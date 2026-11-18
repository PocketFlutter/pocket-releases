/**
 * @pocket/looseleaf — Pluggable `UiSkinAdapter` for `@pocket/ui/skins`.
 *
 * Maps the unified `UiSkinKit` contract onto Looseleaf's hand-drawn paper,
 * masking tape, felt-tip pen, highlighter marker, and hard umber shadow
 * components so any `<Skin*>` application switches into Looseleaf seamlessly.
 */

import { For, Show, type JSX } from "solid-js";
import { Focusable, Text, View } from "@pocketjs/framework/solid/components";
import {
  MobileParagraph,
  registerUiSkin,
  type UiSkinAccent,
  type UiSkinAdapter,
  type UiSkinThemeMode,
  type UiSkinTokens,
} from "@pocket/ui";
import {
  LooseleafThemeProvider,
  resolveLooseleafPalette,
  useLooseleafTheme,
  type LooseleafDensity,
  type LooseleafThemeMode,
} from "./tokens.ts";
import { LooseleafDeskBackdrop } from "./skins.tsx";
import { Paper, StickyNote } from "./surfaces.tsx";
import {
  Button,
  ButtonGroup,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  Stepper,
  Switch,
} from "./controls.tsx";
import { LooseleafAppBar, LooseleafNavigationBar } from "./navigation.tsx";
import { Badge, Empty, Item, Progress } from "./data.tsx";
import { Alert, Dialog, Drawer, Toast } from "./overlays.tsx";

function toLooseleafMode(mode: UiSkinThemeMode): LooseleafThemeMode {
  if (mode === "amber-night") return "amber-night";
  if (mode === "dark") return "dark";
  return "notebook";
}

function toLooseleafDensity(density: "touch" | "desktop" | "auto"): LooseleafDensity {
  if (density === "desktop") return "compact";
  return "comfortable";
}

export function resolveLooseleafSkinTokens(
  mode: UiSkinThemeMode = "light",
  accent: UiSkinAccent = "coral",
): UiSkinTokens {
  const llMode = toLooseleafMode(mode);
  const p = resolveLooseleafPalette(llMode);
  const accentBg =
    accent === "blue"
      ? p.inkYou
      : accent === "green" || accent === "teal"
        ? p.green
        : accent === "amber"
          ? p.hi
          : accent === "rose"
            ? p.red
            : p.marker;
  const accentFg =
    accent === "amber" || llMode === "amber-night" ? "#1C1000" : "#FFFDF6";
  return {
    id: "looseleaf",
    label: "Looseleaf",
    mode,
    dark: llMode !== "notebook",
    accent,
    canvasBg: p.desk,
    surfaceBg: p.paper,
    surfaceRaisedBg: p.card,
    surfaceMutedBg: p.slip,
    ink: p.ink,
    inkSecondary: p.inkSoft,
    inkMuted: p.pencilText,
    border: p.ink,
    borderStrong: p.ink,
    accentBg,
    accentFg,
    accentSubtleBg: p.paperShade,
    successBg: p.green,
    warningBg: p.hi,
    dangerBg: p.red,
    radiusControl: 4,
    radiusSurface: 6,
    radiusPanel: 8,
  };
}

export const looseleafSkinAdapter: UiSkinAdapter = {
  id: "looseleaf",
  label: "Looseleaf",
  description: "Hand-drawn cream paper, felt-tip pen, highlighter marker & masking tape UI.",
  resolveTokens: resolveLooseleafSkinTokens,
  Provider(props) {
    return (
      <LooseleafThemeProvider
        mode={() => toLooseleafMode(props.mode())}
        density={() =>
          props.reducedMotion() ? "calm" : toLooseleafDensity(props.density())
        }
      >
        {props.children}
      </LooseleafThemeProvider>
    );
  },
  kit: {
    Backdrop(props) {
      const { palette } = useLooseleafTheme();
      return (
        <View
          class="absolute inset-0 w-full h-full"
          style={{ posType: 1, insetT: 0, insetR: 0, insetB: 0, insetL: 0, hitPass: 1 }}
        >
          <LooseleafDeskBackdrop isDark={() => palette().mode !== "notebook"} />
          {props.children}
        </View>
      );
    },
    AppBar(props) {
      return (
        <LooseleafAppBar
          title={props.title}
          subtitle={props.subtitle}
          leading={props.leading}
          trailing={props.trailing}
        />
      );
    },
    NavigationBar(props) {
      return (
        <LooseleafNavigationBar
          active={props.route}
          items={props.items}
          onChange={(id) => props.onNavigate(id as typeof props.route)}
          visible={props.visible}
          geometry={props.geometry}
        />
      );
    },
    Card(props) {
      const { palette } = useLooseleafTheme();
      if (props.variant === "sticky") {
        return (
          <StickyNote
            color="yellow"
            title={props.title}
            pin
            seed={props.title ?? "sticky"}
            onPress={props.onPress}
          >
            <Show when={Boolean(props.detail)}>
              <MobileParagraph
                text={props.detail!}
                class="text-xs"
                style={{ textColor: palette().inkSoft }}
              />
            </Show>
            {props.children}
          </StickyNote>
        );
      }
      const stock = () => {
        if (props.variant === "muted") return "slip" as const;
        if (props.variant === "raised" || props.variant === "accent") return "card" as const;
        return "paper" as const;
      };
      return (
        <Paper
          stock={stock()}
          tape={props.variant === "raised" || props.variant === "accent" ? "top" : false}
          shadow={props.variant === "muted" ? "sheet" : "hard"}
          seed={props.title ?? "card"}
          onPress={props.onPress}
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
                    style={{ textColor: palette().ink }}
                  />
                </Show>
                <Show when={Boolean(props.detail)}>
                  <MobileParagraph
                    text={props.detail!}
                    class="text-xs"
                    style={{ textColor: palette().pencilText }}
                  />
                </Show>
              </View>
              <Show when={Boolean(props.badge) || Boolean(props.trailing)}>
                <View class="flex-row items-center gap-1.5 shrink-0">
                  <Show when={Boolean(props.badge)}>
                    <Badge label={props.badge!} variant="secondary" />
                  </Show>
                  {props.trailing}
                </View>
              </Show>
            </View>
          </Show>
          {props.children}
        </Paper>
      );
    },
    ListTile(props) {
      return (
        <Item
          title={props.title}
          description={props.detail}
          leading={props.leading}
          trailing={props.trailing}
          onPress={props.onPress}
        />
      );
    },
    Button(props) {
      const variant = () => {
        if (props.variant === "danger") return "destructive" as const;
        if (props.variant === "secondary" || props.variant === "tonal") {
          return "secondary" as const;
        }
        if (props.variant === "outline") return "outline" as const;
        if (props.variant === "ghost") return "ghost" as const;
        return "primary" as const;
      };
      return (
        <View class={props.fullWidth ? "w-full" : ""}>
          <Button
            label={props.label}
            variant={variant()}
            size={props.compact ? "sm" : "default"}
            disabled={props.disabled}
            onPress={props.onPress}
          />
        </View>
      );
    },
    Badge(props) {
      const variant = () => {
        if (props.tone === "danger") return "destructive" as const;
        if (props.tone === "warning") return "secondary" as const;
        if (props.tone === "success") return "grass" as const;
        if (props.tone === "info") return "sky" as const;
        if (props.tone === "outline") return "outline" as const;
        if (props.tone === "neutral") return "lemon" as const;
        return "default" as const;
      };
      return <Badge label={props.label} variant={variant()} />;
    },
    SegmentedControl(props) {
      return (
        <ButtonGroup
          items={props.items as readonly { id: string; label: string }[]}
          value={props.active}
          onChange={(id) => props.onChange(id as typeof props.active)}
        />
      );
    },
    Switch(props) {
      return (
        <Switch
          checked={props.value}
          label={props.label}
          detail={props.detail}
          disabled={props.disabled}
          onChange={props.onChange}
        />
      );
    },
    Checkbox(props) {
      return (
        <Checkbox
          checked={props.checked}
          label={props.label}
          disabled={props.disabled}
          onChange={props.onChange}
        />
      );
    },
    RadioGroup(props) {
      return (
        <RadioGroup
          options={props.items}
          value={props.value}
          onChange={(id) => props.onChange(id)}
        />
      );
    },
    Input(props) {
      return (
        <View class="flex-col gap-1.5 w-full" style={{ minW: 0 }}>
          <Show when={Boolean(props.label) || Boolean(props.hint)}>
            <Label text={props.label ?? ""} hint={props.hint} />
          </Show>
          <Input
            value={props.value}
            placeholder={props.placeholder}
            onInput={props.onInput}
            onSubmit={props.onSubmit}
          />
        </View>
      );
    },
    Progress(props) {
      const pct = () => Math.max(0, Math.min(100, Math.round(props.value * 100)));
      const accent = () => {
        if (props.tone === "success") return "green" as const;
        if (props.tone === "accent") return "blue" as const;
        return "marker" as const;
      };
      return <Progress value={pct()} max={100} label={props.label} accent={accent()} />;
    },
    Stepper(props) {
      return (
        <View class="flex-col gap-1.5 w-full" style={{ minW: 0 }}>
          <Show when={Boolean(props.label)}>
            <Label text={props.label!} />
          </Show>
          <Stepper
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
      const tone = () => {
        if (props.tone === "danger") return "destructive" as const;
        if (props.tone === "warning") return "warning" as const;
        if (props.tone === "success") return "success" as const;
        return "info" as const;
      };
      return (
        <Alert
          title={props.title}
          description={props.body}
          tone={tone()}
          actionLabel={props.actionLabel}
          onAction={props.onAction}
        />
      );
    },
    Toast(props) {
      const tone = () => {
        if (props.tone === "danger") return "error" as const;
        if (props.tone === "success") return "success" as const;
        if (props.tone === "info") return "info" as const;
        return "default" as const;
      };
      return (
        <Toast
          open={() => props.open}
          title={props.title}
          description={props.body}
          tone={tone()}
          actionLabel={props.actionLabel}
          onAction={props.onAction}
          onClose={props.onDismiss}
        />
      );
    },
    Dialog(props) {
      return (
        <Dialog
          open={() => props.open}
          title={props.title}
          description={props.body}
          destructive={props.tone === "danger"}
          confirmLabel={props.confirmLabel}
          cancelLabel={props.cancelLabel}
          onConfirm={props.onConfirm}
          onClose={props.onClose}
        >
          {props.children}
        </Dialog>
      );
    },
    Sheet(props) {
      const { palette } = useLooseleafTheme();
      return (
        <Drawer
          open={() => props.open}
          title={props.title}
          subtitle={props.subtitle}
          onClose={props.onClose}
        >
          <Show when={Boolean(props.actions?.length)}>
            <View class="flex-col gap-2 w-full">
              <For each={props.actions ?? []}>
                {(action) => (
                  <Paper
                    stock="slip"
                    shadow="sheet"
                    tilt={false}
                    onPress={() => {
                      props.onSelectAction?.(action.id);
                      props.onClose();
                    }}
                  >
                    <MobileParagraph
                      text={action.label}
                      class="text-sm font-bold"
                      style={{
                        textColor:
                          action.tone === "danger" ? palette().red : palette().ink,
                      }}
                    />
                    <Show when={Boolean(action.detail)}>
                      <MobileParagraph
                        text={action.detail!}
                        class="text-xs"
                        style={{ textColor: palette().pencilText }}
                      />
                    </Show>
                  </Paper>
                )}
              </For>
            </View>
          </Show>
          {props.children}
        </Drawer>
      );
    },
    Metric(props) {
      const { palette } = useLooseleafTheme();
      const valColor = () => {
        if (props.tone === "danger") return palette().red;
        if (props.tone === "success") return palette().green;
        if (props.tone === "accent") return palette().inkYou;
        return palette().ink;
      };
      return (
        <View class="flex-1" style={{ minW: 0 }}>
          <Paper stock="card" shadow="hard" seed={props.label}>
            <MobileParagraph
              text={props.label}
              class="text-xs font-mono"
              style={{ textColor: palette().pencilText }}
            />
            <Text class="text-2xl font-bold" style={{ textColor: valColor() }}>
              {props.value}
            </Text>
            <Show when={Boolean(props.detail)}>
              <MobileParagraph
                text={props.detail!}
                class="text-2xs"
                style={{ textColor: palette().pencilText }}
              />
            </Show>
          </Paper>
        </View>
      );
    },
    EmptyState(props) {
      return (
        <Empty
          title={props.title}
          description={props.detail}
          actionLabel={props.actionLabel}
          onAction={props.onAction}
        />
      );
    },
    Accordion(props) {
      const { palette } = useLooseleafTheme();
      return (
        <Paper stock="slip" shadow="sheet" tilt={false}>
          <Focusable
            onPress={props.onToggle}
            class="flex-row items-center justify-between gap-2 w-full"
          >
            <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
              <MobileParagraph
                text={props.title}
                class="text-sm font-bold"
                style={{ textColor: palette().ink }}
              />
              <Show when={Boolean(props.detail)}>
                <MobileParagraph
                  text={props.detail!}
                  class="text-xs"
                  style={{ textColor: palette().pencilText }}
                />
              </Show>
            </View>
            <Show when={Boolean(props.badge)}>
              <Badge label={props.badge!} variant="outline" />
            </Show>
            <Text
              class="text-xs font-mono font-bold shrink-0"
              style={{ textColor: palette().inkYou }}
            >
              {props.expanded ? "−" : "+"}
            </Text>
          </Focusable>
          <Show when={props.expanded}>{props.children}</Show>
        </Paper>
      );
    },
  },
};

/** Register `@pocket/looseleaf` into `@pocket/ui`'s global skin registry. */
export function registerLooseleafSkin(): UiSkinAdapter {
  return registerUiSkin(looseleafSkinAdapter);
}
