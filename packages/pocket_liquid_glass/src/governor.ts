/**
 * @pocket/liquid_glass — GPU surface budget and guest-work telemetry.
 *
 * Why this exists:
 * Each real refractive `BackdropFilter` (`pocket.registerSurface(..., "glass", ...)`)
 * executes an offscreen GPU backdrop pass. Mounting 25+ unbudgeted glass passes on
 * a single scroll view can cause costly overdraw.
 *
 * `LiquidGlassGovernor` limits guest surface work by:
 * 1. Enforcing a deterministic per-route GPU surface budget (`ultra` = 8, `balanced` = 5,
 *    `performance` = 2, `vector` = 0) with priority admission (`critical` > `high` > `normal` > `low`).
 *    Surfaces exceeding the budget seamlessly render via Zero-Pass Specular Vector Glass!
 * 2. Running a zero-allocation `Float64Array` ring-buffer frame profiler to track live FPS
 *    and 95th-percentile frame work (`p95WorkMs`), stepping down quality tier automatically
 *    (`autoAdapt`) if active frame cadence dips below `minFps` (default 58 FPS).
 */

import { batch, createSignal, untrack, type Accessor } from "solid-js";
import { createFrameProfiler } from "@pocket/ui/fast";

export type LiquidGlassQualityTier = "ultra" | "balanced" | "performance" | "vector";

export type LiquidGlassSurfacePriority = "critical" | "high" | "normal" | "low";

export interface GlassFrameProfileSnapshot {
  readonly frames: number;
  readonly sampleCount: number;
  readonly fps: number;
  readonly avgWorkMs: number;
  readonly p95WorkMs: number;
  readonly maxWorkMs: number;
  readonly budgetPct: number;
  readonly headroomFps: number;
}

export interface GlassFrameProfiler {
  beginFrame(nowOverrideMs?: number): void;
  endFrame(nowOverrideMs?: number): number;
  frames(): number;
  snapshot(): GlassFrameProfileSnapshot;
  reset(): void;
}

/** Reuse the shared UI profiler; Liquid Glass keeps its 60 Hz/60-sample defaults (minimum window: 8). */
export function createGlassFrameProfiler(options: {
  windowSize?: number;
  targetHz?: number;
} = {}): GlassFrameProfiler {
  return createFrameProfiler({
    windowSize: Math.max(8, Math.min(240, Math.trunc(options.windowSize ?? 60))),
    targetHz: Math.max(30, options.targetHz ?? 60),
  });
}

const PRIORITY_RANK: Readonly<Record<LiquidGlassSurfacePriority, number>> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export const TIER_GPU_BUDGET: Readonly<Record<LiquidGlassQualityTier, number>> = {
  ultra: 8,
  balanced: 5,
  performance: 2,
  vector: 0,
};

export interface LiquidGlassGovernorOptions {
  /** Initial quality tier (default `"ultra"`). */
  initialTier?: LiquidGlassQualityTier;
  /** Override maximum concurrent GPU `BackdropFilter` surfaces in `"ultra"` tier. */
  maxGpuSurfaces?: number;
  /** Target display refresh rate for budget % computation (default `60`). */
  targetFps?: number;
  /** Minimum acceptable FPS before `autoAdapt` steps down one tier (default `58`). */
  minFps?: number;
  /** Automatically step down quality tier under sustained frame pressure (default `true`). */
  autoAdapt?: boolean;
}

export interface LiquidGlassLease {
  readonly id: number;
  readonly priority: LiquidGlassSurfacePriority;
  /** Reactive accessor: `true` when this surface holds an active GPU `BackdropFilter` slot. */
  readonly granted: Accessor<boolean>;
  /** Release the slot on unmount or when switching to opaque/vector mode. */
  release(): void;
}

export interface LiquidGlassGovernor {
  readonly tier: Accessor<LiquidGlassQualityTier>;
  setTier(next: LiquidGlassQualityTier): void;
  readonly budget: Accessor<number>;
  readonly activeGpuCount: Accessor<number>;
  readonly totalRegisteredCount: Accessor<number>;
  readonly profiler: GlassFrameProfiler;
  /** Acquire a prioritized GPU surface lease; excess surfaces fall back to zero-pass vector glass. */
  acquireLease(priority?: LiquidGlassSurfacePriority): LiquidGlassLease;
  /** Record a frame sample (`workMs` / cadence) and run `autoAdapt` hysteresis check. */
  recordFrameSample(beginMs: number, endMs: number): GlassFrameProfileSnapshot;
}

interface InternalSlot {
  readonly id: number;
  readonly priority: LiquidGlassSurfacePriority;
  readonly rank: number;
  readonly setGranted: (next: boolean) => void;
  grantedNow: boolean;
}

function nextLowerTier(tier: LiquidGlassQualityTier): LiquidGlassQualityTier {
  if (tier === "ultra") return "balanced";
  if (tier === "balanced") return "performance";
  return "vector";
}

export function createLiquidGlassGovernor(
  options: LiquidGlassGovernorOptions = {},
): LiquidGlassGovernor {
  const targetFps = Math.max(30, options.targetFps ?? 60);
  const minFps = Math.max(30, options.minFps ?? 58);
  const maxFrameBudgetMs = 1000 / minFps;
  const autoAdapt = options.autoAdapt !== false;

  const [tier, setTierSignal] = createSignal<LiquidGlassQualityTier>(
    options.initialTier ?? "ultra",
  );
  const [activeGpuCount, setActiveGpuCount] = createSignal(0);
  const [totalRegisteredCount, setTotalRegisteredCount] = createSignal(0);

  const profiler = createGlassFrameProfiler({ windowSize: 60, targetHz: targetFps });
  const slots = new Map<number, InternalSlot>();
  let nextSlotId = 1;
  let consecutiveSlowWindows = 0;

  const resolveBudget = (t: LiquidGlassQualityTier): number => {
    if (t === "ultra" && options.maxGpuSurfaces !== undefined) {
      return Math.max(0, Math.trunc(options.maxGpuSurfaces));
    }
    return TIER_GPU_BUDGET[t];
  };

  const budget = (): number => resolveBudget(tier());

  const rebalance = (): void => {
    const cap = resolveBudget(untrack(tier));
    const ordered = Array.from(slots.values()).sort(
      (a, b) => b.rank - a.rank || a.id - b.id,
    );
    batch(() => {
      let grantedCount = 0;
      for (let i = 0; i < ordered.length; i += 1) {
        const slot = ordered[i]!;
        const shouldGrant = grantedCount < cap;
        if (shouldGrant) grantedCount += 1;
        if (slot.grantedNow !== shouldGrant) {
          slot.grantedNow = shouldGrant;
          slot.setGranted(shouldGrant);
        }
      }
      setActiveGpuCount(grantedCount);
      setTotalRegisteredCount(ordered.length);
    });
  };

  const setTier = (next: LiquidGlassQualityTier): void => {
    if (untrack(tier) === next) return;
    consecutiveSlowWindows = 0;
    setTierSignal(next);
    rebalance();
  };

  return {
    tier,
    setTier,
    budget,
    activeGpuCount,
    totalRegisteredCount,
    profiler,
    acquireLease(priority: LiquidGlassSurfacePriority = "normal"): LiquidGlassLease {
      const id = nextSlotId++;
      const [granted, setGranted] = createSignal(false);
      const slot: InternalSlot = {
        id,
        priority,
        rank: PRIORITY_RANK[priority],
        setGranted,
        grantedNow: false,
      };
      slots.set(id, slot);
      rebalance();
      let released = false;
      return {
        id,
        priority,
        granted,
        release() {
          if (released) return;
          released = true;
          if (slots.delete(id)) {
            slot.grantedNow = false;
            setGranted(false);
            rebalance();
          }
        },
      };
    },
    recordFrameSample(beginMs: number, endMs: number): GlassFrameProfileSnapshot {
      profiler.beginFrame(beginMs);
      profiler.endFrame(endMs);
      const snap = profiler.snapshot();
      if (autoAdapt && snap.sampleCount >= 24 && tier() !== "vector") {
        const overloaded =
          snap.p95WorkMs > maxFrameBudgetMs || (snap.fps > 0 && snap.fps < minFps);
        if (overloaded) {
          consecutiveSlowWindows += 1;
          if (consecutiveSlowWindows >= 12) {
            consecutiveSlowWindows = 0;
            setTier(nextLowerTier(tier()));
          }
        } else if (consecutiveSlowWindows > 0) {
          consecutiveSlowWindows -= 1;
        }
      }
      return snap;
    },
  };
}
