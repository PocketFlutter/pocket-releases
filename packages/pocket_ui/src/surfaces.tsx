/**
 * Unified Apple & Android Full-Ecosystem + System Widget/Extension Surface SDK.
 *
 * Single-engine contract:
 * - Editor live preview (`pocket_probe`) and real-device system extensions
 *   (Apple WidgetKit / Today / Lock Screen / Live Activity / Dynamic Island /
 *   Watch Smart Stack & Complications / App Clip, and Android AppWidget /
 *   Glance / At-a-Glance / Live Update / Wear OS Tile / Instant App) execute
 *   the exact same `buildGuest`-compiled `app.qjbc` + `app.pak` bundle.
 * - Interactive regions inside widgets declare `<WidgetActionLink href="pocket://...">`,
 *   which acts as a live `<Focusable>` tap target in Editor preview AND emits a
 *   deduplicated `widget.snapshot` hotspot manifest (committed `pocket.getLayouts`
 *   rectangles + deep-link URIs) so native WidgetKit `Link` / Android `RemoteViews`
 *   tap overlays stay 100% pixel-identical with the Editor canvas.
 */

import {
  For,
  Show,
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { onFrame } from "@pocketjs/framework/solid/lifecycle";
import {
  Focusable,
  Text,
  View,
  type NodeMirror,
} from "@pocketjs/framework/solid/components";
import { createHostBridge, type BridgeObject, type HostBridge, type HostEvent } from "./host.ts";
import {
  subscribeHostEvents,
  type DisplayGeometryBridge,
} from "./display.ts";
import {
  availableDisplayPanes,
  type DisplayGeometry,
} from "./responsive.ts";
import {
  useUiSkin,
  type UiSkinTokens,
} from "./skins.tsx";
import { MobileParagraph, toMobileColor } from "./mobile.tsx";

function normalizeNativeColor(color: string): string {
  if (color.startsWith("#")) return color;
  const argb = toMobileColor(color) >>> 0;
  const a = (argb >>> 24) & 0xff;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  const hex2 = (n: number) => n.toString(16).padStart(2, "0");
  return a === 0xff ? `#${hex2(r)}${hex2(g)}${hex2(b)}` : `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;
}
import { useOptionalPocketRouter } from "./router.tsx";
import {
  DEFAULT_SURFACE_ENVIRONMENT,
  MAX_WIDGET_HOTSPOTS,
  SURFACE_CONTEXT_EVENT,
  WIDGET_ACTION_EVENT,
  WIDGET_SNAPSHOT_EVENT,
  deriveSurfaceFormFactor,
  parseSurfaceEnvironment,
  type SurfaceEnvironment,
  type SurfaceRenderMode,
} from "./surface-catalog.ts";

export * from "./surface-catalog.ts";

const INITIAL_HOTSPOT_FRAMES = 3;

export interface ResolvedSurfacePalette {
  readonly mode: SurfaceRenderMode;
  readonly surfaceBg: string;
  readonly cardBg: string;
  readonly subtleBg: string;
  readonly border: string;
  readonly primaryInk: string;
  readonly secondaryInk: string;
  readonly mutedInk: string;
  readonly accentBg: string;
  readonly accentSoftBg: string;
  readonly accentInk: string;
  readonly onAccentInk: string;
}

interface LatestSurfaceFact {
  readonly event: HostEvent;
  readonly environment: SurfaceEnvironment;
}

const latestSurfaceFacts = new WeakMap<object, LatestSurfaceFact>();

function globalSurfaceBridge(): DisplayGeometryBridge {
  return globalThis as typeof globalThis & DisplayGeometryBridge;
}

export interface SurfaceEnvironmentOptions {
  readonly bridge?: DisplayGeometryBridge;
  readonly fallback?: SurfaceEnvironment;
  readonly onChange?: (env: SurfaceEnvironment) => void;
}

/**
 * Reactive Solid signal tracking the active Apple/Android device or widget
 * surface published on the host's `platform.surface` event lane.
 */
export function createSurfaceEnvironment(
  options: SurfaceEnvironmentOptions = {},
): Accessor<SurfaceEnvironment> {
  const bridge = options.bridge ?? globalSurfaceBridge();
  const fallback = options.fallback ?? DEFAULT_SURFACE_ENVIRONMENT;
  const cached = latestSurfaceFacts.get(bridge)?.environment ?? fallback;
  const [env, setEnv] = createSignal<SurfaceEnvironment>(cached);
  let disposed = false;

  onMount(() => {
    const unsubscribe = subscribeHostEvents((event: HostEvent) => {
      if (disposed || event.method !== SURFACE_CONTEXT_EVENT) return;
      const next = parseSurfaceEnvironment(event.params, env());
      latestSurfaceFacts.set(bridge, { event, environment: next });
      setEnv(next);
      try {
        options.onChange?.(next);
      } catch {
        // Isolate observer callback failures from the host event lane.
      }
    }, bridge);
    const latest = latestSurfaceFacts.get(bridge);
    if (latest && latest.environment !== env()) {
      setEnv(latest.environment);
    }
    onCleanup(() => {
      disposed = true;
      unsubscribe();
    });
  });

  return env;
}

const SurfaceEnvironmentContext = createContext<Accessor<SurfaceEnvironment> | undefined>(undefined);

export interface SurfaceEnvironmentProviderProps extends SurfaceEnvironmentOptions {
  readonly value?: Accessor<SurfaceEnvironment>;
  readonly children: JSX.Element;
}

export function SurfaceEnvironmentProvider(
  props: SurfaceEnvironmentProviderProps,
): JSX.Element {
  const signal = props.value ?? createSurfaceEnvironment(props);
  return SurfaceEnvironmentContext.Provider({
    get value() {
      return signal;
    },
    get children() {
      return props.children;
    },
  });
}

export function useSurfaceEnvironment(): Accessor<SurfaceEnvironment> {
  const ctx = useContext(SurfaceEnvironmentContext);
  if (ctx) return ctx;
  return () => DEFAULT_SURFACE_ENVIRONMENT;
}

/**
 * Resolve skin tokens into a render-mode-accurate widget/surface palette:
 * - `fullColor`: native skin tokens (`Default`, `Looseleaf`, `Arc`)
 * - `vibrant`: iOS Lock Screen / Smart Stack translucent monochrome glass
 * - `accented`: WidgetKit accented tint / Material You tonal accent
 * - `alwaysOn`: ultra-low-luminance OLED Always-On Display palette
 */
export function resolveSurfacePalette(
  tokens: UiSkinTokens,
  renderMode: SurfaceRenderMode,
): ResolvedSurfacePalette {
  if (renderMode === "vibrant") {
    return {
      mode: "vibrant",
      surfaceBg: "#161E2E",
      cardBg: "#222D42",
      subtleBg: "#1B2436",
      border: "#475569",
      primaryInk: "#F8FAFC",
      secondaryInk: "#E2E8F0",
      mutedInk: "#94A3B8",
      accentBg: "#F8FAFC",
      accentSoftBg: "#293548",
      accentInk: "#FFFFFF",
      onAccentInk: "#0F172A",
    };
  }
  if (renderMode === "accented") {
    return {
      mode: "accented",
      surfaceBg: "#0F172A",
      cardBg: tokens.accentSubtleBg,
      subtleBg: "#1E293B",
      border: tokens.accentBg,
      primaryInk: "#F8FAFC",
      secondaryInk: "#CBD5E1",
      mutedInk: "#94A3B8",
      accentBg: normalizeNativeColor(tokens.accentBg),
      accentSoftBg: tokens.accentSubtleBg,
      accentInk: normalizeNativeColor(tokens.accentBg),
      onAccentInk: normalizeNativeColor(tokens.accentFg),
    };
  }
  if (renderMode === "alwaysOn") {
    return {
      mode: "alwaysOn",
      surfaceBg: "#05070B",
      cardBg: "#0B0F17",
      subtleBg: "#111622",
      border: "#1E2636",
      primaryInk: "#CBD5E1",
      secondaryInk: "#94A3B8",
      mutedInk: "#64748B",
      accentBg: "#334155",
      accentSoftBg: "#151C28",
      accentInk: "#93C5FD",
      onAccentInk: "#E2E8F0",
    };
  }
  return {
    mode: "fullColor",
    surfaceBg: normalizeNativeColor(tokens.surfaceBg),
    cardBg: normalizeNativeColor(tokens.surfaceRaisedBg),
    subtleBg: normalizeNativeColor(tokens.surfaceMutedBg),
    border: normalizeNativeColor(tokens.border),
    primaryInk: normalizeNativeColor(tokens.ink),
    secondaryInk: normalizeNativeColor(tokens.inkSecondary),
    mutedInk: normalizeNativeColor(tokens.inkMuted),
    accentBg: normalizeNativeColor(tokens.accentBg),
    accentSoftBg: normalizeNativeColor(tokens.accentSubtleBg),
    accentInk: normalizeNativeColor(tokens.accentBg),
    onAccentInk: normalizeNativeColor(tokens.accentFg),
  };
}

// ── Widget Hotspot & Snapshot Bridge (100% Pixel-Identical Deep-Linking) ─────

export interface WidgetHotspotRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WidgetHotspot {
  readonly id: string;
  readonly nativeId: number;
  readonly label: string;
  readonly href: string;
  readonly role: "link" | "button";
  readonly rect: WidgetHotspotRect;
}

export interface WidgetSnapshotManifest {
  readonly generation: number;
  readonly profileId: string;
  readonly renderMode: SurfaceRenderMode;
  readonly hotspots: readonly WidgetHotspot[];
}

export interface WidgetHotspotRegistration {
  readonly id: string;
  readonly label: string | (() => string);
  readonly href: string | (() => string);
  readonly role?: "link" | "button";
  readonly disabled?: boolean | (() => boolean);
  readonly onActivate?: (href: string) => void;
}

export interface WidgetSnapshotBridge {
  emit?: (method: string, params?: BridgeObject) => boolean;
  onEvent?: (listener: (event: HostEvent) => void) => () => void;
  __pocketHostBridge?: WidgetSnapshotBridge;
}

export interface WidgetSnapshotStore {
  register(item: WidgetHotspotRegistration): (node: NodeMirror | null | undefined) => void;
  unregister(id: string): void;
  snapshot(): WidgetSnapshotManifest;
  readonly hotspots: Accessor<readonly WidgetHotspot[]>;
  flush(): boolean;
  dispose(): void;
  readonly generation: number;
}

type PocketLayoutGlobal = {
  getLayout?: (id: number) => unknown;
  getLayouts?: (ids: readonly number[]) => unknown;
};

const pocketLayoutGlobal = globalThis as typeof globalThis & {
  pocket?: PocketLayoutGlobal;
};

function parseRect(raw: unknown): WidgetHotspotRect | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const x = typeof rec.x === "number" && Number.isFinite(rec.x) ? rec.x : undefined;
  const y = typeof rec.y === "number" && Number.isFinite(rec.y) ? rec.y : undefined;
  const wRaw = rec.width ?? rec.w;
  const hRaw = rec.height ?? rec.h;
  const width = typeof wRaw === "number" && Number.isFinite(wRaw) ? wRaw : undefined;
  const height = typeof hRaw === "number" && Number.isFinite(hRaw) ? hRaw : undefined;
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

function measureHotspotBatch(
  nodes: readonly (NodeMirror | undefined)[],
): readonly (WidgetHotspotRect | undefined)[] {
  if (nodes.length === 0) return [];
  const getLayouts = pocketLayoutGlobal.pocket?.getLayouts;
  if (typeof getLayouts === "function") {
    try {
      const ids: number[] = [];
      const indexMap: number[] = [];
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        if (node) {
          ids.push(node.id);
          indexMap.push(i);
        }
      }
      if (ids.length === 0) return new Array(nodes.length).fill(undefined);
      const rawBatch = getLayouts(ids);
      if (Array.isArray(rawBatch) && rawBatch.length === ids.length) {
        const result = new Array<WidgetHotspotRect | undefined>(nodes.length).fill(undefined);
        for (let k = 0; k < ids.length; k += 1) {
          result[indexMap[k]!] = parseRect(rawBatch[k]);
        }
        return result;
      }
    } catch {
      // Fall back to individual getLayout calls below.
    }
  }
  const getLayout = pocketLayoutGlobal.pocket?.getLayout;
  if (typeof getLayout !== "function") return new Array(nodes.length).fill(undefined);
  return nodes.map((node) => {
    if (!node) return undefined;
    try {
      return parseRect(getLayout(node.id));
    } catch {
      return undefined;
    }
  });
}

function readStr(value: string | (() => string)): string {
  try {
    const resolved = typeof value === "function" ? value() : value;
    return typeof resolved === "string" ? resolved : "";
  } catch {
    return "";
  }
}

function readBool(value: boolean | (() => boolean) | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  try {
    const resolved = typeof value === "function" ? value() : value;
    return typeof resolved === "boolean" ? resolved : fallback;
  } catch {
    return fallback;
  }
}

let sharedDefaultSnapshotBridge: HostBridge | undefined;

function resolveSnapshotBridge(bridge?: WidgetSnapshotBridge): WidgetSnapshotBridge {
  if (bridge) {
    if (typeof bridge.emit === "function" || typeof bridge.onEvent === "function") {
      return bridge;
    }
    if (bridge.__pocketHostBridge) return bridge.__pocketHostBridge;
  }
  const global = globalThis as typeof globalThis & WidgetSnapshotBridge;
  if (typeof global.emit === "function" || typeof global.onEvent === "function") return global;
  if (global.__pocketHostBridge && (typeof global.__pocketHostBridge.emit === "function" || typeof global.__pocketHostBridge.onEvent === "function")) {
    return global.__pocketHostBridge;
  }
  if (!sharedDefaultSnapshotBridge) {
    sharedDefaultSnapshotBridge = createHostBridge();
  }
  return sharedDefaultSnapshotBridge;
}

function sameHotspots(
  left: readonly WidgetHotspot[],
  right: readonly WidgetHotspot[],
): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!;
    const b = right[i]!;
    if (
      a.id !== b.id ||
      a.nativeId !== b.nativeId ||
      a.label !== b.label ||
      a.href !== b.href ||
      a.role !== b.role ||
      !Object.is(a.rect.x, b.rect.x) ||
      !Object.is(a.rect.y, b.rect.y) ||
      !Object.is(a.rect.width, b.rect.width) ||
      !Object.is(a.rect.height, b.rect.height)
    ) {
      return false;
    }
  }
  return true;
}

interface HotspotEntry {
  readonly item: WidgetHotspotRegistration;
  node: NodeMirror | undefined;
  pendingFrames: number;
}

export interface WidgetSnapshotStoreOptions {
  readonly bridge?: WidgetSnapshotBridge;
  readonly environment?: Accessor<SurfaceEnvironment>;
  readonly maxHotspots?: number;
}

export function createWidgetSnapshotStore(
  options: WidgetSnapshotStoreOptions = {},
): WidgetSnapshotStore {
  const bridge = resolveSnapshotBridge(options.bridge);
  const env = options.environment ?? (() => DEFAULT_SURFACE_ENVIRONMENT);
  const maxHotspots = Math.min(
    MAX_WIDGET_HOTSPOTS,
    Math.max(1, Math.trunc(options.maxHotspots ?? MAX_WIDGET_HOTSPOTS)),
  );
  const entries = new Map<string, HotspotEntry>();
  const [hotspotsSignal, setHotspotsSignal] = createSignal<readonly WidgetHotspot[]>([]);
  let disposed = false;
  let generation = 0;
  let lastProfileId = "";
  let lastRenderMode: SurfaceRenderMode = "fullColor";
  let lastHotspots: readonly WidgetHotspot[] = [];
  let hasPublished = false;

  const collectCurrent = (): {
    hotspots: WidgetHotspot[];
    pendingInitial: boolean;
  } => {
    const active: HotspotEntry[] = [];
    for (const entry of entries.values()) {
      if (readBool(entry.item.disabled, false)) continue;
      active.push(entry);
    }
    const rects = measureHotspotBatch(active.map((entry) => entry.node));
    const hotspots: WidgetHotspot[] = [];
    let pendingInitial = false;
    for (let idx = 0; idx < active.length; idx += 1) {
      const entry = active[idx]!;
      const rect = rects[idx];
      if (!entry.node || !rect) {
        if (entry.pendingFrames > 0) {
          entry.pendingFrames -= 1;
          if (entry.pendingFrames > 0) pendingInitial = true;
        }
        continue;
      }
      entry.pendingFrames = 0;
      const href = readStr(entry.item.href).trim();
      if (!href) continue;
      hotspots.push({
        id: entry.item.id,
        nativeId: entry.node.id,
        label: readStr(entry.item.label),
        href,
        role: entry.item.role === "button" ? "button" : "link",
        rect,
      });
      if (hotspots.length >= maxHotspots) break;
    }
    return { hotspots, pendingInitial };
  };

  const emitSnapshot = (
    hotspots: readonly WidgetHotspot[],
    force = false,
  ): boolean => {
    if (disposed && !force) return false;
    if (!sameHotspots(lastHotspots, hotspots)) {
      setHotspotsSignal(hotspots);
    }
    if (typeof bridge.emit !== "function") {
      lastHotspots = hotspots;
      return false;
    }
    const currentEnv = env();
    if (
      !force &&
      hasPublished &&
      lastProfileId === currentEnv.profileId &&
      lastRenderMode === currentEnv.renderMode &&
      sameHotspots(lastHotspots, hotspots)
    ) {
      return true;
    }
    const nextGen = generation + 1;
    let accepted = false;
    try {
      accepted = bridge.emit(WIDGET_SNAPSHOT_EVENT, {
        generation: nextGen,
        profileId: currentEnv.profileId,
        renderMode: currentEnv.renderMode,
        hotspots: hotspots.map((spot) => ({
          id: spot.id,
          nativeId: spot.nativeId,
          label: spot.label,
          href: spot.href,
          role: spot.role,
          rect: { ...spot.rect },
        })),
      } as unknown as BridgeObject) === true;
    } catch {
      accepted = false;
    }
    if (accepted) {
      generation = nextGen;
      lastProfileId = currentEnv.profileId;
      lastRenderMode = currentEnv.renderMode;
      lastHotspots = hotspots;
      hasPublished = true;
    }
    return accepted;
  };

  const flush = (): boolean => {
    if (disposed) return false;
    if (entries.size === 0 && (!hasPublished || lastHotspots.length === 0)) return false;
    const { hotspots, pendingInitial } = collectCurrent();
    if (pendingInitial && !hasPublished) return false;
    return emitSnapshot(hotspots);
  };

  const removeHostEvent = bridge.onEvent?.((event: HostEvent) => {
    if (disposed || event.method !== WIDGET_ACTION_EVENT) return;
    const params = event.params as Record<string, unknown>;
    const id = typeof params.id === "string" ? params.id : "";
    if (!id) return;
    const entry = entries.get(id);
    if (!entry || readBool(entry.item.disabled, false)) return;
    const href = readStr(entry.item.href).trim();
    if (!href) return;
    try {
      entry.item.onActivate?.(href);
    } catch {
      // Keep host event lane isolated.
    }
  });

  try {
    onFrame(() => {
      flush();
    }, {
      active: () => !disposed,
      continuous: () => {
        for (const entry of entries.values()) {
          if (!readBool(entry.item.disabled, false) && entry.pendingFrames > 0) return true;
        }
        return false;
      },
    });
  } catch {
    // Store may be created outside a component mount in unit tests.
  }

  return {
    register(item) {
      if (disposed) return () => {};
      if (!item.id || typeof item.id !== "string") {
        throw new TypeError("WidgetActionLink id must be a non-empty string");
      }
      const entry: HotspotEntry = {
        item,
        node: undefined,
        pendingFrames: INITIAL_HOTSPOT_FRAMES,
      };
      entries.set(item.id, entry);
      try {
        onCleanup(() => {
          entries.delete(item.id);
        });
      } catch {
        // Explicit unregister remains available outside Solid scopes.
      }
      return (node) => {
        const current = entries.get(item.id);
        if (!current || current.node === node) return;
        current.node = node ?? undefined;
        current.pendingFrames = INITIAL_HOTSPOT_FRAMES;
      };
    },
    unregister(id) {
      entries.delete(id);
    },
    snapshot() {
      const currentEnv = env();
      const { hotspots } = collectCurrent();
      return {
        generation,
        profileId: currentEnv.profileId,
        renderMode: currentEnv.renderMode,
        hotspots,
      };
    },
    hotspots: hotspotsSignal,
    flush,
    dispose() {
      if (disposed) return;
      if (hasPublished || entries.size > 0) emitSnapshot([], true);
      disposed = true;
      removeHostEvent?.();
      entries.clear();
    },
    get generation() {
      return generation;
    },
  };
}

export async function publishWidgetSnapshot(
  host: Pick<HostBridge, "request">,
  manifest: WidgetSnapshotManifest,
): Promise<BridgeObject> {
  return host.request<BridgeObject>("platform.widgets.publishSnapshot", {
    generation: manifest.generation,
    profileId: manifest.profileId,
    renderMode: manifest.renderMode,
    hotspots: manifest.hotspots.map((spot) => ({
      id: spot.id,
      nativeId: spot.nativeId,
      label: spot.label,
      href: spot.href,
      role: spot.role,
      rect: { ...spot.rect },
    })),
  } as unknown as BridgeObject);
}

const WidgetSnapshotContext = createContext<WidgetSnapshotStore | undefined>(undefined);

export interface WidgetSnapshotProviderProps extends WidgetSnapshotStoreOptions {
  readonly store?: WidgetSnapshotStore;
  readonly children: JSX.Element;
}

export function WidgetSnapshotProvider(props: WidgetSnapshotProviderProps): JSX.Element {
  const inheritedEnv = useSurfaceEnvironment();
  const store = props.store ?? createWidgetSnapshotStore({
    bridge: props.bridge,
    environment: props.environment ?? inheritedEnv,
    maxHotspots: props.maxHotspots,
  });
  const ownsStore = props.store === undefined;
  try {
    onCleanup(() => {
      if (ownsStore) store.dispose();
    });
  } catch {
    // Caller-supplied stores manage their own lifecycle.
  }
  return WidgetSnapshotContext.Provider({
    get value() {
      return store;
    },
    get children() {
      return props.children;
    },
  });
}

export function useWidgetSnapshots(): WidgetSnapshotStore | undefined {
  return useContext(WidgetSnapshotContext);
}

let autoHotspotId = 0;

export interface WidgetActionLinkProps {
  readonly id?: string;
  readonly href: string;
  readonly label: string;
  readonly role?: "link" | "button";
  readonly disabled?: boolean;
  readonly class?: string;
  readonly style?: Record<string, unknown>;
  readonly onPress?: (href: string) => void;
  readonly children?: JSX.Element;
}

/**
 * Dual-mode interactive tap region for system widgets & full-ecosystem surfaces:
 * - In Editor preview (`pocket_probe`) and full-app runtimes, acts as a live
 *   `<Focusable>` that triggers `onPress` and/or `PocketRouter.openDeepLink(href)`.
 * - Simultaneously registers its committed layout rectangle + `href` in
 *   `WidgetSnapshotStore` so real-device WidgetKit `Link` / Android `RemoteViews`
 *   overlays map the exact same tap region to `href`.
 */
export function WidgetActionLink(props: WidgetActionLinkProps): JSX.Element {
  const store = useWidgetSnapshots();
  const router = useOptionalPocketRouter();
  const stableId = props.id ?? `widget-hotspot-${++autoHotspotId}`;

  const activate = (): void => {
    if (props.disabled) return;
    const href = props.href;
    props.onPress?.(href);
    if (!props.onPress && router && href) {
      router.openDeepLink(href, { synthesizeStack: true });
    }
  };

  const bindRef = store?.register({
    id: stableId,
    label: () => props.label,
    href: () => props.href,
    role: props.role ?? "link",
    disabled: () => Boolean(props.disabled),
    onActivate: () => activate(),
  });

  return (
    <Focusable
      nodeRef={bindRef}
      class={props.class ?? "flex-row items-center"}
      style={props.style}
      onPress={activate}
    >
      {props.children}
    </Focusable>
  );
}

// ── Reusable Multi-Ecosystem & System Widget Components ──────────────────────

export interface WidgetSurfaceProps {
  readonly renderMode?: SurfaceRenderMode;
  readonly cornerRadius?: number;
  readonly padding?: number;
  readonly roundSafe?: boolean;
  readonly class?: string;
  readonly style?: Record<string, unknown>;
  readonly children: JSX.Element;
}

export function WidgetSurface(props: WidgetSurfaceProps): JSX.Element {
  const skin = useUiSkin();
  const env = useSurfaceEnvironment();
  const activeMode = () => props.renderMode ?? env().renderMode;
  const palette = createMemo(() => resolveSurfacePalette(skin.tokens(), activeMode()));
  const radius = () => props.cornerRadius ?? env().cornerRadius;
  const pad = () => {
    if (props.padding !== undefined) return props.padding;
    if (props.roundSafe || env().screenShape === "round") {
      return Math.max(env().contentPadding, 8);
    }
    return env().contentPadding;
  };

  return (
    <View
      class={props.class ?? "w-full h-full flex-col justify-between overflow-hidden"}
      style={{
        bgColor: palette().surfaceBg,
        borderColor: palette().border,
        borderWidth: 1,
        radius: radius(),
        paddingL: pad(),
        paddingR: pad(),
        paddingT: pad(),
        paddingB: pad(),
        ...(props.style ?? {}),
      }}
    >
      {props.children}
    </View>
  );
}

export interface TodayWidgetMetric {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly href?: string;
}

export interface TodayWidgetAction {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface TodayWidgetCardProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly primaryValue: string;
  readonly subtitle: string;
  readonly badge?: string;
  readonly primaryHref?: string;
  readonly metrics?: readonly TodayWidgetMetric[];
  readonly actions?: readonly TodayWidgetAction[];
  readonly renderMode?: SurfaceRenderMode;
  readonly onAction?: (href: string) => void;
}

/**
 * Adaptive Today / Home Screen Widget card supporting Apple WidgetKit
 * (`Small`, `Medium`, `Large`, `ExtraLarge`) and Android AppWidget (`2×2`, `4×2`, `4×4`).
 */
export function TodayWidgetCard(props: TodayWidgetCardProps): JSX.Element {
  const skin = useUiSkin();
  const env = useSurfaceEnvironment();
  const palette = createMemo(() =>
    resolveSurfacePalette(skin.tokens(), props.renderMode ?? env().renderMode),
  );
  const isCompact = () =>
    env().family === "systemSmall" || env().family === "appWidgetSmall";
  const isExpanded = () =>
    env().family === "systemLarge" ||
    env().family === "systemExtraLarge" ||
    env().family === "appWidgetLarge";

  return (
    <WidgetSurface renderMode={props.renderMode} class="w-full h-full flex-col justify-between overflow-hidden">
      <View class="flex-row items-center justify-between gap-1.5">
        <Text class="text-xs font-bold" style={{ textColor: palette().accentInk }}>
          {props.eyebrow}
        </Text>
        <Show when={props.badge && !isCompact()}>
          <View
            class="px-2 py-1"
            style={{ bgColor: palette().accentSoftBg, radius: 999 }}
          >
            <Text class="text-xs font-bold" style={{ textColor: palette().accentInk }}>
              {props.badge}
            </Text>
          </View>
        </Show>
      </View>

      <WidgetActionLink
        id="today-primary-card"
        href={props.primaryHref ?? "pocket://showcase/home"}
        label={props.title}
        onPress={props.onAction}
        class="flex-col w-full gap-1 overflow-hidden"
        style={{ minW: 0 }}
      >
        <Text
          class={isCompact() ? "text-xl font-bold" : "text-2xl font-bold"}
          style={{ textColor: palette().primaryInk }}
        >
          {props.primaryValue}
        </Text>
        <MobileParagraph
          text={props.title}
          class="text-xs font-bold"
          style={{ textColor: palette().secondaryInk }}
          fallbackInsetPx={48}
        />
        <Show when={!isCompact()}>
          <MobileParagraph
            text={props.subtitle}
            class="text-xs"
            style={{ textColor: palette().mutedInk }}
            fallbackInsetPx={48}
          />
        </Show>
      </WidgetActionLink>

      <Show when={!isCompact() && (props.metrics?.length ?? 0) > 0}>
        <View class="flex-row flex-wrap gap-2">
          <For each={(props.metrics ?? []).slice(0, isExpanded() ? 4 : 2)}>
            {(metric) => (
              <WidgetActionLink
                id={`today-metric-${metric.id}`}
                href={metric.href ?? props.primaryHref ?? "pocket://showcase/home"}
                label={`${metric.label} ${metric.value}`}
                onPress={props.onAction}
                class="flex-1 flex-col gap-1 p-2 rounded-xl"
                style={{
                  bgColor: palette().cardBg,
                  borderColor: palette().border,
                  borderWidth: 1,
                  radius: 12,
                }}
              >
                <Text class="text-xs" style={{ textColor: palette().mutedInk }}>
                  {metric.label}
                </Text>
                <Text class="text-sm font-bold" style={{ textColor: palette().primaryInk }}>
                  {metric.value}
                </Text>
              </WidgetActionLink>
            )}
          </For>
        </View>
      </Show>

      <Show when={isExpanded() && (props.actions?.length ?? 0) > 0}>
        <View class="flex-row items-center gap-2">
          <For each={(props.actions ?? []).slice(0, 3)}>
            {(action, index) => (
              <WidgetActionLink
                id={`today-action-${action.id}`}
                href={action.href}
                label={action.label}
                role="button"
                onPress={props.onAction}
                class="flex-1 flex-row items-center justify-center px-2.5 py-1.5 rounded-lg"
                style={{
                  bgColor: index() === 0 ? palette().accentBg : palette().subtleBg,
                  borderColor: palette().border,
                  borderWidth: index() === 0 ? 0 : 1,
                  radius: 10,
                }}
              >
                <Text
                  class="text-xs font-bold"
                  style={{
                    textColor: index() === 0 ? palette().onAccentInk : palette().primaryInk,
                  }}
                >
                  {action.label}
                </Text>
              </WidgetActionLink>
            )}
          </For>
        </View>
      </Show>
    </WidgetSurface>
  );
}

export interface LockAccessoryWidgetProps {
  readonly glyph: string;
  readonly shortValue: string;
  readonly title: string;
  readonly detail: string;
  readonly inlineText?: string;
  readonly href: string;
  readonly renderMode?: SurfaceRenderMode;
  readonly onAction?: (href: string) => void;
}

/**
 * Adaptive Lock Screen accessory widget supporting Apple `accessoryCircular`,
 * `accessoryRectangular`, `accessoryInline`, and Android `atAGlance`.
 */
export function LockAccessoryWidget(props: LockAccessoryWidgetProps): JSX.Element {
  const skin = useUiSkin();
  const env = useSurfaceEnvironment();
  const mode = () => props.renderMode ?? env().renderMode;
  const palette = createMemo(() => resolveSurfacePalette(skin.tokens(), mode()));
  const family = () => env().family;

  return (
    <Show
      when={family() !== "accessoryInline"}
      fallback={
        <WidgetActionLink
          id="lock-inline-link"
          href={props.href}
          label={props.inlineText ?? `${props.glyph} ${props.title} · ${props.shortValue}`}
          onPress={props.onAction}
          class="w-full h-full flex-row items-center gap-1.5 px-2 overflow-hidden"
          style={{
            bgColor: palette().surfaceBg,
            borderColor: palette().border,
            borderWidth: 1,
            radius: 14,
          }}
        >
          <Text class="text-xs font-bold" style={{ textColor: palette().accentInk }}>
            {props.glyph}
          </Text>
          <Text class="text-xs font-bold" style={{ textColor: palette().primaryInk }}>
            {props.inlineText ?? `${props.title} · ${props.shortValue}`}
          </Text>
        </WidgetActionLink>
      }
    >
      <Show
        when={family() !== "accessoryCircular" && family() !== "watchCorner"}
        fallback={
          <WidgetActionLink
            id="lock-circular-link"
            href={props.href}
            label={`${props.title} ${props.shortValue}`}
            onPress={props.onAction}
            class="w-full h-full flex-col items-center justify-center gap-1 overflow-hidden"
            style={{
              bgColor: palette().surfaceBg,
              borderColor: palette().border,
              borderWidth: 2,
              radius: Math.round(Math.min(env().cornerRadius, 40)),
            }}
          >
            <Text class="text-xs font-bold" style={{ textColor: palette().accentInk }}>
              {props.glyph}
            </Text>
            <Text class="text-sm font-bold" style={{ textColor: palette().primaryInk }}>
              {props.shortValue}
            </Text>
          </WidgetActionLink>
        }
      >
        <WidgetActionLink
          id="lock-rect-link"
          href={props.href}
          label={`${props.title} ${props.detail}`}
          onPress={props.onAction}
          class="w-full h-full flex-col justify-center gap-1 px-3 py-2 overflow-hidden"
          style={{
            bgColor: palette().surfaceBg,
            borderColor: palette().border,
            borderWidth: 1,
            radius: env().cornerRadius,
          }}
        >
          <View class="flex-row items-center justify-between gap-1.5">
            <Text class="text-xs font-bold" style={{ textColor: palette().accentInk }}>
              {`${props.glyph} ${props.title}`}
            </Text>
            <Text class="text-xs font-bold" style={{ textColor: palette().primaryInk }}>
              {props.shortValue}
            </Text>
          </View>
          <Text class="text-xs" style={{ textColor: palette().secondaryInk }}>
            {props.detail}
          </Text>
        </WidgetActionLink>
      </Show>
    </Show>
  );
}

export interface LiveActivityBannerProps {
  readonly leadingBadge: string;
  readonly trailingMetric: string;
  readonly title: string;
  readonly subtitle: string;
  readonly progress: number;
  readonly primaryActionLabel: string;
  readonly primaryHref: string;
  readonly secondaryActionLabel?: string;
  readonly secondaryHref?: string;
  readonly onAction?: (href: string) => void;
}

/**
 * Adaptive Live Activity surface supporting Apple Dynamic Island (`Compact`,
 * `Minimal`, `Expanded`), Lock Screen Live Activity, and Android 16 `Live Update`.
 * In `dynamicIslandCompact`, automatically splits leading/trailing slots around
 * the central TrueDepth camera occlusion (`74px | 88px sensor | 74px`).
 */
export function LiveActivityBanner(props: LiveActivityBannerProps): JSX.Element {
  const skin = useUiSkin();
  const env = useSurfaceEnvironment();
  const clampedProgress = () => Math.max(0, Math.min(1, props.progress));
  const isIslandMinimal = () => env().family === "dynamicIslandMinimal";
  const isIslandCompact = () => env().family === "dynamicIslandCompact";
  const isDarkCapsule = () =>
    env().ecosystem === "apple" &&
    (isIslandMinimal() || isIslandCompact() || env().family === "dynamicIslandExpanded");
  const palette = createMemo(() => resolveSurfacePalette(skin.tokens(), env().renderMode));

  return (
    <Show
      when={!isIslandMinimal()}
      fallback={
        <WidgetActionLink
          id="island-minimal-pill"
          href={props.primaryHref}
          label={props.leadingBadge}
          onPress={props.onAction}
          class="w-full h-full flex-row items-center justify-center overflow-hidden"
          style={{
            bgColor: "#05070B",
            borderColor: "#27272A",
            borderWidth: 1,
            radius: 19,
          }}
        >
          <Text class="text-xs font-bold" style={{ textColor: "#34D399" }}>
            {props.leadingBadge}
          </Text>
        </WidgetActionLink>
      }
    >
      <Show
        when={!isIslandCompact()}
        fallback={
          <WidgetActionLink
            id="island-compact-pill"
            href={props.primaryHref}
            label={`${props.title} ${props.trailingMetric}`}
            onPress={props.onAction}
            class="w-full h-full flex-row items-center justify-between px-3 overflow-hidden"
            style={{
              bgColor: "#05070B",
              borderColor: "#27272A",
              borderWidth: 1,
              radius: 19,
            }}
          >
            <View class="flex-row items-center gap-1" style={{ width: 62 }}>
              <Text class="text-xs font-bold" style={{ textColor: "#34D399" }}>
                {props.leadingBadge}
              </Text>
            </View>
            <View style={{ width: 88, height: 20 }} />
            <View class="flex-row items-center justify-end gap-1" style={{ width: 62 }}>
              <Text class="text-xs font-bold" style={{ textColor: "#60A5FA" }}>
                {props.trailingMetric}
              </Text>
            </View>
          </WidgetActionLink>
        }
      >
        <View
          class="w-full h-full flex-col justify-between p-3.5 overflow-hidden"
          style={{
            bgColor: isDarkCapsule() ? "#080B12" : palette().surfaceBg,
            borderColor: isDarkCapsule() ? "#273043" : palette().border,
            borderWidth: 1,
            radius: env().cornerRadius,
          }}
        >
          <View class="flex-row items-center justify-between gap-2 w-full" style={{ minW: 0 }}>
            <View class="flex-row items-center gap-2 flex-1" style={{ minW: 0 }}>
              <View
                class="px-2 py-1 shrink-0"
                style={{
                  bgColor: isDarkCapsule() ? "#0F2E24" : palette().accentSoftBg,
                  radius: 999,
                }}
              >
                <Text
                  class="text-xs font-bold"
                  style={{ textColor: isDarkCapsule() ? "#34D399" : palette().accentInk }}
                >
                  {props.leadingBadge}
                </Text>
              </View>
              <View class="flex-1 min-w-0 overflow-hidden" style={{ minW: 0 }}>
                <MobileParagraph
                  text={props.title}
                  class="text-sm font-bold"
                  style={{ textColor: isDarkCapsule() ? "#F8FAFC" : palette().primaryInk }}
                  fallbackInsetPx={136}
                />
              </View>
            </View>
            <Text
              class="text-sm font-bold shrink-0"
              style={{ textColor: isDarkCapsule() ? "#60A5FA" : palette().accentInk }}
            >
              {props.trailingMetric}
            </Text>
          </View>

          <MobileParagraph
            text={props.subtitle}
            class="text-xs"
            style={{ textColor: isDarkCapsule() ? "#94A3B8" : palette().secondaryInk }}
            fallbackInsetPx={48}
          />

          <View
            class="w-full flex-row overflow-hidden"
            style={{
              height: 6,
              bgColor: isDarkCapsule() ? "#1E293B" : palette().subtleBg,
              radius: 999,
            }}
          >
            <View
              style={{
                grow: Math.max(1, Math.round(clampedProgress() * 1000)),
                height: 6,
                bgColor: isDarkCapsule() ? "#3B82F6" : palette().accentBg,
                radius: 999,
              }}
            />
            <View
              style={{
                grow: Math.max(0, 1000 - Math.round(clampedProgress() * 1000)),
                height: 6,
                bgColor: "#00000000",
              }}
            />
          </View>

          <View class="flex-row items-center justify-between gap-2">
            <WidgetActionLink
              id="live-primary-action"
              href={props.primaryHref}
              label={props.primaryActionLabel}
              role="button"
              onPress={props.onAction}
              class="flex-1 flex-row items-center justify-center py-1.5 px-3"
              style={{
                bgColor: isDarkCapsule() ? "#2563EB" : palette().accentBg,
                radius: 999,
              }}
            >
              <Text
                class="text-xs font-bold"
                style={{ textColor: isDarkCapsule() ? "#FFFFFF" : palette().onAccentInk }}
              >
                {props.primaryActionLabel}
              </Text>
            </WidgetActionLink>
            <Show when={props.secondaryActionLabel && props.secondaryHref}>
              <WidgetActionLink
                id="live-secondary-action"
                href={props.secondaryHref!}
                label={props.secondaryActionLabel!}
                role="button"
                onPress={props.onAction}
                class="flex-row items-center justify-center py-1.5 px-3"
                style={{
                  bgColor: isDarkCapsule() ? "#1E293B" : palette().subtleBg,
                  borderColor: isDarkCapsule() ? "#334155" : palette().border,
                  borderWidth: 1,
                  radius: 999,
                }}
              >
                <Text
                  class="text-xs font-bold"
                  style={{ textColor: isDarkCapsule() ? "#E2E8F0" : palette().primaryInk }}
                >
                  {props.secondaryActionLabel}
                </Text>
              </WidgetActionLink>
            </Show>
          </View>
        </View>
      </Show>
    </Show>
  );
}

export interface WearTileSurfaceProps {
  readonly eyebrow: string;
  readonly metric: string;
  readonly unit: string;
  readonly caption: string;
  readonly actionLabel: string;
  readonly href: string;
  readonly onAction?: (href: string) => void;
}

/**
 * Circular Wear OS Tile & Apple Watch Smart Stack surface respecting the
 * inscribed circle safe inset (`inscribedRoundInset`) on round watch faces.
 */
export function WearTileSurface(props: WearTileSurfaceProps): JSX.Element {
  const skin = useUiSkin();
  const env = useSurfaceEnvironment();
  const isRound = () => env().screenShape === "round";
  const palette = createMemo(() => resolveSurfacePalette(skin.tokens(), env().renderMode));
  const pad = () => (isRound() ? Math.max(env().contentPadding, 26) : 10);

  return (
    <View
      class="w-full h-full flex-col items-center justify-between overflow-hidden"
      style={{
        bgColor: env().renderMode === "alwaysOn" ? "#05070B" : "#090D16",
        borderColor: palette().accentBg,
        borderWidth: isRound() ? 3 : 1,
        radius: env().cornerRadius,
        paddingL: pad(),
        paddingR: pad(),
        paddingT: isRound() ? pad() : 8,
        paddingB: isRound() ? pad() : 8,
      }}
    >
      <Text class="text-xs font-bold" style={{ textColor: palette().accentInk }}>
        {props.eyebrow}
      </Text>
      <View class="flex-row items-end justify-center gap-1">
        <Text class="text-xl font-bold" style={{ textColor: "#F8FAFC" }}>
          {props.metric}
        </Text>
        <Text class="text-xs font-bold" style={{ textColor: "#94A3B8" }}>
          {props.unit}
        </Text>
      </View>
      <Show when={isRound()}>
        <Text class="text-xs" style={{ textColor: "#94A3B8" }}>
          {props.caption}
        </Text>
      </Show>
      <WidgetActionLink
        id="wear-tile-action"
        href={props.href}
        label={props.actionLabel}
        role="button"
        onPress={props.onAction}
        class="px-3 py-1"
        style={{ bgColor: palette().accentBg, radius: 999 }}
      >
        <Text class="text-xs font-bold" style={{ textColor: palette().onAccentInk }}>
          {props.actionLabel}
        </Text>
      </WidgetActionLink>
    </View>
  );
}

export interface EcosystemAdaptiveShellProps {
  readonly geometry: Accessor<DisplayGeometry>;
  readonly environment?: Accessor<SurfaceEnvironment>;
  readonly renderSystemSurface?: (env: SurfaceEnvironment) => JSX.Element;
  readonly renderWatch?: (env: SurfaceEnvironment) => JSX.Element;
  readonly primaryPane: JSX.Element | (() => JSX.Element);
  readonly secondaryPane?: JSX.Element | (() => JSX.Element);
}

/**
 * Top-level multi-ecosystem layout container:
 * - Delegates directly to `renderSystemSurface` when mounted inside a Today Widget,
 *   Lock Screen accessory, Dynamic Island / Live Activity, Watch Complication, or
 *   Android AppWidget / Wear OS Tile.
 * - Splits automatically across physical hinges (`availableDisplayPanes` >= 2) on
 *   unfolded Android Foldables without painting across the central crease.
 * - Renders compact watch layout on watchOS / Wear OS, or two-column wide layout
 *   on iPad, macOS, Vision Pro, Apple TV, Android Tablet, and CarPlay / Android Auto.
 */
export function EcosystemAdaptiveShell(
  props: EcosystemAdaptiveShellProps,
): JSX.Element {
  const inheritedEnv = useSurfaceEnvironment();
  const env = () => (props.environment ? props.environment() : inheritedEnv());
  const formFactor = createMemo(() => deriveSurfaceFormFactor(props.geometry(), env()));
  const panes = createMemo(() => availableDisplayPanes(props.geometry()));
  const mountPrimary = () =>
    typeof props.primaryPane === "function"
      ? (props.primaryPane as () => JSX.Element)()
      : props.primaryPane;
  const mountSecondary = () =>
    typeof props.secondaryPane === "function"
      ? (props.secondaryPane as () => JSX.Element)()
      : props.secondaryPane;

  return (
    <Show
      when={formFactor() !== "system-surface" || !props.renderSystemSurface}
      fallback={props.renderSystemSurface ? props.renderSystemSurface(env()) : undefined}
    >
      <Show
        when={formFactor() !== "watch" || !props.renderWatch}
        fallback={props.renderWatch ? props.renderWatch(env()) : undefined}
      >
        <Show
          when={formFactor() === "foldable-dual" && props.secondaryPane !== undefined}
          fallback={
            <Show
              when={
                (formFactor() === "wide" || formFactor() === "tv-spatial") &&
                props.secondaryPane !== undefined
              }
              fallback={<View class="w-full h-full flex-col overflow-hidden">{mountPrimary()}</View>}
            >
              <View class="w-full h-full flex-row gap-3 overflow-hidden">
                <View class="flex-1 h-full flex-col overflow-hidden">{mountPrimary()}</View>
                <View class="flex-1 h-full flex-col overflow-hidden">{mountSecondary()}</View>
              </View>
            </Show>
          }
        >
          <View class="w-full h-full flex-row overflow-hidden">
            <View
              class="h-full flex-col overflow-hidden"
              style={{ width: panes()[0]?.width ?? Math.floor(props.geometry().width / 2) }}
            >
              {mountPrimary()}
            </View>
            <View
              style={{
                width: Math.max(
                  0,
                  props.geometry().width -
                    (panes()[0]?.width ?? 0) -
                    (panes()[panes().length - 1]?.width ?? 0),
                ),
              }}
            />
            <View
              class="h-full flex-col overflow-hidden"
              style={{
                width:
                  panes()[panes().length - 1]?.width ??
                  Math.floor(props.geometry().width / 2),
              }}
            >
              {mountSecondary()}
            </View>
          </View>
        </Show>
      </Show>
    </Show>
  );
}
