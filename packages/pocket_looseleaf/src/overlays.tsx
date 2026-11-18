/**
 * @pocket/looseleaf — Feedback, Alerts, Paper-Slip Toasts, Modal Dialogs,
 * Drawers, Side Sheets, Popovers, HoverCards, Tooltips & Accordions.
 */

import { For, Show, createEffect, createSignal, type JSX } from "solid-js";
import { Focusable, Modal, Text, View } from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/solid/lifecycle";
import { MobileParagraph, motionEaseOut, usePresenceTransition } from "@pocket/ui";
import { useLooseleafTheme, type LooseleafStock } from "./tokens.ts";
import { Button } from "./controls.tsx";
import { Avatar } from "./data.tsx";
import { Paper, Tape } from "./surfaces.tsx";

function readLooseleafNodeHeight(node: { id: number } | undefined): number | undefined {
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

export type AlertTone = "default" | "info" | "success" | "warning" | "destructive";

/** Paper callout `<Alert>` slip with ink border and semantic left bar. */
export function Alert(props: {
  title: string;
  description?: string;
  tone?: AlertTone;
  actionLabel?: string;
  onAction?: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const accent = () => {
    const p = palette();
    switch (props.tone) {
      case "destructive":
        return p.red;
      case "success":
        return p.green;
      case "warning":
        return p.tangerine;
      case "info":
        return p.inkYou;
      case "default":
      default:
        return p.marker;
    }
  };
  const stock = (): LooseleafStock =>
    props.tone === "warning" ? "sticky-yellow" : props.tone === "destructive" ? "sticky-pink" : "slip";
  return (
    <Paper stock={stock()} shadow="sheet" tilt={false} paddingClass="relative flex-row items-stretch w-full overflow-hidden">
      <View class="w-[5] shrink-0" style={{ bgColor: accent() }} />
      <View class="flex-col gap-1 p-3 flex-1" style={{ minW: 0 }}>
        <MobileParagraph text={props.title} class="text-sm font-bold" style={{ textColor: palette().ink }} />
        <Show when={Boolean(props.description)}>
          <MobileParagraph text={props.description!} class="text-xs" style={{ textColor: palette().inkSoft }} />
        </Show>
        {props.children}
        <Show when={Boolean(props.actionLabel && props.onAction)}>
          <View class="flex-row justify-end pt-1">
            <Button label={props.actionLabel!} variant="outline" size="xs" onPress={props.onAction} />
          </View>
        </Show>
      </View>
    </Paper>
  );
}

/**
 * Paper-slip `<Toast>` / `<Sonner>` notification with top masking tape
 * ("Each kind is its own paper, so the meaning is not only a color" — Looseleaf `ToastCard`).
 */
export function Toast(props: {
  open: boolean | (() => boolean);
  title: string;
  description?: string;
  tone?: "default" | "success" | "error" | "info";
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);
  const presence = usePresenceTransition(isOpen, { durationMs: 200, animateOnMount: true });
  const stock = (): LooseleafStock => {
    if (props.tone === "success") return "sticky-green";
    if (props.tone === "error") return "sticky-pink";
    if (props.tone === "info") return "sticky-blue";
    return "sticky-yellow";
  };
  return (
    <Show when={presence.mounted()}>
      <View
        class="w-full"
        style={{
          opacity: presence.progress(),
          translateY: (1 - presence.progress()) * -8,
        }}
      >
        <Paper stock={stock()} tape="top" shadow="hard" seed={props.title}>
          <View class="flex-row items-start justify-between gap-2 w-full">
            <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
              <MobileParagraph text={props.title} class="text-sm font-bold" style={{ textColor: palette().ink }} />
              <Show when={Boolean(props.description)}>
                <MobileParagraph text={props.description!} class="text-xs" style={{ textColor: palette().inkSoft }} />
              </Show>
            </View>
            <View class="flex-row items-center gap-1.5 shrink-0">
              <Show when={Boolean(props.actionLabel && props.onAction)}>
                <Button label={props.actionLabel!} variant="outline" size="xs" onPress={props.onAction} />
              </Show>
              <Show when={Boolean(props.onClose)}>
                <Button label="✕" variant="ghost" size="xs" onPress={props.onClose} />
              </Show>
            </View>
          </View>
        </Paper>
      </View>
    </Show>
  );
}

export const Sonner = Toast;

/** Modal paper `<Dialog>` (and `<AlertDialog>`) with masking tape and smoothly fading umber scrim. */
export function Dialog(props: {
  open: boolean | (() => boolean);
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);
  const presence = usePresenceTransition(isOpen, { durationMs: 220 });
  return (
    <Show when={presence.mounted()}>
      <Modal
        open
        backdropClass="bg-transparent"
        class="absolute inset-0 z-50"
        panelClass="absolute inset-0 flex-col items-center justify-center p-4 bg-transparent"
      >
        <View
          class="absolute inset-0 w-full h-full bg-[#15110E]"
          style={{ opacity: presence.progress() * 0.62, hitPass: 1 }}
        />
        <Focusable
          class="flex-1 w-full"
          onPress={() => {
            if (presence.interactive()) props.onClose();
          }}
        >
          <View class="w-full h-full" />
        </Focusable>
        <View
          class="relative w-full max-w-[336] shrink-0"
          style={{
            posType: 0,
            bgColor: palette().card,
            radius: 4,
            opacity: presence.progress(),
            scale: 0.94 + 0.06 * presence.progress(),
          }}
        >
          <Paper stock="card" tape="top" shadow="hard" tilt={false} contour={false}>
            <MobileParagraph text={props.title} class="text-lg font-bold" style={{ textColor: palette().ink }} />
            <Show when={Boolean(props.description)}>
              <MobileParagraph text={props.description!} class="text-xs" style={{ textColor: palette().inkSoft }} />
            </Show>
            {props.children}
            <View class="flex-row items-center justify-end gap-2 w-full pt-2">
              <Button
                label={props.cancelLabel ?? "Cancel"}
                variant="outline"
                size="sm"
                onPress={props.onClose}
              />
              <Show when={Boolean(props.onConfirm || props.confirmLabel)}>
                <Button
                  label={props.confirmLabel ?? "Confirm"}
                  variant={props.destructive ? "destructive" : "primary"}
                  size="sm"
                  onPress={() => {
                    props.onConfirm?.();
                    props.onClose();
                  }}
                />
              </Show>
            </View>
          </Paper>
        </View>
        <Focusable
          class="flex-1 w-full"
          onPress={() => {
            if (presence.interactive()) props.onClose();
          }}
        >
          <View class="w-full h-full" />
        </Focusable>
      </Modal>
    </Show>
  );
}

export const AlertDialog = Dialog;

/** Bottom notebook sheet `<Drawer>` (inline or modal). */
export function Drawer(props: {
  open?: boolean | (() => boolean);
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children?: JSX.Element;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  if (props.open === undefined) {
    return (
      <Paper stock="card" shadow="hard" tilt={false} contour={false}>
        <View class="items-center justify-center w-full pb-1">
          <View class="w-[42] h-[4]" style={{ bgColor: palette().pencilMark, radius: 2 }} />
        </View>
        <MobileParagraph text={props.title} class="text-base font-bold" style={{ textColor: palette().ink }} />
        <Show when={Boolean(props.subtitle)}>
          <MobileParagraph text={props.subtitle!} class="text-xs" style={{ textColor: palette().pencilText }} />
        </Show>
        {props.children}
      </Paper>
    );
  }
  const isOpen = () => (typeof props.open === "function" ? props.open() : Boolean(props.open));
  const presence = usePresenceTransition(isOpen, { durationMs: 260, easing: motionEaseOut });
  let panelNode: { id: number } | undefined;
  const [panelHeight, setPanelHeight] = createSignal(0);
  const syncHeight = (): void => {
    const measured = readLooseleafNodeHeight(panelNode);
    if (measured !== undefined && Math.abs(measured - panelHeight()) >= 1) {
      setPanelHeight(measured);
    }
  };
  createEffect(() => {
    if (!presence.mounted()) setPanelHeight(0);
  });
  try {
    onFrame(syncHeight, {
      active: presence.mounted,
      continuous: false,
    });
  } catch {}
  const travelPx = () => (panelHeight() > 0 ? panelHeight() + 40 : 460);

  return (
    <Show when={presence.mounted()}>
      <Modal
        open
        backdropClass="bg-transparent"
        class="absolute inset-0 z-50"
        panelClass="absolute inset-0 flex-col items-center justify-end p-3 bg-transparent"
      >
        <View
          class="absolute inset-0 w-full h-full bg-[#15110E]"
          style={{ opacity: presence.progress() * 0.62, hitPass: 1 }}
        />
        <Focusable
          class="flex-1 w-full"
          onPress={() => {
            if (presence.interactive()) props.onClose?.();
          }}
        >
          <View class="w-full h-full" />
        </Focusable>
        <View
          ref={(node) => {
            panelNode = node;
            syncHeight();
          }}
          class="relative w-full max-w-[360] shrink-0"
          style={{
            posType: 0,
            bgColor: palette().card,
            radius: 4,
            translateY: Math.round((1 - presence.progress()) * travelPx()),
          }}
        >
          <Paper stock="card" shadow="hard" tilt={false} contour={false}>
            <View class="items-center justify-center w-full">
              <Tape kind="masking" width={54} height={12} angle={-1} />
            </View>
            <View class="flex-row items-start justify-between gap-2 w-full">
              <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
                <MobileParagraph text={props.title} class="text-base font-bold" style={{ textColor: palette().ink }} />
                <Show when={Boolean(props.subtitle)}>
                  <MobileParagraph text={props.subtitle!} class="text-xs" style={{ textColor: palette().pencilText }} />
                </Show>
              </View>
              <Show when={Boolean(props.onClose)}>
                <Button label="Close" variant="outline" size="xs" onPress={props.onClose} />
              </Show>
            </View>
            {props.children}
          </Paper>
        </View>
      </Modal>
    </Show>
  );
}

export const Sheet = Drawer;

/** Toggleable slip `<Popover>`. */
export function Popover(props: {
  triggerLabel: string;
  title?: string;
  children?: JSX.Element;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const [open, setOpen] = createSignal(true);
  return (
    <View class="flex-col gap-2 w-full">
      <View class="flex-row items-center">
        <Button
          label={props.triggerLabel}
          variant="outline"
          size="sm"
          onPress={() => setOpen((o) => !o)}
        />
      </View>
      <Show when={open()}>
        <Paper stock="slip" tape="corner" shadow="hard">
          <Show when={Boolean(props.title)}>
            <MobileParagraph text={props.title!} class="text-sm font-bold" style={{ textColor: palette().ink }} />
          </Show>
          {props.children}
        </Paper>
      </Show>
    </View>
  );
}

/** Author bio `<HoverCard>` on index slip. */
export function HoverCard(props: {
  handle: string;
  bio: string;
  meta?: string;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  return (
    <Paper stock="slip" fastener="clip" shadow="sheet" seed={props.handle}>
      <View class="flex-row items-start gap-3 w-full">
        <Avatar name={props.handle.replace(/^@/, "")} />
        <View class="flex-col gap-0.5 flex-1" style={{ minW: 0 }}>
          <MobileParagraph text={props.handle} class="text-sm font-bold" style={{ textColor: palette().inkYou }} />
          <MobileParagraph text={props.bio} class="text-xs" style={{ textColor: palette().inkSoft }} />
          <Show when={Boolean(props.meta)}>
            <MobileParagraph text={props.meta!} class="text-2xs" style={{ textColor: palette().pencilText }} />
          </Show>
        </View>
      </View>
    </Paper>
  );
}

/** Sticky-note callout `<Tooltip>`. */
export function Tooltip(props: {
  label: string;
  tip: string;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const [shown, setShown] = createSignal(true);
  return (
    <View class="flex-row flex-wrap items-center gap-2">
      <Button label={props.label} variant="outline" size="xs" onPress={() => setShown((s) => !s)} />
      <Show when={shown()}>
        <View
          class="px-2.5 py-1"
          style={{
            bgColor: palette().stickyYellow,
            borderColor: palette().ink,
            borderWidth: 1.5,
            radius: 5,
            rotate: -1.5,
          }}
        >
          <Text class="text-xs font-bold" style={{ textColor: palette().ink }}>
            {props.tip}
          </Text>
        </View>
      </Show>
    </View>
  );
}

export interface AccordionItemData {
  id: string;
  title: string;
  content: string;
}

/** Multi-row ruled `<Accordion>` disclosure list. */
export function Accordion(props: {
  items: readonly AccordionItemData[];
  defaultOpenId?: string;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const [openId, setOpenId] = createSignal<string | undefined>(
    props.defaultOpenId ?? props.items[0]?.id,
  );
  return (
    <Paper stock="paper" shadow="hard" tilt={false}>
      <For each={props.items}>
        {(item, idx) => {
          const expanded = () => openId() === item.id;
          return (
            <View class="flex-col gap-1.5 w-full">
              <Focusable
                onPress={() => setOpenId((cur) => (cur === item.id ? undefined : item.id))}
                class="flex-row items-center justify-between gap-2 py-1 w-full"
              >
                <View class="flex-col flex-1" style={{ minW: 0 }}>
                  <MobileParagraph text={item.title} class="text-sm font-bold" style={{ textColor: palette().ink }} />
                </View>
                <Text class="text-xs font-bold shrink-0" style={{ textColor: palette().inkYou }}>
                  {expanded() ? "▴" : "▾"}
                </Text>
              </Focusable>
              <Show when={expanded()}>
                <MobileParagraph text={item.content} class="text-xs" containerClass="pb-1" style={{ textColor: palette().inkSoft }} />
              </Show>
              <Show when={idx() < props.items.length - 1}>
                <View class="w-full h-[1]" style={{ bgColor: palette().pencilMark, opacity: 0.5 }} />
              </Show>
            </View>
          );
        }}
      </For>
    </Paper>
  );
}

/** Expandable `<Collapsible>` list group. */
export function Collapsible(props: {
  title: string;
  preview: string;
  moreItems: readonly string[];
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const [open, setOpen] = createSignal(false);
  return (
    <View class="flex-col gap-1.5 w-full">
      <View class="flex-row items-center justify-between gap-2 w-full">
        <View class="flex-col flex-1" style={{ minW: 0 }}>
          <MobileParagraph text={props.title} class="text-xs font-bold" style={{ textColor: palette().ink }} />
        </View>
        <Button
          label={open() ? "Fold ▴" : `More (${String(props.moreItems.length)}) ▾`}
          variant="outline"
          size="xs"
          onPress={() => setOpen((o) => !o)}
        />
      </View>
      <Paper stock="slip" shadow="sheet" tilt={false} paddingClass="relative flex-col p-2.5 w-full">
        <MobileParagraph text={props.preview} class="text-xs font-mono" style={{ textColor: palette().inkYou }} />
      </Paper>
      <Show when={open()}>
        <For each={props.moreItems}>
          {(entry) => (
            <Paper stock="slip" shadow="sheet" tilt={false} paddingClass="relative flex-col p-2.5 w-full">
              <MobileParagraph text={entry} class="text-xs font-mono" style={{ textColor: palette().ink }} />
            </Paper>
          )}
        </For>
      </Show>
    </View>
  );
}
