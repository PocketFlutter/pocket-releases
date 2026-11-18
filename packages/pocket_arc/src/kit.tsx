/**
 * @pocket/arc — Complete Calm-Motion Components & Pluggable `UiSkinAdapter`.
 *
 * Implements the full `@pocket/ui/skins` contract (`arcSkinAdapter`) plus
 * standalone `Arc*` components (`ArcAppBar`, `ArcNavigationBar`, `ArcListTile`,
 * `ArcCheckbox`, `ArcRadioGroup`, `ArcInput`, `ArcStepper`, `ArcAlert`,
 * `ArcMetric`, `ArcEmpty`, `ArcAccordion`) built on Arc's 3-tier surfaces,
 * concentric corner radii (`22px -> 16px -> 10px`), 1px hairline structural
 * borders, and calm physical springs.
 */

import { For, Show, type JSX } from "solid-js";
import { Focusable, Text, View } from "@pocketjs/framework/solid/components";
import {
  InputField,
  MobileParagraph,
  NavigationBar,
  registerUiSkin,
  type DisplayGeometry,
  type NavigationItem,
  type UiSkinAccent,
  type UiSkinAdapter,
  type UiSkinThemeMode,
  type UiSkinTokens,
} from "@pocket/ui";
import { createArcSpring } from "./motion.ts";
import {
  ArcThemeProvider,
  concentricInnerRadius,
  resolveArcPalette,
  useArcTheme,
  type ArcAccent,
  type ArcDensity,
  type ArcThemeMode,
} from "./tokens.ts";
import {
  ArcActionButton,
  ArcBackdrop,
  ArcBadge,
  ArcProgressMeter,
  ArcSegmentedControl,
  ArcSurface,
  ArcSwitchPill,
} from "./skins.tsx";
import { ArcBottomSheet, ArcDialog, ArcToast } from "./overlays.tsx";

function toArcMode(mode: UiSkinThemeMode): ArcThemeMode {
  if (mode === "amber-night") return "amber-night";
  if (mode === "dark") return "dark";
  return "light";
}

function toArcAccent(accent: UiSkinAccent): ArcAccent {
  if (accent === "teal") return "green";
  if (
    accent === "neutral" ||
    accent === "violet" ||
    accent === "blue" ||
    accent === "green" ||
    accent === "amber" ||
    accent === "orange" ||
    accent === "coral" ||
    accent === "rose"
  ) {
    return accent;
  }
  return "coral";
}

function toArcDensity(density: "touch" | "desktop" | "auto"): ArcDensity {
  return density === "desktop" ? "compact" : "comfortable";
}

function parseHexArgb(hex: string): number {
  const cleaned = hex.replace("#", "").slice(0, 6);
  const rgb = Number.parseInt(cleaned, 16);
  return Number.isFinite(rgb) ? ((0xff000000 | rgb) >>> 0) : 0xff2563eb;
}

export function resolveArcSkinTokens(
  mode: UiSkinThemeMode = "light",
  accent: UiSkinAccent = "coral",
): UiSkinTokens {
  const pal = resolveArcPalette(toArcMode(mode), toArcAccent(accent));
  return {
    id: "arc",
    label: "Arc",
    mode: pal.mode,
    dark: pal.mode !== "light",
    accent,
    canvasBg: pal.background,
    surfaceBg: pal.surface,
    surfaceRaisedBg: pal.surfaceRaised,
    surfaceMutedBg: pal.surfaceMuted,
    ink: pal.foreground,
    inkSecondary: pal.textSecondary,
    inkMuted: pal.textMuted,
    border: pal.border,
    borderStrong: pal.borderStrong,
    accentBg: pal.accent,
    accentFg: pal.accentForeground,
    accentSubtleBg: pal.accentSubtle,
    successBg: pal.success.solid,
    warningBg: pal.warning.solid,
    dangerBg: pal.danger.solid,
    radiusControl: pal.radiusControl,
    radiusSurface: pal.radiusSurface,
    radiusPanel: pal.radiusPanel,
  };
}

/** Architectural 1px-hairline Arc top navigation header. */
export function ArcAppBar(props: {
  title: string;
  subtitle?: string;
  centered?: boolean;
  leading?: JSX.Element;
  trailing?: JSX.Element;
}): JSX.Element {
  const { palette } = useArcTheme();
  return (
    <View
      class="flex-row items-center justify-between gap-3 w-full px-4 py-3"
      style={{
        bgColor: palette().surfaceRaised,
        borderColor: palette().border,
        borderWidth: 1,
      }}
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
            class={props.centered ? "text-base font-bold text-center" : "text-base font-bold"}
            style={{ textColor: palette().foreground }}
          />
          <Show when={Boolean(props.subtitle)}>
            <MobileParagraph
              text={props.subtitle!}
              class={props.centered ? "text-2xs text-center" : "text-2xs"}
              style={{ textColor: palette().textMuted }}
            />
          </Show>
        </View>
      </View>
      <Show when={Boolean(props.trailing)}>
        <View class="flex-row items-center gap-2 shrink-0">{props.trailing}</View>
      </Show>
    </View>
  );
}

/** Floating concentric `22px` Arc dock navigation bar. */
export function ArcNavigationBar<T extends string = string>(props: {
  route: T;
  items: readonly NavigationItem[];
  onNavigate: (route: T) => void;
  visible?: boolean;
  geometry?: () => DisplayGeometry;
}): JSX.Element {
  const { palette } = useArcTheme();
  return (
    <NavigationBar
      route={props.route}
      items={props.items}
      onNavigate={(id) => props.onNavigate(id as T)}
      visible={props.visible ?? true}
      dark={palette().mode !== "light"}
      accentColor={parseHexArgb(palette().accent)}
      geometry={props.geometry}
      floating
      selectionIndicator
      background={
        <View
          class="absolute inset-0"
          style={{
            posType: 1,
            insetT: 0,
            insetR: 0,
            insetB: 0,
            insetL: 0,
            hitPass: 1,
          }}
        >
          <View
            class="absolute inset-0"
            style={{
              posType: 1,
              insetL: 0,
              insetT: 2,
              insetR: 0,
              insetB: -2,
              bgColor: palette().shadowAmbient,
              radius: palette().radiusPanel,
              hitPass: 1,
            }}
          />
          <View
            class="absolute inset-0"
            style={{
              posType: 1,
              insetT: 0,
              insetR: 0,
              insetB: 0,
              insetL: 0,
              bgColor: palette().surfaceRaised,
              borderColor: palette().borderStrong,
              borderWidth: 1,
              radius: palette().radiusPanel,
              hitPass: 1,
            }}
          />
        </View>
      }
    />
  );
}

/** Concentric hairline Arc list row (`innerRadius = concentricInnerRadius(16, 4)`). */
export function ArcListTile(props: {
  title: string;
  detail?: string;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  onPress?: () => void;
}): JSX.Element {
  const { palette } = useArcTheme();
  const row = (
    <View
      class="flex-row items-center justify-between gap-3 w-full px-3.5 py-2.5"
      style={{
        minW: 0,
        bgColor: palette().surface,
        borderColor: palette().borderSubtle,
        borderWidth: 1,
        radius: concentricInnerRadius(palette().radiusSurface, 4),
      }}
    >
      <View class="flex-row items-center gap-2.5 flex-1" style={{ minW: 0 }}>
        {props.leading}
        <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
          <MobileParagraph
            text={props.title}
            class="text-sm font-bold"
            style={{ textColor: palette().foreground }}
          />
          <Show when={Boolean(props.detail)}>
            <MobileParagraph
              text={props.detail!}
              class="text-xs"
              style={{ textColor: palette().textSecondary }}
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

/** Spring-driven concentric Arc checkbox. */
export function ArcCheckbox(props: {
  checked: boolean;
  label?: string;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}): JSX.Element {
  const ctx = useArcTheme();
  const scale = createArcSpring(() => (props.checked ? 1 : 0.92), {
    preset: "snappy",
    reducedMotion: ctx.reducedMotion,
  });
  return (
    <Focusable
      focusable={!props.disabled}
      onPress={props.disabled ? undefined : () => props.onChange?.(!props.checked)}
      class={
        (props.label?.length ?? 0) > 28
          ? "flex-row items-center gap-2.5 py-1 w-full"
          : "flex-row items-center gap-2.5 py-1"
      }
      style={{ opacity: props.disabled ? 0.5 : 1 }}
    >
      <View
        class="w-[18] h-[18] items-center justify-center shrink-0"
        style={{
          bgColor: props.checked ? ctx.palette().accent : ctx.palette().surface,
          borderColor: props.checked ? ctx.palette().accentStrong : ctx.palette().borderStrong,
          borderWidth: 1,
          radius: 6,
          scale: scale(),
        }}
      >
        <Show when={props.checked}>
          <Text
            class="text-2xs font-bold"
            style={{ textColor: ctx.palette().accentForeground }}
          >
            ✓
          </Text>
        </Show>
      </View>
      <Show when={Boolean(props.label)}>
        <Show
          when={(props.label?.length ?? 0) > 28}
          fallback={
            <Text class="text-sm" style={{ textColor: ctx.palette().foreground }}>
              {props.label}
            </Text>
          }
        >
          <View class="flex-col flex-1" style={{ minW: 0 }}>
            <MobileParagraph
              text={props.label!}
              class="text-sm"
              style={{ textColor: ctx.palette().foreground }}
            />
          </View>
        </Show>
      </Show>
    </Focusable>
  );
}

/** Concentric Arc radio selection list. */
export function ArcRadioGroup(props: {
  items: readonly { id: string; label: string; detail?: string }[];
  value: string;
  direction?: "row" | "col";
  onChange: (id: string) => void;
}): JSX.Element {
  const { palette } = useArcTheme();
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
              class="flex-row items-center gap-2.5 px-3 py-2"
              style={{
                minW: 0,
                bgColor: selected() ? palette().accentSubtle : palette().surface,
                borderColor: selected() ? palette().accent : palette().border,
                borderWidth: 1,
                radius: palette().radiusControl,
              }}
            >
              <View
                class="w-[16] h-[16] items-center justify-center shrink-0"
                style={{
                  borderColor: selected() ? palette().accent : palette().borderStrong,
                  borderWidth: 1.5,
                  radius: 999,
                }}
              >
                <Show when={selected()}>
                  <View
                    class="w-[8] h-[8]"
                    style={{ bgColor: palette().accent, radius: 999 }}
                  />
                </Show>
              </View>
              <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
                <MobileParagraph
                  text={item.label}
                  class="text-xs font-bold"
                  style={{ textColor: palette().foreground }}
                />
                <Show when={Boolean(item.detail)}>
                  <MobileParagraph
                    text={item.detail!}
                    class="text-2xs"
                    style={{ textColor: palette().textMuted }}
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

/** Native IME-backed Arc input field (`radiusControl = 10px`). */
export function ArcInput(props: {
  value: string | (() => string);
  placeholder?: string;
  label?: string;
  hint?: string;
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
}): JSX.Element {
  const { palette } = useArcTheme();
  const accessor = () => (typeof props.value === "function" ? props.value() : props.value);
  return (
    <View class="flex-col gap-1.5 w-full" style={{ minW: 0 }}>
      <Show when={Boolean(props.label) || Boolean(props.hint)}>
        <View class="flex-row items-center justify-between gap-2 w-full">
          <Show when={Boolean(props.label)}>
            <Text class="text-xs font-bold" style={{ textColor: palette().foreground }}>
              {props.label}
            </Text>
          </Show>
          <Show when={Boolean(props.hint)}>
            <Text class="text-2xs" style={{ textColor: palette().textMuted }}>
              {props.hint}
            </Text>
          </Show>
        </View>
      </Show>
      <InputField
        value={accessor}
        placeholder={props.placeholder}
        onInput={props.onInput}
        onSubmit={props.onSubmit}
        appearance={{
          fillColor: palette().surfaceRaised,
          textColor: palette().foreground,
          placeholderColor: palette().textMuted,
          borderColor: palette().borderStrong,
          focusedBorderColor: palette().accent,
          borderRadius: palette().radiusControl,
        }}
      />
    </View>
  );
}

/** Concentric hairline Arc numeric stepper. */
export function ArcStepper(props: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  onChange: (value: number) => void;
}): JSX.Element {
  const { palette } = useArcTheme();
  const step = () => props.step ?? 1;
  const clamp = (next: number): number => {
    const lo = props.min ?? Number.NEGATIVE_INFINITY;
    const hi = props.max ?? Number.POSITIVE_INFINITY;
    return Math.max(lo, Math.min(hi, next));
  };
  return (
    <View class="flex-row items-center justify-between gap-3 w-full" style={{ minW: 0 }}>
      <Show when={Boolean(props.label)}>
        <View class="flex-col flex-1" style={{ minW: 0 }}>
          <MobileParagraph
            text={props.label!}
            class="text-xs font-bold"
            style={{ textColor: palette().foreground }}
          />
        </View>
      </Show>
      <View
        class="flex-row items-center gap-2 p-1 shrink-0"
        style={{
          bgColor: palette().surfaceMuted,
          borderColor: palette().border,
          borderWidth: 1,
          radius: palette().radiusControl,
        }}
      >
        <Focusable
          onPress={() => props.onChange(clamp(props.value - step()))}
          class="w-[28] h-[28] items-center justify-center"
          style={{
            bgColor: palette().surfaceRaised,
            borderColor: palette().border,
            borderWidth: 1,
            radius: concentricInnerRadius(palette().radiusControl, 3),
          }}
        >
          <Text class="text-sm font-bold" style={{ textColor: palette().foreground }}>
            −
          </Text>
        </Focusable>
        <View class="px-2 items-center justify-center">
          <Text class="text-xs font-mono font-bold" style={{ textColor: palette().foreground }}>
            {String(props.value)}
          </Text>
        </View>
        <Focusable
          onPress={() => props.onChange(clamp(props.value + step()))}
          class="w-[28] h-[28] items-center justify-center"
          style={{
            bgColor: palette().accent,
            borderColor: palette().accentStrong,
            borderWidth: 1,
            radius: concentricInnerRadius(palette().radiusControl, 3),
          }}
        >
          <Text class="text-sm font-bold" style={{ textColor: palette().accentForeground }}>
            +
          </Text>
        </Focusable>
      </View>
    </View>
  );
}

/** Semantic status triplet Arc inline alert banner. */
export function ArcAlert(props: {
  title: string;
  body?: string;
  tone?: "info" | "success" | "warning" | "danger";
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}): JSX.Element {
  const { palette } = useArcTheme();
  const triplet = () => {
    const p = palette();
    if (props.tone === "danger") return p.danger;
    if (props.tone === "warning") return p.warning;
    if (props.tone === "success") return p.success;
    return p.info;
  };
  return (
    <View
      class="flex-col gap-2 p-3.5 w-full"
      style={{
        minW: 0,
        bgColor: triplet().subtle,
        borderColor: triplet().border,
        borderWidth: 1,
        radius: palette().radiusSurface,
      }}
    >
      <View class="flex-row items-start justify-between gap-2 w-full">
        <View class="flex-col gap-1 flex-1" style={{ minW: 0 }}>
          <MobileParagraph
            text={props.title}
            class="text-xs font-bold"
            style={{ textColor: triplet().fg }}
          />
          <Show when={Boolean(props.body)}>
            <MobileParagraph
              text={props.body!}
              class="text-xs"
              style={{ textColor: palette().textSecondary }}
            />
          </Show>
        </View>
        <Show when={Boolean(props.onDismiss)}>
          <Focusable onPress={props.onDismiss} class="px-1.5 py-0.5 shrink-0">
            <Text class="text-xs font-bold" style={{ textColor: triplet().fg }}>
              ✕
            </Text>
          </Focusable>
        </Show>
      </View>
      <Show when={Boolean(props.actionLabel) && Boolean(props.onAction)}>
        <View class="flex-row items-center">
          <ArcActionButton
            label={props.actionLabel!}
            variant={props.tone === "danger" ? "danger" : "outline"}
            isDark={palette().mode !== "light"}
            onPress={props.onAction}
          />
        </View>
      </Show>
    </View>
  );
}

/** Concentric Arc metric card. */
export function ArcMetric(props: {
  label: string;
  value: string;
  detail?: string;
  tone?: "accent" | "info" | "success" | "warning" | "danger" | "neutral" | "outline";
}): JSX.Element {
  const { palette } = useArcTheme();
  const valueColor = () => {
    const p = palette();
    if (props.tone === "danger") return p.danger.fg;
    if (props.tone === "success") return p.success.fg;
    if (props.tone === "warning") return p.warning.fg;
    if (props.tone === "accent") return p.accent;
    return p.foreground;
  };
  return (
    <View class="flex-1" style={{ minW: 0 }}>
      <ArcSurface
        variant="raised"
        isDark={palette().mode !== "light"}
        accentStripe={props.tone === "accent"}
        class="flex-col gap-1 p-3.5 w-full"
      >
        <MobileParagraph
          text={props.label}
          class="text-xs"
          style={{ textColor: palette().textMuted }}
        />
        <Text class="text-2xl font-bold" style={{ textColor: valueColor() }}>
          {props.value}
        </Text>
        <Show when={Boolean(props.detail)}>
          <MobileParagraph
            text={props.detail!}
            class="text-2xs"
            style={{ textColor: palette().textSecondary }}
          />
        </Show>
      </ArcSurface>
    </View>
  );
}

/** Calm concentric Arc empty state panel. */
export function ArcEmpty(props: {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}): JSX.Element {
  const { palette } = useArcTheme();
  return (
    <ArcSurface
      variant="muted"
      isDark={palette().mode !== "light"}
      class="flex-col items-center justify-center gap-2 p-4 w-full"
    >
      <View
        class="w-[28] h-[28] items-center justify-center"
        style={{
          bgColor: palette().accentSubtle,
          borderColor: palette().border,
          borderWidth: 1,
          radius: 999,
        }}
      >
        <Text class="text-xs font-bold" style={{ textColor: palette().accent }}>
          ◎
        </Text>
      </View>
      <MobileParagraph
        text={props.title}
        class="text-sm font-bold text-center"
        style={{ textColor: palette().foreground }}
      />
      <Show when={Boolean(props.detail)}>
        <MobileParagraph
          text={props.detail!}
          class="text-xs text-center"
          style={{ textColor: palette().textSecondary }}
        />
      </Show>
      <Show when={Boolean(props.actionLabel) && Boolean(props.onAction)}>
        <ArcActionButton
          label={props.actionLabel!}
          variant="primary"
          isDark={palette().mode !== "light"}
          onPress={props.onAction}
        />
      </Show>
    </ArcSurface>
  );
}

/** Calm concentric Arc expandable accordion item. */
export function ArcAccordion(props: {
  title: string;
  detail?: string;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const { palette } = useArcTheme();
  return (
    <ArcSurface
      variant="surface"
      isDark={palette().mode !== "light"}
      class="flex-col gap-2.5 p-3.5 w-full"
    >
      <Focusable
        onPress={props.onToggle}
        class="flex-row items-center justify-between gap-2 w-full"
      >
        <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
          <MobileParagraph
            text={props.title}
            class="text-sm font-bold"
            style={{ textColor: palette().foreground }}
          />
          <Show when={Boolean(props.detail)}>
            <MobileParagraph
              text={props.detail!}
              class="text-xs"
              style={{ textColor: palette().textSecondary }}
            />
          </Show>
        </View>
        <Show when={Boolean(props.badge)}>
          <ArcBadge
            label={props.badge!}
            tone="neutral"
            isDark={palette().mode !== "light"}
          />
        </Show>
        <Text
          class="text-xs font-mono font-bold shrink-0"
          style={{ textColor: palette().accent }}
        >
          {props.expanded ? "−" : "+"}
        </Text>
      </Focusable>
      <Show when={props.expanded}>{props.children}</Show>
    </ArcSurface>
  );
}

export const arcSkinAdapter: UiSkinAdapter = {
  id: "arc",
  label: "Arc",
  description: "Calm architectural 3-tier surfaces, concentric radii & physical springs (@uiarc).",
  resolveTokens: resolveArcSkinTokens,
  Provider(props) {
    return (
      <ArcThemeProvider
        mode={() => toArcMode(props.mode())}
        accent={() => toArcAccent(props.accent())}
        density={() => toArcDensity(props.density())}
        reducedMotion={props.reducedMotion}
      >
        {props.children}
      </ArcThemeProvider>
    );
  },
  kit: {
    Backdrop(props) {
      const { palette } = useArcTheme();
      return (
        <View
          class="absolute inset-0 w-full h-full"
          style={{ posType: 1, insetT: 0, insetR: 0, insetB: 0, insetL: 0, hitPass: 1 }}
        >
          <ArcBackdrop
            isDark={() => palette().mode !== "light"}
            accent={() => palette().accentName}
          />
          {props.children}
        </View>
      );
    },
    AppBar(props) {
      return (
        <ArcAppBar
          title={props.title}
          subtitle={props.subtitle}
          centered={props.centered}
          leading={props.leading}
          trailing={props.trailing}
        />
      );
    },
    NavigationBar(props) {
      return (
        <ArcNavigationBar
          route={props.route}
          items={props.items}
          onNavigate={(id) => props.onNavigate(id as T)}
          visible={props.visible}
          geometry={props.geometry}
        />
      );
    },
    Card(props) {
      const { palette } = useArcTheme();
      const surfaceVariant = () => {
        if (props.variant === "muted") return "muted" as const;
        if (props.variant === "raised" || props.variant === "accent") return "raised" as const;
        if (props.variant === "sticky") return "notice-warning" as const;
        return "surface" as const;
      };
      const inner = (
        <ArcSurface
          variant={surfaceVariant()}
          isDark={palette().mode !== "light"}
          accentStripe={props.variant === "accent"}
          class={props.class ?? "flex-col gap-2.5 p-4 w-full"}
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
                    style={{ textColor: palette().foreground }}
                  />
                </Show>
                <Show when={Boolean(props.detail)}>
                  <MobileParagraph
                    text={props.detail!}
                    class="text-xs"
                    style={{ textColor: palette().textSecondary }}
                  />
                </Show>
              </View>
              <Show when={Boolean(props.badge) || Boolean(props.trailing)}>
                <View class="flex-row items-center gap-1.5 shrink-0">
                  <Show when={Boolean(props.badge)}>
                    <ArcBadge
                      label={props.badge!}
                      tone="coral"
                      isDark={palette().mode !== "light"}
                    />
                  </Show>
                  {props.trailing}
                </View>
              </Show>
            </View>
          </Show>
          {props.children}
        </ArcSurface>
      );
      return props.onPress ? (
        <Focusable class="w-full" onPress={props.onPress}>
          {inner}
        </Focusable>
      ) : (
        inner
      );
    },
    ListTile(props) {
      return (
        <ArcListTile
          title={props.title}
          detail={props.detail}
          leading={props.leading}
          trailing={props.trailing}
          onPress={props.onPress}
        />
      );
    },
    Button(props) {
      const { palette } = useArcTheme();
      const variant = () => {
        if (props.variant === "danger") return "danger" as const;
        if (props.variant === "secondary" || props.variant === "tonal") {
          return "secondary" as const;
        }
        if (props.variant === "outline") return "outline" as const;
        if (props.variant === "ghost") return "ghost" as const;
        return "primary" as const;
      };
      return (
        <View
          class={props.fullWidth ? "w-full" : ""}
          style={{ opacity: props.disabled ? 0.5 : 1 }}
        >
          <ArcActionButton
            label={props.label}
            variant={variant()}
            isDark={palette().mode !== "light"}
            fullWidth={props.fullWidth}
            boxClass={
              props.compact
                ? "relative py-1.5 px-3 items-center justify-center"
                : undefined
            }
            onPress={props.disabled ? undefined : props.onPress}
          />
        </View>
      );
    },
    Badge(props) {
      const { palette } = useArcTheme();
      const tone = () => {
        if (props.tone === "danger") return "danger" as const;
        if (props.tone === "warning") return "trial" as const;
        if (props.tone === "success") return "safe" as const;
        if (props.tone === "neutral") return "neutral" as const;
        if (props.tone === "outline") return "outline" as const;
        return "coral" as const;
      };
      return (
        <ArcBadge
          label={props.label}
          tone={tone()}
          isDark={palette().mode !== "light"}
          showDot={props.tone === "success" || props.tone === "danger"}
        />
      );
    },
    SegmentedControl(props) {
      const { palette } = useArcTheme();
      return (
        <ArcSegmentedControl
          isDark={palette().mode !== "light"}
          items={props.items}
          activeId={() => props.active}
          onSelect={props.onChange}
        />
      );
    },
    Switch(props) {
      const { palette } = useArcTheme();
      if (!props.label && !props.detail) {
        return (
          <ArcSwitchPill
            checked={props.value}
            isDark={palette().mode !== "light"}
            onPress={props.disabled ? undefined : () => props.onChange?.(!props.value)}
          />
        );
      }
      const hasLongCopy = () =>
        Boolean(props.detail) || (props.label?.length ?? 0) > 24;
      return (
        <Focusable
          focusable={!props.disabled}
          onPress={props.disabled ? undefined : () => props.onChange?.(!props.value)}
          class={
            hasLongCopy()
              ? "flex-row items-center justify-between gap-3 py-1 w-full"
              : "flex-row items-center gap-2.5 py-1"
          }
          style={{ opacity: props.disabled ? 0.5 : 1 }}
        >
          <Show
            when={hasLongCopy()}
            fallback={
              <Text
                class="text-xs font-bold"
                style={{ textColor: palette().foreground }}
              >
                {props.label}
              </Text>
            }
          >
            <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
              <Show when={Boolean(props.label)}>
                <MobileParagraph
                  text={props.label!}
                  class="text-xs font-bold"
                  style={{ textColor: palette().foreground }}
                />
              </Show>
              <Show when={Boolean(props.detail)}>
                <MobileParagraph
                  text={props.detail!}
                  class="text-2xs"
                  style={{ textColor: palette().textMuted }}
                />
              </Show>
            </View>
          </Show>
          <ArcSwitchPill
            checked={props.value}
            isDark={palette().mode !== "light"}
          />
        </Focusable>
      );
    },
    Checkbox(props) {
      return (
        <ArcCheckbox
          checked={props.checked}
          label={props.label}
          disabled={props.disabled}
          onChange={props.onChange}
        />
      );
    },
    RadioGroup(props) {
      return (
        <ArcRadioGroup
          items={props.items}
          value={props.value}
          direction={props.direction}
          onChange={props.onChange}
        />
      );
    },
    Input(props) {
      return (
        <ArcInput
          value={props.value}
          placeholder={props.placeholder}
          label={props.label}
          hint={props.hint}
          onInput={props.onInput}
          onSubmit={props.onSubmit}
        />
      );
    },
    Progress(props) {
      const { palette } = useArcTheme();
      return (
        <View class="flex-col gap-1.5 w-full" style={{ minW: 0 }}>
          <Show when={Boolean(props.label)}>
            <View class="flex-row items-center justify-between gap-2 w-full">
              <MobileParagraph
                text={props.label!}
                class="text-xs font-bold"
                style={{ textColor: palette().foreground }}
              />
              <Text
                class="text-xs font-mono shrink-0"
                style={{ textColor: palette().textMuted }}
              >
                {`${Math.round(Math.max(0, Math.min(1, props.value)) * 100)}%`}
              </Text>
            </View>
          </Show>
          <ArcProgressMeter
            isDark={palette().mode !== "light"}
            ratio={() => Math.max(0, Math.min(1, props.value))}
            tone={props.tone === "success" ? "sage" : "coral"}
          />
        </View>
      );
    },
    Stepper(props) {
      return (
        <ArcStepper
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          label={props.label}
          onChange={props.onChange}
        />
      );
    },
    Alert(props) {
      return (
        <ArcAlert
          title={props.title}
          body={props.body}
          tone={props.tone}
          actionLabel={props.actionLabel}
          onAction={props.onAction}
          onDismiss={props.onDismiss}
        />
      );
    },
    Toast(props) {
      const { palette } = useArcTheme();
      const message = () => {
        if (!props.open) return null;
        return props.body ? `${props.title} · ${props.body}` : props.title;
      };
      return (
        <ArcToast
          message={message}
          isDark={palette().mode !== "light"}
          bottomOffset={24}
        />
      );
    },
    Dialog(props) {
      const { palette } = useArcTheme();
      return (
        <ArcDialog
          open={() => props.open}
          title={props.title}
          description={props.body}
          confirmLabel={props.confirmLabel}
          cancelLabel={props.cancelLabel}
          isDark={palette().mode !== "light"}
          onConfirm={props.onConfirm}
          onClose={props.onClose}
        >
          {props.children}
        </ArcDialog>
      );
    },
    Sheet(props) {
      const { palette } = useArcTheme();
      return (
        <ArcBottomSheet
          open={() => props.open}
          title={props.title}
          subtitle={props.subtitle}
          isDark={palette().mode !== "light"}
          onClose={props.onClose}
        >
          <Show when={Boolean(props.actions?.length)}>
            <View class="flex-col gap-2 w-full">
              <For each={props.actions ?? []}>
                {(action) => (
                  <ArcListTile
                    title={action.label}
                    detail={action.detail}
                    onPress={() => {
                      props.onSelectAction?.(action.id);
                      props.onClose();
                    }}
                  />
                )}
              </For>
            </View>
          </Show>
          {props.children}
        </ArcBottomSheet>
      );
    },
    Metric(props) {
      return (
        <ArcMetric
          label={props.label}
          value={props.value}
          detail={props.detail}
          tone={props.tone}
        />
      );
    },
    EmptyState(props) {
      return (
        <ArcEmpty
          title={props.title}
          detail={props.detail}
          actionLabel={props.actionLabel}
          onAction={props.onAction}
        />
      );
    },
    Accordion(props) {
      return (
        <ArcAccordion
          title={props.title}
          detail={props.detail}
          badge={props.badge}
          expanded={props.expanded}
          onToggle={props.onToggle}
        >
          {props.children}
        </ArcAccordion>
      );
    },
  },
};

/** Register `@pocket/arc` into `@pocket/ui`'s global skin registry. */
export function registerArcSkin(): UiSkinAdapter {
  return registerUiSkin(arcSkinAdapter);
}
