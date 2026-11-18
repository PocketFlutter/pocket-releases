/**
 * @pocket/liquid_glass — High-FPS Interactive Controls & Tactile Physics.
 *
 * Implements the tactile iOS 26 Liquid Glass control suite:
 * - `LiquidGlassButton`, `LiquidGlassIconButton` & `LiquidGlassFlexSurface`: Group-aware clear
 *   glass capsules with imperative `jump()` press-bloom and `FlexInteraction` press-and-drag
 *   rubber-band deformation + specular `GlowView` highlight.
 * - `LiquidGlassSwitch`: Liquid Glass droplet toggle whose thumb lifts (`scale -> 1.18`)
 *   and glides via imperative `jump(node, "translateX", ...)` on active guest frames.
 * - `LiquidGlassSlider`: Continuous or commit-on-release (`continuous={false}`) slider whose
 *   thumb expands into a live clear refractive lens while held.
 * - `LiquidGlassSegmentedControl`: Recessed track with draggable & spring-gliding clear
 *   Liquid Glass selection lens, supporting `momentary` and `disabled` segments.
 * - `LiquidGlassStepper`: Split capsule stepper with left/right press highlight, divider fade,
 *   hold-to-accelerate `autorepeat`, and `wraps` cycling.
 * - `LiquidGlassPageControl`: `PageControlPlatterView` capsule pill with tap left/right,
 *   hold-and-scrub magnification, and windowed dot scaling (`12+` pages).
 * - `LiquidGlassBadge`, `LiquidGlassCheckbox`, `LiquidGlassRadioGroup`, `LiquidGlassInput`,
 *   `LiquidGlassProgress`.
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type JSX,
} from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import { Focusable, Text, View, type NodeMirror } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/solid/lifecycle";
import {
  InputField,
  MobileParagraph,
  SafeAreaScaffoldContext,
  ScrollablePageContext,
  useRouteActive,
} from "@pocket/ui";
import { resolveNodeLocalPoint } from "@pocket/ui/fast";
import {
  createGlassSpring,
  createImperativeSpring,
  quantizeOptical,
} from "./motion.ts";
import {
  LiquidGlassSurface,
  useInLiquidGlassGroup,
  useLiquidGlass,
} from "./surfaces.tsx";
import { concentricGlassRadius, type LiquidGlassMaterial } from "./tokens.ts";

export type LiquidGlassButtonVariant =
  | "glass"
  | "primary"
  | "secondary"
  | "tonal"
  | "outline"
  | "ghost"
  | "danger";

export type LiquidGlassTone =
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "outline";

function readNodeWidth(node: { id: number } | undefined): number | undefined {
  const getLayout = (
    globalThis as typeof globalThis & {
      pocket?: { getLayout?: (id: number) => unknown };
    }
  ).pocket?.getLayout;
  if (!node || typeof getLayout !== "function") return undefined;
  try {
    const raw = getLayout(node.id) as { width?: unknown; w?: unknown } | undefined;
    const w = Number(raw?.width ?? raw?.w ?? 0);
    return Number.isFinite(w) && w > 8 ? w : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Interactive `FlexInteraction` + `GlowView` container (`Control & Flex` parity):
 * Press and drag to stretch, translate, and bend the refractive glass surface with
 * rubber-band resistance; release to watch the underdamped jelly spring recover!
 */
export function LiquidGlassFlexSurface(props: {
  material?: LiquidGlassMaterial;
  radius?: number;
  shape?: "rounded" | "pill" | "circle";
  disabled?: boolean;
  class?: string;
  contentClass?: string;
  onPress?: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const routeActive = useRouteActive();

  let hostNode: NodeMirror | undefined;
  const [pressing, setPressing] = createSignal(false);
  const [dragVec, setDragVec] = createSignal({ x: 0, y: 0 });
  const [glowPos, setGlowPos] = createSignal({ x: 0, y: 0 });

  const tx = createGlassSpring(
    () => (pressing() ? Math.tanh(dragVec().x / 46) * 14 : 0),
    { preset: "jelly", reducedMotion: ctx.reducedMotion, quantizeStep: 0.2 },
  );
  const ty = createGlassSpring(
    () => (pressing() ? Math.tanh(dragVec().y / 46) * 14 : 0),
    { preset: "jelly", reducedMotion: ctx.reducedMotion, quantizeStep: 0.2 },
  );
  const sx = createGlassSpring(
    () => {
      if (!pressing()) return 1;
      const ax = Math.abs(dragVec().x);
      const ay = Math.abs(dragVec().y);
      return 1.03 + Math.min(0.085, ax / 240) - Math.min(0.04, ay / 360);
    },
    { preset: "jelly", reducedMotion: ctx.reducedMotion, quantizeStep: 0.004 },
  );
  const sy = createGlassSpring(
    () => {
      if (!pressing()) return 1;
      const ax = Math.abs(dragVec().x);
      const ay = Math.abs(dragVec().y);
      return 1.03 + Math.min(0.085, ay / 240) - Math.min(0.04, ax / 360);
    },
    { preset: "jelly", reducedMotion: ctx.reducedMotion, quantizeStep: 0.004 },
  );
  const glowAlpha = createGlassSpring(() => (pressing() ? 1 : 0), {
    preset: "tactile",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.02,
  });

  createGesture({
    axis: "any",
    panSlop: 2,
    region: {
      node: () => (routeActive() && !props.disabled ? hostNode : undefined),
    },
    onDown: (c) => {
      setPressing(true);
      setDragVec({ x: 0, y: 0 });
      const pt = resolveNodeLocalPoint(hostNode, c.x, c.y, null, 0);
      if (pt) setGlowPos({ x: pt.clampedX - pt.width * 0.5, y: pt.clampedY - pt.height * 0.5 });
    },
    onPanMove: (c) => {
      setDragVec({ x: c.dx, y: c.dy });
      const pt = resolveNodeLocalPoint(hostNode, c.x, c.y, null, 0);
      if (pt) setGlowPos({ x: pt.clampedX - pt.width * 0.5, y: pt.clampedY - pt.height * 0.5 });
    },
    onTap: () => {
      setPressing(false);
      setDragVec({ x: 0, y: 0 });
      props.onPress?.();
    },
    onPanEnd: () => {
      setPressing(false);
      setDragVec({ x: 0, y: 0 });
    },
    onUp: () => {
      setPressing(false);
      setDragVec({ x: 0, y: 0 });
    },
    onCancel: () => {
      setPressing(false);
      setDragVec({ x: 0, y: 0 });
    },
  });

  const rad = () => props.radius ?? 22;

  return (
    <View
      ref={(node) => {
        hostNode = node;
      }}
      class={props.class ?? "relative flex-col"}
      style={{
        posType: 0,
        translateX: quantizeOptical(tx(), 0.25, 0),
        translateY: quantizeOptical(ty(), 0.25, 0),
        scaleX: quantizeOptical(sx(), 0.004, 1),
        scaleY: quantizeOptical(sy(), 0.004, 1),
        opacity: props.disabled ? 0.48 : 1,
      }}
    >
      <LiquidGlassSurface
        material={props.material ?? "regular"}
        priority="high"
        shape={props.shape ?? "rounded"}
        radius={rad()}
        pressed={pressing}
        magnification={() => (pressing() ? 1.12 : 1.02)}
        deformation={{
          anchorX: glowPos().x * 0.65,
          anchorY: glowPos().y * 0.65,
          offsetX: quantizeOptical(tx() * 0.75, 0.1, 0),
          offsetY: quantizeOptical(ty() * 0.75, 0.1, 0),
          radius: 76,
        }}
        class="relative w-full overflow-hidden"
        contentClass={props.contentClass ?? "relative flex-col p-4 w-full"}
      >
        {/* Specular touch-point GlowView */}
        <Show when={glowAlpha() > 0.02}>
          <View
            class="absolute inset-0"
            style={{
              posType: 1,
              insetT: 0,
              insetR: 0,
              insetB: 0,
              insetL: 0,
              bgColor: ctx.palette().dark ? "#FFFFFF1C" : "#FFFFFF52",
              borderColor: ctx.palette().rimHighlight,
              borderWidth: 1.5,
              radius: rad(),
              opacity: quantizeOptical(glowAlpha(), 0.02, 0),
              hitPass: 1,
            }}
          />
        </Show>
        {props.children}
      </LiquidGlassSurface>
    </View>
  );
}

/**
 * Group-aware Liquid Glass action button with imperative 120Hz press-bloom and
 * optional `flex` (`FlexInteraction`) press-and-drag deformation.
 */
export function LiquidGlassButton(props: {
  label: string;
  pressedLabel?: string;
  icon?: JSX.Element;
  variant?: LiquidGlassButtonVariant;
  selected?: boolean;
  compact?: boolean;
  fullWidth?: boolean;
  flex?: boolean;
  disabled?: boolean;
  onPressStateChange?: (pressed: boolean) => void;
  onPress?: () => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const inGroup = useInLiquidGlassGroup();
  const routeActive = useRouteActive();

  let btnNode: NodeMirror | undefined;
  const [pulse, setPulse] = createSignal(0);
  const [holding, setHolding] = createSignal(false);
  const [flexVec, setFlexVec] = createSignal({ x: 0, y: 0 });

  const pressScale = createImperativeSpring(
    () => (holding() ? 1.04 : pulse() > 0 ? 0.965 : 1),
    "scale",
    { preset: "tactile", reducedMotion: ctx.reducedMotion },
  );

  const flexTx = createGlassSpring(
    () => (props.flex && holding() ? Math.tanh(flexVec().x / 40) * 10 : 0),
    { preset: "jelly", reducedMotion: ctx.reducedMotion, quantizeStep: 0.25 },
  );
  const flexTy = createGlassSpring(
    () => (props.flex && holding() ? Math.tanh(flexVec().y / 40) * 10 : 0),
    { preset: "jelly", reducedMotion: ctx.reducedMotion, quantizeStep: 0.25 },
  );

  try {
    onFrame(
      () => {
        if (pulse() > 0) setPulse(0);
      },
      { continuous: () => pulse() > 0 },
    );
  } catch {}

  const updateHold = (next: boolean): void => {
    setHolding(next);
    if (!next) setFlexVec({ x: 0, y: 0 });
    props.onPressStateChange?.(next);
  };

  createGesture({
    axis: "any",
    panSlop: 3,
    region: {
      node: () =>
        routeActive() && !props.disabled && (props.flex || Boolean(props.pressedLabel) || Boolean(props.onPressStateChange))
          ? btnNode
          : undefined,
    },
    onDown: () => updateHold(true),
    onPanMove: (c) => {
      if (props.flex) setFlexVec({ x: c.dx, y: c.dy });
    },
    onPanEnd: () => updateHold(false),
    onUp: () => updateHold(false),
    onCancel: () => updateHold(false),
  });

  const variant = (): LiquidGlassButtonVariant => props.variant ?? "primary";
  const isCompact = (): boolean => props.compact === true || ctx.density() === "compact";

  const handlePress = (): void => {
    if (props.disabled) return;
    updateHold(false);
    setPulse(1);
    pressScale.impulse(-1.4);
    props.onPress?.();
  };

  const colors = createMemo(() => {
    const p = ctx.palette();
    const v = variant();
    if (props.selected) {
      return {
        bg: p.accentHex,
        border: p.accentStrong,
        fg: p.accentForeground,
        useGlassShell: false,
      };
    }
    if (v === "glass") {
      return {
        bg: inGroup ? (p.dark ? "#FFFFFF14" : "#0000000A") : "#00000000",
        border: inGroup ? p.rimSubtle : "#00000000",
        fg: p.ink,
        useGlassShell: !inGroup,
      };
    }
    if (v === "primary") {
      return {
        bg: p.accentHex,
        border: p.rimHighlight,
        fg: p.accentForeground,
        useGlassShell: false,
      };
    }
    if (v === "danger") {
      return {
        bg: p.danger.solid,
        border: p.danger.border,
        fg: p.danger.solidFg,
        useGlassShell: false,
      };
    }
    if (v === "secondary" || v === "tonal") {
      return {
        bg: p.accentSubtle,
        border: p.rimSubtle,
        fg: p.accentHex,
        useGlassShell: false,
      };
    }
    if (v === "outline") {
      return {
        bg: p.surface,
        border: p.contourOuter,
        fg: p.ink,
        useGlassShell: false,
      };
    }
    return {
      bg: "#00000000",
      border: "#00000000",
      fg: p.accentHex,
      useGlassShell: false,
    };
  });

  const displayLabel = () =>
    holding() && props.pressedLabel ? props.pressedLabel : props.label;

  // Each branch owns its renderer nodes when selection changes the shell.
  const renderRow = () => (
    <Focusable
      focusable={!props.disabled}
      onPress={props.disabled ? undefined : handlePress}
      class={props.fullWidth ? "w-full" : ""}
      style={{ opacity: props.disabled ? 0.48 : 1 }}
    >
      <View
        ref={(node) => {
          btnNode = node;
          pressScale.ref(node);
        }}
        class={
          isCompact()
            ? "relative flex-row items-center justify-center gap-1.5 px-3.5 h-[36]"
            : "relative flex-row items-center justify-center gap-2 px-4 h-[44]"
        }
        style={{
          posType: 0,
          width: props.fullWidth ? -1 : undefined,
          bgColor: colors().bg,
          borderColor: holding() ? ctx.palette().rimHighlight : colors().border,
          borderWidth: colors().border === "#00000000" && !holding() ? 0 : 1,
          radius: 999,
          translateX: props.flex ? quantizeOptical(flexTx(), 0.25, 0) : 0,
          translateY: props.flex ? quantizeOptical(flexTy(), 0.25, 0) : 0,
        }}
      >
        {props.icon}
        <Text
          class={isCompact() ? "text-xs font-bold" : "text-sm font-bold"}
          style={{ textColor: colors().fg, hitPass: 1 }}
        >
          {displayLabel()}
        </Text>
      </View>
    </Focusable>
  );

  return (
    <Show when={colors().useGlassShell} fallback={renderRow()}>
      <LiquidGlassSurface
        material="clear"
        priority="normal"
        shape="pill"
        radius={999}
        pressed={holding}
        magnification={() => (holding() ? 1.1 : 1)}
        class={props.fullWidth ? "relative flex-col w-full" : "relative flex-col"}
        contentClass="relative flex-row items-center justify-center p-0"
      >
        {renderRow()}
      </LiquidGlassSurface>
    </Show>
  );
}

/** Circular 40/44pt Liquid Glass icon button (group-aware). */
export function LiquidGlassIconButton(props: {
  glyph: string;
  active?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const inGroup = useInLiquidGlassGroup();
  const size = () => (props.compact ? 36 : 42);

  const buttonNode = (
    <Focusable
      focusable={!props.disabled}
      onPress={props.disabled ? undefined : props.onPress}
      style={{ opacity: props.disabled ? 0.45 : 1 }}
    >
      <View
        class="items-center justify-center shrink-0"
        style={{
          width: size(),
          height: size(),
          bgColor: props.active
            ? ctx.palette().accentHex
            : inGroup
              ? "#00000000"
              : ctx.palette().surface,
          borderColor: props.active ? ctx.palette().accentStrong : ctx.palette().rimSubtle,
          borderWidth: inGroup && !props.active ? 0 : 1,
          radius: 999,
        }}
      >
        <Text
          class="text-sm font-bold"
          style={{
            textColor: props.active ? ctx.palette().accentForeground : ctx.palette().ink,
            hitPass: 1,
          }}
        >
          {props.glyph}
        </Text>
      </View>
    </Focusable>
  );

  if (inGroup || props.active) return buttonNode;
  return (
    <LiquidGlassSurface
      material="clear"
      priority="normal"
      shape="circle"
      radius={999}
      class="relative items-center justify-center shrink-0"
      contentClass="items-center justify-center p-0"
      style={{ width: size(), height: size() }}
    >
      {buttonNode}
    </LiquidGlassSurface>
  );
}

/**
 * Signature iOS 26 Liquid Glass Switch (`SwitchModernVisualElement`):
 * Capsule track (`60 x 32`) + imperative `jump(thumb, "translateX", ...)` droplet thumb
 * that blooms into a clear magnifying glass droplet while pressed/toggled!
 */
export function LiquidGlassSwitch(props: {
  value: boolean;
  label?: string;
  detail?: string;
  tintColor?: string;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const routeActive = useRouteActive();
  const [holding, setHolding] = createSignal(false);
  let switchTrackNode: NodeMirror | undefined;

  const thumbTravel = 18;
  const thumbX = createImperativeSpring(
    () => (props.value ? thumbTravel : 0),
    "translateX",
    { preset: "tactile", reducedMotion: ctx.reducedMotion },
  );
  const thumbScale = createImperativeSpring(
    () => (holding() ? 1.18 : 1),
    "scale",
    { preset: "tactile", reducedMotion: ctx.reducedMotion },
  );

  createGesture({
    axis: "x",
    panSlop: 4,
    region: {
      node: () => (routeActive() && !props.disabled ? switchTrackNode : undefined),
    },
    onDown: () => {
      if (!props.disabled) setHolding(true);
    },
    onPanEnd: (contact) => {
      setHolding(false);
      if (props.disabled) return;
      if (Math.abs(contact.dx) > 6) {
        const wantOn = contact.dx > 0;
        if (wantOn !== props.value) props.onChange?.(wantOn);
      }
    },
    onUp: () => setHolding(false),
    onCancel: () => setHolding(false),
  });

  const toggle = (): void => {
    if (props.disabled) return;
    thumbScale.impulse(1.8);
    props.onChange?.(!props.value);
  };

  const onFill = () => props.tintColor ?? ctx.palette().accentHex;

  const pill = (
    <View
      ref={(node) => {
        switchTrackNode = node;
      }}
      class="relative w-[60] h-[32] p-[3] flex-row items-center shrink-0"
      style={{
        posType: 0,
        width: 60,
        height: 32,
        bgColor: props.value ? onFill() : ctx.palette().surfaceMuted,
        borderColor: props.value
          ? props.tintColor ?? ctx.palette().accentStrong
          : ctx.palette().contourOuter,
        borderWidth: 1,
        radius: 999,
      }}
    >
      <View
        ref={(node) => {
          thumbX.ref(node);
          thumbScale.ref(node);
        }}
        class="relative w-[36] h-[24] items-center justify-center"
        style={{
          posType: 0,
          width: 36,
          height: 24,
          hitPass: 1,
        }}
      >
        <Show
          when={holding()}
          fallback={
            <View
              class="relative w-[36] h-[24]"
              style={{
                posType: 0,
                width: 36,
                height: 24,
                bgColor: "#FFFFFF",
                borderColor: ctx.palette().contourOuter,
                borderWidth: 1,
                radius: 999,
                hitPass: 1,
              }}
            >
              <View
                class="absolute left-[7] top-[3] w-[16] h-[3]"
                style={{
                  posType: 1,
                  insetL: 7,
                  insetT: 3,
                  width: 16,
                  height: 3,
                  bgColor: "#FFFFFF",
                  opacity: 0.95,
                  radius: 999,
                  hitPass: 1,
                }}
              />
            </View>
          }
        >
          <LiquidGlassSurface
            material="clear"
            priority="high"
            shape="pill"
            radius={999}
            magnification={1.18}
            class="w-[36] h-[24]"
            contentClass="w-[36] h-[24] p-0"
            style={{ width: 36, height: 24, hitPass: 1 }}
          />
        </Show>
      </View>
    </View>
  );

  if (!props.label && !props.detail) {
    return (
      <Focusable
        focusable={!props.disabled}
        onPress={props.disabled ? undefined : toggle}
        style={{ opacity: props.disabled ? 0.48 : 1 }}
      >
        {pill}
      </Focusable>
    );
  }

  return (
    <Focusable
      focusable={!props.disabled}
      onPress={props.disabled ? undefined : toggle}
      class="flex-row items-center justify-between gap-3 py-1.5 w-full"
      style={{ minW: 0, opacity: props.disabled ? 0.48 : 1 }}
    >
      <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
        <Show when={Boolean(props.label)}>
          <MobileParagraph
            text={props.label!}
            class="text-sm font-bold"
            style={{ textColor: ctx.palette().ink }}
            fallbackInsetPx={112}
          />
        </Show>
        <Show when={Boolean(props.detail)}>
          <MobileParagraph
            text={props.detail!}
            class="text-xs"
            style={{ textColor: ctx.palette().inkSecondary }}
            fallbackInsetPx={112}
          />
        </Show>
      </View>
      {pill}
    </Focusable>
  );
}

/**
 * Interactive Liquid Glass slider:
 * Supports both continuous updates (`continuous !== false`) and commit-on-release
 * (`continuous={false}` + `onCommit`), optional leading/trailing value glyphs, and custom tint!
 */
export function LiquidGlassSlider(props: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  leadingGlyph?: string;
  trailingGlyph?: string;
  tintColor?: string;
  continuous?: boolean;
  showValue?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const routeActive = useRouteActive();
  const scrollPage = useContext(ScrollablePageContext);
  const scaffold = useContext(SafeAreaScaffoldContext);

  let trackNode: NodeMirror | undefined;
  const [trackWidth, setTrackWidth] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);
  const [liveValue, setLiveValue] = createSignal<number | null>(null);

  const min = () => props.min ?? 0;
  const max = () => Math.max(min() + 0.0001, props.max ?? 100);
  const displayedValue = () => liveValue() ?? props.value;
  const ratio = () =>
    Math.max(0, Math.min(1, (displayedValue() - min()) / (max() - min())));

  const effectiveWidth = (): number => {
    const w = trackWidth();
    if (w > 24) return w;
    const iconReserve =
      (props.leadingGlyph ? 24 : 0) + (props.trailingGlyph ? 24 : 0);
    return Math.max(120, (scaffold.geometry().width || 390) - 72 - iconReserve);
  };

  const syncTrackWidth = (): void => {
    const w = readNodeWidth(trackNode);
    if (w !== undefined && Math.abs(w - trackWidth()) >= 1) {
      setTrackWidth(w);
    }
  };

  try {
    onFrame(syncTrackWidth, {
      active: () => routeActive() && trackWidth() <= 0,
      continuous: false,
    });
  } catch {}

  const thumbW = 38;
  const thumbH = 24;
  const thumbTargetX = () => ratio() * Math.max(0, effectiveWidth() - thumbW);
  const thumbX = createImperativeSpring(thumbTargetX, "translateX", {
    preset: "fluid",
    reducedMotion: ctx.reducedMotion,
  });
  const thumbScale = createImperativeSpring(
    () => (dragging() ? 1.24 : 1),
    "scale",
    { preset: "tactile", reducedMotion: ctx.reducedMotion },
  );
  const fillScale = createImperativeSpring(
    () => Math.max(0.02, ratio()),
    "scaleX",
    { preset: "fluid", reducedMotion: ctx.reducedMotion },
  );

  const computeFromViewportX = (viewportX: number, viewportY: number): number => {
    syncTrackWidth();
    const pt = resolveNodeLocalPoint(trackNode, viewportX, viewportY, scrollPage, 0);
    const width = pt && pt.width > 16 ? pt.width : effectiveWidth();
    if (pt && pt.width > 16 && Math.abs(pt.width - trackWidth()) >= 1) {
      setTrackWidth(pt.width);
    }
    const localX = pt ? pt.clampedX : 0;
    const rawRatio = Math.max(0, Math.min(1, localX / Math.max(1, width)));
    const rawVal = min() + rawRatio * (max() - min());
    const step = props.step ?? 1;
    const stepped =
      step > 0 ? Math.round((rawVal - min()) / step) * step + min() : rawVal;
    return Math.max(min(), Math.min(max(), Number(stepped.toFixed(4))));
  };

  const handleScrub = (vx: number, vy: number, isRelease: boolean): void => {
    if (props.disabled) return;
    const next = computeFromViewportX(vx, vy);
    const isCont = props.continuous !== false;
    if (isCont) {
      setLiveValue(null);
      if (next !== props.value) props.onChange(next);
      if (isRelease) props.onCommit?.(next);
    } else {
      setLiveValue(next);
      if (isRelease) {
        setLiveValue(null);
        props.onChange(next);
        props.onCommit?.(next);
      }
    }
  };

  createGesture({
    axis: "x",
    panSlop: 1,
    region: {
      node: () => (routeActive() && !props.disabled ? trackNode : undefined),
    },
    onDown: (c) => {
      if (props.disabled) return;
      setDragging(true);
      handleScrub(c.x, c.y, false);
    },
    onPanMove: (c) => {
      if (!dragging() || props.disabled) return;
      handleScrub(c.x, c.y, false);
    },
    onTap: (c) => {
      handleScrub(c.x, c.y, true);
      setDragging(false);
    },
    onPanEnd: (c) => {
      handleScrub(c.x, c.y, true);
      setDragging(false);
    },
    onUp: (c) => {
      if (dragging()) handleScrub(c.x, c.y, true);
      setDragging(false);
    },
    onCancel: () => {
      setLiveValue(null);
      setDragging(false);
    },
  });

  const activeColor = () => props.tintColor ?? ctx.palette().accentHex;

  return (
    <View
      class="flex-col gap-1.5 w-full"
      style={{ minW: 0, opacity: props.disabled ? 0.48 : 1 }}
    >
      <Show when={Boolean(props.label) || props.showValue !== false}>
        <View class="flex-row items-center justify-between gap-2 w-full">
          <Show when={Boolean(props.label)}>
            <MobileParagraph
              text={props.label!}
              class="text-xs font-bold"
              style={{ textColor: ctx.palette().ink }}
            />
          </Show>
          <Show when={props.showValue !== false}>
            <Text
              class="text-xs font-mono font-bold shrink-0"
              style={{ textColor: activeColor() }}
            >
              {String(displayedValue())}
            </Text>
          </Show>
        </View>
      </Show>

      <View class="flex-row items-center gap-2.5 w-full">
        <Show when={Boolean(props.leadingGlyph)}>
          <Text
            class="text-xs font-bold shrink-0"
            style={{ textColor: ctx.palette().inkMuted }}
          >
            {props.leadingGlyph}
          </Text>
        </Show>

        <View
          ref={(node) => {
            trackNode = node;
            syncTrackWidth();
          }}
          class="relative flex-1 h-[34] flex-row items-center"
          style={{ posType: 0 }}
        >
          {/* Recessed track bar */}
          <View
            class="w-full h-[8] overflow-hidden"
            style={{
              overflow: 1,
              bgColor: ctx.palette().surfaceMuted,
              borderColor: ctx.palette().contourOuter,
              borderWidth: 1,
              radius: 999,
              hitPass: 1,
            }}
          >
            <View
              ref={fillScale.ref}
              class="h-[8]"
              style={{
                width: -1,
                originX: -0.5,
                bgColor: activeColor(),
                radius: 999,
                hitPass: 1,
              }}
            />
          </View>

          {/* Imperatively positioned capsule Liquid Glass droplet thumb */}
          <View
            ref={(node) => {
              thumbX.ref(node);
              thumbScale.ref(node);
            }}
            class="absolute left-[0] top-[5] w-[38] h-[24] items-center justify-center"
            style={{
              posType: 1,
              insetL: 0,
              insetT: 5,
              width: thumbW,
              height: thumbH,
              hitPass: 1,
            }}
          >
            <Show
              when={dragging()}
              fallback={
                <View
                  class="relative w-[38] h-[24]"
                  style={{
                    posType: 0,
                    width: thumbW,
                    height: thumbH,
                    bgColor: "#FFFFFF",
                    borderColor: ctx.palette().contourOuter,
                    borderWidth: 1,
                    radius: 999,
                    hitPass: 1,
                  }}
                >
                  <View
                    class="absolute left-[8] top-[3] w-[22] h-[3]"
                    style={{
                      posType: 1,
                      insetL: 8,
                      insetT: 3,
                      width: 22,
                      height: 3,
                      bgColor: "#FFFFFF",
                      opacity: 0.95,
                      radius: 999,
                      hitPass: 1,
                    }}
                  />
                </View>
              }
            >
              <LiquidGlassSurface
                material="clear"
                priority="high"
                shape="pill"
                radius={999}
                magnification={1.22}
                class="w-[38] h-[24]"
                contentClass="w-[38] h-[24] p-0"
                style={{ width: thumbW, height: thumbH, hitPass: 1 }}
              />
            </Show>
          </View>
        </View>

        <Show when={Boolean(props.trailingGlyph)}>
          <Text
            class="text-xs font-bold shrink-0"
            style={{ textColor: activeColor() }}
          >
            {props.trailingGlyph}
          </Text>
        </Show>
      </View>
    </View>
  );
}

/**
 * Recessed capsule Segmented Control with a finger-draggable & spring-gliding
 * Liquid Glass pill lens (`jump(lens, "translateX", ...)`), supporting `momentary`
 * and per-segment `disabled` states.
 */
export function LiquidGlassSegmentedControl<T extends string = string>(props: {
  items: readonly { id: T; label: string; disabled?: boolean }[];
  active: T;
  momentary?: boolean;
  tintColor?: string;
  accentActive?: boolean;
  onChange: (id: T) => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const routeActive = useRouteActive();
  const scrollPage = useContext(ScrollablePageContext);
  const scaffold = useContext(SafeAreaScaffoldContext);

  let railNode: NodeMirror | undefined;
  const [railWidth, setRailWidth] = createSignal(0);
  const [dragIndex, setDragIndex] = createSignal<number | null>(null);
  const [momentaryFlash, setMomentaryFlash] = createSignal<number | null>(null);

  const count = () => Math.max(1, props.items.length);
  const activeIndex = () => {
    if (props.momentary) return momentaryFlash() ?? dragIndex() ?? 0;
    const idx = props.items.findIndex((it) => it.id === props.active);
    return idx >= 0 ? idx : 0;
  };

  const syncRailWidth = (): void => {
    const w = readNodeWidth(railNode);
    if (w !== undefined && Math.abs(w - railWidth()) >= 1) {
      setRailWidth(w);
    }
  };

  try {
    onFrame(syncRailWidth, {
      active: () => routeActive() && railWidth() <= 0,
      continuous: false,
    });
  } catch {}

  const totalInnerWidth = (): number => {
    const w = railWidth();
    const outer = w > 24 ? w : Math.max(160, (scaffold.geometry().width || 390) - 40);
    return Math.max(60, outer - 8);
  };

  const segmentWidth = () => totalInnerWidth() / count();
  const visualIndex = () => dragIndex() ?? activeIndex();
  const lensTargetX = () => visualIndex() * segmentWidth();
  const showLens = () =>
    !props.momentary || dragIndex() !== null || momentaryFlash() !== null;

  const lensX = createImperativeSpring(lensTargetX, "translateX", {
    preset: "fluid",
    reducedMotion: ctx.reducedMotion,
  });
  const lensScale = createImperativeSpring(
    () => (dragIndex() !== null ? 1.04 : 1),
    "scale",
    { preset: "tactile", reducedMotion: ctx.reducedMotion },
  );

  const resolveHoveredIndex = (vx: number, vy: number): number => {
    syncRailWidth();
    const pt = resolveNodeLocalPoint(railNode, vx, vy, scrollPage, 4);
    const w = pt && pt.width > 24 ? pt.width - 8 : totalInnerWidth();
    const lx = pt ? Math.max(0, pt.x - 4) : 0;
    const raw = Math.floor((lx / Math.max(1, w)) * count());
    return Math.max(0, Math.min(count() - 1, raw));
  };

  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(flashTimer));

  const firePick = (idx: number): void => {
    const picked = props.items[idx];
    if (!picked || picked.disabled) return;
    if (props.momentary) {
      setMomentaryFlash(idx);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => setMomentaryFlash(null), 180);
      props.onChange(picked.id);
      return;
    }
    if (picked.id !== props.active) props.onChange(picked.id);
  };

  createGesture({
    axis: "x",
    panSlop: 4,
    region: {
      node: () => (routeActive() ? railNode : undefined),
    },
    onPanStart: (c) => {
      const idx = resolveHoveredIndex(c.x, c.y);
      if (!props.items[idx]?.disabled) setDragIndex(idx);
    },
    onPanMove: (c) => {
      if (dragIndex() === null) return;
      const idx = resolveHoveredIndex(c.x, c.y);
      if (!props.items[idx]?.disabled) setDragIndex(idx);
    },
    onPanEnd: () => {
      const idx = dragIndex();
      setDragIndex(null);
      if (idx !== null) firePick(idx);
    },
    onCancel: () => setDragIndex(null),
  });

  const activeBg = () =>
    props.tintColor ??
    (props.accentActive ? ctx.palette().accentHex : ctx.palette().surfaceRaised);

  return (
    <View
      ref={(node) => {
        railNode = node;
        syncRailWidth();
      }}
      class="relative w-full h-[40] p-[4] flex-row items-center"
      style={{
        posType: 0,
        bgColor: ctx.palette().surfaceMuted,
        borderColor: ctx.palette().contourOuter,
        borderWidth: 1,
        radius: 999,
      }}
    >
      {/* Gliding Liquid Glass Pill Indicator */}
      <View
        ref={(node) => {
          lensX.ref(node);
          lensScale.ref(node);
        }}
        class="absolute left-[4] top-[4] h-[32]"
        style={{
          posType: 1,
          insetL: 4,
          insetT: 4,
          width: Math.max(32, Math.round(segmentWidth())),
          height: 32,
          opacity: showLens() ? 1 : 0,
          hitPass: 1,
        }}
      >
        <Show
          when={!props.accentActive && !props.tintColor && dragIndex() !== null}
          fallback={
            <View
              class="w-full h-[32]"
              style={{
                width: -1,
                height: 32,
                bgColor: activeBg(),
                borderColor:
                  props.accentActive || props.tintColor
                    ? props.tintColor ?? ctx.palette().accentStrong
                    : ctx.palette().rimHighlight,
                borderWidth: 1,
                radius: 999,
                hitPass: 1,
              }}
            />
          }
        >
          <LiquidGlassSurface
            material="clear"
            priority="high"
            shape="pill"
            radius={999}
            magnification={1.12}
            class="w-full h-[32]"
            contentClass="w-full h-[32] p-0"
            style={{ width: -1, height: 32, hitPass: 1 }}
          />
        </Show>
      </View>

      <For each={props.items}>
        {(item, idx) => {
          const isSelected = () =>
            showLens() &&
            (dragIndex() !== null
              ? dragIndex() === idx()
              : props.momentary
                ? momentaryFlash() === idx()
                : props.active === item.id);
          return (
            <Focusable
              focusable={!item.disabled}
              class="flex-1 h-[32] items-center justify-center bg-transparent"
              style={{ opacity: item.disabled ? 0.38 : 1 }}
              onPress={
                item.disabled
                  ? undefined
                  : () => {
                      syncRailWidth();
                      firePick(idx());
                    }
              }
            >
              <Text
                class={isSelected() ? "text-xs font-bold" : "text-xs"}
                style={{
                  textColor: isSelected()
                    ? props.accentActive || props.tintColor
                      ? "#FFFFFF"
                      : ctx.palette().ink
                    : ctx.palette().inkSecondary,
                  hitPass: 1,
                }}
              >
                {item.label}
              </Text>
            </Focusable>
          );
        }}
      </For>
    </View>
  );
}

/** Specular pill status badge. */
export function LiquidGlassBadge(props: {
  label: string;
  tone?: LiquidGlassTone;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const colors = createMemo(() => {
    const p = ctx.palette();
    const t = props.tone ?? "accent";
    if (t === "success") return { bg: p.success.subtle, border: p.success.border, fg: p.success.fg };
    if (t === "warning") return { bg: p.warning.subtle, border: p.warning.border, fg: p.warning.fg };
    if (t === "danger") return { bg: p.danger.solid, border: p.danger.border, fg: p.danger.solidFg };
    if (t === "info") return { bg: p.info.subtle, border: p.info.border, fg: p.info.fg };
    if (t === "neutral") return { bg: p.surfaceMuted, border: p.contourOuter, fg: p.inkSecondary };
    if (t === "outline") return { bg: "#00000000", border: p.contourOuter, fg: p.ink };
    return { bg: p.accentSubtle, border: p.rimHighlight, fg: p.accentHex };
  });

  return (
    <View
      class="px-2.5 py-1 flex-row items-center justify-center shrink-0"
      style={{
        bgColor: colors().bg,
        borderColor: colors().border,
        borderWidth: 1,
        radius: 999,
      }}
    >
      <Text class="text-2xs font-bold" style={{ textColor: colors().fg, hitPass: 1 }}>
        {props.label}
      </Text>
    </View>
  );
}

/** Tactile spring Liquid Glass Checkbox. */
export function LiquidGlassCheckbox(props: {
  checked: boolean;
  label?: string;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const boxScale = createImperativeSpring(
    () => (props.checked ? 1 : 0.92),
    "scale",
    { preset: "tactile", reducedMotion: ctx.reducedMotion },
  );

  return (
    <Focusable
      focusable={!props.disabled}
      onPress={props.disabled ? undefined : () => props.onChange?.(!props.checked)}
      class="flex-row items-center gap-2.5 py-1.5 w-full"
      style={{ minW: 0, opacity: props.disabled ? 0.48 : 1 }}
    >
      <View
        ref={boxScale.ref}
        class="w-[20] h-[20] items-center justify-center shrink-0"
        style={{
          width: 20,
          height: 20,
          bgColor: props.checked ? ctx.palette().accentHex : ctx.palette().surface,
          borderColor: props.checked ? ctx.palette().accentStrong : ctx.palette().contourOuter,
          borderWidth: 1,
          radius: 7,
        }}
      >
        <Show when={props.checked}>
          <Text
            class="text-xs font-bold"
            style={{ textColor: ctx.palette().accentForeground, hitPass: 1 }}
          >
            ✓
          </Text>
        </Show>
      </View>
      <Show when={Boolean(props.label)}>
        <View class="flex-col flex-1" style={{ minW: 0 }}>
          <MobileParagraph
            text={props.label!}
            class="text-sm"
            style={{ textColor: ctx.palette().ink }}
          />
        </View>
      </Show>
    </Focusable>
  );
}

/** Concentric specular Liquid Glass RadioGroup. */
export function LiquidGlassRadioGroup(props: {
  items: readonly { id: string; label: string; detail?: string }[];
  value: string;
  direction?: "row" | "col";
  onChange: (id: string) => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  return (
    <View
      class={
        props.direction === "row"
          ? "flex-row flex-wrap items-center gap-2 w-full"
          : "flex-col gap-2 w-full"
      }
      style={{ minW: 0 }}
    >
      <For each={props.items}>
        {(item) => {
          const selected = () => props.value === item.id;
          return (
            <Focusable
              onPress={() => props.onChange(item.id)}
              class="flex-row items-center gap-2.5 px-3.5 py-2.5"
              style={{
                minW: 0,
                bgColor: selected() ? ctx.palette().accentSubtle : ctx.palette().surface,
                borderColor: selected() ? ctx.palette().accentHex : ctx.palette().contourOuter,
                borderWidth: 1,
                radius: ctx.palette().radiusControl,
              }}
            >
              <View
                class="w-[18] h-[18] items-center justify-center shrink-0"
                style={{
                  width: 18,
                  height: 18,
                  borderColor: selected() ? ctx.palette().accentHex : ctx.palette().inkMuted,
                  borderWidth: 1.5,
                  radius: 999,
                }}
              >
                <Show when={selected()}>
                  <View
                    class="w-[9] h-[9]"
                    style={{
                      width: 9,
                      height: 9,
                      bgColor: ctx.palette().accentHex,
                      radius: 999,
                    }}
                  />
                </Show>
              </View>
              <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
                <MobileParagraph
                  text={item.label}
                  class="text-xs font-bold"
                  style={{ textColor: ctx.palette().ink }}
                />
                <Show when={Boolean(item.detail)}>
                  <MobileParagraph
                    text={item.detail!}
                    class="text-2xs"
                    style={{ textColor: ctx.palette().inkSecondary }}
                  />
                </Show>
              </View>
            </Focusable>
          );
        }}
      </For>
    </View>
  );
}

/** Native IME-backed Liquid Glass text field (`InputField` inside concentric glass well). */
export function LiquidGlassInput(props: {
  value: string | (() => string);
  placeholder?: string;
  label?: string;
  hint?: string;
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const accessor = () => (typeof props.value === "function" ? props.value() : props.value);
  const solidFill = () => {
    const p = ctx.palette();
    if (p.mode === "amber-night") return "#170F00" as const;
    return p.dark ? ("#162033" as const) : ("#FFFFFF" as const);
  };
  const borderHex = () => {
    const p = ctx.palette();
    if (p.mode === "amber-night") return "#473000" as const;
    return p.dark ? ("#334463" as const) : ("#CBD5E6" as const);
  };

  return (
    <View class="flex-col gap-1.5 w-full" style={{ minW: 0 }}>
      <Show when={Boolean(props.label) || Boolean(props.hint)}>
        <View class="flex-row items-center justify-between gap-2 w-full">
          <Show when={Boolean(props.label)}>
            <Text class="text-xs font-bold" style={{ textColor: ctx.palette().ink }}>
              {props.label}
            </Text>
          </Show>
          <Show when={Boolean(props.hint)}>
            <Text class="text-2xs" style={{ textColor: ctx.palette().inkMuted }}>
              {props.hint}
            </Text>
          </Show>
        </View>
      </Show>
      <InputField
        value={accessor}
        placeholder={props.placeholder}
        onInput={(val) => props.onInput?.(val)}
        onSubmit={props.onSubmit}
        appearance={{
          fillColor: solidFill(),
          textColor: ctx.palette().ink as `#${string}`,
          placeholderColor: ctx.palette().inkMuted as `#${string}`,
          borderColor: borderHex(),
          focusedBorderColor: ctx.palette().accentHex as `#${string}`,
          borderRadius: ctx.palette().radiusControl,
        }}
      />
    </View>
  );
}

/** Luminous capsule Liquid Glass progress meter driven by imperative `scaleX` spring. */
export function LiquidGlassProgress(props: {
  value: number;
  label?: string;
  barStyle?: "default" | "bar";
  tone?: "accent" | "success" | "warning" | "danger";
}): JSX.Element {
  const ctx = useLiquidGlass();
  const clamped = () => Math.max(0, Math.min(1, props.value));
  const fillScale = createImperativeSpring(
    () => Math.max(0.02, clamped()),
    "scaleX",
    { preset: "fluid", reducedMotion: ctx.reducedMotion },
  );
  const pct = createGlassSpring(() => clamped() * 100, {
    preset: "fluid",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.5,
  });

  const barColor = () => {
    const p = ctx.palette();
    if (props.tone === "success") return p.success.solid;
    if (props.tone === "warning") return p.warning.solid;
    if (props.tone === "danger") return p.danger.solid;
    return p.accentHex;
  };

  const trackH = () => (props.barStyle === "bar" ? 4 : 10);

  return (
    <View class="flex-col gap-1.5 w-full" style={{ minW: 0 }}>
      <Show when={Boolean(props.label)}>
        <View class="flex-row items-center justify-between gap-2 w-full">
          <MobileParagraph
            text={props.label!}
            class="text-xs font-bold"
            style={{ textColor: ctx.palette().ink }}
          />
          <Text
            class="text-xs font-mono font-bold shrink-0"
            style={{ textColor: ctx.palette().inkSecondary }}
          >
            {`${Math.round(pct())}%`}
          </Text>
        </View>
      </Show>
      <View
        class="w-full overflow-hidden"
        style={{
          height: trackH(),
          overflow: 1,
          bgColor: ctx.palette().surfaceMuted,
          borderColor: ctx.palette().contourOuter,
          borderWidth: props.barStyle === "bar" ? 0 : 1,
          radius: 999,
        }}
      >
        <View
          ref={fillScale.ref}
          style={{
            width: -1,
            height: trackH(),
            originX: -0.5,
            bgColor: barColor(),
            radius: 999,
            hitPass: 1,
          }}
        />
      </View>
    </View>
  );
}

/**
 * iOS 26 `UIStepper` (`Stepper visual element` parity):
 * Split capsule pill with independent left/right press highlight, divider pill fade,
 * hold-to-accelerate `autorepeat`, and `wraps` cycling!
 */
export function LiquidGlassStepper(props: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  wraps?: boolean;
  autorepeat?: boolean;
  showValuePill?: boolean;
  label?: string;
  detail?: string;
  onChange: (value: number) => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const routeActive = useRouteActive();

  const [pressedSide, setPressedSide] = createSignal<"left" | "right" | null>(null);
  let pillNode: NodeMirror | undefined;
  let repeatTimer: ReturnType<typeof setTimeout> | undefined;
  let repeatStepCount = 0;

  const stopRepeat = (): void => {
    if (repeatTimer !== undefined) {
      clearTimeout(repeatTimer);
      repeatTimer = undefined;
    }
    repeatStepCount = 0;
    setPressedSide(null);
  };
  onCleanup(stopRepeat);

  const stepVal = () => props.step ?? 1;
  const lo = () => props.min ?? Number.NEGATIVE_INFINITY;
  const hi = () => props.max ?? Number.POSITIVE_INFINITY;

  const canDecrement = () => props.wraps === true || props.value > lo();
  const canIncrement = () => props.wraps === true || props.value < hi();

  const applyDelta = (dir: -1 | 1): void => {
    const raw = Number((props.value + dir * stepVal()).toFixed(4));
    if (props.wraps && Number.isFinite(lo()) && Number.isFinite(hi())) {
      if (raw > hi()) {
        props.onChange(lo());
        return;
      }
      if (raw < lo()) {
        props.onChange(hi());
        return;
      }
    }
    const clamped = Math.max(lo(), Math.min(hi(), raw));
    if (clamped !== props.value) props.onChange(clamped);
  };

  const scheduleAutorepeat = (dir: -1 | 1): void => {
    if (props.autorepeat === false) return;
    repeatStepCount += 1;
    const delay = repeatStepCount === 1 ? 380 : repeatStepCount < 6 ? 130 : 65;
    repeatTimer = setTimeout(() => {
      applyDelta(dir);
      scheduleAutorepeat(dir);
    }, delay);
  };

  createGesture({
    axis: "any",
    panSlop: 8,
    region: {
      node: () => (routeActive() ? pillNode : undefined),
    },
    onDown: (c) => {
      const pt = resolveNodeLocalPoint(pillNode, c.x, c.y, null, 0);
      if (!pt) return;
      const side = pt.x < pt.width * 0.5 ? "left" : "right";
      if ((side === "left" && !canDecrement()) || (side === "right" && !canIncrement())) return;
      setPressedSide(side);
      if (props.autorepeat !== false) {
        clearTimeout(repeatTimer);
        repeatStepCount = 0;
        scheduleAutorepeat(side === "left" ? -1 : 1);
      }
    },
    onUp: () => stopRepeat(),
    onPanEnd: () => stopRepeat(),
    onCancel: () => stopRepeat(),
  });

  const pillScale = createGlassSpring(() => (pressedSide() ? 0.96 : 1), {
    preset: "tactile",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.005,
  });

  return (
    <View class="flex-row items-center justify-between gap-3 w-full" style={{ minW: 0 }}>
      <Show when={Boolean(props.label) || Boolean(props.detail)}>
        <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
          <Show when={Boolean(props.label)}>
            <MobileParagraph
              text={props.label!}
              class="text-sm font-bold"
              style={{ textColor: ctx.palette().ink }}
            />
          </Show>
          <Show when={Boolean(props.detail)}>
            <MobileParagraph
              text={props.detail!}
              class="text-xs"
              style={{ textColor: ctx.palette().inkSecondary }}
            />
          </Show>
        </View>
      </Show>

      <View
        ref={(node) => {
          pillNode = node;
        }}
        class="flex-row items-center shrink-0 overflow-hidden"
        style={{
          bgColor: ctx.palette().surfaceRaised,
          borderColor: ctx.palette().rimHighlight,
          borderWidth: 1,
          radius: 999,
          overflow: 1,
          scale: quantizeOptical(pillScale(), 0.005, 1),
        }}
      >
        <Focusable
          focusable={canDecrement()}
          onPress={canDecrement() ? () => applyDelta(-1) : undefined}
          class="w-[46] h-[34] items-center justify-center"
          style={{
            width: 46,
            height: 34,
            bgColor:
              pressedSide() === "left"
                ? ctx.palette().accentSubtle
                : "#00000000",
            opacity: canDecrement() ? 1 : 0.35,
          }}
        >
          <Text
            class="text-base font-bold"
            style={{ textColor: ctx.palette().ink, hitPass: 1 }}
          >
            −
          </Text>
        </Focusable>

        {/* Stepper divider pill */}
        <View
          class="w-[1] h-[18]"
          style={{
            width: 1,
            height: 18,
            bgColor: ctx.palette().contourOuter,
            opacity: pressedSide() ? 0.15 : 1,
          }}
        />

        <Show when={props.showValuePill !== false}>
          <View class="px-2.5 h-[34] items-center justify-center">
            <Text
              class="text-xs font-mono font-bold"
              style={{ textColor: ctx.palette().ink }}
            >
              {String(props.value)}
            </Text>
          </View>
          <View
            class="w-[1] h-[18]"
            style={{
              width: 1,
              height: 18,
              bgColor: ctx.palette().contourOuter,
              opacity: pressedSide() ? 0.15 : 1,
            }}
          />
        </Show>

        <Focusable
          focusable={canIncrement()}
          onPress={canIncrement() ? () => applyDelta(1) : undefined}
          class="w-[46] h-[34] items-center justify-center"
          style={{
            width: 46,
            height: 34,
            bgColor:
              pressedSide() === "right"
                ? ctx.palette().accentSubtle
                : "#00000000",
            opacity: canIncrement() ? 1 : 0.35,
          }}
        >
          <Text
            class="text-base font-bold"
            style={{ textColor: ctx.palette().accentHex, hitPass: 1 }}
          >
            +
          </Text>
        </Focusable>
      </View>
    </View>
  );
}

/**
 * iOS 26 `UIPageControl` (`PageControlPlatterView` parity):
 * Capsule Liquid Glass pill containing interactive page indicator dots.
 * Supports tapping left/right sides of the pill to step pages, holding & scrubbing
 * across dots with live pill bloom (`1.08x`), and windowed dot scaling for `count > 7`!
 */
export function LiquidGlassPageControl(props: {
  count: number;
  current: number;
  prominentPlatter?: boolean;
  onChange: (index: number) => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const routeActive = useRouteActive();
  const scrollPage = useContext(ScrollablePageContext);

  let platterNode: NodeMirror | undefined;
  const [scrubbing, setScrubbing] = createSignal(false);

  const total = () => Math.max(1, props.count);
  const maxVisibleDots = 7;

  const visibleRange = createMemo(() => {
    const n = total();
    if (n <= maxVisibleDots) {
      return Array.from({ length: n }, (_, i) => ({ page: i, edgeScale: 1 }));
    }
    const half = Math.floor(maxVisibleDots / 2);
    let start = Math.max(0, Math.min(n - maxVisibleDots, props.current - half));
    return Array.from({ length: maxVisibleDots }, (_, slot) => {
      const page = start + slot;
      const atStartEdge = slot === 0 && start > 0;
      const atEndEdge = slot === maxVisibleDots - 1 && start + maxVisibleDots < n;
      const nearStart = slot === 1 && start > 0;
      const nearEnd = slot === maxVisibleDots - 2 && start + maxVisibleDots < n;
      const edgeScale = atStartEdge || atEndEdge ? 0.56 : nearStart || nearEnd ? 0.78 : 1;
      return { page, edgeScale };
    });
  });

  const platterScale = createGlassSpring(() => (scrubbing() ? 1.1 : 1), {
    preset: "tactile",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.005,
  });

  const scrubAt = (vx: number, vy: number): void => {
    const pt = resolveNodeLocalPoint(platterNode, vx, vy, scrollPage, 8);
    if (!pt || pt.width <= 8) return;
    const ratio = Math.max(0, Math.min(0.9999, (pt.x - 8) / Math.max(1, pt.width - 16)));
    const next = Math.max(0, Math.min(total() - 1, Math.floor(ratio * total())));
    if (next !== props.current) props.onChange(next);
  };

  createGesture({
    axis: "x",
    panSlop: 3,
    region: {
      node: () => (routeActive() ? platterNode : undefined),
    },
    onPanStart: (c) => {
      setScrubbing(true);
      scrubAt(c.x, c.y);
    },
    onPanMove: (c) => {
      if (scrubbing()) scrubAt(c.x, c.y);
    },
    onTap: (c) => {
      const pt = resolveNodeLocalPoint(platterNode, c.x, c.y, scrollPage, 0);
      if (!pt) return;
      const next =
        pt.x < pt.width * 0.5
          ? Math.max(0, props.current - 1)
          : Math.min(total() - 1, props.current + 1);
      if (next !== props.current) props.onChange(next);
      setScrubbing(false);
    },
    onPanEnd: () => setScrubbing(false),
    onUp: () => setScrubbing(false),
    onCancel: () => setScrubbing(false),
  });

  const innerDots = (
    <View
      ref={(node) => {
        platterNode = node;
      }}
      class="flex-row items-center justify-center gap-2 px-3.5 h-[28]"
      style={{
        height: 28,
        bgColor:
          props.prominentPlatter !== false
            ? scrubbing()
              ? "#00000000"
              : ctx.palette().surfaceRaised
            : "#00000000",
        borderColor:
          props.prominentPlatter !== false ? ctx.palette().rimHighlight : "#00000000",
        borderWidth: props.prominentPlatter !== false ? 1 : 0,
        radius: 999,
        scale: quantizeOptical(platterScale(), 0.005, 1),
      }}
    >
      <For each={visibleRange()}>
        {(entry) => {
          const active = () => entry.page === props.current;
          const size = () => Math.max(4, Math.round(7.5 * entry.edgeScale));
          return (
            <View
              style={{
                width: active() ? Math.max(7, size() + 1) : size(),
                height: active() ? Math.max(7, size() + 1) : size(),
                bgColor: active() ? ctx.palette().ink : ctx.palette().inkMuted,
                opacity: active() ? 1 : 0.42 * entry.edgeScale + 0.15,
                radius: 999,
                hitPass: 1,
              }}
            />
          );
        }}
      </For>
    </View>
  );

  return (
    <View class="items-center justify-center">
      <Show when={scrubbing() && props.prominentPlatter !== false} fallback={innerDots}>
        <LiquidGlassSurface
          material="clear"
          priority="high"
          shape="pill"
          radius={999}
          magnification={1.12}
          class="items-center justify-center"
          contentClass="p-0"
        >
          {innerDots}
        </LiquidGlassSurface>
      </Show>
    </View>
  );
}

/** Classic 12-spoke iOS `UIActivityIndicatorView` driven on active guest frames. */
export function LiquidGlassActivityIndicator(props: {
  animating?: boolean;
  size?: "medium" | "large";
  hidesWhenStopped?: boolean;
  color?: string;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const routeActive = useRouteActive();
  const [step, setStep] = createSignal(0);

  const isAnimating = () => props.animating !== false;
  const visible = () => isAnimating() || !props.hidesWhenStopped;

  let accumMs = 0;
  let prevNow = 0;
  try {
    onFrame(
      () => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const dt = prevNow > 0 ? Math.min(50, Math.max(8, now - prevNow)) : 16.67;
        prevNow = now;
        accumMs += dt;
        if (accumMs >= 72) {
          accumMs = 0;
          setStep((s) => (s + 1) % 8);
        }
      },
      {
        active: () => routeActive() && isAnimating(),
        continuous: () => routeActive() && isAnimating(),
      },
    );
  } catch {}

  const boxPx = () => (props.size === "large" ? 36 : 22);
  const dotSize = () => (props.size === "large" ? 5 : 3.5);
  const orbit = () => (props.size === "large" ? 12 : 7.5);
  const spokeAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <Show when={visible()}>
      <View
        class="relative items-center justify-center shrink-0"
        style={{
          posType: 0,
          width: boxPx(),
          height: boxPx(),
        }}
      >
        <For each={spokeAngles}>
          {(deg, idx) => {
            const rad = (deg * Math.PI) / 180;
            const cx = boxPx() * 0.5 + Math.cos(rad) * orbit() - dotSize() * 0.5;
            const cy = boxPx() * 0.5 + Math.sin(rad) * orbit() - dotSize() * 0.5;
            const alpha = () => {
              if (!isAnimating()) return 0.45;
              const age = (step() - idx() + 8) % 8;
              return Math.max(0.18, 1 - age * 0.11);
            };
            return (
              <View
                class="absolute"
                style={{
                  posType: 1,
                  insetL: Math.round(cx * 10) / 10,
                  insetT: Math.round(cy * 10) / 10,
                  width: dotSize(),
                  height: dotSize(),
                  bgColor: props.color ?? ctx.palette().inkSecondary,
                  opacity: alpha(),
                  radius: 999,
                  hitPass: 1,
                }}
              />
            );
          }}
        </For>
      </View>
    </Show>
  );
}
