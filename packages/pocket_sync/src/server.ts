/**
 * Embedded Sync Server Controller & In-Memory Reference Node (`@pocket/sync/server`).
 *
 * Allows macOS, Apple TV / Android TV, Watch, and Mobile devices to host a
 * Pocket Sync Server directly inside the client app (via `PocketSyncPlugin`
 * Worker Isolate on Flutter hosts, or `InMemorySyncServerNode` in Studio / Web / tests).
 */

import type { BridgeObject, HostBridge } from "@pocket/ui/host";
import {
  POCKET_SYNC_AUTH_HEADER,
  POCKET_SYNC_DEFAULT_PORT,
  POCKET_SYNC_PROTOCOL_VERSION,
  PocketSyncLedger,
  SyncReplayGuard,
  defaultPowerPolicyForDevice,
  defaultStorageDurabilityForDevice,
  parseSyncEndpointUrl,
  sha256Hex,
  signBlobArchiveReceipt,
  type SequencedSyncOp,
  type ServerPowerPolicy,
  type StorageDurability,
  type SyncArchiveReceipt,
  type SyncDeviceKind,
  type SyncExchangeRequest,
  type SyncExchangeResponse,
  type SyncNodeInfo,
  type SyncOpRecord,
} from "./protocol.ts";

export const POCKET_SYNC_BLOB_CHUNK_BYTES = 128 * 1024;
export const POCKET_SYNC_OP_BATCH_LIMIT = 128;

export interface EmbeddedServerConfig {
  readonly namespace: string;
  readonly roomSecret: string;
  readonly nodeId: string;
  readonly deviceName: string;
  readonly deviceKind: SyncDeviceKind;
  readonly port?: number;
  readonly bindHost?: string;
  readonly storageDurability?: StorageDurability;
  readonly powerPolicy?: ServerPowerPolicy;
  readonly advertisedUrls?: readonly string[];
  readonly simulateBindDenied?: boolean;
  readonly authorizeOp?: (op: SyncOpRecord) => boolean;
  readonly nowMs?: () => number;
}

export interface EmbeddedServerStatus {
  readonly running: boolean;
  readonly degradedToClientOnly: boolean;
  readonly mode: "listening" | "adaptiveRelayClientOnly" | "stopped";
  readonly port: number;
  readonly serverInstanceId: string;
  readonly nodeId: string;
  readonly deviceName: string;
  readonly deviceKind: SyncDeviceKind;
  readonly storageDurability: StorageDurability;
  readonly powerPolicy: ServerPowerPolicy;
  readonly listenUrls: readonly string[];
  readonly lanUrls: readonly string[];
  readonly overlayUrls: readonly string[];
  readonly connectedPeers: number;
  readonly latestSeq: number;
  readonly storedBlobCount: number;
  readonly storedBlobBytes: number;
  readonly reason?: string;
}

export interface SyncLiveHeadPush {
  readonly type: "head";
  readonly namespace: string;
  readonly serverInstanceId: string;
  readonly latestSeq: number;
  readonly latestHlc: string;
}

export interface SyncHttpEnvelopeRequest {
  readonly method: "GET" | "POST" | "PUT";
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly jsonBody?: unknown;
  readonly binaryBody?: Uint8Array;
  readonly peerIp?: string;
}

export interface SyncHttpEnvelopeResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly jsonBody?: unknown;
  readonly binaryBody?: Uint8Array;
}

interface BlobAssemblyBuffer {
  readonly totalBytes: number;
  readonly buffer: Uint8Array;
  receivedBytes: number;
}

/**
 * Deterministic in-process reference Sync Server implementing the exact wire
 * protocol of `PocketSyncPlugin`'s Dart IO Worker Isolate.
 */
export class InMemorySyncServerNode {
  public readonly config: Required<
    Pick<
      EmbeddedServerConfig,
      | "namespace"
      | "roomSecret"
      | "nodeId"
      | "deviceName"
      | "deviceKind"
      | "port"
      | "storageDurability"
      | "powerPolicy"
    >
  >;
  public readonly ledger: PocketSyncLedger;
  private readonly replayGuard: SyncReplayGuard;
  private readonly nowMs: () => number;
  private readonly blobs = new Map<string, Uint8Array>();
  private readonly partialBlobs = new Map<string, BlobAssemblyBuffer>();
  private readonly authFailuresByIp = new Map<string, { count: number; resetAtMs: number }>();
  private readonly liveListeners = new Set<(event: SyncLiveHeadPush) => void>();
  private readonly remoteIngestListeners = new Set<(ops: readonly SequencedSyncOp[]) => void>();
  private readonly advertisedUrls: string[];
  private running = false;
  private degradedToClientOnly = false;
  private stopReason?: string;

  constructor(config: EmbeddedServerConfig, existingLedger?: PocketSyncLedger) {
    const nowFn = config.nowMs ?? (() => Date.now());
    this.nowMs = nowFn;
    const storageDurability =
      config.storageDurability ?? defaultStorageDurabilityForDevice(config.deviceKind);
    const powerPolicy = config.powerPolicy ?? defaultPowerPolicyForDevice(config.deviceKind);
    this.config = {
      namespace: config.namespace,
      roomSecret: config.roomSecret,
      nodeId: config.nodeId,
      deviceName: config.deviceName,
      deviceKind: config.deviceKind,
      port: config.port ?? POCKET_SYNC_DEFAULT_PORT,
      storageDurability,
      powerPolicy,
    };
    this.ledger =
      existingLedger ??
      new PocketSyncLedger({
        nodeId: config.nodeId,
        storageDurability,
        nowMs: nowFn,
        authorizeOp: config.authorizeOp,
      });
    this.replayGuard = new SyncReplayGuard();
    this.advertisedUrls = [...(config.advertisedUrls ?? [])];
    if (config.simulateBindDenied) {
      if (powerPolicy === "adaptiveRelay") {
        this.running = false;
        this.degradedToClientOnly = true;
        this.stopReason = "Inbound socket bind restricted by OS; running in adaptive outbound relay mode";
      } else {
        throw new Error("SocketBindDenied: OS refused inbound listening socket");
      }
    } else {
      this.running = true;
    }
  }

  start(): EmbeddedServerStatus {
    if (!this.degradedToClientOnly) {
      this.running = true;
    }
    return this.getStatus();
  }

  stop(): EmbeddedServerStatus {
    this.running = false;
    return this.getStatus();
  }

  setAdvertisedUrls(urls: readonly string[]): void {
    this.advertisedUrls.length = 0;
    this.advertisedUrls.push(...urls);
  }

  onLivePush(listener: (event: SyncLiveHeadPush) => void): () => void {
    this.liveListeners.add(listener);
    return () => this.liveListeners.delete(listener);
  }

  onRemoteOpsIngested(listener: (ops: readonly SequencedSyncOp[]) => void): () => void {
    this.remoteIngestListeners.add(listener);
    return () => this.remoteIngestListeners.delete(listener);
  }

  ingestLocalOps(ops: readonly SyncOpRecord[]): readonly SequencedSyncOp[] {
    const res = this.ledger.ingestOps(ops, { isRemote: false });
    if (res.accepted.length > 0) {
      this.broadcastHead();
    }
    return res.accepted;
  }

  hasBlob(sha256: string): boolean {
    return this.blobs.has(sha256.toLowerCase());
  }

  getStatus(): EmbeddedServerStatus {
    const lanUrls: string[] = [];
    const overlayUrls: string[] = [];
    const normalizedAll: string[] = [];

    for (const raw of this.advertisedUrls) {
      try {
        const parsed = parseSyncEndpointUrl(raw, {
          defaultPort: this.config.port,
          allowInsecureWan: true,
        });
        normalizedAll.push(parsed.normalizedBaseUrl);
        if (parsed.networkKind === "lan") lanUrls.push(parsed.normalizedBaseUrl);
        else if (parsed.networkKind === "overlay") overlayUrls.push(parsed.normalizedBaseUrl);
      } catch {
        // Ignore malformed advertised hint
      }
    }

    let storedBlobBytes = 0;
    for (const blob of this.blobs.values()) storedBlobBytes += blob.byteLength;

    return {
      running: this.running,
      degradedToClientOnly: this.degradedToClientOnly,
      mode: this.running
        ? "listening"
        : this.degradedToClientOnly
          ? "adaptiveRelayClientOnly"
          : "stopped",
      port: this.config.port,
      serverInstanceId: this.ledger.serverInstanceId,
      nodeId: this.config.nodeId,
      deviceName: this.config.deviceName,
      deviceKind: this.config.deviceKind,
      storageDurability: this.config.storageDurability,
      powerPolicy: this.config.powerPolicy,
      listenUrls: normalizedAll,
      lanUrls,
      overlayUrls,
      connectedPeers: this.liveListeners.size,
      latestSeq: this.ledger.getLatestSeq(),
      storedBlobCount: this.blobs.size,
      storedBlobBytes,
      ...(this.stopReason ? { reason: this.stopReason } : {}),
    };
  }

  handleRequest(req: SyncHttpEnvelopeRequest): SyncHttpEnvelopeResponse {
    if (!this.running) {
      return {
        statusCode: 503,
        headers: { "content-type": "application/json" },
        jsonBody: { error: "server_offline", message: this.stopReason ?? "Sync server is stopped" },
      };
    }

    const peerIp = req.peerIp ?? "peer";
    const now = this.nowMs();
    const rateBucket = this.authFailuresByIp.get(peerIp);
    if (rateBucket && rateBucket.resetAtMs > now && rateBucket.count >= 12) {
      return {
        statusCode: 429,
        headers: { "content-type": "application/json" },
        jsonBody: { error: "rate_limited", message: "Too many failed authentication attempts" },
      };
    }

    const namespace =
      req.query?.namespace ??
      (req.jsonBody && typeof req.jsonBody === "object"
        ? String((req.jsonBody as Record<string, unknown>).namespace ?? "")
        : "");
    if (!namespace || namespace !== this.config.namespace) {
      this.recordAuthFailure(peerIp, now);
      return {
        statusCode: 403,
        headers: { "content-type": "application/json" },
        jsonBody: { error: "namespace_mismatch", message: "Unknown or unauthorized sync namespace" },
      };
    }

    const authHeader =
      req.headers?.[POCKET_SYNC_AUTH_HEADER] ??
      req.headers?.[POCKET_SYNC_AUTH_HEADER.toUpperCase()] ??
      req.query?.auth;
    const bodyHash = req.binaryBody
      ? sha256Hex(req.binaryBody)
      : req.jsonBody !== undefined
        ? sha256Hex(JSON.stringify(req.jsonBody))
        : sha256Hex("");

    const verified = this.replayGuard.verifyHeader({
      headerValue: authHeader,
      roomSecret: this.config.roomSecret,
      namespace: this.config.namespace,
      method: req.method,
      path: req.path,
      bodySha256: bodyHash,
      nowMs: now,
    });
    if (!verified.ok) {
      this.recordAuthFailure(peerIp, now);
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        jsonBody: { error: "unauthorized", reason: verified.reason ?? "auth_failed" },
      };
    }

    if (req.method === "GET" && req.path === "/v1/pocket-sync/info") {
      const info: SyncNodeInfo = {
        protocolVersion: POCKET_SYNC_PROTOCOL_VERSION,
        serverInstanceId: this.ledger.serverInstanceId,
        nodeId: this.config.nodeId,
        deviceName: this.config.deviceName,
        deviceKind: this.config.deviceKind,
        storageDurability: this.config.storageDurability,
        powerPolicy: this.config.powerPolicy,
        namespaces: [this.config.namespace],
        latestSeq: this.ledger.getLatestSeq(),
        latestHlc: this.ledger.clock.latestFormatted(),
      };
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        jsonBody: info,
      };
    }

    if (req.method === "POST" && req.path === "/v1/pocket-sync/ops/exchange") {
      const payload = req.jsonBody as SyncExchangeRequest | undefined;
      if (!payload || typeof payload !== "object") {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          jsonBody: { error: "invalid_exchange_payload" },
        };
      }
      const exchanged = this.ledger.exchange({
        ...payload,
        limit: Math.min(POCKET_SYNC_OP_BATCH_LIMIT, payload.limit ?? POCKET_SYNC_OP_BATCH_LIMIT),
      });
      if (exchanged.acceptedOps.length > 0) {
        for (const listener of [...this.remoteIngestListeners]) {
          listener(exchanged.acceptedOps);
        }
        this.broadcastHead();
      }
      const response: SyncExchangeResponse = {
        namespace: exchanged.namespace,
        serverInstanceId: exchanged.serverInstanceId,
        storageDurability: this.config.storageDurability,
        resetCursor: exchanged.resetCursor,
        hasMore: exchanged.hasMore,
        acceptedCount: exchanged.acceptedCount,
        serverOps: exchanged.serverOps,
        latestSeq: exchanged.latestSeq,
        latestHlc: exchanged.latestHlc,
      };
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        jsonBody: response,
      };
    }

    if (req.path.startsWith("/v1/pocket-sync/blobs/")) {
      const blobSha = req.path.slice("/v1/pocket-sync/blobs/".length).trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(blobSha)) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          jsonBody: { error: "invalid_blob_sha256" },
        };
      }
      if (req.method === "PUT") {
        const chunk = req.binaryBody ?? new Uint8Array(0);
        if (chunk.byteLength > POCKET_SYNC_BLOB_CHUNK_BYTES) {
          return {
            statusCode: 413,
            headers: { "content-type": "application/json" },
            jsonBody: { error: "blob_chunk_too_large" },
          };
        }
        const offset = Math.max(0, Number(req.query?.offset ?? "0"));
        const total = Math.max(chunk.byteLength, Number(req.query?.total ?? String(chunk.byteLength)));
        if (total > 32 * 1024 * 1024 || offset + chunk.byteLength > total) {
          return {
            statusCode: 400,
            headers: { "content-type": "application/json" },
            jsonBody: { error: "invalid_blob_bounds" },
          };
        }

        let assembly = this.partialBlobs.get(blobSha);
        if (!assembly || offset === 0 || assembly.totalBytes !== total) {
          if (!this.partialBlobs.has(blobSha) && this.partialBlobs.size >= 8) {
            const oldestSha = this.partialBlobs.keys().next().value;
            if (oldestSha !== undefined) this.partialBlobs.delete(oldestSha);
          }
          assembly = {
            totalBytes: total,
            buffer: new Uint8Array(total),
            receivedBytes: 0,
          };
          this.partialBlobs.set(blobSha, assembly);
        }
        assembly.buffer.set(chunk, offset);
        assembly.receivedBytes = Math.max(assembly.receivedBytes, offset + chunk.byteLength);

        if (assembly.receivedBytes < total) {
          return {
            statusCode: 202,
            headers: { "content-type": "application/json" },
            jsonBody: {
              complete: false,
              receivedBytes: assembly.receivedBytes,
              totalBytes: total,
            },
          };
        }

        this.partialBlobs.delete(blobSha);
        const actualSha = sha256Hex(assembly.buffer);
        if (actualSha !== blobSha) {
          return {
            statusCode: 422,
            headers: { "content-type": "application/json" },
            jsonBody: { error: "blob_sha256_mismatch", expected: blobSha, actual: actualSha },
          };
        }
        this.blobs.set(blobSha, assembly.buffer);
        const receipt: SyncArchiveReceipt = signBlobArchiveReceipt({
          roomSecret: this.config.roomSecret,
          namespace: this.config.namespace,
          blobSha256: blobSha,
          byteLength: total,
          serverInstanceId: this.ledger.serverInstanceId,
          serverNodeId: this.config.nodeId,
          storageDurability: this.config.storageDurability,
          issuedAtMs: now,
        });
        return {
          statusCode: 201,
          headers: { "content-type": "application/json" },
          jsonBody: { complete: true, receipt },
        };
      }

      if (req.method === "GET") {
        const stored = this.blobs.get(blobSha);
        if (!stored) {
          return {
            statusCode: 404,
            headers: { "content-type": "application/json" },
            jsonBody: { error: "blob_not_found" },
          };
        }
        const offset = Math.max(0, Number(req.query?.offset ?? "0"));
        const length = Math.min(
          POCKET_SYNC_BLOB_CHUNK_BYTES,
          Math.max(1, Number(req.query?.length ?? String(POCKET_SYNC_BLOB_CHUNK_BYTES))),
        );
        const slice = stored.slice(offset, Math.min(stored.byteLength, offset + length));
        return {
          statusCode: slice.byteLength < stored.byteLength ? 206 : 200,
          headers: {
            "content-type": "application/octet-stream",
            "x-blob-total-length": String(stored.byteLength),
          },
          binaryBody: slice,
        };
      }
    }

    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      jsonBody: { error: "route_not_found", path: req.path },
    };
  }

  private recordAuthFailure(peerIp: string, now: number): void {
    const existing = this.authFailuresByIp.get(peerIp);
    if (!existing || existing.resetAtMs <= now) {
      this.authFailuresByIp.set(peerIp, { count: 1, resetAtMs: now + 60_000 });
    } else {
      existing.count += 1;
    }
  }

  private broadcastHead(): void {
    if (!this.running || this.liveListeners.size === 0) return;
    const head: SyncLiveHeadPush = {
      type: "head",
      namespace: this.config.namespace,
      serverInstanceId: this.ledger.serverInstanceId,
      latestSeq: this.ledger.getLatestSeq(),
      latestHlc: this.ledger.clock.latestFormatted(),
    };
    for (const listener of [...this.liveListeners]) {
      listener(head);
    }
  }
}

/**
 * Virtual cross-subnet mesh registry mapping LAN (`192.168.x.x`), Overlay
 * (`100.64.x.x` Tailscale / WireGuard), and WAN (`https://...`) URLs to
 * `InMemorySyncServerNode` instances for Studio previews and chaos E2E tests.
 */
export class InMemorySyncMeshRegistry {
  private readonly nodesByBaseUrl = new Map<string, { node: InMemorySyncServerNode; simulatedRttMs: number }>();

  register(
    rawUrl: string,
    node: InMemorySyncServerNode,
    options?: { simulatedRttMs?: number; allowInsecureWan?: boolean },
  ): string {
    const parsed = parseSyncEndpointUrl(rawUrl, {
      defaultPort: node.config.port,
      allowInsecureWan: options?.allowInsecureWan ?? true,
    });
    this.nodesByBaseUrl.set(parsed.normalizedBaseUrl, {
      node,
      simulatedRttMs: Math.max(1, options?.simulatedRttMs ?? (parsed.networkKind === "lan" ? 4 : parsed.networkKind === "overlay" ? 26 : 68)),
    });
    const current = node.getStatus().listenUrls;
    if (!current.includes(parsed.normalizedBaseUrl)) {
      node.setAdvertisedUrls([...current, parsed.normalizedBaseUrl]);
    }
    return parsed.normalizedBaseUrl;
  }

  unregister(rawUrl: string): void {
    try {
      const parsed = parseSyncEndpointUrl(rawUrl, { allowInsecureWan: true });
      this.nodesByBaseUrl.delete(parsed.normalizedBaseUrl);
    } catch {
      this.nodesByBaseUrl.delete(rawUrl);
    }
  }

  resolve(rawUrl: string): { node: InMemorySyncServerNode; simulatedRttMs: number } | undefined {
    try {
      const parsed = parseSyncEndpointUrl(rawUrl, { allowInsecureWan: true });
      return this.nodesByBaseUrl.get(parsed.normalizedBaseUrl);
    } catch {
      return this.nodesByBaseUrl.get(rawUrl);
    }
  }
}

export interface EmbeddedServerController {
  start(overrides?: Partial<EmbeddedServerConfig>): Promise<EmbeddedServerStatus>;
  stop(): Promise<EmbeddedServerStatus>;
  refreshStatus(): Promise<EmbeddedServerStatus>;
  ingestLocalOps(ops: readonly SyncOpRecord[]): Promise<number>;
  onRemoteOps(listener: (ops: readonly SequencedSyncOp[]) => void): () => void;
  getFallbackNode(): InMemorySyncServerNode | undefined;
  dispose(): void;
}

/**
 * Unified Embedded Sync Server controller:
 * - Uses native `PocketSyncPlugin` (`sync.server.*`) when running inside a Flutter host
 * - Automatically falls back to an `InMemorySyncServerNode` in Studio / Web / tests
 */
export function createEmbeddedServerController(options: {
  config: EmbeddedServerConfig;
  bridge?: HostBridge;
  meshRegistry?: InMemorySyncMeshRegistry;
  ledger?: PocketSyncLedger;
}): EmbeddedServerController {
  let currentConfig: EmbeddedServerConfig = { ...options.config };
  let fallbackNode: InMemorySyncServerNode | undefined;
  let lastStatus: EmbeddedServerStatus = {
    running: false,
    degradedToClientOnly: false,
    mode: "stopped",
    port: currentConfig.port ?? POCKET_SYNC_DEFAULT_PORT,
    serverInstanceId: options.ledger?.serverInstanceId ?? `inst_${currentConfig.nodeId}`,
    nodeId: currentConfig.nodeId,
    deviceName: currentConfig.deviceName,
    deviceKind: currentConfig.deviceKind,
    storageDurability:
      currentConfig.storageDurability ?? defaultStorageDurabilityForDevice(currentConfig.deviceKind),
    powerPolicy: currentConfig.powerPolicy ?? defaultPowerPolicyForDevice(currentConfig.deviceKind),
    listenUrls: currentConfig.advertisedUrls ?? [],
    lanUrls: [],
    overlayUrls: [],
    connectedPeers: 0,
    latestSeq: options.ledger?.getLatestSeq() ?? 0,
    storedBlobCount: 0,
    storedBlobBytes: 0,
  };
  const remoteListeners = new Set<(ops: readonly SequencedSyncOp[]) => void>();
  let unsubHostEvents: (() => void) | undefined;
  let unsubFallbackRemote: (() => void) | undefined;

  if (options.bridge?.onEvent) {
    unsubHostEvents = options.bridge.onEvent((event) => {
      if (event.method === "sync.server.events" || event.method === "stream/sync.server.events") {
        const rawOps = (event.params as Record<string, unknown>)?.ops;
        if (Array.isArray(rawOps) && rawOps.length > 0) {
          const ops = rawOps as unknown as SequencedSyncOp[];
          options.ledger?.ingestOps(ops, { isRemote: true });
          for (const listener of [...remoteListeners]) {
            listener(ops);
          }
        }
      }
    });
  }

  const ensureFallbackNode = (): InMemorySyncServerNode => {
    if (!fallbackNode) {
      fallbackNode = new InMemorySyncServerNode(currentConfig, options.ledger);
      unsubFallbackRemote = fallbackNode.onRemoteOpsIngested((ops) => {
        for (const listener of [...remoteListeners]) {
          listener(ops);
        }
      });
    }
    return fallbackNode;
  };

  return {
    async start(overrides?: Partial<EmbeddedServerConfig>): Promise<EmbeddedServerStatus> {
      if (overrides) {
        currentConfig = { ...currentConfig, ...overrides };
      }
      if (options.bridge) {
        try {
          const raw = (await options.bridge.request("sync.server.start", {
            namespace: currentConfig.namespace,
            roomSecret: currentConfig.roomSecret,
            nodeId: currentConfig.nodeId,
            deviceName: currentConfig.deviceName,
            deviceKind: currentConfig.deviceKind,
            port: currentConfig.port ?? POCKET_SYNC_DEFAULT_PORT,
            bindHost: currentConfig.bindHost ?? "0.0.0.0",
            storageDurability:
              currentConfig.storageDurability ??
              defaultStorageDurabilityForDevice(currentConfig.deviceKind),
            powerPolicy:
              currentConfig.powerPolicy ?? defaultPowerPolicyForDevice(currentConfig.deviceKind),
          } as BridgeObject)) as unknown as EmbeddedServerStatus;
          if (raw && typeof raw === "object") {
            lastStatus = raw;
            return lastStatus;
          }
        } catch (err) {
          const code = (err as { code?: string })?.code ?? "";
          if (
            code !== "unconfigured" &&
            code !== "host_abi_unavailable" &&
            code !== "unknown_capability"
          ) {
            if (
              (currentConfig.powerPolicy ??
                defaultPowerPolicyForDevice(currentConfig.deviceKind)) === "adaptiveRelay"
            ) {
              lastStatus = {
                ...lastStatus,
                running: false,
                degradedToClientOnly: true,
                mode: "adaptiveRelayClientOnly",
                reason: err instanceof Error ? err.message : String(err),
              };
              return lastStatus;
            }
            throw err;
          }
        }
      }

      const node = ensureFallbackNode();
      const defaultAdvertised =
        currentConfig.advertisedUrls && currentConfig.advertisedUrls.length > 0
          ? currentConfig.advertisedUrls
          : [`http://pocket-hub.local:${currentConfig.port ?? POCKET_SYNC_DEFAULT_PORT}`];
      node.setAdvertisedUrls(defaultAdvertised);
      lastStatus = node.start();
      if (options.meshRegistry) {
        for (const url of lastStatus.listenUrls) {
          options.meshRegistry.register(url, node);
        }
      }
      return lastStatus;
    },

    async stop(): Promise<EmbeddedServerStatus> {
      if (options.bridge && !fallbackNode) {
        try {
          const raw = (await options.bridge.request(
            "sync.server.stop",
            {},
          )) as unknown as EmbeddedServerStatus;
          if (raw && typeof raw === "object") {
            lastStatus = raw;
            return lastStatus;
          }
        } catch {
          // Fall through to local state update
        }
      }
      if (fallbackNode) {
        lastStatus = fallbackNode.stop();
        return lastStatus;
      }
      lastStatus = { ...lastStatus, running: false, mode: "stopped" };
      return lastStatus;
    },

    async refreshStatus(): Promise<EmbeddedServerStatus> {
      if (options.bridge && !fallbackNode) {
        try {
          const raw = (await options.bridge.request(
            "sync.server.status",
            {},
          )) as unknown as EmbeddedServerStatus;
          if (raw && typeof raw === "object") {
            lastStatus = raw;
            return lastStatus;
          }
        } catch {
          // Return cached status
        }
      }
      if (fallbackNode) {
        lastStatus = fallbackNode.getStatus();
      }
      return lastStatus;
    },

    async ingestLocalOps(ops: readonly SyncOpRecord[]): Promise<number> {
      if (ops.length === 0) return 0;
      if (options.bridge && !fallbackNode && lastStatus.running) {
        let totalAccepted = 0;
        for (let i = 0; i < ops.length; i += POCKET_SYNC_OP_BATCH_LIMIT) {
          const batch = ops.slice(i, i + POCKET_SYNC_OP_BATCH_LIMIT);
          try {
            const res = (await options.bridge.request("sync.server.ingestLocalOps", {
              ops: batch as unknown as BridgeObject[],
            })) as unknown as { acceptedCount?: number };
            totalAccepted += Number(res?.acceptedCount ?? batch.length);
          } catch {
            break;
          }
        }
        return totalAccepted;
      }
      if (fallbackNode) {
        return fallbackNode.ingestLocalOps(ops).length;
      }
      return 0;
    },

    onRemoteOps(listener: (ops: readonly SequencedSyncOp[]) => void): () => void {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },

    getFallbackNode(): InMemorySyncServerNode | undefined {
      return fallbackNode;
    },

    dispose(): void {
      unsubHostEvents?.();
      unsubFallbackRemote?.();
      fallbackNode?.stop();
      remoteListeners.clear();
    },
  };
}
