/**
 * Unified Pluggable UI Skin Contract for PocketJS (`@pocket/ui/skins`).
 *
 * Enables seamless runtime switching across Default UI (`@pocket/ui` Option C /
 * Shadcn), Looseleaf (`@pocket/looseleaf` hand-drawn paper & ink), Arc
 * (`@pocket/arc` calm concentric architectural UI), and custom registered skins
 * while preserving 100% of SolidJS reactive state, native IME `InputField`
 * bridges, focus scopes, safe-area geometry, and width-aware line wrapping.
 */

import {
  For,
  Show,
  createContext,
  createMemo,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { Focusable, Text, View, type ViewProps } from "@pocketjs/framework/solid/components";
import { InputField, NavigationBar, SafeAreaScaffold, type NavigationItem, type SafeAreaEdges } from "./ui.tsx";
import {
  DesignDensityProvider,
  MobileAccordion,
  MobileAlert,
  MobileAppBar,
  MobileBadge,
  MobileButton,
  MobileCard,
  MobileCheckbox,
  MobileDialog,
  MobileListTile,
  MobileParagraph,
  MobilePopup,
  MobileProgress,
  MobileRadioGroup,
  MobileSegmentedControl,
  MobileStepper,
  MobileSwitch,
  MobileThemeProvider,
  MobileToast,
  createMobileTheme,
  toMobileColor,
  type MobilePopupAction,
  type MobileTheme,
} from "./mobile.tsx";
import type { DesignDensity, DisplayGeometry } from "./responsive.ts";

export type UiSkinId = "default" | "looseleaf" | "arc" | (string & {});

export type UiSkinThemeMode = "light" | "dark" | "amber-night";

export type NamedUiSkinAccent =
  | "blue"
  | "violet"
  | "teal"
  | "rose"
  | "coral"
  | "green"
  | "amber"
  | "orange"
  | "neutral";

export type UiSkinAccent = NamedUiSkinAccent | `#${string}`;

export type UiSkinTone =
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "outline";

export type UiSkinButtonVariant =
  | "primary"
  | "secondary"
  | "tonal"
  | "outline"
  | "ghost"
  | "danger";

export type UiSkinSurfaceVariant =
  | "default"
  | "raised"
  | "muted"
  | "accent"
  | "sticky";

export interface UiSkinTokens {
  readonly id: UiSkinId;
  readonly label: string;
  readonly mode: UiSkinThemeMode;
  readonly dark: boolean;
  readonly accent: UiSkinAccent;
  readonly canvasBg: string;
  readonly surfaceBg: string;
  readonly surfaceRaisedBg: string;
  readonly surfaceMutedBg: string;
  readonly ink: string;
  readonly inkSecondary: string;
  readonly inkMuted: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly accentBg: string;
  readonly accentFg: string;
  readonly accentSubtleBg: string;
  readonly successBg: string;
  readonly warningBg: string;
  readonly dangerBg: string;
  readonly radiusControl: number;
  readonly radiusSurface: number;
  readonly radiusPanel: number;
}

export interface UiSkinProviderSlotProps {
  mode: Accessor<UiSkinThemeMode>;
  accent: Accessor<UiSkinAccent>;
  density: Accessor<DesignDensity | "auto">;
  reducedMotion: Accessor<boolean>;
  children?: JSX.Element;
}

export interface SkinBackdropProps {
  children?: JSX.Element;
}

export interface SkinScaffoldProps {
  edges?: readonly SafeAreaEdges[];
  geometry?: () => DisplayGeometry;
  appBar?: JSX.Element | (() => JSX.Element);
  bottomBar?: JSX.Element;
  backdrop?: boolean;
  class?: string;
  style?: ViewProps["style"];
  children?: JSX.Element;
}

export interface SkinAppBarProps {
  title: string;
  subtitle?: string;
  centered?: boolean;
  leading?: JSX.Element;
  trailing?: JSX.Element;
}

export interface SkinNavigationBarProps<T extends string = string> {
  route: T;
  items: readonly NavigationItem[];
  onNavigate: (route: T) => void;
  visible?: boolean;
  geometry?: () => DisplayGeometry;
}

export interface SkinCardProps {
  title?: string;
  detail?: string;
  variant?: UiSkinSurfaceVariant;
  badge?: string;
  trailing?: JSX.Element;
  onPress?: () => void;
  class?: string;
  style?: ViewProps["style"];
  children?: JSX.Element;
}

export interface SkinListTileProps {
  title: string;
  detail?: string;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  onPress?: () => void;
}

export interface SkinButtonProps {
  label: string;
  variant?: UiSkinButtonVariant;
  compact?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export interface SkinBadgeProps {
  label: string;
  tone?: UiSkinTone;
}

export interface SkinSegmentedItem<T extends string = string> {
  id: T;
  label: string;
}

export interface SkinSegmentedControlProps<T extends string = string> {
  items: readonly SkinSegmentedItem<T>[];
  active: T;
  onChange: (id: T) => void;
  accentActive?: boolean;
}

export interface SkinSwitchProps {
  value: boolean;
  onChange?: (value: boolean) => void;
  label?: string;
  detail?: string;
  disabled?: boolean;
}

export interface SkinCheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export interface SkinRadioItem {
  id: string;
  label: string;
  detail?: string;
}

export interface SkinRadioGroupProps {
  items: readonly SkinRadioItem[];
  value: string;
  onChange: (id: string) => void;
  direction?: "row" | "col";
}

export interface SkinInputProps {
  value: string | (() => string);
  placeholder?: string;
  label?: string;
  hint?: string;
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
}

export interface SkinProgressProps {
  value: number;
  label?: string;
  tone?: "accent" | "success" | "warning" | "danger";
}

export interface SkinStepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  onChange: (value: number) => void;
}

export interface SkinAlertProps {
  title: string;
  body?: string;
  tone?: "info" | "success" | "warning" | "danger";
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

export interface SkinToastProps {
  open: boolean;
  title: string;
  body?: string;
  tone?: "info" | "success" | "warning" | "danger";
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

export interface SkinDialogProps {
  open: boolean;
  title: string;
  body?: string;
  tone?: "default" | "danger";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  children?: JSX.Element;
}

export interface SkinSheetAction {
  id: string;
  label: string;
  detail?: string;
  tone?: "default" | "danger";
}

export interface SkinSheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  actions?: readonly SkinSheetAction[];
  onSelectAction?: (id: string) => void;
  onClose: () => void;
  children?: JSX.Element;
}

export interface SkinMetricProps {
  label: string;
  value: string;
  detail?: string;
  tone?: UiSkinTone;
}

export interface SkinEmptyStateProps {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface SkinAccordionProps {
  title: string;
  detail?: string;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  children?: JSX.Element;
}

export interface SkinParagraphProps {
  text: string;
  muted?: boolean;
  class?: string;
  style?: ViewProps["style"];
}

export interface UiSkinKit {
  Backdrop: (props: SkinBackdropProps) => JSX.Element;
  AppBar: (props: SkinAppBarProps) => JSX.Element;
  NavigationBar: <T extends string = string>(props: SkinNavigationBarProps<T>) => JSX.Element;
  Card: (props: SkinCardProps) => JSX.Element;
  ListTile: (props: SkinListTileProps) => JSX.Element;
  Button: (props: SkinButtonProps) => JSX.Element;
  Badge: (props: SkinBadgeProps) => JSX.Element;
  SegmentedControl: <T extends string = string>(props: SkinSegmentedControlProps<T>) => JSX.Element;
  Switch: (props: SkinSwitchProps) => JSX.Element;
  Checkbox: (props: SkinCheckboxProps) => JSX.Element;
  RadioGroup: (props: SkinRadioGroupProps) => JSX.Element;
  Input: (props: SkinInputProps) => JSX.Element;
  Progress: (props: SkinProgressProps) => JSX.Element;
  Stepper: (props: SkinStepperProps) => JSX.Element;
  Alert: (props: SkinAlertProps) => JSX.Element;
  Toast: (props: SkinToastProps) => JSX.Element;
  Dialog: (props: SkinDialogProps) => JSX.Element;
  Sheet: (props: SkinSheetProps) => JSX.Element;
  Metric: (props: SkinMetricProps) => JSX.Element;
  EmptyState: (props: SkinEmptyStateProps) => JSX.Element;
  Accordion: (props: SkinAccordionProps) => JSX.Element;
}

export interface UiSkinAdapter {
  readonly id: UiSkinId;
  readonly label: string;
  readonly description: string;
  resolveTokens: (mode: UiSkinThemeMode, accent: UiSkinAccent) => UiSkinTokens;
  Provider?: (props: UiSkinProviderSlotProps) => JSX.Element;
  readonly kit: UiSkinKit;
}

const DEFAULT_ACCENT_HEX: Readonly<Record<NamedUiSkinAccent, { light: string; dark: string; subtleLight: string; subtleDark: string }>> = {
  blue: { light: "#2563EB", dark: "#3B82F6", subtleLight: "#EFF6FF", subtleDark: "#172554" },
  violet: { light: "#7C3AED", dark: "#8B5CF6", subtleLight: "#F5F3FF", subtleDark: "#2E1065" },
  teal: { light: "#0D9488", dark: "#14B8A6", subtleLight: "#F0FDFA", subtleDark: "#042F2E" },
  rose: { light: "#E11D48", dark: "#F43F5E", subtleLight: "#FFF1F2", subtleDark: "#4C0519" },
  coral: { light: "#DE5A43", dark: "#F0715A", subtleLight: "#FCECE8", subtleDark: "#381B16" },
  green: { light: "#16A34A", dark: "#22C55E", subtleLight: "#F0FDF4", subtleDark: "#14532D" },
  amber: { light: "#D97706", dark: "#F59E0B", subtleLight: "#FEF3C7", subtleDark: "#451A03" },
  orange: { light: "#EA580C", dark: "#F97316", subtleLight: "#FFEDD5", subtleDark: "#431407" },
  neutral: { light: "#18181B", dark: "#FAFAFA", subtleLight: "#F4F4F5", subtleDark: "#27272A" },
};

const CUSTOM_HEX6_RE = /^#([0-9a-fA-F]{6})$/;

export function resolveDefaultSkinTokens(
  mode: UiSkinThemeMode = "light",
  accent: UiSkinAccent = "blue",
): UiSkinTokens {
  const customHex =
    typeof accent === "string" && CUSTOM_HEX6_RE.test(accent.trim())
      ? (`#${accent.trim().slice(1).toUpperCase()}` as `#${string}`)
      : undefined;
  const namedKey: NamedUiSkinAccent = (
    accent in DEFAULT_ACCENT_HEX ? accent : "blue"
  ) as NamedUiSkinAccent;
  const pair = DEFAULT_ACCENT_HEX[namedKey];
  if (mode === "amber-night") {
    return {
      id: "default",
      label: "Default UI",
      mode: "amber-night",
      dark: true,
      accent: customHex ?? namedKey,
      canvasBg: "#0A0600",
      surfaceBg: "#140C00",
      surfaceRaisedBg: "#1E1300",
      surfaceMutedBg: "#261800",
      ink: "#FFD260",
      inkSecondary: "#D9A438",
      inkMuted: "#9E7218",
      border: "#422A00",
      borderStrong: "#664200",
      accentBg: "#E69500",
      accentFg: "#0A0600",
      accentSubtleBg: "#2E1D00",
      successBg: "#8FB800",
      warningBg: "#FFB000",
      dangerBg: "#D94800",
      radiusControl: 10,
      radiusSurface: 14,
      radiusPanel: 18,
    };
  }
  const dark = mode === "dark";
  return {
    id: "default",
    label: "Default UI",
    mode: dark ? "dark" : "light",
    dark,
    accent: customHex ?? namedKey,
    canvasBg: dark ? "#09090B" : "#FAFAFA",
    surfaceBg: dark ? "#09090B" : "#FFFFFF",
    surfaceRaisedBg: dark ? "#18181B" : "#FFFFFF",
    surfaceMutedBg: dark ? "#27272A" : "#F4F4F5",
    ink: dark ? "#FAFAFA" : "#09090B",
    inkSecondary: dark ? "#D4D4D8" : "#3F3F46",
    inkMuted: dark ? "#A1A1AA" : "#71717A",
    border: dark ? "#27272A" : "#E4E4E7",
    borderStrong: dark ? "#3F3F46" : "#D4D4D8",
    accentBg: customHex ?? (dark ? pair.dark : pair.light),
    accentFg: namedKey === "neutral" && !customHex && dark ? "#09090B" : "#FFFFFF",
    accentSubtleBg: dark ? pair.subtleDark : pair.subtleLight,
    successBg: dark ? "#22C55E" : "#16A34A",
    warningBg: dark ? "#F59E0B" : "#D97706",
    dangerBg: "#DC2626",
    radiusControl: 10,
    radiusSurface: 14,
    radiusPanel: 18,
  };
}

function mapButtonKind(
  variant: UiSkinButtonVariant | undefined,
): "filled" | "tonal" | "outlined" | "text" | "danger" {
  if (variant === "danger") return "danger";
  if (variant === "secondary" || variant === "tonal") return "tonal";
  if (variant === "outline") return "outlined";
  if (variant === "ghost") return "text";
  return "filled";
}

function mapBadgeTone(
  tone: UiSkinTone | undefined,
): "accent" | "success" | "warning" | "danger" | "neutral" | "outline" {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "danger") return "danger";
  if (tone === "neutral") return "neutral";
  if (tone === "outline") return "outline";
  return "accent";
}

export const defaultSkinAdapter: UiSkinAdapter = {
  id: "default",
  label: "Default UI",
  description: "Built-in Option C / Shadcn cross-platform mobile & desktop design system.",
  resolveTokens: resolveDefaultSkinTokens,
  kit: {
    Backdrop(props) {
      const { tokens } = useUiSkin();
      return (
        <View
          class="absolute inset-0 w-full h-full"
          style={{
            posType: 1,
            insetT: 0,
            insetR: 0,
            insetB: 0,
            insetL: 0,
            bgColor: tokens().canvasBg,
            hitPass: 1,
          }}
        >
          {props.children}
        </View>
      );
    },
    AppBar(props) {
      return (
        <MobileAppBar
          title={props.title}
          subtitle={props.subtitle}
          centered={props.centered}
          leading={props.leading}
          trailing={props.trailing}
        />
      );
    },
    NavigationBar(props) {
      const { tokens } = useUiSkin();
      const baseTheme = createMobileTheme(tokens().dark, tokens().accentBg);
      return (
        <NavigationBar
          route={props.route}
          items={props.items}
          onNavigate={(id) => props.onNavigate(id as typeof props.route)}
          visible={props.visible ?? true}
          dark={tokens().dark}
          accentColor={baseTheme.accentColor}
          geometry={props.geometry}
        />
      );
    },
    Card(props) {
      const { tokens } = useUiSkin();
      const content = (
        <MobileCard title={props.title} detail={props.detail} class={props.class}>
          <Show when={Boolean(props.badge) || Boolean(props.trailing)}>
            <View class="flex-row items-center justify-between gap-2 w-full">
              <Show when={Boolean(props.badge)}>
                <MobileBadge label={props.badge!} tone="accent" />
              </Show>
              {props.trailing}
            </View>
          </Show>
          {props.children}
        </MobileCard>
      );
      if (!props.onPress) return content;
      return (
        <Focusable
          class="w-full"
          onPress={props.onPress}
          style={
            props.variant === "muted"
              ? { bgColor: tokens().surfaceMutedBg, radius: tokens().radiusSurface }
              : undefined
          }
        >
          {content}
        </Focusable>
      );
    },
    ListTile(props) {
      return (
        <MobileListTile
          title={props.title}
          detail={props.detail}
          leading={props.leading}
          trailing={props.trailing}
          onPress={props.onPress}
        />
      );
    },
    Button(props) {
      return (
        <View class={props.fullWidth ? "w-full" : ""}>
          <MobileButton
            label={props.label}
            kind={mapButtonKind(props.variant)}
            compact={props.compact}
            disabled={props.disabled}
            onPress={props.onPress}
          />
        </View>
      );
    },
    Badge(props) {
      return <MobileBadge label={props.label} tone={mapBadgeTone(props.tone)} />;
    },
    SegmentedControl(props) {
      return (
        <MobileSegmentedControl
          items={props.items as readonly { id: string; label: string }[]}
          active={props.active}
          accentActive={props.accentActive}
          onChange={(id) => props.onChange(id as typeof props.active)}
        />
      );
    },
    Switch(props) {
      const { tokens } = useUiSkin();
      return (
        <View class="flex-col gap-0.5 w-full" style={{ minW: 0 }}>
          <MobileSwitch
            value={props.value}
            label={props.label}
            disabled={props.disabled}
            onChange={(next) => props.onChange?.(next)}
          />
          <Show when={Boolean(props.detail)}>
            <MobileParagraph
              text={props.detail!}
              class="text-xs"
              style={{ textColor: tokens().inkMuted }}
            />
          </Show>
        </View>
      );
    },
    Checkbox(props) {
      return (
        <MobileCheckbox
          checked={props.checked}
          label={props.label}
          disabled={props.disabled}
          onChange={(next) => props.onChange?.(next)}
        />
      );
    },
    RadioGroup(props) {
      return (
        <MobileRadioGroup
          items={props.items}
          value={props.value}
          direction={props.direction}
          onChange={props.onChange}
        />
      );
    },
    Input(props) {
      const { tokens } = useUiSkin();
      const accessor = () => (typeof props.value === "function" ? props.value() : props.value);
      return (
        <View class="flex-col gap-1.5 w-full" style={{ minW: 0 }}>
          <Show when={Boolean(props.label)}>
            <MobileParagraph
              text={props.label!}
              class="text-xs font-bold"
              style={{ textColor: tokens().ink }}
            />
          </Show>
          <InputField
            value={accessor}
            placeholder={props.placeholder}
            onInput={props.onInput}
            onSubmit={props.onSubmit}
            appearance={{
              fillColor: tokens().surfaceBg,
              textColor: tokens().ink,
              placeholderColor: tokens().inkMuted,
              borderColor: tokens().border,
              focusedBorderColor: tokens().accentBg,
              borderRadius: tokens().radiusControl,
            }}
          />
          <Show when={Boolean(props.hint)}>
            <MobileParagraph
              text={props.hint!}
              class="text-xs"
              style={{ textColor: tokens().inkMuted }}
            />
          </Show>
        </View>
      );
    },
    Progress(props) {
      return (
        <MobileProgress
          value={props.value}
          label={props.label}
          tone={props.tone}
        />
      );
    },
    Stepper(props) {
      const { tokens } = useUiSkin();
      return (
        <View class="flex-col gap-1.5 w-full" style={{ minW: 0 }}>
          <Show when={Boolean(props.label)}>
            <MobileParagraph
              text={props.label!}
              class="text-xs font-bold"
              style={{ textColor: tokens().ink }}
            />
          </Show>
          <MobileStepper
            value={props.value}
            min={props.min}
            max={props.max}
            step={props.step}
            onChange={props.onChange}
          />
        </View>
      );
    },
    Alert(props) {
      return (
        <MobileAlert
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
        <MobileToast
          open={props.open}
          title={props.title}
          body={props.body}
          tone={props.tone}
          actionLabel={props.actionLabel}
          onAction={props.onAction}
          onDismiss={props.onDismiss}
        />
      );
    },
    Dialog(props) {
      return (
        <MobileDialog
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
        </MobileDialog>
      );
    },
    Sheet(props) {
      const actions = (): readonly MobilePopupAction[] | undefined =>
        props.actions?.map((action) => ({
          id: action.id,
          label: action.label,
          detail: action.detail,
          tone: action.tone,
        }));
      return (
        <MobilePopup
          open={props.open}
          title={props.title}
          subtitle={props.subtitle}
          actions={actions()}
          onSelectAction={props.onSelectAction}
          onClose={props.onClose}
        >
          {props.children}
        </MobilePopup>
      );
    },
    Metric(props) {
      const { tokens } = useUiSkin();
      const valueColor = () => {
        if (props.tone === "danger") return tokens().dangerBg;
        if (props.tone === "success") return tokens().successBg;
        if (props.tone === "warning") return tokens().warningBg;
        if (props.tone === "accent") return tokens().accentBg;
        return tokens().ink;
      };
      return (
        <View
          class="flex-1 flex-col gap-1 p-3 rounded-xl"
          style={{
            minW: 0,
            bgColor: tokens().surfaceRaisedBg,
            borderColor: tokens().border,
            borderWidth: 1,
            radius: tokens().radiusSurface,
          }}
        >
          <MobileParagraph
            text={props.label}
            class="text-xs"
            style={{ textColor: tokens().inkMuted }}
          />
          <Text class="text-2xl font-bold" style={{ textColor: valueColor() }}>
            {props.value}
          </Text>
          <Show when={Boolean(props.detail)}>
            <MobileParagraph
              text={props.detail!}
              class="text-2xs"
              style={{ textColor: tokens().inkMuted }}
            />
          </Show>
        </View>
      );
    },
    EmptyState(props) {
      const { tokens } = useUiSkin();
      return (
        <View
          class="flex-col items-center justify-center gap-2 p-4 rounded-xl w-full"
          style={{
            minW: 0,
            bgColor: tokens().surfaceMutedBg,
            borderColor: tokens().border,
            borderWidth: 1,
            radius: tokens().radiusSurface,
          }}
        >
          <MobileParagraph
            text={props.title}
            class="text-sm font-bold text-center"
            style={{ textColor: tokens().ink }}
          />
          <Show when={Boolean(props.detail)}>
            <MobileParagraph
              text={props.detail!}
              class="text-xs text-center"
              style={{ textColor: tokens().inkMuted }}
            />
          </Show>
          <Show when={Boolean(props.actionLabel) && Boolean(props.onAction)}>
            <MobileButton
              label={props.actionLabel!}
              compact
              onPress={props.onAction}
            />
          </Show>
        </View>
      );
    },
    Accordion(props) {
      return (
        <MobileAccordion
          title={props.title}
          detail={props.detail}
          badge={props.badge}
          expanded={props.expanded}
          onToggle={props.onToggle}
        >
          {props.children}
        </MobileAccordion>
      );
    },
  },
};

const skinRegistry = new Map<UiSkinId, UiSkinAdapter>([
  [defaultSkinAdapter.id, defaultSkinAdapter],
]);

/** Register or update a pluggable UI skin adapter in the global registry. */
export function registerUiSkin(adapter: UiSkinAdapter): UiSkinAdapter {
  skinRegistry.set(adapter.id, adapter);
  return adapter;
}

/** Look up a registered UI skin adapter, falling back cleanly to `default`. */
export function getUiSkin(id: UiSkinId): UiSkinAdapter {
  return skinRegistry.get(id) ?? defaultSkinAdapter;
}

/** List all registered UI skin adapters in registration order. */
export function listUiSkins(): readonly UiSkinAdapter[] {
  return Array.from(skinRegistry.values());
}

export interface UiSkinContextValue {
  skinId: Accessor<UiSkinId>;
  mode: Accessor<UiSkinThemeMode>;
  accent: Accessor<UiSkinAccent>;
  density: Accessor<DesignDensity | "auto">;
  reducedMotion: Accessor<boolean>;
  adapter: Accessor<UiSkinAdapter>;
  tokens: Accessor<UiSkinTokens>;
  availableSkins: Accessor<readonly UiSkinAdapter[]>;
  setSkin?: (next: UiSkinId) => void;
  setMode?: (next: UiSkinThemeMode) => void;
  setAccent?: (next: UiSkinAccent) => void;
}

const defaultSkinContext: UiSkinContextValue = {
  skinId: () => "default",
  mode: () => "light",
  accent: () => "blue",
  density: () => "auto",
  reducedMotion: () => false,
  adapter: () => defaultSkinAdapter,
  tokens: () => resolveDefaultSkinTokens("light", "blue"),
  availableSkins: () => listUiSkins(),
};

const UiSkinContext = createContext<UiSkinContextValue>(defaultSkinContext);

export function useUiSkin(): UiSkinContextValue {
  return useContext(UiSkinContext) ?? defaultSkinContext;
}

function toSyncedMobileTheme(tokens: UiSkinTokens): MobileTheme {
  const base = createMobileTheme(tokens.dark, tokens.accentBg);
  return {
    ...base,
    name: tokens.dark ? "dark" : "light",
    accentInkColor: base.accentInkColor,
    accentSoftColor: base.accentSoftColor,
  };
}

export function UiSkinProvider(props: {
  skin?: UiSkinId | Accessor<UiSkinId>;
  mode?: UiSkinThemeMode | Accessor<UiSkinThemeMode>;
  accent?: UiSkinAccent | Accessor<UiSkinAccent>;
  density?: DesignDensity | "auto" | Accessor<DesignDensity | "auto">;
  reducedMotion?: boolean | Accessor<boolean>;
  skins?: readonly UiSkinAdapter[];
  onSkinChange?: (next: UiSkinId) => void;
  onModeChange?: (next: UiSkinThemeMode) => void;
  onAccentChange?: (next: UiSkinAccent) => void;
  children?: JSX.Element;
}): JSX.Element {
  const parent = useContext(UiSkinContext);

  const mergedAdapters = createMemo<readonly UiSkinAdapter[]>(() => {
    const map = new Map<UiSkinId, UiSkinAdapter>();
    map.set(defaultSkinAdapter.id, defaultSkinAdapter);
    for (const reg of skinRegistry.values()) map.set(reg.id, reg);
    if (parent) {
      for (const item of parent.availableSkins()) map.set(item.id, item);
    }
    if (props.skins) {
      for (const item of props.skins) {
        map.set(item.id, item);
        skinRegistry.set(item.id, item);
      }
    }
    return Array.from(map.values());
  });

  const skinId = (): UiSkinId => {
    if (props.skin !== undefined) {
      return typeof props.skin === "function" ? props.skin() : props.skin;
    }
    return parent ? parent.skinId() : "default";
  };

  const mode = (): UiSkinThemeMode => {
    if (props.mode !== undefined) {
      return typeof props.mode === "function" ? props.mode() : props.mode;
    }
    return parent ? parent.mode() : "light";
  };

  const accent = (): UiSkinAccent => {
    if (props.accent !== undefined) {
      return typeof props.accent === "function" ? props.accent() : props.accent;
    }
    return parent ? parent.accent() : "blue";
  };

  const density = (): DesignDensity | "auto" => {
    if (props.density !== undefined) {
      return typeof props.density === "function" ? props.density() : props.density;
    }
    return parent ? parent.density() : "auto";
  };

  const reducedMotion = (): boolean => {
    if (props.reducedMotion !== undefined) {
      return typeof props.reducedMotion === "function"
        ? props.reducedMotion()
        : props.reducedMotion;
    }
    return parent ? parent.reducedMotion() : false;
  };

  const adapter = createMemo<UiSkinAdapter>(() => {
    const target = skinId();
    const list = mergedAdapters();
    return (
      list.find((entry) => entry.id === target) ??
      skinRegistry.get(target) ??
      defaultSkinAdapter
    );
  });

  const tokens = createMemo<UiSkinTokens>(() =>
    adapter().resolveTokens(mode(), accent()),
  );

  const syncedMobileTheme = createMemo<MobileTheme>(() =>
    toSyncedMobileTheme(tokens()),
  );

  const contextValue: UiSkinContextValue = {
    skinId,
    mode,
    accent,
    density,
    reducedMotion,
    adapter,
    tokens,
    availableSkins: mergedAdapters,
    setSkin: props.onSkinChange ?? parent?.setSkin,
    setMode: props.onModeChange ?? parent?.setMode,
    setAccent: props.onAccentChange ?? parent?.setAccent,
  };

  return (
    <UiSkinContext.Provider value={contextValue}>
      <MobileThemeProvider theme={syncedMobileTheme} density={density}>
        <DesignDensityProvider density={density}>
          <AdapterProviderChain
            adapters={mergedAdapters}
            index={0}
            mode={mode}
            accent={accent}
            density={density}
            reducedMotion={reducedMotion}
          >
            {props.children}
          </AdapterProviderChain>
        </DesignDensityProvider>
      </MobileThemeProvider>
    </UiSkinContext.Provider>
  );
}

function AdapterProviderChain(props: {
  adapters: Accessor<readonly UiSkinAdapter[]>;
  index: number;
  mode: Accessor<UiSkinThemeMode>;
  accent: Accessor<UiSkinAccent>;
  density: Accessor<DesignDensity | "auto">;
  reducedMotion: Accessor<boolean>;
  children?: JSX.Element;
}): JSX.Element {
  const list = props.adapters();
  const current = list[props.index];
  if (!current) return props.children;
  const renderNext = (): JSX.Element => (
    <AdapterProviderChain
      adapters={props.adapters}
      index={props.index + 1}
      mode={props.mode}
      accent={props.accent}
      density={props.density}
      reducedMotion={props.reducedMotion}
    >
      {props.children}
    </AdapterProviderChain>
  );
  if (!current.Provider) return renderNext();
  return current.Provider({
    mode: props.mode,
    accent: props.accent,
    density: props.density,
    reducedMotion: props.reducedMotion,
    get children() {
      return renderNext();
    },
  });
}

/** Escape hatch for custom skin-aware fragments that read `(kit, tokens)` directly. */
export function SkinSlot(props: {
  render: (kit: UiSkinKit, tokens: UiSkinTokens) => JSX.Element;
}): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => props.render(active.kit, ctx.tokens())}
    </Show>
  );
}

export function SkinBackdrop(props: SkinBackdropProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Backdrop(props)}
    </Show>
  );
}

export function SkinScaffold(props: SkinScaffoldProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <SafeAreaScaffold
      edges={props.edges}
      geometry={props.geometry}
      class={props.class ?? "relative flex-col w-full h-full overflow-hidden"}
      style={{
        posType: 0,
        bgColor: ctx.tokens().canvasBg,
        ...props.style,
      }}
      appBar={props.appBar}
      bottomBar={props.bottomBar}
    >
      <View class="relative flex-1 flex-col w-full h-full overflow-hidden" style={{ posType: 0 }}>
        <Show when={props.backdrop !== false}>
          <SkinBackdrop />
        </Show>
        <View class="relative flex-1 flex-col w-full h-full overflow-hidden" style={{ posType: 0 }}>
          {props.children}
        </View>
      </View>
    </SafeAreaScaffold>
  );
}

export function SkinAppBar(props: SkinAppBarProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.AppBar(props)}
    </Show>
  );
}

export function SkinNavigationBar<T extends string = string>(
  props: SkinNavigationBarProps<T>,
): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.NavigationBar(props)}
    </Show>
  );
}

export function SkinCard(props: SkinCardProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Card(props)}
    </Show>
  );
}

export function SkinListTile(props: SkinListTileProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.ListTile(props)}
    </Show>
  );
}

export function SkinButton(props: SkinButtonProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Button(props)}
    </Show>
  );
}

export function SkinBadge(props: SkinBadgeProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Badge(props)}
    </Show>
  );
}

export function SkinSegmentedControl<T extends string = string>(
  props: SkinSegmentedControlProps<T>,
): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.SegmentedControl(props)}
    </Show>
  );
}

export const SkinTabs = SkinSegmentedControl;

export function SkinSwitch(props: SkinSwitchProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Switch(props)}
    </Show>
  );
}

export function SkinCheckbox(props: SkinCheckboxProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Checkbox(props)}
    </Show>
  );
}

export function SkinRadioGroup(props: SkinRadioGroupProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.RadioGroup(props)}
    </Show>
  );
}

export function SkinInput(props: SkinInputProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Input(props)}
    </Show>
  );
}

export function SkinProgress(props: SkinProgressProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Progress(props)}
    </Show>
  );
}

export function SkinStepper(props: SkinStepperProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Stepper(props)}
    </Show>
  );
}

export function SkinAlert(props: SkinAlertProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Alert(props)}
    </Show>
  );
}

export function SkinToast(props: SkinToastProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Toast(props)}
    </Show>
  );
}

export function SkinDialog(props: SkinDialogProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Dialog(props)}
    </Show>
  );
}

export function SkinSheet(props: SkinSheetProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Sheet(props)}
    </Show>
  );
}

export function SkinMetric(props: SkinMetricProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Metric(props)}
    </Show>
  );
}

export function SkinEmptyState(props: SkinEmptyStateProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.EmptyState(props)}
    </Show>
  );
}

export function SkinAccordion(props: SkinAccordionProps): JSX.Element {
  const ctx = useUiSkin();
  return (
    <Show when={ctx.adapter()} keyed>
      {(active) => active.kit.Accordion(props)}
    </Show>
  );
}

export function SkinParagraph(props: SkinParagraphProps): JSX.Element {
  const { tokens } = useUiSkin();
  return (
    <MobileParagraph
      text={props.text}
      class={props.class ?? "text-xs"}
      style={{
        textColor: props.muted ? tokens().inkMuted : tokens().ink,
        ...props.style,
      }}
    />
  );
}

/** Compact ready-made skin selector bar for instant switching across registered skins. */
export function SkinSwitcherBar(props: {
  showThemeModes?: boolean;
}): JSX.Element {
  const ctx = useUiSkin();
  const skinItems = createMemo(() =>
    ctx.availableSkins().map((entry) => ({
      id: entry.id as string,
      label: entry.label,
    })),
  );
  return (
    <View class="flex-col gap-2 w-full" style={{ minW: 0 }}>
      <SkinSegmentedControl
        items={skinItems()}
        active={ctx.skinId() as string}
        accentActive
        onChange={(id) => ctx.setSkin?.(id)}
      />
      <Show when={props.showThemeModes === true && Boolean(ctx.setMode)}>
        <SkinSegmentedControl
          items={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
            { id: "amber-night", label: "0% Blue Night" },
          ]}
          active={ctx.mode()}
          onChange={(id) => ctx.setMode?.(id as UiSkinThemeMode)}
        />
      </Show>
    </View>
  );
}

export { toMobileColor };
