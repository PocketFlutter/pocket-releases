/**
 * @pocket/liquid_glass — GPU-Governed Optical Surfaces, Shared Containers & Mesh Backdrop.
 *
 * Optical surface architecture for PocketJS:
 * - `LiquidGlassProvider`: Supplies reactive palette, spring motion settings, and the
 *   per-tree `LiquidGlassGovernor` (a bounded GPU surface budget).
 * - `LiquidGlassBackdrop`: Chromatic orbital mesh backdrop giving Snell-refracted bevels
 *   subtle multi-hue gradients to bend across Light/Dark modes (and pure `#RRGG00` obsidian
 *   in `amber-night`).
 * - `LiquidGlassSurface`: Mounts foreground children once and switches only the backdrop
 *   shell between a prioritized GPU `GlassSurface` lease (`critical` / `high` / `normal` / `low`)
 *   and Zero-Pass Specular Vector Glass (`0` GPU `BackdropFilter` passes).
 * - `LiquidGlassGroup`: Shared single-pass container (`UIGlassContainerEffect` equivalent) so
 *   toolbars, action bars, and segmented strips never stack glass-over-glass passes.
 */

import {
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { View, type NodeMirror, type ViewProps } from "@pocketjs/framework/solid/components";
import { GlassSurface, useAccessibilityPreferences, type GlassShape } from "@pocket/ui";
import {
  createLiquidGlassGovernor,
  type LiquidGlassGovernor,
  type LiquidGlassQualityTier,
  type LiquidGlassSurfacePriority,
} from "./governor.ts";
import { quantizeOptical } from "./motion.ts";
import {
  resolveLiquidGlassPalette,
  resolveOpticalRecipe,
  type LiquidGlassAccent,
  type LiquidGlassDensity,
  type LiquidGlassMaterial,
  type LiquidGlassPalette,
  type LiquidGlassThemeMode,
} from "./tokens.ts";

const ABS_FILL = {
  posType: 1,
  insetT: 0,
  insetR: 0,
  insetB: 0,
  insetL: 0,
} as const;

export interface LiquidGlassContextValue {
  readonly mode: Accessor<LiquidGlassThemeMode>;
  readonly accent: Accessor<LiquidGlassAccent>;
  readonly density: Accessor<LiquidGlassDensity>;
  readonly reducedMotion: Accessor<boolean>;
  readonly palette: Accessor<LiquidGlassPalette>;
  readonly governor: LiquidGlassGovernor;
}

const defaultGovernor = createLiquidGlassGovernor({ initialTier: "ultra", maxGpuSurfaces: 8 });
const defaultPalette = resolveLiquidGlassPalette("light", "blue");

export const LiquidGlassContext = createContext<LiquidGlassContextValue>({
  mode: () => "light",
  accent: () => "blue",
  density: () => "comfortable",
  reducedMotion: () => false,
  palette: () => defaultPalette,
  governor: defaultGovernor,
});

const LiquidGlassGroupContext = createContext<boolean>(false);

export function useLiquidGlass(): LiquidGlassContextValue {
  return useContext(LiquidGlassContext);
}

export function useInLiquidGlassGroup(): boolean {
  return useContext(LiquidGlassGroupContext);
}

export function LiquidGlassProvider(props: {
  mode?: LiquidGlassThemeMode | Accessor<LiquidGlassThemeMode>;
  accent?: LiquidGlassAccent | Accessor<LiquidGlassAccent>;
  density?: LiquidGlassDensity | Accessor<LiquidGlassDensity>;
  reducedMotion?: boolean | Accessor<boolean>;
  qualityTier?: LiquidGlassQualityTier | Accessor<LiquidGlassQualityTier>;
  maxGpuSurfaces?: number;
  governor?: LiquidGlassGovernor;
  children?: JSX.Element;
}): JSX.Element {
  const parent = useContext(LiquidGlassContext);
  const ownedGovernor =
    props.governor ??
    createLiquidGlassGovernor({
      initialTier:
        typeof props.qualityTier === "function"
          ? props.qualityTier()
          : (props.qualityTier ?? "ultra"),
      maxGpuSurfaces: props.maxGpuSurfaces,
    });

  createEffect(() => {
    if (props.qualityTier !== undefined) {
      const next =
        typeof props.qualityTier === "function" ? props.qualityTier() : props.qualityTier;
      ownedGovernor.setTier(next);
    }
  });

  const mode = (): LiquidGlassThemeMode => {
    if (props.mode !== undefined) {
      return typeof props.mode === "function" ? props.mode() : props.mode;
    }
    return parent.mode();
  };

  const accent = (): LiquidGlassAccent => {
    if (props.accent !== undefined) {
      return typeof props.accent === "function" ? props.accent() : props.accent;
    }
    return parent.accent();
  };

  const density = (): LiquidGlassDensity => {
    if (props.density !== undefined) {
      return typeof props.density === "function" ? props.density() : props.density;
    }
    return parent.density();
  };

  const reducedMotion = (): boolean => {
    if (props.reducedMotion !== undefined) {
      return typeof props.reducedMotion === "function"
        ? props.reducedMotion()
        : props.reducedMotion;
    }
    return parent.reducedMotion();
  };

  const palette = createMemo(() => resolveLiquidGlassPalette(mode(), accent()));

  const value: LiquidGlassContextValue = {
    mode,
    accent,
    density,
    reducedMotion,
    palette,
    governor: ownedGovernor,
  };

  return (
    <LiquidGlassContext.Provider value={value}>
      {props.children}
    </LiquidGlassContext.Provider>
  );
}

/**
 * Full-bleed Liquid Glass ambient canvas with soft chromatic orbs so refractive
 * bevels have realistic spatial luminance & hue gradients to bend.
 */
export function LiquidGlassBackdrop(props: {
  mode?: LiquidGlassThemeMode | Accessor<LiquidGlassThemeMode>;
  accent?: LiquidGlassAccent | Accessor<LiquidGlassAccent>;
  children?: JSX.Element;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const pal = createMemo(() => {
    const m =
      props.mode !== undefined
        ? typeof props.mode === "function"
          ? props.mode()
          : props.mode
        : ctx.mode();
    const a =
      props.accent !== undefined
        ? typeof props.accent === "function"
          ? props.accent()
          : props.accent
        : ctx.accent();
    return resolveLiquidGlassPalette(m, a);
  });

  return (
    <View
      class="absolute inset-0 w-full h-full overflow-hidden"
      style={{
        ...ABS_FILL,
        overflow: 1,
        bgColor: pal().canvasBg,
        gradFrom: pal().canvasGradFrom,
        gradTo: pal().canvasGradTo,
        gradDir: 1,
        hitPass: 1,
      }}
    >
      {/* Top-left primary refractive orb */}
      <View
        class="absolute left-[-56] top-[44] w-[248] h-[248]"
        style={{
          posType: 1,
          insetL: -56,
          insetT: 44,
          width: 248,
          height: 248,
          bgColor: pal().orbPrimary,
          opacity: pal().mode === "amber-night" ? 0.35 : pal().dark ? 0.52 : 0.72,
          radius: 999,
          rotate: -14,
          hitPass: 1,
        }}
      />
      {/* Mid-right warm accent refractive orb */}
      <View
        class="absolute right-[-72] top-[260] w-[264] h-[264]"
        style={{
          posType: 1,
          insetR: -72,
          insetT: 260,
          width: 264,
          height: 264,
          bgColor: pal().orbSecondary,
          opacity: pal().mode === "amber-night" ? 0.28 : pal().dark ? 0.46 : 0.68,
          radius: 999,
          rotate: 16,
          hitPass: 1,
        }}
      />
      {/* Lower-left cool emerald/amber refractive capsule */}
      <View
        class="absolute left-[36] bottom-[68] w-[280] h-[168]"
        style={{
          posType: 1,
          insetL: 36,
          insetB: 68,
          width: 280,
          height: 168,
          bgColor: pal().orbTertiary,
          opacity: pal().mode === "amber-night" ? 0.24 : pal().dark ? 0.38 : 0.64,
          radius: 84,
          rotate: -8,
          hitPass: 1,
        }}
      />
      {props.children}
    </View>
  );
}

export interface LiquidGlassSurfaceProps {
  material?: LiquidGlassMaterial;
  priority?: LiquidGlassSurfacePriority;
  shape?: GlassShape;
  radius?: number;
  elastic?: boolean;
  magnification?: number | Accessor<number>;
  deformation?: {
    anchorX: number;
    anchorY: number;
    offsetX: number;
    offsetY: number;
    radius: number;
  };
  pressed?: boolean;
  elevated?: boolean;
  accentTint?: boolean;
  class?: string;
  contentClass?: string;
  style?: ViewProps["style"];
  nodeRef?: ViewProps["nodeRef"];
  children?: JSX.Element;
}

/**
 * Core dual-path Liquid Glass surface:
 * - Mounts `props.children` ONCE inside a stable foreground container so dynamic GPU
 *   lease preemption or quality-tier switching never unmounts child inputs, scroll views,
 *   or gesture recognizers.
 * - Renders real GPU `GlassSurface` (`liquid_glass.frag`) in the background layer when
 *   leased by `LiquidGlassGovernor` and outside an ancestor `LiquidGlassGroup`; otherwise
 *   renders Zero-Pass Specular Vector Glass (no optical GPU passes).
 */
export function LiquidGlassSurface(props: LiquidGlassSurfaceProps): JSX.Element {
  const ctx = useLiquidGlass();
  const inGroup = useInLiquidGlassGroup();
  const accessibility = useAccessibilityPreferences();

  const material = (): LiquidGlassMaterial => props.material ?? "regular";
  const shape = (): GlassShape => props.shape ?? "rounded";
  const recipe = createMemo(() => resolveOpticalRecipe(material(), ctx.palette()));

  const wantsGpu = createMemo(
    () =>
      !inGroup &&
      recipe().usesGpuBackdrop &&
      !accessibility().reduceTransparency &&
      !accessibility().increaseContrast,
  );

  let activeLease: ReturnType<LiquidGlassGovernor["acquireLease"]> | undefined =
    untrack(() =>
      wantsGpu() ? ctx.governor.acquireLease(props.priority ?? "normal") : undefined,
    );
  const [leaseRef, setLeaseRef] = createSignal(activeLease);

  createEffect(() => {
    const want = wantsGpu();
    const prio = props.priority ?? "normal";
    untrack(() => {
      if (!want) {
        if (activeLease) {
          activeLease.release();
          activeLease = undefined;
          setLeaseRef(undefined);
        }
      } else if (!activeLease || activeLease.priority !== prio) {
        activeLease?.release();
        activeLease = ctx.governor.acquireLease(prio);
        setLeaseRef(activeLease);
      }
    });
  });

  const leaseGranted = (): boolean => leaseRef()?.granted() ?? false;

  onCleanup(() => {
    activeLease?.release();
    activeLease = undefined;
  });

  const resolvedRadius = (): number => {
    if (props.radius !== undefined) return props.radius;
    if (shape() === "pill" || shape() === "circle") return 999;
    return ctx.palette().radiusSurface;
  };

  const quantizedMag = (): number => {
    const raw =
      typeof props.magnification === "function"
        ? props.magnification()
        : (props.magnification ?? 1);
    return quantizeOptical(raw, 0.005, 1);
  };

  return (
    <View
      nodeRef={props.nodeRef}
      class={props.class ?? "relative flex-col w-full"}
      style={{ posType: 0, ...(props.style ?? {}) }}
    >
      <Show
        when={leaseGranted()}
        fallback={
          <VectorSpecularBackdrop
            palette={ctx.palette}
            material={material}
            radius={resolvedRadius}
            elevated={props.elevated !== false}
            accentTint={props.accentTint === true}
            inGroup={inGroup}
          />
        }
      >
        <GlassSurface
          shape={shape()}
          material={recipe().shaderMaterial}
          blur={recipe().blurSigma}
          materialStrength={recipe().materialStrength}
          materialTint={recipe().materialTintArgb}
          tintOpacity={recipe().tintOpacity}
          warp={recipe().warp}
          elastic={props.elastic === true && !ctx.reducedMotion()}
          magnification={quantizedMag}
          deformation={props.deformation}
          pressed={props.pressed}
          radius={resolvedRadius}
          class="absolute inset-0 w-full h-full"
          contentClass="p-0"
          style={{ ...ABS_FILL, hitPass: 1 }}
        />
      </Show>

      <View
        class={props.contentClass ?? "relative flex-col gap-2.5 w-full p-4"}
        style={{ minW: 0 }}
      >
        {props.children}
      </View>
    </View>
  );
}

/**
 * Zero-Pass Specular Vector Glass Backdrop (`0` GPU `BackdropFilter` passes):
 * Renders ambient drop shadow + directional top-left specular gradient sheen +
 * `1px` top highlight lip + hairline outer contour from retained `NodeMirror` primitives.
 */
function VectorSpecularBackdrop(props: {
  palette: Accessor<LiquidGlassPalette>;
  material: Accessor<LiquidGlassMaterial>;
  radius: Accessor<number>;
  elevated: boolean;
  accentTint: boolean;
  inGroup: boolean;
}): JSX.Element {
  const pal = () => props.palette();
  const rad = () => props.radius();

  const baseFill = (): string => {
    const p = pal();
    if (props.accentTint) return p.accentSubtle;
    if (props.inGroup) return p.dark ? "#FFFFFF14" : "#FFFFFF78";
    const m = props.material();
    if (m === "thick") return p.surfaceSolidSheet;
    if (m === "clear") return p.dark ? "#1B263B7A" : "#FFFFFF96";
    return p.surface;
  };

  return (
    <View class="absolute inset-0 w-full h-full" style={{ ...ABS_FILL, hitPass: 1 }}>
      {/* 1. Diffused vertical ambient shadow (skipped inside grouped toolbars) */}
      <Show when={props.elevated && !props.inGroup}>
        <View
          class="absolute inset-0"
          style={{
            posType: 1,
            insetL: 0,
            insetT: 3,
            insetR: 0,
            insetB: -3,
            bgColor: pal().shadowAmbient,
            radius: rad(),
            hitPass: 1,
          }}
        />
      </Show>

      {/* 2. Translucent body sheen + outer hairline optical contour */}
      <View
        class="absolute inset-0 overflow-hidden"
        style={{
          ...ABS_FILL,
          overflow: 1,
          bgColor: baseFill(),
          gradFrom: props.accentTint ? pal().accentSubtle : pal().sheenLightFrom,
          gradTo: props.accentTint ? pal().surface : pal().sheenLightTo,
          gradDir: 1,
          borderColor: pal().contourOuter,
          borderWidth: 1,
          radius: rad(),
          hitPass: 1,
        }}
      >
        {/* 3. Razor-sharp 1px top directional specular rim highlight */}
        <View
          class="absolute left-4 right-4 top-0 h-[1]"
          style={{
            posType: 1,
            insetL: rad() >= 999 ? 18 : 12,
            insetR: rad() >= 999 ? 18 : 12,
            insetT: 0,
            height: 1,
            bgColor: pal().rimHighlight,
            radius: 999,
            hitPass: 1,
          }}
        />
      </View>
    </View>
  );
}

/**
 * Shared single-material container (`UIGlassContainerEffect` / `GlassEffectContainer`):
 * Acquires ONE GPU `LiquidGlassSurface` for the whole cluster while nested
 * `LiquidGlassButton` / `LiquidGlassIconButton` children automatically render as
 * lightweight zero-pass tint layers inside it.
 */
export function LiquidGlassGroup(props: {
  material?: LiquidGlassMaterial;
  priority?: LiquidGlassSurfacePriority;
  shape?: GlassShape;
  radius?: number;
  class?: string;
  contentClass?: string;
  style?: ViewProps["style"];
  nodeRef?: ViewProps["nodeRef"];
  children?: JSX.Element;
}): JSX.Element {
  return (
    <LiquidGlassSurface
      material={props.material ?? "clear"}
      priority={props.priority ?? "high"}
      shape={props.shape ?? "pill"}
      radius={props.radius}
      class={props.class ?? "relative flex-row items-center"}
      contentClass={
        props.contentClass ?? "relative flex-row items-center gap-1.5 px-2 py-1.5"
      }
      style={props.style}
      nodeRef={props.nodeRef}
    >
      <LiquidGlassGroupContext.Provider value={true}>
        {props.children}
      </LiquidGlassGroupContext.Provider>
    </LiquidGlassSurface>
  );
}

export type { NodeMirror };
