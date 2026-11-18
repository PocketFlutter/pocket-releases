/**
 * Headless Reactive SolidJS Store for `@pocket/sync` (`@pocket/sync/solid`).
 *
 * Zero JSX, zero app-specific business logic — any Pocket app can bind its
 * settings screen, menu bar popover, TV hub, or watch relay toggle directly
 * to these signals.
 */

import { createSignal, type Accessor } from "solid-js";
import type { HostBridge } from "@pocket/ui/host";
import {
  PocketSyncLedger,
  defaultPowerPolicyForDevice,
  defaultStorageDurabilityForDevice,
  type SequencedSyncOp,
  type SyncDeviceKind,
  type SyncOpRecord,
} from "./protocol.ts";
import {
  InMemorySyncMeshRegistry,
  createEmbeddedServerController,
  type EmbeddedServerConfig,
  type EmbeddedServerStatus,
} from "./server.ts";
import {
  MultiEndpointSyncClient,
  createCompositeSyncTransport,
  type MeshSyncRoundResult,
  type SyncEndpointEntry,
} from "./client.ts";

export interface SyncMeshStoreOptions {
  readonly namespace: string;
  readonly roomSecret: string;
  readonly nodeId: string;
  readonly deviceName: string;
  readonly deviceKind: SyncDeviceKind;
  readonly port?: number;
  readonly advertisedUrls?: readonly string[];
  readonly autoStartServer?: boolean;
  readonly initialEndpoints?: ReadonlyArray<{
    id?: string;
    url: string;
    label?: string;
    enabled?: boolean;
    allowInsecureWan?: boolean;
  }>;
  readonly bridge?: HostBridge;
  readonly meshRegistry?: InMemorySyncMeshRegistry;
  readonly ledger?: PocketSyncLedger;
  readonly onRemoteOps?: (ops: readonly SequencedSyncOp[]) => void;
}

export interface SyncMeshStore {
  readonly ledger: PocketSyncLedger;
  readonly client: MultiEndpointSyncClient;
  readonly serverStatus: Accessor<EmbeddedServerStatus>;
  readonly endpoints: Accessor<readonly SyncEndpointEntry[]>;
  readonly onlineCount: Accessor<number>;
  readonly syncing: Accessor<boolean>;
  readonly lastSyncAtMs: Accessor<number | null>;
  readonly lastError: Accessor<string | null>;
  setServerEnabled(enabled: boolean): Promise<EmbeddedServerStatus>;
  addEndpoint(url: string, label?: string, allowInsecureWan?: boolean): SyncEndpointEntry;
  removeEndpoint(endpointId: string): boolean;
  toggleEndpoint(endpointId: string, enabled?: boolean): void;
  recordAndBroadcastOp(op: SyncOpRecord): Promise<void>;
  syncNow(extraOps?: readonly SyncOpRecord[]): Promise<MeshSyncRoundResult>;
  probeAll(): Promise<readonly SyncEndpointEntry[]>;
  dispose(): void;
}

export function createSyncMeshStore(options: SyncMeshStoreOptions): SyncMeshStore {
  const storageDurability = defaultStorageDurabilityForDevice(options.deviceKind);
  const powerPolicy = defaultPowerPolicyForDevice(options.deviceKind);
  const ledger =
    options.ledger ??
    new PocketSyncLedger({
      nodeId: options.nodeId,
      storageDurability,
    });

  const serverConfig: EmbeddedServerConfig = {
    namespace: options.namespace,
    roomSecret: options.roomSecret,
    nodeId: options.nodeId,
    deviceName: options.deviceName,
    deviceKind: options.deviceKind,
    port: options.port,
    storageDurability,
    powerPolicy,
    advertisedUrls: options.advertisedUrls,
  };

  const serverController = createEmbeddedServerController({
    config: serverConfig,
    bridge: options.bridge,
    meshRegistry: options.meshRegistry,
    ledger,
  });

  const [serverStatus, setServerStatus] = createSignal<EmbeddedServerStatus>({
    running: false,
    degradedToClientOnly: false,
    mode: "stopped",
    port: options.port ?? 8795,
    serverInstanceId: ledger.serverInstanceId,
    nodeId: options.nodeId,
    deviceName: options.deviceName,
    deviceKind: options.deviceKind,
    storageDurability,
    powerPolicy,
    listenUrls: options.advertisedUrls ?? [],
    lanUrls: [],
    overlayUrls: [],
    connectedPeers: 0,
    latestSeq: ledger.getLatestSeq(),
    storedBlobCount: 0,
    storedBlobBytes: 0,
  });

  const [endpoints, setEndpoints] = createSignal<readonly SyncEndpointEntry[]>([]);
  const [syncing, setSyncing] = createSignal(false);
  const [lastSyncAtMs, setLastSyncAtMs] = createSignal<number | null>(null);
  const [lastError, setLastError] = createSignal<string | null>(null);

  const transport = createCompositeSyncTransport({
    meshRegistry: options.meshRegistry,
    bridge: options.bridge,
  });

  const client = new MultiEndpointSyncClient({
    namespace: options.namespace,
    roomSecret: options.roomSecret,
    clientNodeId: options.nodeId,
    ledger,
    transport,
    initialEndpoints: options.initialEndpoints,
    onRemoteOps: (ops) => {
      options.onRemoteOps?.(ops);
    },
    onStateChange: (next) => {
      setEndpoints(next);
    },
  });

  setEndpoints(client.getEndpoints());

  const unsubServerOps = serverController.onRemoteOps((ops) => {
    options.onRemoteOps?.(ops);
    void serverController.refreshStatus().then(setServerStatus);
  });

  const onlineCount: Accessor<number> = () =>
    endpoints().filter((ep) => ep.enabled && ep.status === "online").length;

  const runSyncNow = async (
    extraOps?: readonly SyncOpRecord[],
  ): Promise<MeshSyncRoundResult> => {
    setSyncing(true);
    setLastError(null);
    try {
      if (extraOps && extraOps.length > 0) {
        await serverController.ingestLocalOps(extraOps);
      }
      const round = await client.syncAll(extraOps);
      setLastSyncAtMs(Date.now());
      if (serverStatus().running) {
        setServerStatus(await serverController.refreshStatus());
      }
      return round;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
      throw err;
    } finally {
      setSyncing(false);
    }
  };

  if (options.autoStartServer ?? powerPolicy === "alwaysOn") {
    void serverController
      .start()
      .then(setServerStatus)
      .catch((err) => {
        setLastError(err instanceof Error ? err.message : String(err));
      });
  }

  return {
    ledger,
    client,
    serverStatus,
    endpoints,
    onlineCount,
    syncing,
    lastSyncAtMs,
    lastError,

    async setServerEnabled(enabled: boolean): Promise<EmbeddedServerStatus> {
      try {
        setLastError(null);
        const next = enabled
          ? await serverController.start()
          : await serverController.stop();
        setServerStatus(next);
        return next;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLastError(msg);
        throw err;
      }
    },

    addEndpoint(url: string, label?: string, allowInsecureWan?: boolean): SyncEndpointEntry {
      setLastError(null);
      return client.addEndpoint({ url, label, allowInsecureWan, enabled: true });
    },

    removeEndpoint(endpointId: string): boolean {
      return client.removeEndpoint(endpointId);
    },

    toggleEndpoint(endpointId: string, enabled?: boolean): void {
      client.toggleEndpoint(endpointId, enabled);
    },

    async recordAndBroadcastOp(op: SyncOpRecord): Promise<void> {
      ledger.ingestOps([op], { isRemote: false });
      await serverController.ingestLocalOps([op]);
      if (serverStatus().running) {
        setServerStatus(await serverController.refreshStatus());
      }
      if (endpoints().some((ep) => ep.enabled)) {
        await runSyncNow();
      }
    },

    syncNow: runSyncNow,

    async probeAll(): Promise<readonly SyncEndpointEntry[]> {
      return client.probeAll();
    },

    dispose(): void {
      unsubServerOps();
      client.dispose();
      serverController.dispose();
    },
  };
}
