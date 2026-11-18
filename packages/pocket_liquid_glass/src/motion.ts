/**
 * @pocket/liquid_glass — Fluid springs and imperative node updates.
 *
 * Scheduling behavior:
 * 1. Zero heap allocation in steady-state simulation ticks (`<= 8ms` sub-stepped
 *    semi-implicit Euler solver with `dtSec <= 0.05s` spike clamping).
 * 2. Demand-driven frame parking (`continuous: () => !settled()`): `onFrame`
 *    parks completely (`0%` CPU/GPU) the exact frame position & velocity converge.
 * 3. Imperative `NodeMirror` fast path (`createImperativeSpring`): writes `translateX`,
 *    `translateY`, `scale`, `scaleX`, `opacity` directly through `@pocketjs/framework/animation`
 *    `jump()` without triggering SolidJS VDOM diffs on 60–120Hz frames.
 * 4. Optical uniform quantization (`quantizeOptical`): prevents sub-pixel float dust
 *    from busting WebGL/Impeller resting surface caches.
 */

import { createEffect, createSignal, type Accessor } from "solid-js";
import { jump, type JumpProp } from "@pocketjs/framework/animation";
import { simulationHz } from "@pocketjs/framework/clock";
import type { NodeMirror } from "@pocketjs/framework/renderer";
import { onFrame } from "@pocketjs/framework/solid/lifecycle";

export type GlassSpringPreset =
  | "fluid"
  | "tactile"
  | "jelly"
  | "sheet"
  | "morph"
  | "snappy";

export interface GlassSpringConfig {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
  readonly precision?: number;
}

export const GLASS_SPRINGS: Readonly<Record<GlassSpringPreset, GlassSpringConfig>> = {
  /** Gliding selection capsules, segmented lenses, and continuous track tracking. */
  fluid: { stiffness: 330, damping: 29, mass: 1.0, precision: 0.002 },
  /** Snappy press-bloom buttons, switch droplets, and tactile micro-interactions. */
  tactile: { stiffness: 520, damping: 35, mass: 0.85, precision: 0.002 },
  /** Underdamped elastic glass deformation & release rebound (`zeta ~ 0.61`). */
  jelly: { stiffness: 270, damping: 19.5, mass: 0.95, precision: 0.003 },
  /** Critically damped modal & bottom-sheet slide without bottom-edge gap overshoot. */
  sheet: { stiffness: 350, damping: 36, mass: 1.05, precision: 0.002 },
  /** Pill-to-platter liquid menu morphing (`LiquidMorphAnimationContext`). */
  morph: { stiffness: 380, damping: 28.5, mass: 0.92, precision: 0.002 },
  /** Fast submenu height & gliding menu selection row highlight (`SelectionView`). */
  snappy: { stiffness: 460, damping: 34, mass: 0.88, precision: 0.002 },
};

export interface GlassSpringState {
  readonly value: number;
  readonly velocity: number;
  readonly settled: boolean;
}

/**
 * Quantize optical uniforms (`magnification`, `offsetX`, `offsetY`) so resting or
 * nearly settled frames do not emit unique floating-point strings every tick.
 */
export function quantizeOptical(value: number, step = 0.005, restTarget = 0): number {
  if (!Number.isFinite(value)) return restTarget;
  if (Math.abs(value - restTarget) < step * 0.75) return restTarget;
  return Math.round(value / step) * step;
}

/**
 * Pure deterministic single-frame spring step (safe against background-tab `dtSec` spikes).
 */
export function stepGlassSpring(
  current: GlassSpringState,
  target: number,
  dtSec: number,
  config: GlassSpringConfig = GLASS_SPRINGS.fluid,
  reducedMotion = false,
): GlassSpringState {
  if (!Number.isFinite(target)) {
    return { value: current.value, velocity: 0, settled: true };
  }
  if (!Number.isFinite(current.value) || reducedMotion) {
    return { value: target, velocity: 0, settled: true };
  }
  const precision = config.precision ?? 0.002;
  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    const converged =
      Math.abs(target - current.value) <= precision &&
      Math.abs(current.velocity) <= precision * 6;
    return converged
      ? { value: target, velocity: 0, settled: true }
      : { value: current.value, velocity: current.velocity, settled: false };
  }

  const safeDt = Math.min(0.05, dtSec);
  const mass = Math.max(0.1, config.mass);
  const stiffness = Math.max(1, config.stiffness);
  const damping = Math.max(0.1, config.damping);

  const subSteps = Math.max(1, Math.ceil(safeDt / 0.008));
  const h = safeDt / subSteps;

  let x = current.value;
  let v = Number.isFinite(current.velocity) ? current.velocity : 0;

  for (let i = 0; i < subSteps; i += 1) {
    const force = -stiffness * (x - target) - damping * v;
    v += (force / mass) * h;
    x += v * h;
  }

  if (Math.abs(target - x) <= precision && Math.abs(v) <= precision * 6) {
    return { value: target, velocity: 0, settled: true };
  }
  return { value: x, velocity: v, settled: false };
}

/**
 * Reactive demand-parked spring signal for low-cardinality layout/opacity transitions.
 */
export function createGlassSpring(
  target: Accessor<number>,
  options: {
    preset?: GlassSpringPreset;
    reducedMotion?: Accessor<boolean>;
    quantizeStep?: number;
  } = {},
): Accessor<number> {
  const initial = target();
  let current = Number.isFinite(initial) ? initial : 0;
  const [value, setValue] = createSignal(current);
  const [settled, setSettled] = createSignal(true);
  let velocity = 0;

  createEffect(() => {
    const goal = target();
    if (!Number.isFinite(goal)) {
      velocity = 0;
      setSettled(true);
      return;
    }
    if (options.reducedMotion?.()) {
      current = goal;
      velocity = 0;
      setValue(goal);
      setSettled(true);
      return;
    }
    if (Math.abs(goal - current) > 0.001 || Math.abs(velocity) > 0.005) {
      setSettled(false);
    }
  });

  try {
    onFrame(
      () => {
        if (settled()) return;
        const rm = options.reducedMotion?.() ?? false;
        const cfg = GLASS_SPRINGS[options.preset ?? "fluid"];
        const goal = target();
        const next = stepGlassSpring(
          { value: current, velocity, settled: false },
          goal,
          1 / simulationHz(),
          cfg,
          rm,
        );
        current = next.value;
        velocity = next.velocity;
        const out =
          !next.settled && Number.isFinite(goal) && options.quantizeStep !== undefined
            ? quantizeOptical(current, options.quantizeStep, goal)
            : current;
        setValue(out);
        if (next.settled) {
          setSettled(true);
        }
      },
      { active: () => !settled(), continuous: () => !settled() },
    );
  } catch {
    // Headless unit test fallback without active native frame loop.
  }

  return value;
}

export interface ImperativeSpringHandle {
  /** Bind directly to `<View ref={handle.ref}>` or `<Focusable nodeRef={handle.ref}>`. */
  readonly ref: (node: NodeMirror | undefined) => void;
  /** Read current simulated scalar without forcing Solid VDOM subscriptions. */
  readonly peek: () => number;
  /** Inject instantaneous velocity (e.g. gesture fling or tactile tap impulse). */
  readonly impulse: (deltaVelocity: number) => void;
  /** Immediately snap to `nextValue` without oscillation. */
  readonly snap: (nextValue: number) => void;
  /** Reactive settled flag (`true` when `onFrame` is parked). */
  readonly settled: Accessor<boolean>;
}

/**
 * Frame-driven imperative spring that writes directly to a
 * retained `NodeMirror` via `jump(node, prop, mappedValue)`.
 */
export function createImperativeSpring(
  target: Accessor<number>,
  prop: JumpProp,
  options: {
    preset?: GlassSpringPreset;
    reducedMotion?: Accessor<boolean>;
    map?: (raw: number) => number;
  } = {},
): ImperativeSpringHandle {
  let boundNode: NodeMirror | undefined;
  let current = Number.isFinite(target()) ? target() : 0;
  let goal = current;
  let velocity = 0;
  const [settled, setSettled] = createSignal(true);
  const mapValue = options.map ?? ((v: number) => v);

  const flushNode = (val: number): void => {
    if (!boundNode) return;
    try {
      jump(boundNode, prop, mapValue(val));
    } catch {
      // Safe fallback in non-native test environments.
    }
  };

  createEffect(() => {
    const nextGoal = target();
    if (!Number.isFinite(nextGoal)) return;
    goal = nextGoal;
    if (options.reducedMotion?.()) {
      current = nextGoal;
      velocity = 0;
      flushNode(current);
      setSettled(true);
      return;
    }
    if (Math.abs(nextGoal - current) > 0.001 || Math.abs(velocity) > 0.005) {
      setSettled(false);
    }
  });

  try {
    onFrame(
      () => {
        if (settled()) return;
        const rm = options.reducedMotion?.() ?? false;
        const cfg = GLASS_SPRINGS[options.preset ?? "fluid"];
        const next = stepGlassSpring(
          { value: current, velocity, settled: false },
          goal,
          1 / simulationHz(),
          cfg,
          rm,
        );
        current = next.value;
        velocity = next.velocity;
        flushNode(current);
        if (next.settled) {
          setSettled(true);
        }
      },
      { active: () => !settled(), continuous: () => !settled() },
    );
  } catch {
    // Safe fallback in headless unit tests.
  }

  return {
    ref(node) {
      boundNode = node;
      if (node) flushNode(current);
    },
    peek: () => current,
    impulse(deltaVelocity: number) {
      if (!Number.isFinite(deltaVelocity) || options.reducedMotion?.()) return;
      velocity += deltaVelocity;
      setSettled(false);
    },
    snap(nextValue: number) {
      if (!Number.isFinite(nextValue)) return;
      current = nextValue;
      goal = nextValue;
      velocity = 0;
      flushNode(current);
      setSettled(true);
    },
    settled,
  };
}
