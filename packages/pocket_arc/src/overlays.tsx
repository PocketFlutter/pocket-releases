import { Show, createEffect, createSignal, untrack, type JSX } from "solid-js";
import { Focusable, Modal, View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/solid/lifecycle";
import { MobileParagraph } from "@pocket/ui";
import { createArcSpring } from "./motion.ts";
import { resolveArcPalette, useArcTheme, type ArcThemeMode } from "./tokens.ts";
import { ArcActionButton, ArcSurface } from "./skins.tsx";

function resolveOverlayMode(
  isDark: boolean | undefined,
  ctxMode: ArcThemeMode,
): ArcThemeMode {
  if (isDark === undefined) return ctxMode;
  if (!isDark) return "light";
  return ctxMode === "amber-night" ? "amber-night" : "dark";
}

function readOverlayNodeHeight(node: { id: number } | undefined): number | undefined {
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

function useRetainedMessage(source: () => string | null): () => string {
  const [cached, setCached] = createSignal(untrack(source) ?? "");
  createEffect(() => {
    const val = source();
    if (typeof val === "string" && val.length > 0) {
      setCached(val);
    }
  });
  return cached;
}

/** Calm rising & dismissing Arc Toast (`@uiarc/toast`) with symmetric spring presence & `hitPass: 1`. */
export function ArcToast(props: {
  message: () => string | null;
  isDark?: boolean;
  bottomOffset?: number;
}): JSX.Element {
  const ctx = useArcTheme();
  const visible = () => Boolean(props.message());
  const text = useRetainedMessage(props.message);
  const presence = createArcSpring(() => (visible() ? 1 : 0), {
    preset: "snappy",
    reducedMotion: ctx.reducedMotion,
  });
  const pal = () =>
    resolveArcPalette(resolveOverlayMode(props.isDark, ctx.mode()), ctx.accent());

  return (
    <Show when={visible() || presence() > 0.01}>
      <View
        class="absolute left-4 right-4 z-50"
        style={{
          posType: 1,
          insetL: 16,
          insetR: 16,
          insetB: props.bottomOffset ?? 102,
          opacity: Math.max(0, Math.min(1, presence())),
          translateY: (1 - presence()) * 16,
          hitPass: 1,
        }}
      >
        <View
          class="relative w-full px-3.5 py-2.5 flex-row items-center justify-between gap-2"
          style={{
            posType: 0,
            bgColor: pal().surfaceRaised,
            borderColor: pal().borderStrong,
            borderWidth: 1,
            radius: pal().radiusControl + 2,
            hitPass: 1,
          }}
        >
          <View
            class="w-2 h-2 shrink-0"
            style={{ bgColor: pal().accent, radius: 999, hitPass: 1 }}
          />
          <View class="flex-col flex-1" style={{ minW: 0, hitPass: 1 }}>
            <MobileParagraph
              text={text()}
              class="text-xs font-bold"
              style={{ textColor: pal().foreground, hitPass: 1 }}
              containerStyle={{ hitPass: 1 }}
              fallbackInsetPx={72}
            />
          </View>
        </View>
      </View>
    </Show>
  );
}

/** Concentric `22px` Arc modal dialog with focus-isolated Modal, fading scrim & spring card. */
export function ArcDialog(props: {
  open: boolean | (() => boolean);
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDark?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const ctx = useArcTheme();
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);
  const presence = createArcSpring(() => (isOpen() ? 1 : 0), {
    preset: "calm",
    reducedMotion: ctx.reducedMotion,
  });
  const pal = () =>
    resolveArcPalette(resolveOverlayMode(props.isDark, ctx.mode()), ctx.accent());
  const clampedPresence = () => Math.max(0, Math.min(1, presence()));

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
            bgColor: pal().surfaceScrim,
            opacity: clampedPresence(),
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
            opacity: clampedPresence(),
            scale: 0.94 + 0.06 * clampedPresence(),
            translateY: (1 - clampedPresence()) * 10,
          }}
        >
          <ArcSurface
            variant="raised"
            isDark={props.isDark}
            radius={pal().radiusPanel}
            class="relative w-full max-w-[360] p-4 flex-col gap-3"
            style={{ bgColor: pal().surfaceRaised }}
          >
            <View class="flex-col gap-1 w-full" style={{ minW: 0 }}>
              <MobileParagraph
                text={props.title}
                class="text-base font-bold"
                style={{ textColor: pal().foreground }}
                fallbackInsetPx={64}
              />
              <Show when={Boolean(props.description)}>
                <MobileParagraph
                  text={props.description ?? ""}
                  class="text-xs"
                  style={{ textColor: pal().textSecondary }}
                  fallbackInsetPx={64}
                />
              </Show>
            </View>
            {props.children}
            <View class="flex-row items-center justify-end gap-2 w-full">
              <ArcActionButton
                variant="secondary"
                isDark={props.isDark}
                label={props.cancelLabel ?? "取消"}
                onPress={props.onClose}
              />
              <Show when={Boolean(props.onConfirm || props.confirmLabel)}>
                <ArcActionButton
                  variant="primary"
                  isDark={props.isDark}
                  label={props.confirmLabel ?? "确定"}
                  onPress={() => {
                    props.onConfirm?.();
                    props.onClose();
                  }}
                />
              </Show>
            </View>
          </ArcSurface>
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

/** Concentric `22px` Arc bottom sheet with focus-isolated Modal, measured height & opaque bottom-up slide. */
export function ArcBottomSheet(props: {
  open: boolean | (() => boolean);
  title: string;
  subtitle?: string;
  isDark?: boolean;
  bottomPadding?: number;
  onClose: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const ctx = useArcTheme();
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);
  const presence = createArcSpring(() => (isOpen() ? 1 : 0), {
    preset: "calm",
    reducedMotion: ctx.reducedMotion,
  });
  const pal = () =>
    resolveArcPalette(resolveOverlayMode(props.isDark, ctx.mode()), ctx.accent());
  const mounted = () => isOpen() || presence() > 0.005;

  let panelNode: { id: number } | undefined;
  const [panelHeight, setPanelHeight] = createSignal(0);
  const syncHeight = (): void => {
    const measured = readOverlayNodeHeight(panelNode);
    if (measured !== undefined && Math.abs(measured - panelHeight()) >= 1) {
      setPanelHeight(measured);
    }
  };
  createEffect(() => {
    if (!mounted()) setPanelHeight(0);
  });
  try {
    onFrame(syncHeight, {
      active: mounted,
      continuous: false,
    });
  } catch {}

  const bottomPad = () => props.bottomPadding ?? 24;
  const travelPx = () => (panelHeight() > 0 ? panelHeight() + bottomPad() + 28 : 520);
  const clampedPresence = () => Math.max(0, Math.min(1, presence()));
  const slideOffsetPx = () => Math.round((1 - clampedPresence()) * travelPx());

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
            bgColor: pal().surfaceScrim,
            opacity: clampedPresence(),
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
          <ArcSurface
            variant="raised"
            isDark={props.isDark}
            radius={pal().radiusPanel}
            class="relative w-full max-w-[380] p-4 flex-col gap-3"
            style={{ bgColor: pal().surfaceRaised }}
          >
            <View class="w-full items-center justify-center pb-0.5">
              <Focusable onPress={props.onClose}>
                <View
                  class="w-9 h-1"
                  style={{ bgColor: pal().borderStrong, radius: 999 }}
                />
              </Focusable>
            </View>
            <View class="flex-col gap-0.5 w-full" style={{ minW: 0 }}>
              <MobileParagraph
                text={props.title}
                class="text-base font-bold"
                style={{ textColor: pal().foreground }}
                fallbackInsetPx={56}
              />
              <Show when={Boolean(props.subtitle)}>
                <MobileParagraph
                  text={props.subtitle ?? ""}
                  class="text-2xs"
                  style={{ textColor: pal().textSecondary }}
                  fallbackInsetPx={56}
                />
              </Show>
            </View>
            {props.children}
          </ArcSurface>
        </View>
      </Modal>
    </Show>
  );
}

export { ArcDialog as Dialog, ArcBottomSheet as BottomSheet, ArcSurface as Alert };
