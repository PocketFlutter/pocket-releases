/**
 * @pocket/liquid_glass — Pluggable `@pocket/ui/skins` Adapter (`liquidGlassSkinAdapter`).
 *
 * Implements all 21 slots of `UiSkinKit` so any PocketJS application using
 * `<UiSkinProvider>` and polymorphic `<Skin*>` components can hot-switch into
 * Liquid Glass (`id: "liquid-glass"`) while preserving control state.
 */

import { type JSX } from "solid-js";
import { View as PocketView } from "@pocketjs/framework/solid/components";
import {
  registerUiSkin,
  type UiSkinAccent,
  type UiSkinAdapter,
  type UiSkinThemeMode,
  type UiSkinTokens,
} from "@pocket/ui";
import {
  LiquidGlassBadge,
  LiquidGlassButton,
  LiquidGlassCheckbox,
  LiquidGlassInput,
  LiquidGlassProgress,
  LiquidGlassRadioGroup,
  LiquidGlassSegmentedControl,
  LiquidGlassStepper,
  LiquidGlassSwitch,
} from "./controls.tsx";
import {
  LiquidGlassAccordion,
  LiquidGlassAppBar,
  LiquidGlassCard,
  LiquidGlassEmpty,
  LiquidGlassListTile,
  LiquidGlassMetric,
  LiquidGlassNavigationBar,
} from "./navigation.tsx";
import {
  LiquidGlassAlert,
  LiquidGlassDialog,
  LiquidGlassSheet,
  LiquidGlassToast,
} from "./overlays.tsx";
import { LiquidGlassBackdrop, LiquidGlassProvider } from "./surfaces.tsx";
import {
  resolveLiquidGlassPalette,
  type LiquidGlassAccent,
  type LiquidGlassDensity,
  type LiquidGlassThemeMode,
} from "./tokens.ts";

function toGlassMode(mode: UiSkinThemeMode): LiquidGlassThemeMode {
  if (mode === "amber-night") return "amber-night";
  if (mode === "dark") return "dark";
  return "light";
}

function toGlassAccent(accent: UiSkinAccent): LiquidGlassAccent {
  return accent as LiquidGlassAccent;
}

function toGlassDensity(density: "touch" | "desktop" | "auto"): LiquidGlassDensity {
  return density === "desktop" ? "compact" : "comfortable";
}

export function resolveLiquidGlassSkinTokens(
  mode: UiSkinThemeMode = "light",
  accent: UiSkinAccent = "blue",
): UiSkinTokens {
  const pal = resolveLiquidGlassPalette(toGlassMode(mode), toGlassAccent(accent));
  // Provide 6-digit `#RRGGBB` tokens where `createMobileTheme` / `InputField` expect opaque hex
  const solidSurface =
    pal.mode === "amber-night"
      ? "#170F00"
      : pal.dark
        ? "#162033"
        : "#FFFFFF";
  const solidRaised =
    pal.mode === "amber-night"
      ? "#1F1400"
      : pal.dark
        ? "#1E2B44"
        : "#FFFFFF";
  const solidMuted =
    pal.mode === "amber-night"
      ? "#120B00"
      : pal.dark
        ? "#111829"
        : "#E9EEF7";
  const solidBorder =
    pal.mode === "amber-night"
      ? "#473000"
      : pal.dark
        ? "#334463"
        : "#CBD5E6";
  const solidBorderStrong =
    pal.mode === "amber-night"
      ? "#664500"
      : pal.dark
        ? "#4C648F"
        : "#A9B8D1";

  return {
    id: "liquid-glass",
    label: "Liquid Glass",
    mode: pal.mode,
    dark: pal.dark,
    accent,
    canvasBg: pal.canvasBg,
    surfaceBg: solidSurface,
    surfaceRaisedBg: solidRaised,
    surfaceMutedBg: solidMuted,
    ink: pal.ink,
    inkSecondary: pal.inkSecondary,
    inkMuted: pal.inkMuted,
    border: solidBorder,
    borderStrong: solidBorderStrong,
    accentBg: pal.accentHex,
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

export const liquidGlassSkinAdapter: UiSkinAdapter = {
  id: "liquid-glass",
  label: "Liquid Glass",
  description:
    "GPU-budgeted refractive Liquid Glass controls with a specular vector fallback.",
  floatingBottomBar: true,
  resolveTokens: resolveLiquidGlassSkinTokens,
  Provider(props): JSX.Element {
    return (
      <LiquidGlassProvider
        mode={() => toGlassMode(props.mode())}
        accent={() => toGlassAccent(props.accent())}
        density={() => toGlassDensity(props.density())}
        reducedMotion={props.reducedMotion}
      >
        {props.children}
      </LiquidGlassProvider>
    );
  },
  kit: {
    Backdrop(props) {
      return (
        <PocketView
          class="absolute inset-0 w-full h-full"
          style={{
            posType: 1,
            insetT: 0,
            insetR: 0,
            insetB: 0,
            insetL: 0,
            hitPass: 1,
          }}
        >
          <LiquidGlassBackdrop />
          {props.children}
        </PocketView>
      );
    },
    AppBar(props) {
      return (
        <LiquidGlassAppBar
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
        <LiquidGlassNavigationBar
          route={props.route}
          items={props.items}
          onNavigate={props.onNavigate}
          visible={props.visible}
          geometry={props.geometry}
        />
      );
    },
    Card(props) {
      return (
        <LiquidGlassCard
          title={props.title}
          detail={props.detail}
          variant={props.variant}
          badge={props.badge}
          trailing={props.trailing}
          onPress={props.onPress}
          class={props.class}
          style={props.style}
        >
          {props.children}
        </LiquidGlassCard>
      );
    },
    ListTile(props) {
      return (
        <LiquidGlassListTile
          title={props.title}
          detail={props.detail}
          leading={props.leading}
          trailing={props.trailing}
          onPress={props.onPress}
        />
      );
    },
    Button(props) {
      const mappedVariant = () => {
        if (props.variant === "danger") return "danger" as const;
        if (props.variant === "secondary") return "glass" as const;
        if (props.variant === "tonal") return "tonal" as const;
        if (props.variant === "outline") return "outline" as const;
        if (props.variant === "ghost") return "ghost" as const;
        return "primary" as const;
      };
      return (
        <LiquidGlassButton
          label={props.label}
          variant={mappedVariant()}
          compact={props.compact}
          fullWidth={props.fullWidth}
          disabled={props.disabled}
          onPress={props.onPress}
        />
      );
    },
    Badge(props) {
      return <LiquidGlassBadge label={props.label} tone={props.tone} />;
    },
    SegmentedControl(props) {
      return (
        <LiquidGlassSegmentedControl
          items={props.items}
          active={props.active}
          accentActive={props.accentActive}
          onChange={props.onChange}
        />
      );
    },
    Switch(props) {
      return (
        <LiquidGlassSwitch
          value={props.value}
          label={props.label}
          detail={props.detail}
          disabled={props.disabled}
          onChange={props.onChange}
        />
      );
    },
    Checkbox(props) {
      return (
        <LiquidGlassCheckbox
          checked={props.checked}
          label={props.label}
          disabled={props.disabled}
          onChange={props.onChange}
        />
      );
    },
    RadioGroup(props) {
      return (
        <LiquidGlassRadioGroup
          items={props.items}
          value={props.value}
          direction={props.direction}
          onChange={props.onChange}
        />
      );
    },
    Input(props) {
      return (
        <LiquidGlassInput
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
      return (
        <LiquidGlassProgress
          value={props.value}
          label={props.label}
          tone={props.tone}
        />
      );
    },
    Stepper(props) {
      return (
        <LiquidGlassStepper
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
        <LiquidGlassAlert
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
      return (
        <LiquidGlassToast
          open={props.open}
          title={props.title}
          body={props.body}
          tone={props.tone}
          actionLabel={props.actionLabel}
          onAction={props.onAction}
          onDismiss={props.onDismiss}
          bottomOffset={96}
        />
      );
    },
    Dialog(props) {
      return (
        <LiquidGlassDialog
          open={props.open}
          title={props.title}
          body={props.body}
          tone={props.tone}
          confirmLabel={props.confirmLabel}
          cancelLabel={props.cancelLabel}
          onConfirm={props.onConfirm}
          onClose={props.onClose}
        >
          {props.children}
        </LiquidGlassDialog>
      );
    },
    Sheet(props) {
      return (
        <LiquidGlassSheet
          open={props.open}
          title={props.title}
          subtitle={props.subtitle}
          actions={props.actions}
          onSelectAction={props.onSelectAction}
          onClose={props.onClose}
        >
          {props.children}
        </LiquidGlassSheet>
      );
    },
    Metric(props) {
      return (
        <LiquidGlassMetric
          label={props.label}
          value={props.value}
          detail={props.detail}
          tone={props.tone}
        />
      );
    },
    EmptyState(props) {
      return (
        <LiquidGlassEmpty
          title={props.title}
          detail={props.detail}
          actionLabel={props.actionLabel}
          onAction={props.onAction}
        />
      );
    },
    Accordion(props) {
      return (
        <LiquidGlassAccordion
          title={props.title}
          detail={props.detail}
          badge={props.badge}
          expanded={props.expanded}
          onToggle={props.onToggle}
        >
          {props.children}
        </LiquidGlassAccordion>
      );
    },
  },
};

/** Register `@pocket/liquid_glass` in `@pocket/ui`'s global skin registry. */
export function registerLiquidGlassSkin(): UiSkinAdapter {
  return registerUiSkin(liquidGlassSkinAdapter);
}
