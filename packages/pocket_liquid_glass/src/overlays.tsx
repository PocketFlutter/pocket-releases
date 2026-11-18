/**
 * @pocket/liquid_glass — Focus-Isolated Glass Modals, Bottom Sheets, Alerts & Toasts.
 *
 * Follows PocketJS overlay physics & accessibility rules:
 * - `LiquidGlassDialog` & `LiquidGlassSheet` wrap inside focus-isolated `<Modal>` with a
 *   separated fading scrim so the sheet/dialog body stays crisp and legible (`thick` glass
 *   material with `priority="critical"`).
 * - `LiquidGlassSheet` measures its own dynamic layout height (`pocket.getLayout`) to slide
 *   smoothly from the bottom edge via critically damped `sheet` spring without bottom-edge gap.
 */

import { For, Show, createEffect, createSignal, untrack, type JSX } from "solid-js";
import { Focusable, Modal, Text, View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/solid/lifecycle";
import { MobileParagraph } from "@pocket/ui";
import { LiquidGlassButton } from "./controls.tsx";
import { LiquidGlassListTile } from "./navigation.tsx";
import { createGlassSpring } from "./motion.ts";
import { LiquidGlassSurface, useLiquidGlass } from "./surfaces.tsx";

function readSheetNodeHeight(node: { id: number } | undefined): number | undefined {
  const getLayout = (
    globalThis as typeof globalThis & {
      pocket?: { getLayout?: (id: number) => unknown };
    }
  ).pocket?.getLayout;
  if (!node || typeof getLayout !== "function") return undefined;
  try {
    const raw = getLayout(node.id) as { height?: unknown; h?: unknown } | undefined;
    const h = Number(raw?.height ?? raw?.h ?? 0);
    return Number.isFinite(h) && h > 0 ? h : undefined;
  } catch {
    return undefined;
  }
}

function useRetainedCopy(source: () => string | null): () => string {
  const [cached, setCached] = createSignal(untrack(source) ?? "");
  createEffect(() => {
    const v = source();
    if (typeof v === "string" && v.length > 0) setCached(v);
  });
  return cached;
}

/** Semantic Liquid Glass inline callout banner. */
export function LiquidGlassAlert(props: {
  title: string;
  body?: string;
  tone?: "info" | "success" | "warning" | "danger";
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const triplet = () => {
    const p = ctx.palette();
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
        radius: ctx.palette().radiusSurface,
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
              style={{ textColor: ctx.palette().inkSecondary }}
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
          <LiquidGlassButton
            label={props.actionLabel!}
            variant={props.tone === "danger" ? "danger" : "glass"}
            compact
            onPress={props.onAction}
          />
        </View>
      </Show>
    </View>
  );
}

/** Floating capsule Liquid Glass Toast (`priority="high"`). */
export function LiquidGlassToast(props: {
  open: boolean | (() => boolean);
  title: string;
  body?: string;
  tone?: "info" | "success" | "warning" | "danger";
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  bottomOffset?: number;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);
  const messageSource = () =>
    !isOpen() ? null : props.body ? `${props.title} · ${props.body}` : props.title;
  const copy = useRetainedCopy(messageSource);

  const presence = createGlassSpring(() => (isOpen() ? 1 : 0), {
    preset: "tactile",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.01,
  });

  const dotColor = () => {
    const p = ctx.palette();
    if (props.tone === "danger") return p.danger.solid;
    if (props.tone === "warning") return p.warning.solid;
    if (props.tone === "success") return p.success.solid;
    return p.accentHex;
  };

  return (
    <Show when={isOpen() || presence() > 0.01}>
      <View
        class="absolute left-4 right-4 z-50"
        style={{
          posType: 1,
          insetL: 16,
          insetR: 16,
          insetB: props.bottomOffset ?? 96,
          opacity: Math.max(0, Math.min(1, presence())),
          translateY: Math.round((1 - presence()) * 18),
          hitPass: props.onAction || props.onDismiss ? 0 : 1,
        }}
      >
        <LiquidGlassSurface
          material="regular"
          priority="high"
          shape="pill"
          radius={999}
          class="relative flex-col w-full"
          contentClass="relative flex-row items-center justify-between gap-2.5 px-4 py-2.5 w-full"
        >
          <View
            class="w-[8] h-[8] shrink-0"
            style={{ width: 8, height: 8, bgColor: dotColor(), radius: 999 }}
          />
          <View class="flex-col flex-1" style={{ minW: 0 }}>
            <MobileParagraph
              text={copy()}
              class="text-xs font-bold"
              style={{ textColor: ctx.palette().ink }}
              fallbackInsetPx={96}
            />
          </View>
          <Show when={Boolean(props.actionLabel) && Boolean(props.onAction)}>
            <LiquidGlassButton
              label={props.actionLabel!}
              variant="secondary"
              compact
              onPress={props.onAction}
            />
          </Show>
          <Show when={Boolean(props.onDismiss)}>
            <Focusable onPress={props.onDismiss} class="px-1.5 py-0.5 shrink-0">
              <Text
                class="text-xs font-bold"
                style={{ textColor: ctx.palette().inkMuted }}
              >
                ✕
              </Text>
            </Focusable>
          </Show>
        </LiquidGlassSurface>
      </View>
    </Show>
  );
}

/** Focus-isolated centered `thick` Liquid Glass Modal Dialog (`priority="critical"`). */
export function LiquidGlassDialog(props: {
  open: boolean | (() => boolean);
  title: string;
  body?: string;
  tone?: "default" | "danger";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);
  const presence = createGlassSpring(() => (isOpen() ? 1 : 0), {
    preset: "sheet",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.01,
  });
  const clamped = () => Math.max(0, Math.min(1, presence()));

  return (
    <Show when={isOpen() || presence() > 0.01}>
      <Modal
        open
        backdropClass="bg-transparent"
        class="absolute inset-0 z-50"
        panelClass="absolute inset-0 flex-col items-center justify-center px-4 bg-transparent"
      >
        <View
          class="absolute inset-0 w-full h-full"
          style={{
            posType: 1,
            insetT: 0,
            insetR: 0,
            insetB: 0,
            insetL: 0,
            bgColor: ctx.palette().scrim,
            opacity: clamped(),
            hitPass: 1,
          }}
        />
        <Focusable
          class="flex-1 w-full"
          onPress={() => {
            if (isOpen()) props.onClose();
          }}
        >
          <View class="w-full h-full" />
        </Focusable>

        <View
          class="w-full shrink-0 items-center justify-center"
          style={{
            opacity: clamped(),
            scale: 0.94 + 0.06 * clamped(),
            translateY: Math.round((1 - clamped()) * 12),
          }}
        >
          <LiquidGlassSurface
            material="thick"
            priority="critical"
            shape="rounded"
            radius={ctx.palette().radiusPanel}
            class="relative w-full max-w-[360] flex-col"
            contentClass="relative flex-col gap-3.5 p-4 w-full"
          >
            <View class="flex-col gap-1 w-full" style={{ minW: 0 }}>
              <MobileParagraph
                text={props.title}
                class="text-base font-bold"
                style={{ textColor: ctx.palette().ink }}
                fallbackInsetPx={64}
              />
              <Show when={Boolean(props.body)}>
                <MobileParagraph
                  text={props.body!}
                  class="text-xs"
                  style={{ textColor: ctx.palette().inkSecondary }}
                  fallbackInsetPx={64}
                />
              </Show>
            </View>
            {props.children}
            <View class="flex-row items-center justify-end gap-2 w-full">
              <LiquidGlassButton
                label={props.cancelLabel ?? "Cancel"}
                variant="outline"
                compact
                onPress={props.onClose}
              />
              <Show when={Boolean(props.onConfirm || props.confirmLabel)}>
                <LiquidGlassButton
                  label={props.confirmLabel ?? "Confirm"}
                  variant={props.tone === "danger" ? "danger" : "primary"}
                  compact
                  onPress={() => {
                    props.onConfirm?.();
                    props.onClose();
                  }}
                />
              </Show>
            </View>
          </LiquidGlassSurface>
        </View>

        <Focusable
          class="flex-1 w-full"
          onPress={() => {
            if (isOpen()) props.onClose();
          }}
        >
          <View class="w-full h-full" />
        </Focusable>
      </Modal>
    </Show>
  );
}

export interface LiquidGlassSheetAction {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly tone?: "default" | "danger";
}

/**
 * Focus-isolated Bottom Action Sheet (`thick` Liquid Glass, `priority="critical"`):
 * Separates the fading backdrop scrim from the bottom-up sliding panel whose travel
 * distance adapts dynamically via `pocket.getLayout`.
 */
export function LiquidGlassSheet(props: {
  open: boolean | (() => boolean);
  title: string;
  subtitle?: string;
  actions?: readonly LiquidGlassSheetAction[];
  onSelectAction?: (id: string) => void;
  bottomPadding?: number;
  onClose: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);
  const presence = createGlassSpring(() => (isOpen() ? 1 : 0), {
    preset: "sheet",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.005,
  });
  const mounted = () => isOpen() || presence() > 0.005;

  let panelNode: { id: number } | undefined;
  const [panelHeight, setPanelHeight] = createSignal(0);

  const syncHeight = (): void => {
    const measured = readSheetNodeHeight(panelNode);
    if (measured !== undefined && Math.abs(measured - panelHeight()) >= 1) {
      setPanelHeight(measured);
    }
  };

  createEffect(() => {
    if (!mounted()) setPanelHeight(0);
  });

  try {
    onFrame(syncHeight, { active: mounted, continuous: false });
  } catch {}

  const bottomPad = () => props.bottomPadding ?? 24;
  const travelPx = () => (panelHeight() > 0 ? panelHeight() + bottomPad() + 28 : 520);
  const clamped = () => Math.max(0, Math.min(1, presence()));
  const slideOffsetPx = () => Math.round((1 - clamped()) * travelPx());

  return (
    <Show when={mounted()}>
      <Modal
        open
        backdropClass="bg-transparent"
        class="absolute inset-0 z-50"
        panelClass="absolute inset-0 flex-col justify-end px-3 bg-transparent"
      >
        <View
          class="absolute inset-0 w-full h-full"
          style={{
            posType: 1,
            insetT: 0,
            insetR: 0,
            insetB: 0,
            insetL: 0,
            bgColor: ctx.palette().scrim,
            opacity: clamped(),
            hitPass: 1,
          }}
        />
        <Focusable
          class="flex-1 w-full"
          onPress={() => {
            if (isOpen()) props.onClose();
          }}
        >
          <View class="w-full h-full" />
        </Focusable>

        <View
          ref={(node) => {
            panelNode = node;
            syncHeight();
          }}
          class="w-full shrink-0 items-center"
          style={{
            paddingB: bottomPad(),
            translateY: slideOffsetPx(),
          }}
        >
          <LiquidGlassSurface
            material="thick"
            priority="critical"
            shape="rounded"
            radius={ctx.palette().radiusPanel}
            class="relative w-full max-w-[384] flex-col"
            contentClass="relative flex-col gap-3 p-4 w-full"
          >
            <View class="w-full items-center justify-center pb-0.5">
              <Focusable onPress={props.onClose}>
                <View
                  class="w-[38] h-[4]"
                  style={{
                    width: 38,
                    height: 4,
                    bgColor: ctx.palette().inkMuted,
                    opacity: 0.65,
                    radius: 999,
                  }}
                />
              </Focusable>
            </View>

            <View class="flex-col gap-0.5 w-full" style={{ minW: 0 }}>
              <MobileParagraph
                text={props.title}
                class="text-base font-bold"
                style={{ textColor: ctx.palette().ink }}
                fallbackInsetPx={56}
              />
              <Show when={Boolean(props.subtitle)}>
                <MobileParagraph
                  text={props.subtitle!}
                  class="text-xs"
                  style={{ textColor: ctx.palette().inkSecondary }}
                  fallbackInsetPx={56}
                />
              </Show>
            </View>

            <Show when={Boolean(props.actions?.length)}>
              <View class="flex-col gap-2 w-full">
                <For each={props.actions ?? []}>
                  {(action) => (
                    <LiquidGlassListTile
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
          </LiquidGlassSurface>
        </View>
      </Modal>
    </Show>
  );
}
