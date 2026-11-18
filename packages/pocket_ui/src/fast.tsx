/**
 * High-FPS Guest Primitives & Nested Scroll Virtualization (`@pocket/ui/fast`).
 *
 * Reusable building blocks extracted from the Showcase High-FPS Stress Lab so
 * production PocketJS apps can sustain 60–120+ FPS (< 2 ms guest + FFI frame
 * work) without hand-rolling low-level `NodeMirror`, `JumpBatch`, ring-buffer,
 * or nested `ScrollablePage` gesture-arbitration boilerplate:
 *
 * 1. `writeFastText` / `createFastText`: `WeakMap`-cached `#text` child writes
 *    via `replaceText`, bypassing Solid VDOM diffs for high-frequency HUDs and
 *    streaming ticker cells.
 * 2. `syncFastStyle`: O(1) imperative paint updates (`bgColor`, `textColor`,
 *    `borderColor`, `opacity`) on retained mirrors without component rebuilds.
 * 3. `createJumpPool`: managed `createJumpBatch` pool (`ops.setPropBatch`) that
 *    lazily compiles and caches a single-FFI `Float64Array` batch across active
 *    nodes and seamlessly falls back to `jump()` while nodes mount or toggle.
 * 4. `createFrameProfiler`: zero-allocation `Float64Array` ring-buffer profiler
 *    computing `fps`, `headroomFps`, `avgWorkMs`, `p50WorkMs`, `p95WorkMs`, and
 *    `maxWorkMs` with an in-place scratch buffer (zero `.sort()` GC pressure).
 * 5. `resolveNodeLocalPoint`: converts viewport `GestureContact` `(c.x, c.y)`
 *    coordinates into node-local coordinates accounting for `ScrollablePage`
 *    paint translations (preventing `c.lx`/`c.ly` `undefined`/`NaN` pitfalls).
 * 6. `PocketVirtualList` / `SkinVirtualList`: wraps `@pocketjs/framework/virtual-list`
 *    with `panSlop: 1` touch arbitration (so enclosing `ScrollablePage` never
 *    steals vertical drags at 2px), iOS-style boundary scroll chaining
 *    (`chainDrag` / `chainEndDrag`), desktop mouse-wheel / trackpad chaining,
 *    and retained `useRouteActive()` input gating.
 */

import {
  createEffect,
  getOwner,
  onCleanup,
  untrack,
  useContext,
  type JSX,
} from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import { createScroller } from "@pocketjs/framework/kinetics";
import {
  VirtualList,
  type VirtualListHandle,
  type VirtualListProps,
} from "@pocketjs/framework/virtual-list";
import {
  createJumpBatch,
  jump,
  type JumpBatch,
} from "@pocketjs/framework/animation";
import {
  isTextNode,
  replaceText,
  syncStyle,
  type NodeMirror,
} from "@pocketjs/framework/renderer";
import { View, type ViewProps } from "@pocketjs/framework/solid/components";
import { useRouteActive } from "./route.tsx";
import {
  ScrollablePageContext,
  readCommittedNodeRect,
  registerDesktopScrollPage,
  type CommittedNodeRect,
  type DesktopScrollPage,
  type ScrollablePageContextValue,
} from "./ui.tsx";
import { useUiSkin } from "./skins.tsx";

// ============================================================================
// 1. Zero-VDOM Text & Style Fast-Paths (`writeFastText`, `syncFastStyle`)
// ============================================================================

const textChildCache = new WeakMap<NodeMirror, NodeMirror>();

function isLeafTextMirror(node: NodeMirror): boolean {
  const raw = node as NodeMirror & { domNodeType?: number; domTag?: string };
  return raw.domNodeType === 3 || raw.domTag === "#text";
}

function resolveTextTarget(node: NodeMirror | undefined): NodeMirror | undefined {
  if (!node) return undefined;
  if (isLeafTextMirror(node)) return node;
  const cached = textChildCache.get(node);
  if (cached && cached.parent === node && isTextNode(cached)) {
    return cached;
  }
  const children = node.children;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child && isTextNode(child)) {
      textChildCache.set(node, child);
      return child;
    }
  }
  // A <Text> element mirror itself has type === NODE_TYPE.text, so only write to
  // the element directly when it genuinely has no #text children. Never cache
  // the element itself in `textChildCache` because Solid's `spread()` invokes
  // `ref` before appending static `children` during initial mount.
  return isTextNode(node) && children.length === 0 ? node : undefined;
}

/**
 * Update a `<Text>` node's underlying `#text` mirror in O(1) without triggering
 * Solid signal propagation or parent reconciliation. Returns `true` when the
 * native text value actually changed.
 */
export function writeFastText(
  node: NodeMirror | undefined,
  value: string,
): boolean {
  const target = resolveTextTarget(node);
  if (!target || target.text === value) return false;
  replaceText(target, value);
  return true;
}

export interface FastTextSlot {
  /** Bind directly to `<Text ref={slot.ref}>`. */
  readonly ref: (node: NodeMirror | undefined) => void;
  /** Imperatively push a new string if changed; returns `true` when written. */
  readonly write: (value: string) => boolean;
  /** Last value written to this slot. */
  readonly current: () => string;
  /** Currently bound `<Text>` `NodeMirror`, if mounted. */
  readonly node: () => NodeMirror | undefined;
}

/**
 * Stateful fast-text handle that remembers the latest value across mount/remount
 * and caches the resolved `#text` child mirror for zero-scan per-frame writes.
 */
export function createFastText(initialValue = ""): FastTextSlot {
  let boundNode: NodeMirror | undefined;
  let boundLeafChild: NodeMirror | undefined;
  let latest = initialValue;
  let hasWritten = false;

  const resolveBound = (): NodeMirror | undefined => {
    if (
      boundLeafChild &&
      (boundLeafChild === boundNode ||
        (boundNode !== undefined && boundLeafChild.parent === boundNode))
    ) {
      return boundLeafChild;
    }
    const target = resolveTextTarget(boundNode);
    // Cache only true leaf #text mirrors or child mirrors; never pin a <Text>
    // container element whose #text child hasn't been appended by spread() yet.
    if (target && (target !== boundNode || isLeafTextMirror(target))) {
      boundLeafChild = target;
    }
    return target;
  };

  const applyLatestIfMounted = (): void => {
    if (!hasWritten || !boundNode) return;
    const target = resolveBound();
    if (target && target.text !== latest) {
      replaceText(target, latest);
    }
  };

  return {
    ref(node) {
      boundNode = node;
      boundLeafChild = undefined;
      if (!node || !hasWritten) return;
      if (node.children.length > 0 || isLeafTextMirror(node)) {
        applyLatestIfMounted();
      } else {
        // Solid's `spread()` evaluates `ref` before `children`; defer pre-mount
        // text flush until the current synchronous spread completes.
        queueMicrotask(applyLatestIfMounted);
      }
    },
    write(value) {
      latest = value;
      hasWritten = true;
      const target = resolveBound();
      if (!target || target.text === value) return false;
      replaceText(target, value);
      return true;
    },
    current: () => latest,
    node: () => boundNode,
  };
}

/**
 * Imperatively apply paint/layout style properties (`bgColor`, `textColor`,
 * `borderColor`, `opacity`, etc.) to a retained `NodeMirror` without re-running
 * Solid component functions.
 */
export function syncFastStyle(
  node: NodeMirror | undefined,
  style: ViewProps["style"],
): void {
  if (!node || !style) return;
  syncStyle(node, style as Record<string, number | string>);
}

/**
 * QuickJS-safe thousands-grouped integer formatter (`100000 -> "100,000"`).
 * Avoids `Intl.NumberFormat` (optional on embedded QuickJS builds) and avoids
 * per-call regular-expression allocations.
 */
export function formatThousands(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const truncated = Math.trunc(value);
  const negative = truncated < 0;
  const digits = String(Math.abs(truncated));
  if (digits.length <= 3) return negative ? `-${digits}` : digits;
  let out = "";
  const firstGroup = digits.length % 3;
  let cursor = 0;
  if (firstGroup > 0) {
    out = digits.slice(0, firstGroup);
    cursor = firstGroup;
  }
  while (cursor < digits.length) {
    if (out.length > 0) out += ",";
    out += digits.slice(cursor, cursor + 3);
    cursor += 3;
  }
  return negative ? `-${out}` : out;
}

// ============================================================================
// 2. Managed Single-FFI JumpBatch Pool (`createJumpPool`)
// ============================================================================

export type JumpPoolProp = Parameters<typeof jump>[1];

export interface JumpPool<Props extends readonly JumpPoolProp[] = readonly JumpPoolProp[]> {
  readonly maxCount: number;
  readonly props: Props;
  /** Stable ref callback for slot `index` (`<View ref={pool.bind(idx)} />`). */
  bind(index: number): (node: NodeMirror | undefined) => void;
  /** Return the mounted `NodeMirror` at `index`, if any. */
  node(index: number): NodeMirror | undefined;
  /** Stage a numeric or color value for `(index, propOffset)` (`0 <= propOffset < props.length`). */
  set(index: number, propOffset: number, value: number | string): void;
  /** Convenience writer for 3-prop `["translateX", "translateY", "scale"]` pools. */
  setTransform2D(index: number, x: number, y: number, scale?: number): void;
  /**
   * Flush `0 .. activeCount - 1` to the native core. Uses a cached single-FFI
   * `JumpBatch` (`ops.setPropBatch`) when `useBatch !== false` and all active
   * slots are mounted; otherwise falls back cleanly to individual `jump()` calls.
   * Returns `true` when flushed via the single-FFI `JumpBatch` fast path.
   */
  commit(activeCount: number, useBatch?: boolean): boolean;
  /** Force recompilation of the underlying `JumpBatch` on the next `commit()`. */
  invalidate(): void;
}

export function createJumpPool<const Props extends readonly JumpPoolProp[]>(
  maxCount: number,
  props: Props,
): JumpPool<Props> {
  const cap = Math.max(0, Math.trunc(maxCount));
  const stride = props.length;
  if (stride === 0) {
    throw new Error("createJumpPool requires at least one animatable property");
  }
  const nodes = new Array<NodeMirror | undefined>(cap);
  const refs = new Array<((node: NodeMirror | undefined) => void) | undefined>(cap);
  const numericStaging = new Float64Array(cap * stride);
  const stringStaging = new Map<number, string>();

  let compiledCount = -1;
  let compiledBatch: JumpBatch | undefined;

  const invalidate = (): void => {
    compiledCount = -1;
    compiledBatch = undefined;
  };

  const ensureBatch = (activeCount: number): JumpBatch | undefined => {
    if (compiledCount === activeCount && compiledBatch) return compiledBatch;
    const entries: Array<readonly [NodeMirror, JumpPoolProp]> = [];
    for (let i = 0; i < activeCount; i += 1) {
      const node = nodes[i];
      if (!node) return undefined;
      for (let p = 0; p < stride; p += 1) {
        entries.push([node, props[p]!]);
      }
    }
    compiledBatch = createJumpBatch(entries);
    compiledCount = activeCount;
    return compiledBatch;
  };

  return {
    maxCount: cap,
    props,
    bind(index: number) {
      if (index < 0 || index >= cap) {
        return () => {};
      }
      let cb = refs[index];
      if (!cb) {
        cb = (nextNode: NodeMirror | undefined) => {
          if (nodes[index] !== nextNode) {
            nodes[index] = nextNode;
            if (compiledCount < 0 || index < compiledCount) {
              invalidate();
            }
          }
          // PocketJS's Solid universal renderer invokes `ref(node)` on creation
          // without calling `ref(undefined)` on disposal; tie slot eviction to
          // the enclosing Solid reactive owner when present.
          if (nextNode && typeof getOwner === "function" && getOwner()) {
            onCleanup(() => {
              if (nodes[index] === nextNode) {
                nodes[index] = undefined;
                if (compiledCount < 0 || index < compiledCount) {
                  invalidate();
                }
              }
            });
          }
        };
        refs[index] = cb;
      }
      return cb;
    },
    node(index: number) {
      return index >= 0 && index < cap ? nodes[index] : undefined;
    },
    set(index: number, propOffset: number, value: number | string) {
      if (index < 0 || index >= cap || propOffset < 0 || propOffset >= stride) return;
      const flat = index * stride + propOffset;
      if (typeof value === "number") {
        numericStaging[flat] = value;
        if (stringStaging.size > 0) stringStaging.delete(flat);
      } else {
        stringStaging.set(flat, value);
      }
    },
    setTransform2D(index: number, x: number, y: number, scale = 1) {
      if (index < 0 || index >= cap) return;
      const base = index * stride;
      numericStaging[base] = x;
      if (stride > 1) numericStaging[base + 1] = y;
      if (stride > 2) numericStaging[base + 2] = scale;
      if (stringStaging.size > 0) {
        stringStaging.delete(base);
        if (stride > 1) stringStaging.delete(base + 1);
        if (stride > 2) stringStaging.delete(base + 2);
      }
    },
    commit(activeCount: number, useBatch = true): boolean {
      const count = Math.max(0, Math.min(cap, Math.trunc(activeCount)));
      if (count === 0) return true;
      const hasStrings = stringStaging.size > 0;
      const batch = useBatch ? ensureBatch(count) : undefined;
      if (batch) {
        const totalEntries = count * stride;
        if (!hasStrings) {
          for (let flat = 0; flat < totalEntries; flat += 1) {
            batch.set(flat, numericStaging[flat]!);
          }
        } else {
          for (let flat = 0; flat < totalEntries; flat += 1) {
            const str = stringStaging.get(flat);
            batch.set(flat, str !== undefined ? str : numericStaging[flat]!);
          }
        }
        batch.commit();
        return true;
      }
      for (let i = 0; i < count; i += 1) {
        const node = nodes[i];
        if (!node) continue;
        const base = i * stride;
        for (let p = 0; p < stride; p += 1) {
          const flat = base + p;
          const str = hasStrings ? stringStaging.get(flat) : undefined;
          jump(node, props[p]!, str !== undefined ? str : numericStaging[flat]!);
        }
      }
      return false;
    },
    invalidate,
  };
}

// ============================================================================
// 3. Zero-Allocation Rolling Frame Profiler (`createFrameProfiler`)
// ============================================================================

export interface FrameProfileSnapshot {
  readonly frames: number;
  readonly sampleCount: number;
  readonly fps: number;
  readonly headroomFps: number;
  readonly avgWorkMs: number;
  readonly p50WorkMs: number;
  readonly p95WorkMs: number;
  readonly maxWorkMs: number;
  readonly budgetPct: number;
}

export interface FrameProfiler {
  /** Mark the start of guest frame work; returns timestamp in ms. */
  beginFrame(nowMs?: number): number;
  /** Record elapsed guest + FFI frame work; returns this frame's `workMs`. */
  endFrame(nowMs?: number): number;
  /** Compute rolling statistics with zero heap array allocations. */
  snapshot(): FrameProfileSnapshot;
  /** Total frames recorded since creation or last `reset()`. */
  frames(): number;
  /** Clear all ring-buffer samples and counters. */
  reset(): void;
}

function defaultHighResNowMs(): number {
  if (
    typeof globalThis.performance !== "undefined" &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

export function createFrameProfiler(
  options: { windowSize?: number; targetHz?: number } = {},
): FrameProfiler {
  const cap = Math.max(4, Math.min(240, Math.trunc(options.windowSize ?? 60)));
  const targetHz = Math.max(1, options.targetHz ?? 120);
  const budgetMs = 1000 / targetHz;

  const workRing = new Float64Array(cap);
  const cadenceRing = new Float64Array(cap);
  const sortScratch = new Float64Array(cap);

  let writeIdx = 0;
  let fill = 0;
  let totalFrames = 0;
  let frameStartMs = 0;
  let prevBeginMs = 0;

  return {
    beginFrame(nowMs = defaultHighResNowMs()): number {
      if (prevBeginMs > 0) {
        const delta = nowMs - prevBeginMs;
        cadenceRing[writeIdx] = delta > 0.05 && delta < 250 ? delta : 0;
      } else {
        cadenceRing[writeIdx] = 0;
      }
      prevBeginMs = nowMs;
      frameStartMs = nowMs;
      return nowMs;
    },
    endFrame(nowMs = defaultHighResNowMs()): number {
      const workMs = Math.max(0.01, nowMs - frameStartMs);
      workRing[writeIdx] = workMs;
      writeIdx = (writeIdx + 1) % cap;
      if (fill < cap) fill += 1;
      totalFrames += 1;
      return workMs;
    },
    frames: () => totalFrames,
    reset(): void {
      workRing.fill(0);
      cadenceRing.fill(0);
      writeIdx = 0;
      fill = 0;
      totalFrames = 0;
      frameStartMs = 0;
      prevBeginMs = 0;
    },
    snapshot(): FrameProfileSnapshot {
      if (fill === 0) {
        return {
          frames: totalFrames,
          sampleCount: 0,
          fps: 60,
          headroomFps: 999,
          avgWorkMs: 0,
          p50WorkMs: 0,
          p95WorkMs: 0,
          maxWorkMs: 0,
          budgetPct: 0,
        };
      }
      let sumWork = 0;
      let maxWork = 0;
      let sumCadence = 0;
      let cadenceCount = 0;
      for (let i = 0; i < fill; i += 1) {
        const w = workRing[i]!;
        sortScratch[i] = w;
        sumWork += w;
        if (w > maxWork) maxWork = w;
        const c = cadenceRing[i]!;
        if (c > 0) {
          sumCadence += c;
          cadenceCount += 1;
        }
      }
      // In-place insertion sort on preallocated Float64Array (zero heap allocations!)
      for (let i = 1; i < fill; i += 1) {
        const current = sortScratch[i]!;
        let j = i - 1;
        while (j >= 0 && sortScratch[j]! > current) {
          sortScratch[j + 1] = sortScratch[j]!;
          j -= 1;
        }
        sortScratch[j + 1] = current;
      }
      const avgWorkMs = sumWork / fill;
      const p50WorkMs = sortScratch[Math.floor((fill - 1) * 0.5)]!;
      const p95WorkMs = sortScratch[Math.floor((fill - 1) * 0.95)]!;
      const avgCadence = cadenceCount > 0 ? sumCadence / cadenceCount : 1000 / 60;
      const fps = Math.min(240, Math.max(1, 1000 / Math.max(4.16, avgCadence)));
      const headroomFps = Math.min(999, Math.round(1000 / Math.max(0.15, avgWorkMs)));
      const budgetPct = Math.min(999, Math.round((avgWorkMs / budgetMs) * 100));
      return {
        frames: totalFrames,
        sampleCount: fill,
        fps,
        headroomFps,
        avgWorkMs,
        p50WorkMs,
        p95WorkMs,
        maxWorkMs: maxWork,
        budgetPct,
      };
    },
  };
}

// ============================================================================
// 4. Scroll-Aware Node Local Coordinate Resolver (`resolveNodeLocalPoint`)
// ============================================================================

export interface NodeLocalPoint {
  readonly x: number;
  readonly y: number;
  readonly clampedX: number;
  readonly clampedY: number;
  readonly width: number;
  readonly height: number;
  readonly inside: boolean;
}

/**
 * Convert viewport-space `GestureContact` coordinates `(c.x, c.y)` into local
 * coordinates relative to `node`, automatically composing any enclosing
 * `ScrollablePage` paint translation via `scrollPage.visualRect`.
 */
export function resolveNodeLocalPoint(
  node: NodeMirror | undefined,
  viewportX: number,
  viewportY: number,
  scrollPage?: ScrollablePageContextValue,
  paddingPx = 0,
): NodeLocalPoint | undefined {
  if (!Number.isFinite(viewportX) || !Number.isFinite(viewportY)) return undefined;
  const committed = readCommittedNodeRect(node);
  if (!committed) return undefined;
  const visual = (node && scrollPage?.visualRect?.(node, committed)) ?? committed;
  const x = viewportX - visual.x;
  const y = viewportY - visual.y;
  const minX = Math.min(paddingPx, visual.width * 0.5);
  const maxX = Math.max(minX, visual.width - paddingPx);
  const minY = Math.min(paddingPx, visual.height * 0.5);
  const maxY = Math.max(minY, visual.height - paddingPx);
  return {
    x,
    y,
    clampedX: Math.max(minX, Math.min(maxX, x)),
    clampedY: Math.max(minY, Math.min(maxY, y)),
    width: visual.width,
    height: visual.height,
    inside: x >= 0 && x <= visual.width && y >= 0 && y <= visual.height,
  };
}

// ============================================================================
// 5. Scroll-Chained, Route-Gated VirtualList (`PocketVirtualList` / `SkinVirtualList`)
// ============================================================================

export interface PocketVirtualListProps extends VirtualListProps {
  /** Optional outer container class around the fixed-height virtual viewport. */
  class?: string;
  /**
   * Forward unconsumed vertical drag & fling velocity at the top (`0`) or
   * bottom (`max`) boundary to an enclosing `<ScrollablePage>` (default `true`).
   */
  chainToParentScroll?: boolean;
}

export type { VirtualListHandle, VirtualListProps };

/**
 * Production wrapper around `@pocketjs/framework/virtual-list` that fixes
 * nested scrolling inside `<ScrollablePage>`, desktop wheel/trackpad routing,
 * and retained `<RouteView>` input gating:
 * - Claims vertical touch pans at `panSlop: 1` (matching `ScrollablePage`),
 *   preventing an enclosing `ScrollablePage` from stealing drags at 2px.
 * - Chains boundary overflow (`0` / `max`) and release fling velocity to
 *   `ScrollablePageContext` (`chainDrag` / `chainEndDrag`).
 * - Registers with `@pocket/ui`'s desktop `input.scroll` (mouse wheel &
 *   two-finger trackpad) dispatcher with automatic ancestor chaining.
 * - Automatically gates touch, wheel, and D-pad input via `useRouteActive()`.
 */
export function PocketVirtualList(props: PocketVirtualListProps): JSX.Element {
  const routeActive = useRouteActive();
  const parentScrollPage = useContext(ScrollablePageContext);
  const effectiveActive = (): boolean =>
    routeActive() && (props.inputActive ? props.inputActive() : true);
  const maxOffset = (): number =>
    Math.max(0, props.count * props.rowHeight - props.height);

  const scroller =
    props.controller ??
    createScroller({
      max: maxOffset,
      extent: () => props.height,
    });

  let wrapperNode: NodeMirror | undefined;
  let lastLayoutRect: CommittedNodeRect | undefined;
  let chainedToParent = false;
  let panPrimed = false;

  const measureVisibleRect = (): CommittedNodeRect | undefined => {
    if (!effectiveActive()) return undefined;
    const committed = readCommittedNodeRect(wrapperNode);
    if (committed) lastLayoutRect = committed;
    const base = committed ?? lastLayoutRect;
    if (!base) return undefined;
    const visual =
      (wrapperNode && parentScrollPage?.visualRect?.(wrapperNode, base)) ?? base;
    const clip = parentScrollPage?.clipRect?.();
    if (!clip) return visual;
    const left = Math.max(visual.x, clip.x);
    const top = Math.max(visual.y, clip.y);
    const right = Math.min(visual.x + visual.width, clip.x + clip.width);
    const bottom = Math.min(visual.y + visual.height, clip.y + clip.height);
    if (right <= left || bottom <= top) return undefined;
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  // Instantiate VirtualList FIRST so its internal panSlop=6 recognizer registers
  // before ours; our panSlop=1 recognizer below then has higher priority on pans
  // while leaving VirtualList's row tap, long-press, D-pad, and windowing intact.
  const innerList = VirtualList({
    get surface() {
      return props.surface;
    },
    get count() {
      return props.count;
    },
    get rowHeight() {
      return props.rowHeight;
    },
    get height() {
      return props.height;
    },
    renderRow: (index) => props.renderRow(index),
    get overscan() {
      return props.overscan;
    },
    controller: scroller,
    get focusRows() {
      return props.focusRows;
    },
    get onRowPress() {
      return props.onRowPress;
    },
    get onRowLongPress() {
      return props.onRowLongPress;
    },
    get onNearStart() {
      return props.onNearStart;
    },
    get nearStartPx() {
      return props.nearStartPx;
    },
    get onNearEnd() {
      return props.onNearEnd;
    },
    get nearEndPx() {
      return props.nearEndPx;
    },
    get stickToBottom() {
      return props.stickToBottom;
    },
    inputActive: effectiveActive,
    get style() {
      return props.style;
    },
    get ref() {
      return props.ref;
    },
  });

  const panGesture = createGesture({
    surface: props.surface,
    axis: "y",
    panSlop: 1,
    region: {
      node: () => (effectiveActive() ? wrapperNode : undefined),
      rect: () => {
        const rect = measureVisibleRect();
        return rect
          ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
          : undefined;
      },
    },
    onDown: () => {
      if (!effectiveActive()) return;
      chainedToParent = false;
      panPrimed = false;
      scroller.stop();
    },
    onPanStart: () => {
      if (!effectiveActive()) return;
      // Deliberately defer scroller.beginDrag() until onPanMove (which runs
      // immediately after gesture-core's claim() cancels lower-priority owners
      // on the same frame) so VirtualList.onCancel never sees state==="tracking".
      panPrimed = true;
    },
    onPanMove: (contact) => {
      if (!effectiveActive()) return;
      const wantDelta = panPrimed ? -contact.dy : -contact.fdy;
      panPrimed = false;
      if (wantDelta === 0) return;

      const canChain =
        props.chainToParentScroll !== false &&
        parentScrollPage?.chainDrag !== undefined;
      if (!canChain) {
        if (scroller.state() !== "tracking") scroller.beginDrag();
        scroller.drag(wantDelta);
        return;
      }

      const max = untrack(maxOffset);
      const current = Math.max(0, Math.min(max, scroller.offset()));
      const next = Math.max(0, Math.min(max, current + wantDelta));
      const consumed = next - current;
      const remainder = wantDelta - consumed;

      if (consumed !== 0) {
        if (chainedToParent) {
          chainedToParent = false;
          parentScrollPage?.chainEndDrag?.(0);
        }
        if (scroller.state() !== "tracking") scroller.beginDrag();
        scroller.drag(consumed);
      }
      if (Math.abs(remainder) > 0.01) {
        chainedToParent = true;
        parentScrollPage?.chainDrag?.(remainder);
      }
    },
    onPanEnd: (contact) => {
      if (!effectiveActive()) return;
      panPrimed = false;
      const releaseVel = -contact.vy;
      if (chainedToParent) {
        chainedToParent = false;
        if (scroller.state() === "tracking") scroller.endDrag(0);
        parentScrollPage?.chainEndDrag?.(releaseVel);
        return;
      }
      if (scroller.state() !== "tracking") scroller.beginDrag();
      scroller.endDrag(releaseVel);
    },
    onCancel: () => {
      panPrimed = false;
      if (chainedToParent) {
        chainedToParent = false;
        parentScrollPage?.chainEndDrag?.(0);
      }
      if (scroller.state() === "tracking") {
        scroller.endDrag(0);
      }
    },
  });

  const desktopTarget: DesktopScrollPage = {
    node: () => wrapperNode,
    active: effectiveActive,
    rect: measureVisibleRect,
    interrupt: () => {
      panGesture.cancel();
      scroller.stop();
    },
    applyDelta: (deltaY) => {
      desktopTarget.interrupt();
      scroller.scrollTo(scroller.offset(), { immediate: true });
      const before = scroller.offset();
      scroller.scrollBy(deltaY, { immediate: true });
      return scroller.offset() - before;
    },
  };

  let unregisterDesktop: (() => void) | undefined;
  createEffect(() => {
    if (effectiveActive()) {
      if (!unregisterDesktop) {
        unregisterDesktop = registerDesktopScrollPage(desktopTarget);
      }
    } else {
      unregisterDesktop?.();
      unregisterDesktop = undefined;
      panGesture.cancel();
      scroller.stop();
    }
  });
  onCleanup(() => {
    unregisterDesktop?.();
    unregisterDesktop = undefined;
  });

  return (
    <View
      ref={(node) => {
        wrapperNode = node;
      }}
      class={props.class ?? "w-full overflow-hidden"}
      style={{ height: props.height }}
    >
      {innerList}
    </View>
  );
}

/**
 * Multi-skin aware virtual list shell (`Default` / `Looseleaf` / `Arc` ×
 * `light` / `dark` / `amber-night`) wrapping `PocketVirtualList`.
 */
export function SkinVirtualList(
  props: PocketVirtualListProps & { bordered?: boolean },
): JSX.Element {
  const skin = useUiSkin();
  const tokens = () => skin.tokens();
  const resolvedBorderWidth = (): number => {
    if (props.bordered === false) return 0;
    return skin.skinId() === "looseleaf" ? 1.5 : 1;
  };
  const innerHeight = (): number =>
    Math.max(0, props.height - resolvedBorderWidth() * 2);
  return (
    <View
      class={props.class ?? "w-full overflow-hidden"}
      style={{
        height: props.height,
        bgColor: tokens().surfaceBg,
        ...(props.bordered === false
          ? {}
          : {
              borderColor: tokens().border,
              borderWidth: resolvedBorderWidth(),
              radius: tokens().radiusSurface,
            }),
      }}
    >
      <PocketVirtualList
        surface={props.surface}
        count={props.count}
        rowHeight={props.rowHeight}
        height={innerHeight()}
        renderRow={props.renderRow}
        overscan={props.overscan}
        controller={props.controller}
        focusRows={props.focusRows}
        onRowPress={props.onRowPress}
        onRowLongPress={props.onRowLongPress}
        onNearStart={props.onNearStart}
        nearStartPx={props.nearStartPx}
        onNearEnd={props.onNearEnd}
        nearEndPx={props.nearEndPx}
        stickToBottom={props.stickToBottom}
        inputActive={props.inputActive}
        style={props.style}
        ref={props.ref}
        chainToParentScroll={props.chainToParentScroll}
        class="w-full overflow-hidden"
      />
    </View>
  );
}
