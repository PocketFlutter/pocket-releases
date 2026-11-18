/**
 * Multi-Endpoint Cross-Subnet Sync Client (`@pocket/sync/client`).
 *
 * Connects concurrently to multiple user-configured or auto-discovered Sync Servers
 * across LAN (`192.168.x.x` / `.local`), Cross-Subnet Overlay (`100.64.0.0/10`
 * Tailscale / WireGuard / ZeroTier), and HTTPS WAN relays.
 *
 * Maintains independent `(serverInstanceId, lastSeenSeq)` watermarks per endpoint
 * so switching subnets or syncing with multiple home/grandparent servers never
 * drops late-arriving offline CRDT operations.
 */

import type { BridgeObject, HostBridge } from "@pocket/ui/host";
import {
  POCKET_SYNC_AUTH_HEADER,
  PocketSyncLedger,
  createSyncAuthHeader,
  parseSyncEndpointUrl,
  sha256Hex,
  verifyBlobArchiveReceipt,
  type EndpointWatermark,
  type ParsedSyncEndpoint,
  type SequencedSyncOp,
  type StorageDurability,
  type SyncArchiveReceipt,
  type SyncDeviceKind,
  type SyncExchangeRequest,
  type SyncExchangeResponse,
  type SyncNetworkKind,
  type SyncNodeInfo,
  type SyncOpRecord,
} from "./protocol.ts";
import {
  InMemorySyncMeshRegistry,
  POCKET_SYNC_BLOB_CHUNK_BYTES,
  POCKET_SYNC_OP_BATCH_LIMIT,
  type SyncHttpEnvelopeRequest,
  type SyncHttpEnvelopeResponse,
  type SyncLiveHeadPush,
} from "./server.ts";

export type SyncEndpointHealth = "idle" | "online" | "degraded" | "offline" | "auth_error";

export interface SyncEndpointEntry {
  readonly id: string;
  readonly url: string;
  readonly normalizedBaseUrl: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly networkKind: SyncNetworkKind;
  readonly allowInsecureWan?: boolean;
  readonly status: SyncEndpointHealth;
  readonly lastRttMs: number | null;
  readonly lastSyncAtMs: number | null;
  readonly remoteNodeId?: string;
  readonly remoteDeviceName?: string;
  readonly remoteDeviceKind?: SyncDeviceKind;
  readonly remoteStorageDurability?: StorageDurability;
  readonly watermark?: EndpointWatermark;
  readonly lastError?: string;
}

export interface SyncTransportResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly jsonBody?: unknown;
  readonly binaryBody?: Uint8Array;
  readonly rttMs: number;
}

export interface SyncTransportAdapter {
  send(
    endpoint: ParsedSyncEndpoint,
    req: SyncHttpEnvelopeRequest,
    options?: { timeoutMs?: number; allowInsecureWan?: boolean },
  ): Promise<SyncTransportResponse>;
  subscribeLive?(
    endpoint: ParsedSyncEndpoint,
    namespace: string,
    authHeader: string,
    onPush: (push: SyncLiveHeadPush) => void,
  ): () => void;
}

export function createLoopbackSyncTransport(
  registry: InMemorySyncMeshRegistry,
  nowMs: () => number = () => Date.now(),
): SyncTransportAdapter {
  return {
    async send(endpoint, req): Promise<SyncTransportResponse> {
      const target = registry.resolve(endpoint.normalizedBaseUrl);
      if (!target) {
        throw new Error(`Endpoint unreachable: ${endpoint.normalizedBaseUrl}`);
      }
      const start = nowMs();
      const res: SyncHttpEnvelopeResponse = target.node.handleRequest(req);
      const elapsed = Math.max(target.simulatedRttMs, nowMs() - start);
      return {
        statusCode: res.statusCode,
        headers: res.headers,
        jsonBody: res.jsonBody,
        binaryBody: res.binaryBody,
        rttMs: elapsed,
      };
    },
    subscribeLive(endpoint, namespace, _authHeader, onPush): () => void {
      const target = registry.resolve(endpoint.normalizedBaseUrl);
      if (!target) return () => {};
      return target.node.onLivePush((push) => {
        if (push.namespace === namespace) onPush(push);
      });
    },
  };
}

export function createHostBridgeSyncTransport(bridge: HostBridge): SyncTransportAdapter {
  return {
    async send(endpoint, req, options): Promise<SyncTransportResponse> {
      const started = Date.now();
      const querySuffix =
        req.query && Object.keys(req.query).length > 0
          ? `?${Object.entries(req.query)
              .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
              .join("&")}`
          : "";
      const fullUrl = `${endpoint.normalizedBaseUrl}${req.path}${querySuffix}`;
      const raw = (await bridge.request("sync.client.request", {
        url: fullUrl,
        method: req.method,
        headers: (req.headers ?? {}) as BridgeObject,
        ...(req.jsonBody !== undefined ? { jsonBody: req.jsonBody as BridgeObject } : {}),
        ...(req.binaryBody !== undefined ? { binaryBody: req.binaryBody } : {}),
        timeoutMs: options?.timeoutMs ?? 8000,
        allowInsecureWan: Boolean(options?.allowInsecureWan),
      })) as unknown as {
        statusCode: number;
        headers?: Record<string, string>;
        jsonBody?: unknown;
        binaryBody?: Uint8Array | number[];
        rttMs?: number;
      };
      const binary =
        raw.binaryBody instanceof Uint8Array
          ? raw.binaryBody
          : Array.isArray(raw.binaryBody)
            ? new Uint8Array(raw.binaryBody)
            : undefined;
      return {
        statusCode: Number(raw.statusCode ?? 500),
        headers: raw.headers ?? {},
        jsonBody: raw.jsonBody,
        binaryBody: binary,
        rttMs: Math.max(1, Number(raw.rttMs ?? Date.now() - started)),
      };
    },
  };
}

export function createFetchSyncTransport(
  fetchImpl: typeof fetch | undefined = typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : undefined,
): SyncTransportAdapter {
  return {
    async send(endpoint, req): Promise<SyncTransportResponse> {
      if (!fetchImpl) {
        throw new Error(
          "Fetch transport unavailable in bare QuickJS; provide HostBridge or Loopback transport",
        );
      }
      const started = Date.now();
      const querySuffix =
        req.query && Object.keys(req.query).length > 0
          ? `?${Object.entries(req.query)
              .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
              .join("&")}`
          : "";
      const url = `${endpoint.normalizedBaseUrl}${req.path}${querySuffix}`;
      const headers: Record<string, string> = { ...(req.headers ?? {}) };
      let body: BodyInit | undefined;
      if (req.binaryBody) {
        headers["content-type"] = headers["content-type"] ?? "application/octet-stream";
        body = req.binaryBody as unknown as BodyInit;
      } else if (req.jsonBody !== undefined) {
        headers["content-type"] = headers["content-type"] ?? "application/json";
        body = JSON.stringify(req.jsonBody);
      }
      const response = await fetchImpl(url, {
        method: req.method,
        headers,
        body,
      });
      const outHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        outHeaders[key.toLowerCase()] = value;
      });
      const contentType = outHeaders["content-type"] ?? "";
      let jsonBody: unknown;
      let binaryBody: Uint8Array | undefined;
      if (contentType.includes("application/octet-stream")) {
        binaryBody = new Uint8Array(await response.arrayBuffer());
      } else {
        const text = await response.text();
        if (text) {
          try {
            jsonBody = JSON.parse(text);
          } catch {
            jsonBody = { raw: text };
          }
        }
      }
      return {
        statusCode: response.status,
        headers: outHeaders,
        jsonBody,
        binaryBody,
        rttMs: Math.max(1, Date.now() - started),
      };
    },
  };
}

export function createCompositeSyncTransport(options: {
  meshRegistry?: InMemorySyncMeshRegistry;
  bridge?: HostBridge;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
}): SyncTransportAdapter {
  const loopback = options.meshRegistry
    ? createLoopbackSyncTransport(options.meshRegistry, options.nowMs)
    : undefined;
  const hostTransport = options.bridge ? createHostBridgeSyncTransport(options.bridge) : undefined;
  const fetchTransport = createFetchSyncTransport(options.fetchImpl);

  return {
    async send(endpoint, req, sendOpts): Promise<SyncTransportResponse> {
      if (loopback && options.meshRegistry?.resolve(endpoint.normalizedBaseUrl)) {
        return loopback.send(endpoint, req, sendOpts);
      }
      if (hostTransport) {
        try {
          return await hostTransport.send(endpoint, req, sendOpts);
        } catch (err) {
          const code = (err as { code?: string })?.code ?? "";
          if (
            code !== "unconfigured" &&
            code !== "host_abi_unavailable" &&
            code !== "unknown_capability"
          ) {
            throw err;
          }
        }
      }
      return fetchTransport.send(endpoint, req, sendOpts);
    },
    subscribeLive(endpoint, namespace, authHeader, onPush): () => void {
      if (loopback && options.meshRegistry?.resolve(endpoint.normalizedBaseUrl)) {
        return loopback.subscribeLive?.(endpoint, namespace, authHeader, onPush) ?? (() => {});
      }
      return () => {};
    },
  };
}

export interface MultiEndpointSyncClientOptions {
  readonly namespace: string;
  readonly roomSecret: string;
  readonly clientNodeId: string;
  readonly ledger?: PocketSyncLedger;
  readonly transport: SyncTransportAdapter;
  readonly enableLivePush?: boolean;
  readonly initialEndpoints?: ReadonlyArray<{
    id?: string;
    url: string;
    label?: string;
    enabled?: boolean;
    allowInsecureWan?: boolean;
  }>;
  readonly initialWatermarks?: Readonly<Record<string, EndpointWatermark>>;
  readonly onRemoteOps?: (ops: readonly SequencedSyncOp[], endpoint: SyncEndpointEntry) => void;
  readonly onStateChange?: (endpoints: readonly SyncEndpointEntry[]) => void;
  readonly nowMs?: () => number;
}

export interface EndpointSyncSummary {
  readonly endpointId: string;
  readonly normalizedBaseUrl: string;
  readonly ok: boolean;
  readonly pushedCount: number;
  readonly pulledCount: number;
  readonly resetCursor: boolean;
  readonly rttMs: number | null;
  readonly error?: string;
}

export interface MeshSyncRoundResult {
  readonly totalPulled: number;
  readonly totalPushed: number;
  readonly onlineEndpoints: number;
  readonly results: readonly EndpointSyncSummary[];
}

export interface BlobUploadMeshResult {
  readonly blobSha256: string;
  readonly receipts: readonly SyncArchiveReceipt[];
  readonly hasPermanentArchiveReceipt: boolean;
}

export class MultiEndpointSyncClient {
  public readonly namespace: string;
  public clientNodeId: string;
  public readonly ledger: PocketSyncLedger;
  private roomSecret: string;
  private readonly transport: SyncTransportAdapter;
  private readonly enableLivePush: boolean;
  private readonly nowMs: () => number;
  private readonly onRemoteOps?: (ops: readonly SequencedSyncOp[], endpoint: SyncEndpointEntry) => void;
  private readonly onStateChange?: (endpoints: readonly SyncEndpointEntry[]) => void;
  private readonly endpoints = new Map<string, SyncEndpointEntry>();
  private readonly parsedById = new Map<string, ParsedSyncEndpoint>();
  private readonly watermarks = new Map<string, EndpointWatermark>();
  private readonly liveUnsubs = new Map<string, () => void>();
  private readonly inFlightById = new Map<string, Promise<EndpointSyncSummary>>();
  private readonly pendingLivePushById = new Map<string, SyncLiveHeadPush>();
  private nextEndpointSeq = 1;

  constructor(options: MultiEndpointSyncClientOptions) {
    this.namespace = options.namespace;
    this.roomSecret = options.roomSecret;
    this.clientNodeId = options.clientNodeId;
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.ledger =
      options.ledger ??
      new PocketSyncLedger({
        nodeId: options.clientNodeId,
        nowMs: this.nowMs,
      });
    this.transport = options.transport;
    this.enableLivePush = options.enableLivePush ?? true;
    this.onRemoteOps = options.onRemoteOps;
    this.onStateChange = options.onStateChange;

    if (options.initialWatermarks) {
      for (const [baseUrl, wm] of Object.entries(options.initialWatermarks)) {
        this.watermarks.set(baseUrl, wm);
      }
    }
    for (const item of options.initialEndpoints ?? []) {
      this.addEndpoint(item);
    }
  }

  setRoomSecret(secret: string): void {
    this.roomSecret = secret;
  }

  setClientNodeId(nodeId: string): void {
    const trimmed = nodeId.trim();
    if (trimmed) {
      this.clientNodeId = trimmed;
    }
  }

  getEndpoints(): SyncEndpointEntry[] {
    return [...this.endpoints.values()].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      const rttA = a.lastRttMs ?? Number.MAX_SAFE_INTEGER;
      const rttB = b.lastRttMs ?? Number.MAX_SAFE_INTEGER;
      return rttA - rttB;
    });
  }

  exportWatermarks(): Record<string, EndpointWatermark> {
    const out: Record<string, EndpointWatermark> = {};
    for (const [k, v] of this.watermarks.entries()) {
      out[k] = v;
    }
    return out;
  }

  addEndpoint(input: {
    id?: string;
    url: string;
    label?: string;
    enabled?: boolean;
    allowInsecureWan?: boolean;
  }): SyncEndpointEntry {
    const parsed = parseSyncEndpointUrl(input.url, {
      allowInsecureWan: input.allowInsecureWan,
    });
    for (const existing of this.endpoints.values()) {
      if (existing.normalizedBaseUrl === parsed.normalizedBaseUrl) {
        const updated: SyncEndpointEntry = {
          ...existing,
          label: input.label?.trim() || existing.label,
          enabled: input.enabled ?? existing.enabled,
        };
        this.endpoints.set(existing.id, updated);
        this.emitChange();
        return updated;
      }
    }

    const id = input.id ?? `ep_${this.nextEndpointSeq++}`;
    const defaultLabel =
      input.label?.trim() ||
      (parsed.networkKind === "overlay"
        ? `跨网段节点 (${parsed.host})`
        : parsed.networkKind === "lan"
          ? `局域网节点 (${parsed.host})`
          : `云端中继 (${parsed.host})`);
    const wm = this.watermarks.get(parsed.normalizedBaseUrl);
    const entry: SyncEndpointEntry = {
      id,
      url: input.url.trim(),
      normalizedBaseUrl: parsed.normalizedBaseUrl,
      label: defaultLabel,
      enabled: input.enabled ?? true,
      networkKind: parsed.networkKind,
      allowInsecureWan: input.allowInsecureWan,
      status: "idle",
      lastRttMs: null,
      lastSyncAtMs: null,
      ...(wm ? { watermark: wm } : {}),
    };
    this.endpoints.set(id, entry);
    this.parsedById.set(id, parsed);
    this.bindLiveSubscription(entry, parsed);
    this.emitChange();
    return entry;
  }

  removeEndpoint(endpointId: string): boolean {
    this.liveUnsubs.get(endpointId)?.();
    this.liveUnsubs.delete(endpointId);
    this.pendingLivePushById.delete(endpointId);
    this.parsedById.delete(endpointId);
    const existed = this.endpoints.delete(endpointId);
    if (existed) this.emitChange();
    return existed;
  }

  toggleEndpoint(endpointId: string, enabled?: boolean): SyncEndpointEntry | undefined {
    const existing = this.endpoints.get(endpointId);
    if (!existing) return undefined;
    const nextEnabled = enabled ?? !existing.enabled;
    const updated: SyncEndpointEntry = {
      ...existing,
      enabled: nextEnabled,
      status: nextEnabled ? existing.status : "idle",
    };
    this.endpoints.set(endpointId, updated);
    const parsed = this.parsedById.get(endpointId);
    if (parsed) {
      if (nextEnabled) this.bindLiveSubscription(updated, parsed);
      else {
        this.liveUnsubs.get(endpointId)?.();
        this.liveUnsubs.delete(endpointId);
        this.pendingLivePushById.delete(endpointId);
      }
    }
    this.emitChange();
    return updated;
  }

  async probeEndpoint(endpointId: string): Promise<SyncEndpointEntry | undefined> {
    const entry = this.endpoints.get(endpointId);
    const parsed = this.parsedById.get(endpointId);
    if (!entry || !parsed) return undefined;
    const path = "/v1/pocket-sync/info";
    const auth = createSyncAuthHeader({
      roomSecret: this.roomSecret,
      namespace: this.namespace,
      method: "GET",
      path,
      timestampMs: this.nowMs(),
    });
    try {
      const res = await this.transport.send(
        parsed,
        {
          method: "GET",
          path,
          query: { namespace: this.namespace },
          headers: { [POCKET_SYNC_AUTH_HEADER]: auth },
        },
        { allowInsecureWan: entry.allowInsecureWan, timeoutMs: 4000 },
      );
      if (res.statusCode === 401 || res.statusCode === 403) {
        return this.patchEndpoint(endpointId, {
          status: "auth_error",
          lastRttMs: res.rttMs,
          lastError: "房间密钥或命名空间不匹配",
        });
      }
      if (res.statusCode !== 200 || !res.jsonBody) {
        return this.patchEndpoint(endpointId, {
          status: "offline",
          lastError: `HTTP ${res.statusCode}`,
        });
      }
      const info = res.jsonBody as SyncNodeInfo;
      return this.patchEndpoint(endpointId, {
        status: "online",
        lastRttMs: res.rttMs,
        remoteNodeId: info.nodeId,
        remoteDeviceName: info.deviceName,
        remoteDeviceKind: info.deviceKind,
        remoteStorageDurability: info.storageDurability,
        lastError: undefined,
      });
    } catch (err) {
      return this.patchEndpoint(endpointId, {
        status: "offline",
        lastRttMs: null,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async probeAll(): Promise<SyncEndpointEntry[]> {
    const enabledIds = [...this.endpoints.values()]
      .filter((ep) => ep.enabled)
      .map((ep) => ep.id);
    await Promise.all(enabledIds.map((id) => this.probeEndpoint(id)));
    return this.getEndpoints();
  }

  async syncEndpoint(
    endpointId: string,
    extraLocalOps?: readonly SyncOpRecord[],
  ): Promise<EndpointSyncSummary> {
    if (extraLocalOps && extraLocalOps.length > 0) {
      this.ledger.ingestOps(extraLocalOps, { isRemote: false });
    }

    const existingFlight = this.inFlightById.get(endpointId);
    if (existingFlight) {
      const first = await existingFlight;
      if (extraLocalOps && extraLocalOps.length > 0) {
        const second = await this.syncEndpoint(endpointId);
        return {
          ...second,
          ok: first.ok || second.ok,
          pushedCount: first.pushedCount + second.pushedCount,
          pulledCount: first.pulledCount + second.pulledCount,
          resetCursor: first.resetCursor || second.resetCursor,
        };
      }
      return first;
    }

    const flight = Promise.resolve().then(() => this.executeSingleSyncEndpoint(endpointId));
    this.inFlightById.set(endpointId, flight);
    try {
      return await flight;
    } finally {
      this.inFlightById.delete(endpointId);
      const pendingPush = this.pendingLivePushById.get(endpointId);
      this.pendingLivePushById.delete(endpointId);
      const currentEntry = this.endpoints.get(endpointId);
      if (pendingPush && currentEntry && currentEntry.enabled) {
        const wm = this.watermarks.get(currentEntry.normalizedBaseUrl);
        if (
          !wm ||
          wm.serverInstanceId !== pendingPush.serverInstanceId ||
          pendingPush.latestSeq > wm.lastSeenSeq
        ) {
          void this.syncEndpoint(endpointId).then((summary) => {
            if (summary.pulledCount > 0 && this.endpoints.size > 1) {
              for (const peer of this.endpoints.values()) {
                if (peer.enabled && peer.id !== endpointId) {
                  void this.syncEndpoint(peer.id);
                }
              }
            }
          });
        }
      }
    }
  }

  private async executeSingleSyncEndpoint(endpointId: string): Promise<EndpointSyncSummary> {
    const entry = this.endpoints.get(endpointId);
    const parsed = this.parsedById.get(endpointId);
    if (!entry || !parsed || !entry.enabled) {
      return {
        endpointId,
        normalizedBaseUrl: entry?.normalizedBaseUrl ?? "",
        ok: false,
        pushedCount: 0,
        pulledCount: 0,
        resetCursor: false,
        rttMs: null,
        error: "endpoint_disabled_or_missing",
      };
    }

    const outboundAll = this.ledger.getArrivalLog(this.namespace);
    let pushedCount = 0;
    let pulledCount = 0;
    let resetObserved = false;
    let latestRtt: number | null = null;
    const path = "/v1/pocket-sync/ops/exchange";

    try {
      let watermark = this.watermarks.get(entry.normalizedBaseUrl);
      let outboundOffset = 0;
      let keepPaging = true;
      let safetyPages = 0;

      while (keepPaging && safetyPages < 64) {
        safetyPages += 1;
        const batchOps = outboundAll
          .slice(outboundOffset, outboundOffset + POCKET_SYNC_OP_BATCH_LIMIT)
          .map(({ serverSeq: _seq, ...plainOp }) => plainOp);
        outboundOffset += batchOps.length;

        const body: SyncExchangeRequest = {
          namespace: this.namespace,
          clientNodeId: this.clientNodeId,
          ...(watermark ? { expectedServerInstanceId: watermark.serverInstanceId } : {}),
          sinceSeq: watermark?.lastSeenSeq ?? 0,
          ops: batchOps,
          limit: POCKET_SYNC_OP_BATCH_LIMIT,
        };
        const serialized = JSON.stringify(body);
        const auth = createSyncAuthHeader({
          roomSecret: this.roomSecret,
          namespace: this.namespace,
          method: "POST",
          path,
          bodySha256: sha256Hex(serialized),
          timestampMs: this.nowMs(),
        });

        const res = await this.transport.send(
          parsed,
          {
            method: "POST",
            path,
            headers: { [POCKET_SYNC_AUTH_HEADER]: auth },
            jsonBody: body,
          },
          { allowInsecureWan: entry.allowInsecureWan, timeoutMs: 8000 },
        );
        latestRtt = res.rttMs;

        if (res.statusCode === 401 || res.statusCode === 403) {
          this.patchEndpoint(endpointId, {
            status: "auth_error",
            lastRttMs: res.rttMs,
            lastError: "鉴权失败：请检查同步密钥",
          });
          return {
            endpointId,
            normalizedBaseUrl: entry.normalizedBaseUrl,
            ok: false,
            pushedCount,
            pulledCount,
            resetCursor: resetObserved,
            rttMs: res.rttMs,
            error: "auth_error",
          };
        }
        if (res.statusCode !== 200 || !res.jsonBody) {
          this.patchEndpoint(endpointId, {
            status: "offline",
            lastError: `HTTP ${res.statusCode}`,
          });
          return {
            endpointId,
            normalizedBaseUrl: entry.normalizedBaseUrl,
            ok: false,
            pushedCount,
            pulledCount,
            resetCursor: resetObserved,
            rttMs: res.rttMs,
            error: `http_${res.statusCode}`,
          };
        }

        const payload = res.jsonBody as SyncExchangeResponse;
        if (payload.resetCursor) resetObserved = true;
        pushedCount += payload.acceptedCount;

        if (payload.serverOps.length > 0) {
          const merged = this.ledger.ingestOps(payload.serverOps, { isRemote: true });
          pulledCount += merged.accepted.length;
          if (merged.accepted.length > 0 && this.onRemoteOps) {
            const latestEntry = this.endpoints.get(endpointId) ?? entry;
            this.onRemoteOps(merged.accepted, latestEntry);
          }
        }

        watermark = {
          serverInstanceId: payload.serverInstanceId,
          lastSeenSeq: payload.latestSeq,
          updatedAtMs: this.nowMs(),
        };
        this.watermarks.set(entry.normalizedBaseUrl, watermark);
        this.patchEndpoint(endpointId, {
          status: "online",
          lastRttMs: res.rttMs,
          lastSyncAtMs: this.nowMs(),
          remoteStorageDurability: payload.storageDurability,
          watermark,
          lastError: undefined,
        });

        const moreOutbound = outboundOffset < outboundAll.length;
        const moreInbound = Boolean(payload.hasMore);
        keepPaging = moreOutbound || moreInbound;
      }

      return {
        endpointId,
        normalizedBaseUrl: entry.normalizedBaseUrl,
        ok: true,
        pushedCount,
        pulledCount,
        resetCursor: resetObserved,
        rttMs: latestRtt,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.patchEndpoint(endpointId, {
        status: "offline",
        lastRttMs: null,
        lastError: msg,
      });
      return {
        endpointId,
        normalizedBaseUrl: entry.normalizedBaseUrl,
        ok: false,
        pushedCount,
        pulledCount,
        resetCursor: resetObserved,
        rttMs: null,
        error: msg,
      };
    }
  }

  /**
   * Fan-out delta exchange across ALL enabled endpoints concurrently (sorted by lowest RTT),
   * ensuring LAN hubs, Tailscale cross-subnet nodes, and cloud relays all converge.
   */
  async syncAll(extraLocalOps?: readonly SyncOpRecord[]): Promise<MeshSyncRoundResult> {
    if (extraLocalOps && extraLocalOps.length > 0) {
      this.ledger.ingestOps(extraLocalOps, { isRemote: false });
    }
    const ordered = this.getEndpoints().filter((ep) => ep.enabled);
    const summaries = await Promise.all(ordered.map((ep) => this.syncEndpoint(ep.id)));
    // If endpoint B yielded ops that endpoint A hadn't seen yet, run one fast convergence pass
    const anyPulled = summaries.some((s) => s.pulledCount > 0);
    if (anyPulled && ordered.length > 1) {
      const secondPass = await Promise.all(ordered.map((ep) => this.syncEndpoint(ep.id)));
      const merged = summaries.map((first, idx) => {
        const second = secondPass[idx]!;
        return {
          ...second,
          ok: first.ok || second.ok,
          pushedCount: first.pushedCount + second.pushedCount,
          pulledCount: first.pulledCount + second.pulledCount,
          resetCursor: first.resetCursor || second.resetCursor,
        };
      });
      return {
        totalPulled: merged.reduce((acc, item) => acc + item.pulledCount, 0),
        totalPushed: merged.reduce((acc, item) => acc + item.pushedCount, 0),
        onlineEndpoints: merged.filter((item) => item.ok).length,
        results: merged,
      };
    }

    return {
      totalPulled: summaries.reduce((acc, item) => acc + item.pulledCount, 0),
      totalPushed: summaries.reduce((acc, item) => acc + item.pushedCount, 0),
      onlineEndpoints: summaries.filter((item) => item.ok).length,
      results: summaries,
    };
  }

  /**
   * Chunked binary blob upload (`<= 128 KiB` per chunk) across enabled endpoints.
   * Only marks `hasPermanentArchiveReceipt = true` when at least one `persistent`
   * server (`macos` / `desktop` / `android-tv`, NOT `tvos` / `watch` `ephemeralCache`)
   * returns a valid HMAC-signed archive receipt.
   */
  async uploadBlobToMesh(bytes: Uint8Array): Promise<BlobUploadMeshResult> {
    const blobSha256 = sha256Hex(bytes);
    const receipts: SyncArchiveReceipt[] = [];
    const ordered = this.getEndpoints().filter((ep) => ep.enabled);

    for (const ep of ordered) {
      const parsed = this.parsedById.get(ep.id);
      if (!parsed) continue;
      const path = `/v1/pocket-sync/blobs/${blobSha256}`;
      try {
        let offset = 0;
        let finalReceipt: SyncArchiveReceipt | undefined;
        do {
          const slice = bytes.slice(
            offset,
            Math.min(bytes.byteLength, offset + POCKET_SYNC_BLOB_CHUNK_BYTES),
          );
          const auth = createSyncAuthHeader({
            roomSecret: this.roomSecret,
            namespace: this.namespace,
            method: "PUT",
            path,
            bodySha256: sha256Hex(slice),
            timestampMs: this.nowMs(),
          });
          const res = await this.transport.send(
            parsed,
            {
              method: "PUT",
              path,
              query: {
                namespace: this.namespace,
                offset: String(offset),
                total: String(bytes.byteLength),
              },
              headers: { [POCKET_SYNC_AUTH_HEADER]: auth },
              binaryBody: slice,
            },
            { allowInsecureWan: ep.allowInsecureWan, timeoutMs: 12000 },
          );
          if (res.statusCode !== 201 && res.statusCode !== 202) {
            break;
          }
          offset += slice.byteLength;
          if (res.statusCode === 201 && res.jsonBody) {
            const candidate = (res.jsonBody as { receipt?: SyncArchiveReceipt }).receipt;
            if (
              candidate &&
              verifyBlobArchiveReceipt(candidate, this.roomSecret, this.namespace)
            ) {
              finalReceipt = candidate;
            }
          }
        } while (offset < bytes.byteLength);

        if (finalReceipt) {
          receipts.push(finalReceipt);
        }
      } catch {
        // Continue uploading to remaining reachable servers
      }
    }

    return {
      blobSha256,
      receipts,
      hasPermanentArchiveReceipt: receipts.some((r) => r.permanentArchiveSafe),
    };
  }

  async downloadBlobFromMesh(blobSha256: string): Promise<Uint8Array | null> {
    const cleanSha = blobSha256.trim().toLowerCase();
    const path = `/v1/pocket-sync/blobs/${cleanSha}`;
    const ordered = this.getEndpoints().filter((ep) => ep.enabled);

    for (const ep of ordered) {
      const parsed = this.parsedById.get(ep.id);
      if (!parsed) continue;
      try {
        let offset = 0;
        let total = 0;
        let assembled: Uint8Array | undefined;
        do {
          const auth = createSyncAuthHeader({
            roomSecret: this.roomSecret,
            namespace: this.namespace,
            method: "GET",
            path,
            timestampMs: this.nowMs(),
          });
          const res = await this.transport.send(
            parsed,
            {
              method: "GET",
              path,
              query: {
                namespace: this.namespace,
                offset: String(offset),
                length: String(POCKET_SYNC_BLOB_CHUNK_BYTES),
              },
              headers: { [POCKET_SYNC_AUTH_HEADER]: auth },
            },
            { allowInsecureWan: ep.allowInsecureWan, timeoutMs: 12000 },
          );
          if ((res.statusCode !== 200 && res.statusCode !== 206) || !res.binaryBody) {
            assembled = undefined;
            break;
          }
          const declaredTotal = Number(
            res.headers["x-blob-total-length"] ?? String(res.binaryBody.byteLength),
          );
          if (!assembled) {
            total = declaredTotal;
            assembled = new Uint8Array(total);
          }
          assembled.set(res.binaryBody, offset);
          offset += res.binaryBody.byteLength;
          if (res.binaryBody.byteLength === 0) break;
        } while (offset < total);

        if (assembled && sha256Hex(assembled) === cleanSha) {
          return assembled;
        }
      } catch {
        // Fallback to next reachable endpoint in pool
      }
    }
    return null;
  }

  dispose(): void {
    for (const unsub of this.liveUnsubs.values()) unsub();
    this.liveUnsubs.clear();
    this.pendingLivePushById.clear();
    this.inFlightById.clear();
  }

  private bindLiveSubscription(entry: SyncEndpointEntry, parsed: ParsedSyncEndpoint): void {
    this.liveUnsubs.get(entry.id)?.();
    if (!this.enableLivePush || !entry.enabled || !this.transport.subscribeLive) return;
    const auth = createSyncAuthHeader({
      roomSecret: this.roomSecret,
      namespace: this.namespace,
      method: "GET",
      path: "/v1/pocket-sync/live",
      timestampMs: this.nowMs(),
    });
    const unsub = this.transport.subscribeLive(parsed, this.namespace, auth, (push) => {
      if (this.inFlightById.has(entry.id)) {
        this.pendingLivePushById.set(entry.id, push);
        return;
      }
      const wm = this.watermarks.get(entry.normalizedBaseUrl);
      if (!wm || wm.serverInstanceId !== push.serverInstanceId || push.latestSeq > wm.lastSeenSeq) {
        void this.syncEndpoint(entry.id).then((summary) => {
          if (summary.pulledCount > 0 && this.endpoints.size > 1) {
            for (const peer of this.endpoints.values()) {
              if (peer.enabled && peer.id !== entry.id) {
                void this.syncEndpoint(peer.id);
              }
            }
          }
        });
      }
    });
    this.liveUnsubs.set(entry.id, unsub);
  }

  private patchEndpoint(
    endpointId: string,
    patch: Partial<SyncEndpointEntry>,
  ): SyncEndpointEntry | undefined {
    const prev = this.endpoints.get(endpointId);
    if (!prev) return undefined;
    const next: SyncEndpointEntry = { ...prev, ...patch };
    this.endpoints.set(endpointId, next);
    this.emitChange();
    return next;
  }

  private emitChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getEndpoints());
    }
  }
}

export function createMultiEndpointSyncClient(
  options: MultiEndpointSyncClientOptions,
): MultiEndpointSyncClient {
  return new MultiEndpointSyncClient(options);
}
