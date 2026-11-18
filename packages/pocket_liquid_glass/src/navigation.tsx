/**
 * @pocket/liquid_glass — Floating Capsule Navigation, AppBar, Cards, VirtualList & FPS HUD.
 *
 * Implements `uikit.even.how` navigation & structural surfaces with bounded optical passes:
 * - `LiquidGlassAppBar` & `LiquidGlassToolbar`: Shared single-pass `LiquidGlassGroup` capsule
 *   header so leading/trailing actions never create duplicate GPU backdrop passes.
 * - `LiquidGlassNavigationBar`: Floating capsule tab bar (`priority="critical"`) with continuous
 *   finger-tracking refractive lens, contact magnification (`1.0 -> 1.22`), and jelly rebound.
 * - `LiquidGlassCard` & `LiquidGlassListTile`: Raised/Hero cards opt into prioritized GPU
 *   refraction while dense content cards and list rows use Zero-Pass Specular Vector Glass
 *   (`chrome`) to avoid additional backdrop passes.
 * - `LiquidGlassVirtualList` & `LiquidGlassFpsHud`: Built on `@pocket/ui/fast` (`PocketVirtualList`
 *   + `createFastText` zero-VDOM HUD updates).
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  useContext,
  type JSX,
} from "solid-js";
import { createGesture } from "@pocketjs/framework/gesture";
import { Focusable, Text, View, type NodeMirror, type ViewProps } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/solid/lifecycle";
import {
  MobileParagraph,
  NavigationBar,
  SafeAreaScaffoldContext,
  ScrollablePageContext,
  useAccessibilityPreferences,
  useRouteActive,
  type DisplayGeometry,
  type NavigationItem,
} from "@pocket/ui";
import {
  PocketVirtualList,
  createFastText,
  type PocketVirtualListProps,
} from "@pocket/ui/fast";
import { createGlassSpring, quantizeOptical } from "./motion.ts";
import {
  LiquidGlassGroup,
  LiquidGlassSurface,
  useLiquidGlass,
} from "./surfaces.tsx";
import {
  concentricGlassRadius,
  hexToArgb,
  type LiquidGlassMaterial,
} from "./tokens.ts";
import {
  LiquidGlassBadge,
  LiquidGlassButton,
  type LiquidGlassTone,
} from "./controls.tsx";

/**
 * Shared-material Liquid Glass floating AppBar / Toolbar (`priority="high"`).
 */
export function LiquidGlassAppBar(props: {
  title: string;
  subtitle?: string;
  centered?: boolean;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  actions?: () => JSX.Element;
}): JSX.Element {
  const ctx = useLiquidGlass();
  return (
    <LiquidGlassGroup
      material="clear"
      priority="high"
      shape="rounded"
      radius={ctx.palette().radiusPanel}
      class="relative flex-col w-full"
      contentClass="relative flex-row items-center justify-between gap-3 w-full px-4 py-3"
    >
      <View class="flex-row items-center gap-2.5 flex-1" style={{ minW: 0 }}>
        {props.leading}
        <View
          class={
            props.centered
              ? "flex-col items-center gap-0.5 flex-1"
              : "flex-col gap-0.5 flex-1"
          }
          style={{ minW: 0 }}
        >
          <MobileParagraph
            text={props.title}
            class={
              props.centered
                ? "text-base font-bold text-center"
                : "text-base font-bold"
            }
            style={{ textColor: ctx.palette().ink }}
          />
          <Show when={Boolean(props.subtitle)}>
            <MobileParagraph
              text={props.subtitle!}
              class={props.centered ? "text-xs text-center" : "text-xs"}
              style={{ textColor: ctx.palette().inkSecondary }}
            />
          </Show>
        </View>
      </View>
      <Show when={Boolean(props.actions || props.trailing)}>
        <View class="flex-row items-center gap-1.5 shrink-0">
          {props.actions ? props.actions() : props.trailing}
        </View>
      </Show>
    </LiquidGlassGroup>
  );
}

export const LiquidGlassToolbar = LiquidGlassAppBar;

/**
 * Floating capsule Liquid Glass NavigationBar (`priority="critical"`):
 * Combines a clear glass outer rail with a finger-draggable magnifying selection lens.
 */
export function LiquidGlassNavigationBar<T extends string = string>(props: {
  route: T;
  items: readonly NavigationItem[];
  onNavigate: (route: T) => void;
  visible?: boolean;
  geometry?: () => DisplayGeometry;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const accessibility = useAccessibilityPreferences();
  const routeActive = useRouteActive();
  const scrollPage = useContext(ScrollablePageContext);
  const scaffold = useContext(SafeAreaScaffoldContext);

  let trackNode: NodeMirror | undefined;
  let trackLeft = 0;
  let startCenter = 0;
  let activeContactId: number | undefined;

  const [trackWidth, setTrackWidth] = createSignal(336);
  const [dragX, setDragX] = createSignal<number | undefined>(undefined);
  const [pullY, setPullY] = createSignal(0);
  const [lifting, setLifting] = createSignal(false);

  const measureTrack = (): void => {
    if (!trackNode) return;
    const getLayout = (
      globalThis as typeof globalThis & {
        pocket?: { getLayout?: (id: number) => unknown };
      }
    ).pocket?.getLayout;
    const rect =
      typeof getLayout === "function"
        ? (getLayout(trackNode.id) as { x?: number; width?: number; w?: number } | undefined)
        : undefined;
    const w = rect?.width ?? rect?.w;
    if (rect && typeof rect.x === "number" && typeof w === "number" && w > 16) {
      const visual =
        scrollPage?.visualRect?.(trackNode, {
          x: rect.x,
          y: 0,
          width: w,
          height: 58,
        }) ?? rect;
      trackLeft = visual.x ?? rect.x;
      if (Math.abs(w - trackWidth()) >= 1) setTrackWidth(w);
    }
  };

  try {
    onFrame(measureTrack, { active: routeActive, continuous: false });
  } catch {}

  const count = () => Math.max(1, props.items.length);
  const segmentWidth = () => Math.max(40, (trackWidth() - 16) / count());
  const selectedIndex = () =>
    Math.max(
      0,
      props.items.findIndex((item) => item.id === props.route),
    );
  const targetX = () => dragX() ?? selectedIndex() * segmentWidth();

  const lensX = createGlassSpring(targetX, {
    preset: "fluid",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.25,
  });
  const lift = createGlassSpring(
    () => (lifting() && !ctx.reducedMotion() ? 1 : 0),
    {
      preset: "tactile",
      reducedMotion: ctx.reducedMotion,
      quantizeStep: 0.01,
    },
  );
  const jellyY = createGlassSpring(pullY, {
    preset: "jelly",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.05,
  });

  const previewIndex = () =>
    dragX() === undefined
      ? selectedIndex()
      : Math.max(0, Math.min(count() - 1, Math.round(targetX() / segmentWidth())));

  const stopContact = (): void => {
    activeContactId = undefined;
    setDragX(undefined);
    setPullY(0);
    setLifting(false);
  };

  const navGesture = createGesture({
    axis: "any",
    panSlop: 3,
    region: {
      node: () =>
        routeActive() && props.visible !== false ? trackNode : undefined,
    },
    onDown: (c) => {
      if (activeContactId !== undefined) return;
      measureTrack();
      activeContactId = c.id;
      startCenter = lensX();
      setLifting(true);
    },
    onPanStart: (c) => {
      if (c.id !== activeContactId) return;
      const limit = (count() - 1) * segmentWidth();
      startCenter = Math.max(
        0,
        Math.min(limit, c.startX - trackLeft - 8 - segmentWidth() / 2),
      );
      setDragX(startCenter);
    },
    onPanMove: (c) => {
      if (c.id !== activeContactId) return;
      const limit = (count() - 1) * segmentWidth();
      const raw = startCenter + c.dx;
      const bounded = Math.max(0, Math.min(limit, raw));
      setDragX(bounded + Math.tanh((raw - bounded) / 36) * 8);
      setPullY(ctx.reducedMotion() ? 0 : Math.tanh(c.dy / 44) * 10);
    },
    onUp: (c) => {
      if (c.id === activeContactId && dragX() === undefined) stopContact();
    },
    onPanEnd: (c) => {
      if (c.id !== activeContactId) return;
      const item = props.items[previewIndex()];
      if (item) props.onNavigate(item.id as T);
      stopContact();
    },
    onCancel: (c) => {
      if (c.id === activeContactId) stopContact();
    },
  });

  createEffect(() => {
    if (!routeActive() || props.visible === false) {
      navGesture.cancel();
      stopContact();
    }
  });

  const useVectorFallback = () =>
    ctx.palette().mode === "amber-night" ||
    accessibility().reduceTransparency ||
    accessibility().increaseContrast;

  const barGeometry = () => (props.geometry ? props.geometry() : scaffold.geometry());

  return (
    <NavigationBar
      route={props.items[previewIndex()]?.id ?? props.route}
      onNavigate={() => undefined}
      onItemPress={(id) => props.onNavigate(id as T)}
      items={props.items}
      visible={props.visible ?? true}
      dark={ctx.palette().dark}
      accentColor={hexToArgb(ctx.palette().accentHex)}
      geometry={barGeometry}
      trackNodeRef={(node) => {
        trackNode = node;
      }}
      floating
      selectionIndicator={useVectorFallback()}
      selectionOverlay={() =>
        useVectorFallback() ? null : (
          <LiquidGlassSurface
            material="clear"
            priority="critical"
            shape="pill"
            radius={999}
            elevated={false}
            magnification={() => quantizeOptical(1 + lift() * 0.2, 0.01, 1)}
            deformation={{
              anchorX:
                Math.sign(targetX() - lensX()) *
                Math.min(26, segmentWidth() * 0.26),
              anchorY: Math.sign(jellyY()) * 10,
              offsetX: quantizeOptical((targetX() - lensX()) * 0.1 * lift(), 0.05, 0),
              offsetY: quantizeOptical(jellyY(), 0.05, 0),
              radius: 54,
            }}
            class="absolute"
            contentClass="p-0"
            style={{
              posType: 1,
              insetL: 12 + lensX(),
              insetT: 4,
              width: Math.max(0, segmentWidth() - 8),
              height: 50,
              hitPass: 1,
            }}
          />
        )
      }
      background={
        <LiquidGlassSurface
          material="clear"
          priority="critical"
          shape="pill"
          radius={999}
          class="absolute inset-0"
          contentClass="p-0"
          style={{ radius: 999, hitPass: 1 }}
        />
      }
    />
  );
}

export type LiquidGlassCardVariant =
  | "default"
  | "raised"
  | "muted"
  | "accent"
  | "sticky";

/**
 * Liquid Glass Card:
 * - `"raised"` / `"accent"` (or explicit `refractive={true}`) acquires a prioritized GPU
 *   `regular` glass surface.
 * - `"default"` / `"muted"` / `"sticky"` defaults to Zero-Pass Specular Vector Glass (`chrome`)
 *   so scrolling feeds avoid stacking per-card GPU passes.
 */
export function LiquidGlassCard(props: {
  title?: string;
  detail?: string;
  variant?: LiquidGlassCardVariant;
  refractive?: boolean;
  badge?: string;
  trailing?: JSX.Element;
  onPress?: () => void;
  class?: string;
  style?: ViewProps["style"];
  children?: JSX.Element;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const material = (): LiquidGlassMaterial => {
    if (props.refractive === true) return "regular";
    if (props.refractive === false) return "chrome";
    if (props.variant === "raised" || props.variant === "accent") return "regular";
    return "chrome";
  };

  const inner = (
    <LiquidGlassSurface
      material={material()}
      priority={props.variant === "raised" || props.variant === "accent" ? "normal" : "low"}
      shape="rounded"
      radius={ctx.palette().radiusSurface}
      accentTint={props.variant === "accent" || props.variant === "sticky"}
      class="relative flex-col w-full"
      contentClass={props.class ?? "relative flex-col gap-2.5 p-4 w-full"}
      style={{ minW: 0, ...props.style }}
    >
      <Show
        when={
          Boolean(props.title) ||
          Boolean(props.detail) ||
          Boolean(props.badge) ||
          Boolean(props.trailing)
        }
      >
        <View class="flex-row items-start justify-between gap-2 w-full">
          <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
            <Show when={Boolean(props.title)}>
              <MobileParagraph
                text={props.title!}
                class="text-base font-bold"
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
          <Show when={Boolean(props.badge) || Boolean(props.trailing)}>
            <View class="flex-row items-center gap-1.5 shrink-0">
              <Show when={Boolean(props.badge)}>
                <LiquidGlassBadge
                  label={props.badge!}
                  tone={props.variant === "sticky" ? "warning" : "accent"}
                />
              </Show>
              {props.trailing}
            </View>
          </Show>
        </View>
      </Show>
      {props.children}
    </LiquidGlassSurface>
  );

  return props.onPress ? (
    <Focusable class="w-full" onPress={props.onPress}>
      {inner}
    </Focusable>
  ) : (
    inner
  );
}

/** Concentric specular Liquid Glass list row (no optical GPU passes in dense lists). */
export function LiquidGlassListTile(props: {
  title: string;
  detail?: string;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  selected?: boolean;
  onPress?: () => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const row = (
    <View
      class="flex-row items-center justify-between gap-3 w-full px-3.5 py-3"
      style={{
        minW: 0,
        bgColor: props.selected ? ctx.palette().accentSubtle : ctx.palette().surface,
        borderColor: props.selected
          ? ctx.palette().accentHex
          : ctx.palette().contourOuter,
        borderWidth: 1,
        radius: concentricGlassRadius(ctx.palette().radiusSurface, 6, 12),
      }}
    >
      <View class="flex-row items-center gap-2.5 flex-1" style={{ minW: 0 }}>
        {props.leading}
        <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
          <MobileParagraph
            text={props.title}
            class="text-sm font-bold"
            style={{ textColor: ctx.palette().ink }}
          />
          <Show when={Boolean(props.detail)}>
            <MobileParagraph
              text={props.detail!}
              class="text-xs"
              style={{ textColor: ctx.palette().inkSecondary }}
            />
          </Show>
        </View>
      </View>
      <Show when={Boolean(props.trailing)}>
        <View class="flex-row items-center shrink-0">{props.trailing}</View>
      </Show>
    </View>
  );

  return props.onPress ? (
    <Focusable class="w-full" onPress={props.onPress}>
      {row}
    </Focusable>
  ) : (
    row
  );
}

/** Specular Liquid Glass KPI Metric Card. */
export function LiquidGlassMetric(props: {
  label: string;
  value: string;
  detail?: string;
  tone?: LiquidGlassTone;
  refractive?: boolean;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const valueColor = () => {
    const p = ctx.palette();
    if (props.tone === "danger") return p.danger.fg;
    if (props.tone === "success") return p.success.fg;
    if (props.tone === "warning") return p.warning.fg;
    if (props.tone === "accent") return p.accentHex;
    return p.ink;
  };

  return (
    <View class="flex-1" style={{ minW: 0 }}>
      <LiquidGlassSurface
        material={props.refractive ? "regular" : "chrome"}
        priority="low"
        radius={ctx.palette().radiusSurface}
        accentTint={props.tone === "accent"}
        class="relative flex-col w-full"
        contentClass="relative flex-col gap-1 p-3.5 w-full"
      >
        <MobileParagraph
          text={props.label}
          class="text-xs"
          style={{ textColor: ctx.palette().inkMuted }}
        />
        <Text class="text-2xl font-bold" style={{ textColor: valueColor() }}>
          {props.value}
        </Text>
        <Show when={Boolean(props.detail)}>
          <MobileParagraph
            text={props.detail!}
            class="text-2xs"
            style={{ textColor: ctx.palette().inkSecondary }}
          />
        </Show>
      </LiquidGlassSurface>
    </View>
  );
}

/** Specular Liquid Glass Empty State panel. */
export function LiquidGlassEmpty(props: {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  return (
    <LiquidGlassSurface
      material="chrome"
      priority="low"
      radius={ctx.palette().radiusSurface}
      class="relative flex-col w-full"
      contentClass="relative flex-col items-center justify-center gap-2.5 p-5 w-full"
    >
      <View
        class="w-[34] h-[34] items-center justify-center"
        style={{
          width: 34,
          height: 34,
          bgColor: ctx.palette().accentSubtle,
          borderColor: ctx.palette().rimHighlight,
          borderWidth: 1,
          radius: 999,
        }}
      >
        <Text class="text-sm font-bold" style={{ textColor: ctx.palette().accentHex }}>
          ✦
        </Text>
      </View>
      <MobileParagraph
        text={props.title}
        class="text-sm font-bold text-center"
        style={{ textColor: ctx.palette().ink }}
      />
      <Show when={Boolean(props.detail)}>
        <MobileParagraph
          text={props.detail!}
          class="text-xs text-center"
          style={{ textColor: ctx.palette().inkSecondary }}
        />
      </Show>
      <Show when={Boolean(props.actionLabel) && Boolean(props.onAction)}>
        <LiquidGlassButton
          label={props.actionLabel!}
          variant="glass"
          compact
          onPress={props.onAction}
        />
      </Show>
    </LiquidGlassSurface>
  );
}

/** Expandable Liquid Glass Accordion item. */
export function LiquidGlassAccordion(props: {
  title: string;
  detail?: string;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const ctx = useLiquidGlass();
  return (
    <LiquidGlassSurface
      material="chrome"
      priority="low"
      radius={ctx.palette().radiusSurface}
      class="relative flex-col w-full"
      contentClass="relative flex-col gap-2.5 p-3.5 w-full"
    >
      <Focusable
        onPress={props.onToggle}
        class="flex-row items-center justify-between gap-2 w-full"
      >
        <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
          <MobileParagraph
            text={props.title}
            class="text-sm font-bold"
            style={{ textColor: ctx.palette().ink }}
          />
          <Show when={Boolean(props.detail)}>
            <MobileParagraph
              text={props.detail!}
              class="text-xs"
              style={{ textColor: ctx.palette().inkSecondary }}
            />
          </Show>
        </View>
        <Show when={Boolean(props.badge)}>
          <LiquidGlassBadge label={props.badge!} tone="neutral" />
        </Show>
        <Text
          class="text-xs font-mono font-bold shrink-0"
          style={{ textColor: ctx.palette().accentHex }}
        >
          {props.expanded ? "−" : "+"}
        </Text>
      </Focusable>
      <Show when={props.expanded}>{props.children}</Show>
    </LiquidGlassSurface>
  );
}

/**
 * Virtualized list inside a concentric Liquid Glass shell
 * (powered by `@pocket/ui/fast` `PocketVirtualList`).
 */
export function LiquidGlassVirtualList(props: PocketVirtualListProps): JSX.Element {
  const ctx = useLiquidGlass();
  const innerHeight = () => Math.max(0, props.height - 2);
  return (
    <View
      class={props.class ?? "w-full overflow-hidden"}
      style={{
        height: props.height,
        overflow: 1,
        bgColor: ctx.palette().surface,
        borderColor: ctx.palette().contourOuter,
        borderWidth: 1,
        radius: ctx.palette().radiusSurface,
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

/**
 * Zero-VDOM Live FPS & GPU Surface Budget Telemetry Pill (`createFastText`).
 * Reads caller-supplied frame samples when `active` is true and writes HUD strings
 * directly to `#text` leaf mirrors without triggering Solid component diffs.
 */
export function LiquidGlassFpsHud(props: {
  active?: () => boolean;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const routeActive = useRouteActive();
  const fpsSlot = createFastText("No frame samples");
  const gpuSlot = createFastText(
    `GPU ${ctx.governor.activeGpuCount()}/${ctx.governor.budget()} · ${ctx.governor.tier().toUpperCase()}`,
  );

  const isRunning = () =>
    routeActive() && (props.active ? props.active() : false);

  let tickCounter = 0;
  try {
    onFrame(
      () => {
        tickCounter = (tickCounter + 1) | 0;
        // The HUD observes caller-supplied work samples. Timing this callback
        // would measure the HUD itself rather than the guest frame or GPU.
        if ((tickCounter & 7) === 0) {
          const snap = ctx.governor.profiler.snapshot();
          fpsSlot.write(
            snap.sampleCount > 0
              ? `${Math.round(snap.fps)} FPS · p95 ${snap.p95WorkMs.toFixed(1)}ms`
              : "No frame samples",
          );
          gpuSlot.write(
            `GPU ${ctx.governor.activeGpuCount()}/${ctx.governor.budget()} · ${ctx.governor.tier().toUpperCase()}`,
          );
        }
      },
      { active: isRunning, continuous: isRunning },
    );
  } catch {}

  createEffect(() => {
    gpuSlot.write(
      `GPU ${ctx.governor.activeGpuCount()}/${ctx.governor.budget()} · ${ctx.governor.tier().toUpperCase()}`,
    );
  });

  return (
    <View
      class="flex-row items-center justify-between gap-2.5 px-3 py-1.5"
      style={{
        bgColor: ctx.palette().surfaceRaised,
        borderColor: ctx.palette().rimHighlight,
        borderWidth: 1,
        radius: 999,
      }}
    >
      <View class="flex-row items-center gap-1.5">
        <View
          class="w-[7] h-[7]"
          style={{
            width: 7,
            height: 7,
            bgColor: ctx.palette().success.solid,
            radius: 999,
          }}
        />
        <Text
          ref={fpsSlot.ref}
          class="text-xs font-mono font-bold"
          style={{ textColor: ctx.palette().ink }}
        >
          No frame samples
        </Text>
      </View>
      <Text
        ref={gpuSlot.ref}
        class="text-2xs font-bold"
        style={{ textColor: ctx.palette().accentHex }}
      >
        {`GPU ${ctx.governor.activeGpuCount()}/${ctx.governor.budget()} · ${ctx.governor.tier().toUpperCase()}`}
      </Text>
    </View>
  );
}
