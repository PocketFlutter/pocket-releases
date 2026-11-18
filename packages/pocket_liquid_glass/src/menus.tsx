/**
 * @pocket/liquid_glass — Morphing Menus, Submenus, Context Menus, Popovers & Scrubbable Alerts.
 *
 * Implements the iOS 26 UIKit Liquid Morph & Continuous Selection architecture:
 * - `LiquidGlassMenu` & `LiquidGlassMenuButton`: True trigger-to-platter liquid morphing
 *   (`scaleX`, `scaleY`, `translateX`, `translateY`, dynamic corner radius `999 -> 22`, and
 *   `OpacityPair` crossfade from source pill to refractive glass platter), rubber-band
 *   `FlexInteraction` over-drag on open platters, continuous press-drag-release scrubbing
 *   (`ActionScrubbingHandoff` + `ContinuousSelection`) with spring-gliding highlight row,
 *   inline expanding submenus, and `DeferredMenuElement` async items.
 * - `LiquidGlassContextMenu`: Lifts a target preview card above a frosted/dimmed backdrop
 *   and morphs an anchored glass action platter with submenus & scrub selection.
 * - `LiquidGlassPopover`: Anchored morphing glass popover for custom inspector content.
 * - `LiquidGlassAlertModal`: iOS 26 `Alert glass group` centered platter supporting
 *   side-by-side (2 short actions) or stacked (3+ / long actions) layouts and continuous
 *   finger press-and-scrub selection across alert actions.
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
import {
  Focusable,
  Modal,
  Text,
  View,
  type NodeMirror,
} from "@pocketjs/framework/solid/components";
import { onFrame } from "@pocketjs/framework/solid/lifecycle";
import {
  MobileParagraph,
  SafeAreaScaffoldContext,
  ScrollablePageContext,
  useRouteActive,
} from "@pocket/ui";
import { resolveNodeLocalPoint } from "@pocket/ui/fast";
import { createGlassSpring, quantizeOptical } from "./motion.ts";
import {
  LiquidGlassSurface,
  useInLiquidGlassGroup,
  useLiquidGlass,
} from "./surfaces.tsx";

export interface LiquidGlassAnchorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LiquidGlassMenuItem {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly icon?: string;
  readonly shortcut?: string;
  readonly checked?: boolean;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly keepOpen?: boolean;
  /** Inline expanding submenu items (`Context menu submenu list`). */
  readonly children?: readonly LiquidGlassMenuItem[];
  /** Deferred dynamic submenu loader (`DeferredMenuElement`). */
  readonly deferred?: () =>
    | readonly LiquidGlassMenuItem[]
    | Promise<readonly LiquidGlassMenuItem[]>;
  readonly onSelect?: () => void;
}

export interface LiquidGlassMenuSection {
  readonly id?: string;
  readonly title?: string;
  readonly items: readonly LiquidGlassMenuItem[];
}

export type LiquidGlassMenuEntry = LiquidGlassMenuItem | LiquidGlassMenuSection;

function isMenuSection(entry: LiquidGlassMenuEntry): entry is LiquidGlassMenuSection {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "items" in entry &&
    Array.isArray((entry as LiquidGlassMenuSection).items)
  );
}

export function normalizeMenuSections(
  entries: readonly LiquidGlassMenuEntry[],
): LiquidGlassMenuSection[] {
  const sections: LiquidGlassMenuSection[] = [];
  let loose: LiquidGlassMenuItem[] = [];
  for (const entry of entries) {
    if (isMenuSection(entry)) {
      if (loose.length > 0) {
        sections.push({ items: loose });
        loose = [];
      }
      sections.push(entry);
    } else {
      loose.push(entry);
    }
  }
  if (loose.length > 0) sections.push({ items: loose });
  return sections;
}

export function measureViewportRect(
  node: { id: number } | undefined,
  scrollPage?: {
    visualRect?: (
      target: { id: number },
      rect: { x: number; y: number; width: number; height: number },
    ) => { x: number; y: number; width: number; height: number } | undefined;
  } | null,
): LiquidGlassAnchorRect | undefined {
  if (!node) return undefined;
  const getLayout = (
    globalThis as typeof globalThis & {
      pocket?: { getLayout?: (id: number) => unknown };
    }
  ).pocket?.getLayout;
  if (typeof getLayout !== "function") return undefined;
  try {
    const raw = getLayout(node.id) as
      | { x?: unknown; y?: unknown; width?: unknown; w?: unknown; height?: unknown; h?: unknown }
      | undefined;
    if (!raw) return undefined;
    const x = Number(raw.x ?? 0);
    const y = Number(raw.y ?? 0);
    const width = Number(raw.width ?? raw.w ?? 0);
    const height = Number(raw.height ?? raw.h ?? 0);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 2 || height <= 2) {
      return undefined;
    }
    const base = { x, y, width, height };
    const visual = scrollPage?.visualRect?.(node, base);
    return visual ?? base;
  } catch {
    return undefined;
  }
}

interface FlatMenuRow {
  readonly key: string;
  readonly kind: "header" | "back" | "item" | "loading";
  readonly sectionIndex: number;
  readonly y: number;
  readonly height: number;
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: string;
  readonly shortcut?: string;
  readonly checked?: boolean;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly hasSubmenu?: boolean;
  readonly item?: LiquidGlassMenuItem;
  readonly showTopDivider?: boolean;
}

const MENU_ROW_HEIGHT = 42;
const MENU_SUBTITLE_ROW_HEIGHT = 52;
const MENU_SECTION_HEADER_HEIGHT = 26;
const MENU_BACK_HEADER_HEIGHT = 40;
const MENU_PAD_Y = 6;

function buildFlatMenuRows(
  sections: readonly LiquidGlassMenuSection[],
  submenuStack: readonly { title: string; items: readonly LiquidGlassMenuItem[]; loading?: boolean }[],
): { rows: FlatMenuRow[]; totalHeight: number } {
  const rows: FlatMenuRow[] = [];
  let cursorY = MENU_PAD_Y;

  if (submenuStack.length > 0) {
    const activeSub = submenuStack[submenuStack.length - 1]!;
    rows.push({
      key: `back-${submenuStack.length}`,
      kind: "back",
      sectionIndex: 0,
      y: cursorY,
      height: MENU_BACK_HEADER_HEIGHT,
      title: activeSub.title,
      icon: "‹",
    });
    cursorY += MENU_BACK_HEADER_HEIGHT;

    if (activeSub.loading) {
      rows.push({
        key: "deferred-loading",
        kind: "loading",
        sectionIndex: 0,
        y: cursorY,
        height: MENU_ROW_HEIGHT,
        title: "Loading…",
        disabled: true,
        showTopDivider: true,
      });
      cursorY += MENU_ROW_HEIGHT;
    } else {
      activeSub.items.forEach((item, idx) => {
        const h = item.subtitle ? MENU_SUBTITLE_ROW_HEIGHT : MENU_ROW_HEIGHT;
        rows.push({
          key: `sub-${submenuStack.length}-${item.id}`,
          kind: "item",
          sectionIndex: 0,
          y: cursorY,
          height: h,
          title: item.label,
          subtitle: item.subtitle,
          icon: item.icon,
          shortcut: item.shortcut,
          checked: item.checked,
          destructive: item.destructive,
          disabled: item.disabled,
          hasSubmenu: Boolean(item.children?.length || item.deferred),
          item,
          showTopDivider: idx === 0 || idx > 0,
        });
        cursorY += h;
      });
    }
    return { rows, totalHeight: cursorY + MENU_PAD_Y };
  }

  sections.forEach((sec, sIdx) => {
    if (sIdx > 0) {
      cursorY += 6;
    }
    if (sec.title) {
      rows.push({
        key: `hdr-${sIdx}-${sec.title}`,
        kind: "header",
        sectionIndex: sIdx,
        y: cursorY,
        height: MENU_SECTION_HEADER_HEIGHT,
        title: sec.title,
        disabled: true,
        showTopDivider: sIdx > 0,
      });
      cursorY += MENU_SECTION_HEADER_HEIGHT;
    }
    sec.items.forEach((item, iIdx) => {
      const h = item.subtitle ? MENU_SUBTITLE_ROW_HEIGHT : MENU_ROW_HEIGHT;
      rows.push({
        key: `sec-${sIdx}-${item.id}`,
        kind: "item",
        sectionIndex: sIdx,
        y: cursorY,
        height: h,
        title: item.label,
        subtitle: item.subtitle,
        icon: item.icon,
        shortcut: item.shortcut,
        checked: item.checked,
        destructive: item.destructive,
        disabled: item.disabled,
        hasSubmenu: Boolean(item.children?.length || item.deferred),
        item,
        showTopDivider: iIdx > 0 || (sIdx > 0 && !sec.title),
      });
      cursorY += h;
    });
  });

  return { rows, totalHeight: Math.max(52, cursorY + MENU_PAD_Y) };
}

/**
 * Anchored Morphing Liquid Glass Menu (`UIMenu` + `LiquidMorphAnimationContext` parity).
 *
 * Morphs seamlessly from `anchor` (trigger pill rect) into a floating `regular` / `thick`
 * refractive Liquid Glass platter, supporting:
 * - Intermediate pill-to-platter scale, position & corner-radius morphing (`999 -> 22`)
 * - Continuous finger press-and-scrub selection with a spring-gliding highlight capsule
 * - Inline expanding Submenus (`children` & `deferred` async loaders)
 * - Rubber-band `FlexInteraction` platter pull when dragging past bounds
 */
export function LiquidGlassMenu(props: {
  open: boolean | (() => boolean);
  entries: readonly LiquidGlassMenuEntry[];
  anchor?: LiquidGlassAnchorRect | (() => LiquidGlassAnchorRect | undefined);
  title?: string;
  align?: "start" | "end" | "center";
  placement?: "below" | "above" | "auto";
  width?: number;
  /** Optional externally driven scrub viewport coordinates (for trigger press-drag handoff). */
  handoffPointer?: () => { x: number; y: number; active: boolean } | undefined;
  onSelect?: (item: LiquidGlassMenuItem) => void;
  onClose: () => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const scaffold = useContext(SafeAreaScaffoldContext);
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);

  const [submenuStack, setSubmenuStack] = createSignal<
    { title: string; items: readonly LiquidGlassMenuItem[]; loading?: boolean }[]
  >([]);
  const [hoveredKey, setHoveredKey] = createSignal<string | null>(null);
  const [flexOffset, setFlexOffset] = createSignal({ x: 0, y: 0 });

  let platterNode: NodeMirror | undefined;
  let disposed = false;
  onCleanup(() => { disposed = true; });

  // Reset submenu stack & hover state whenever menu closes
  createEffect(() => {
    if (!isOpen()) {
      setSubmenuStack([]);
      setHoveredKey(null);
      setFlexOffset({ x: 0, y: 0 });
    }
  });

  const morph = createGlassSpring(() => (isOpen() ? 1 : 0), {
    preset: "morph",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.005,
  });

  const mounted = () => isOpen() || morph() > 0.01;

  const sections = createMemo(() => {
    const normalized = normalizeMenuSections(props.entries);
    if (props.title && normalized.length > 0 && !normalized[0]!.title) {
      return [
        { ...normalized[0]!, title: props.title },
        ...normalized.slice(1),
      ];
    }
    return normalized;
  });

  const layoutModel = createMemo(() => buildFlatMenuRows(sections(), submenuStack()));

  const animatedHeight = createGlassSpring(() => layoutModel().totalHeight, {
    preset: "snappy",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.5,
  });

  const viewportSize = () => {
    const g = scaffold.geometry();
    return {
      w: g.width > 0 ? g.width : 390,
      h: g.height > 0 ? g.height : 844,
    };
  };

  const resolvedAnchor = (): LiquidGlassAnchorRect => {
    const raw = typeof props.anchor === "function" ? props.anchor() : props.anchor;
    if (raw && raw.width > 0 && raw.height > 0) return raw;
    const vp = viewportSize();
    return { x: vp.w - 104, y: 56, width: 88, height: 34 };
  };

  const menuWidth = () => Math.min(viewportSize().w - 24, props.width ?? 236);

  const menuBox = createMemo(() => {
    const vp = viewportSize();
    const anc = resolvedAnchor();
    const mw = menuWidth();
    const mh = Math.max(52, animatedHeight());
    const align = props.align ?? (anc.x + anc.width * 0.5 > vp.w * 0.52 ? "end" : "start");

    let x =
      align === "end"
        ? anc.x + anc.width - mw
        : align === "center"
          ? anc.x + (anc.width - mw) * 0.5
          : anc.x;
    x = Math.max(12, Math.min(vp.w - mw - 12, x));

    const pref = props.placement ?? "auto";
    const belowY = anc.y + anc.height + 8;
    const aboveY = anc.y - mh - 8;
    const placeAbove =
      pref === "above" ||
      (pref === "auto" && belowY + mh > vp.h - 28 && aboveY >= 44);
    const y = Math.max(44, Math.min(vp.h - mh - 20, placeAbove ? aboveY : belowY));

    return { x, y, width: mw, height: mh, anchor: anc };
  });

  const hoveredRow = createMemo(() => {
    const key = hoveredKey();
    if (!key) return undefined;
    return layoutModel().rows.find((r) => r.key === key && !r.disabled);
  });

  const highlightY = createGlassSpring(
    () => hoveredRow()?.y ?? MENU_PAD_Y,
    { preset: "snappy", reducedMotion: ctx.reducedMotion, quantizeStep: 0.5 },
  );
  const highlightH = createGlassSpring(
    () => hoveredRow()?.height ?? MENU_ROW_HEIGHT,
    { preset: "snappy", reducedMotion: ctx.reducedMotion, quantizeStep: 0.5 },
  );
  const flexX = createGlassSpring(() => flexOffset().x, {
    preset: "jelly",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.2,
  });
  const flexY = createGlassSpring(() => flexOffset().y, {
    preset: "jelly",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.2,
  });

  const activateRow = (row: FlatMenuRow | undefined): void => {
    if (!row || row.disabled) return;
    if (row.kind === "back") {
      setSubmenuStack((prev) => prev.slice(0, -1));
      setHoveredKey(null);
      return;
    }
    const item = row.item;
    if (!item || item.disabled) return;

    if (item.children && item.children.length > 0) {
      setSubmenuStack((prev) => [
        ...prev,
        { title: item.label, items: item.children! },
      ]);
      setHoveredKey(null);
      return;
    }

    const load = item.deferred;
    if (load) {
      const nextDepth = submenuStack().length;
      const loading = { title: item.label, items: [], loading: true };
      setSubmenuStack((prev) => [...prev, loading]);
      setHoveredKey(null);

      const updateLoadingRow = (resolved?: readonly LiquidGlassMenuItem[]): void => {
        if (disposed || !isOpen()) return;
        setSubmenuStack((prev) => {
          if (prev[nextDepth] !== loading) return prev;
          if (!resolved) return prev.slice(0, nextDepth);
          const copy = [...prev];
          copy[nextDepth] = { title: item.label, items: resolved };
          return copy;
        });
      };

      Promise.resolve()
        .then(load)
        .then(updateLoadingRow, () => updateLoadingRow());
      return;
    }

    item.onSelect?.();
    props.onSelect?.(item);
    if (!item.keepOpen) {
      props.onClose();
    }
  };

  const updateScrubAtViewportPoint = (vx: number, vy: number): FlatMenuRow | undefined => {
    const box = menuBox();
    const localX = vx - box.x;
    const localY = vy - box.y;
    // Rubber-band FlexInteraction pull on the open menu platter!
    const overX =
      localX < 0 ? localX : localX > box.width ? localX - box.width : 0;
    const overY =
      localY < 0 ? localY : localY > box.height ? localY - box.height : 0;
    setFlexOffset({
      x: Math.tanh(overX / 48) * 7,
      y: Math.tanh(overY / 48) * 9,
    });

    if (localX < -24 || localX > box.width + 24 || localY < -12 || localY > box.height + 16) {
      setHoveredKey(null);
      return undefined;
    }
    const hit = layoutModel().rows.find(
      (r) =>
        !r.disabled &&
        (r.kind === "item" || r.kind === "back") &&
        localY >= r.y &&
        localY <= r.y + r.height,
    );
    setHoveredKey(hit ? hit.key : null);
    return hit;
  };

  // Support external press-and-drag handoff from `LiquidGlassMenuButton`
  createEffect(() => {
    const hp = props.handoffPointer?.();
    if (!hp || !isOpen()) return;
    if (hp.active) {
      updateScrubAtViewportPoint(hp.x, hp.y);
    }
  });

  // Continuous selection scrub directly inside the open menu platter
  createGesture({
    axis: "any",
    panSlop: 2,
    region: {
      node: () => (isOpen() ? platterNode : undefined),
    },
    onDown: (c) => {
      updateScrubAtViewportPoint(c.x, c.y);
    },
    onPanStart: (c) => {
      updateScrubAtViewportPoint(c.x, c.y);
    },
    onPanMove: (c) => {
      updateScrubAtViewportPoint(c.x, c.y);
    },
    onPanEnd: (c) => {
      const hit = updateScrubAtViewportPoint(c.x, c.y);
      setFlexOffset({ x: 0, y: 0 });
      setHoveredKey(null);
      if (hit) activateRow(hit);
    },
    onUp: () => {
      setFlexOffset({ x: 0, y: 0 });
    },
    onCancel: () => {
      setFlexOffset({ x: 0, y: 0 });
      setHoveredKey(null);
    },
  });

  // True Trigger-to-Platter Morph Interpolation:
  // At p=0, the platter sits centered on the trigger pill with trigger pill dimensions & pill radius;
  // at p=1, it blooms to full `(box.width, box.height)` at `(box.x, box.y)` with `radius: 22`!
  const morphTransform = createMemo(() => {
    const p = Math.max(0, Math.min(1.08, morph()));
    const clampedP = Math.max(0, Math.min(1, p));
    const box = menuBox();
    const anc = box.anchor;

    const startScaleX = Math.max(0.18, Math.min(1, anc.width / Math.max(1, box.width)));
    const startScaleY = Math.max(0.14, Math.min(1, anc.height / Math.max(1, box.height)));
    const sx = startScaleX + (1 - startScaleX) * p;
    const sy = startScaleY + (1 - startScaleY) * p;

    const ancCenterX = anc.x + anc.width * 0.5;
    const ancCenterY = anc.y + anc.height * 0.5;
    const boxCenterX = box.x + box.width * 0.5;
    const boxCenterY = box.y + box.height * 0.5;

    const tx = (ancCenterX - boxCenterX) * (1 - p) + flexX();
    const ty = (ancCenterY - boxCenterY) * (1 - p) + flexY();
    const startRad = Math.min(anc.width, anc.height) * 0.5;
    const radius = Math.max(14, Math.round(startRad + (22 - startRad) * clampedP));
    const shellOpacity = Math.max(0, Math.min(1, clampedP * 1.35));
    const contentOpacity = Math.max(0, Math.min(1, (clampedP - 0.18) / 0.68));

    return { sx, sy, tx, ty, radius, shellOpacity, contentOpacity, clampedP };
  });

  return (
    <Show when={mounted()}>
      <Modal
        open
        backdropClass="bg-transparent"
        class="absolute inset-0 z-50"
        panelClass="absolute inset-0 bg-transparent"
      >
        {/* Subtle tap-outside dismissal catcher */}
        <Focusable
          class="absolute inset-0 w-full h-full"
          onPress={() => {
            if (isOpen()) props.onClose();
          }}
        >
          <View
            class="w-full h-full"
            style={{
              bgColor: ctx.palette().dark ? "#00000036" : "#0F172A18",
              opacity: morphTransform().clampedP,
            }}
          />
        </Focusable>

        {/* Morphing Liquid Glass Menu Platter */}
        <View
          ref={(node) => {
            platterNode = node;
          }}
          class="absolute overflow-hidden"
          style={{
            posType: 1,
            insetL: Math.round(menuBox().x),
            insetT: Math.round(menuBox().y),
            width: Math.round(menuBox().width),
            height: Math.round(menuBox().height),
            scaleX: quantizeOptical(morphTransform().sx, 0.004, 1),
            scaleY: quantizeOptical(morphTransform().sy, 0.004, 1),
            translateX: quantizeOptical(morphTransform().tx, 0.25, 0),
            translateY: quantizeOptical(morphTransform().ty, 0.25, 0),
            opacity: quantizeOptical(morphTransform().shellOpacity, 0.01, 1),
            radius: morphTransform().radius,
            overflow: 1,
          }}
        >
          <LiquidGlassSurface
            material="regular"
            priority="critical"
            shape="rounded"
            radius={morphTransform().radius}
            magnification={1.05}
            deformation={{
              anchorX: flexX() * 2.5,
              anchorY: flexY() * 2.5,
              offsetX: quantizeOptical(flexX() * 0.6, 0.1, 0),
              offsetY: quantizeOptical(flexY() * 0.6, 0.1, 0),
              radius: 72,
            }}
            class="w-full h-full"
            contentClass="relative w-full h-full p-0"
            style={{
              width: Math.round(menuBox().width),
              height: Math.round(menuBox().height),
            }}
          >
            {/* Spring-gliding SelectionView highlight row */}
            <Show when={hoveredRow() !== undefined}>
              <View
                class="absolute left-[6] right-[6]"
                style={{
                  posType: 1,
                  insetL: 6,
                  insetR: 6,
                  insetT: Math.round(highlightY()),
                  height: Math.round(highlightH()),
                  bgColor: ctx.palette().dark ? "#FFFFFF26" : "#0F172A14",
                  borderColor: ctx.palette().rimHighlight,
                  borderWidth: 1,
                  radius: 13,
                  hitPass: 1,
                }}
              />
            </Show>

            {/* Menu rows & inline submenu content */}
            <View
              class="relative w-full h-full"
              style={{
                posType: 0,
                opacity: quantizeOptical(morphTransform().contentOpacity, 0.02, 1),
              }}
            >
              <For each={layoutModel().rows}>
                {(row) => {
                  if (row.kind === "header") {
                    return (
                      <View
                        class="absolute left-0 right-0 flex-col justify-center px-3.5"
                        style={{
                          posType: 1,
                          insetL: 0,
                          insetR: 0,
                          insetT: row.y,
                          height: row.height,
                        }}
                      >
                        <Show when={row.showTopDivider}>
                          <View
                            class="absolute left-0 right-0 top-0 h-[1]"
                            style={{
                              posType: 1,
                              insetL: 0,
                              insetR: 0,
                              insetT: 0,
                              height: 1,
                              bgColor: ctx.palette().contourOuter,
                              hitPass: 1,
                            }}
                          />
                        </Show>
                        <Text
                          class="text-2xs font-bold"
                          style={{ textColor: ctx.palette().inkMuted, hitPass: 1 }}
                        >
                          {row.title}
                        </Text>
                      </View>
                    );
                  }

                  if (row.kind === "back") {
                    return (
                      <Focusable
                        class="absolute left-0 right-0"
                        style={{
                          posType: 1,
                          insetL: 0,
                          insetR: 0,
                          insetT: row.y,
                          height: row.height,
                        }}
                        onPress={() => activateRow(row)}
                      >
                        <View class="flex-row items-center gap-2 px-3.5 h-full w-full">
                          <Text
                            class="text-base font-bold"
                            style={{ textColor: ctx.palette().accentHex, hitPass: 1 }}
                          >
                            ‹
                          </Text>
                          <Text
                            class="text-xs font-bold flex-1"
                            style={{ textColor: ctx.palette().ink, hitPass: 1 }}
                          >
                            {row.title}
                          </Text>
                          <Text
                            class="text-xs font-bold"
                            style={{ textColor: ctx.palette().inkMuted, hitPass: 1 }}
                          >
                            ⌄
                          </Text>
                        </View>
                      </Focusable>
                    );
                  }

                  if (row.kind === "loading") {
                    return (
                      <View
                        class="absolute left-0 right-0 flex-row items-center gap-2 px-4"
                        style={{
                          posType: 1,
                          insetL: 0,
                          insetR: 0,
                          insetT: row.y,
                          height: row.height,
                        }}
                      >
                        <Text
                          class="text-xs"
                          style={{ textColor: ctx.palette().inkMuted, hitPass: 1 }}
                        >
                          ⟳  Loading…
                        </Text>
                      </View>
                    );
                  }

                  const textColor = () => {
                    if (row.disabled) return ctx.palette().inkMuted;
                    if (row.destructive) return ctx.palette().danger.fg;
                    return ctx.palette().ink;
                  };

                  return (
                    <Focusable
                      focusable={!row.disabled}
                      class="absolute left-0 right-0"
                      style={{
                        posType: 1,
                        insetL: 0,
                        insetR: 0,
                        insetT: row.y,
                        height: row.height,
                        opacity: row.disabled ? 0.45 : 1,
                      }}
                      onPress={
                        row.disabled
                          ? undefined
                          : () => {
                              setHoveredKey(row.key);
                              activateRow(row);
                            }
                      }
                    >
                      <View class="relative flex-row items-center justify-between gap-2 px-3.5 h-full w-full">
                        <Show when={row.showTopDivider}>
                          <View
                            class="absolute left-3 right-3 top-0 h-[1]"
                            style={{
                              posType: 1,
                              insetL: 12,
                              insetR: 12,
                              insetT: 0,
                              height: 1,
                              bgColor: ctx.palette().rimSubtle,
                              hitPass: 1,
                            }}
                          />
                        </Show>
                        <View class="flex-row items-center gap-2 flex-1" style={{ minW: 0 }}>
                          <View class="w-[16] items-center justify-center shrink-0">
                            <Show when={row.checked}>
                              <Text
                                class="text-xs font-bold"
                                style={{ textColor: ctx.palette().accentHex, hitPass: 1 }}
                              >
                                ✓
                              </Text>
                            </Show>
                          </View>
                          <View class="flex-col flex-1" style={{ minW: 0 }}>
                            <Text
                              class="text-sm"
                              style={{ textColor: textColor(), hitPass: 1 }}
                            >
                              {row.title}
                            </Text>
                            <Show when={Boolean(row.subtitle)}>
                              <Text
                                class="text-2xs"
                                style={{ textColor: ctx.palette().inkSecondary, hitPass: 1 }}
                              >
                                {row.subtitle}
                              </Text>
                            </Show>
                          </View>
                        </View>
                        <View class="flex-row items-center gap-1.5 shrink-0">
                          <Show when={Boolean(row.shortcut)}>
                            <Text
                              class="text-xs font-mono"
                              style={{ textColor: ctx.palette().inkMuted, hitPass: 1 }}
                            >
                              {row.shortcut}
                            </Text>
                          </Show>
                          <Show when={Boolean(row.icon)}>
                            <Text
                              class="text-xs font-bold"
                              style={{ textColor: textColor(), hitPass: 1 }}
                            >
                              {row.icon}
                            </Text>
                          </Show>
                          <Show when={row.hasSubmenu}>
                            <Text
                              class="text-sm font-bold"
                              style={{ textColor: ctx.palette().inkMuted, hitPass: 1 }}
                            >
                              ›
                            </Text>
                          </Show>
                        </View>
                      </View>
                    </Focusable>
                  );
                }}
              </For>
            </View>
          </LiquidGlassSurface>
        </View>
      </Modal>
    </Show>
  );
}

/**
 * Pull-Down Morphing Liquid Glass Menu Button (`UIBarButtonItem` / `UIButton.showsMenuAsPrimaryAction`).
 *
 * Implements `OpacityPairFilter` + `ActionScrubbingHandoffGestureRecognizer`:
 * - When tapped or pressed, the trigger pill crossfades out (`opacity -> 0`) while morphing
 *   directly into `LiquidGlassMenu` from its exact screen coordinates!
 * - Supports single-gesture press -> drag down into menu -> release to trigger an item!
 */
export function LiquidGlassMenuButton(props: {
  label?: string;
  glyph?: string;
  entries: readonly LiquidGlassMenuEntry[];
  title?: string;
  compact?: boolean;
  align?: "start" | "end" | "center";
  width?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect?: (item: LiquidGlassMenuItem) => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const inGroup = useInLiquidGlassGroup();
  const routeActive = useRouteActive();
  const scrollPage = useContext(ScrollablePageContext);

  const [internalOpen, setInternalOpen] = createSignal(false);
  const isOpen = () => (props.open !== undefined ? props.open : internalOpen());
  const setOpen = (next: boolean): void => {
    if (props.open === undefined) setInternalOpen(next);
    props.onOpenChange?.(next);
  };

  let triggerNode: NodeMirror | undefined;
  const [anchor, setAnchor] = createSignal<LiquidGlassAnchorRect | undefined>(undefined);
  const [handoff, setHandoff] = createSignal<
    { x: number; y: number; active: boolean } | undefined
  >(undefined);

  const syncAnchor = (): void => {
    const measured = measureViewportRect(triggerNode, scrollPage);
    if (measured) setAnchor(measured);
  };

  try {
    onFrame(syncAnchor, { active: routeActive, continuous: false });
  } catch {}

  const morphOut = createGlassSpring(() => (isOpen() ? 1 : 0), {
    preset: "morph",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.01,
  });

  // Press-and-drag handoff from trigger pill straight into menu items!
  createGesture({
    axis: "any",
    panSlop: 4,
    region: {
      node: () => (routeActive() ? triggerNode : undefined),
    },
    onPanStart: (c) => {
      syncAnchor();
      if (!isOpen()) setOpen(true);
      setHandoff({ x: c.x, y: c.y, active: true });
    },
    onPanMove: (c) => {
      setHandoff({ x: c.x, y: c.y, active: true });
    },
    onPanEnd: () => {
      setHandoff(undefined);
    },
    onCancel: () => {
      setHandoff(undefined);
    },
  });

  const pillOpacity = () => Math.max(0, Math.min(1, 1 - morphOut() * 1.8));
  const pillScale = () => 1 + morphOut() * 0.14;

  const buttonPill = (
    <Focusable
      onPress={() => {
        syncAnchor();
        setOpen(!isOpen());
      }}
    >
      <View
        ref={(node) => {
          triggerNode = node;
          syncAnchor();
        }}
        class={
          props.glyph && !props.label
            ? "w-[36] h-[36] items-center justify-center shrink-0"
            : props.compact
              ? "flex-row items-center justify-center gap-1.5 px-3.5 h-[34] shrink-0"
              : "flex-row items-center justify-center gap-1.5 px-4 h-[38] shrink-0"
        }
        style={{
          posType: 0,
          bgColor: inGroup ? (ctx.palette().dark ? "#FFFFFF16" : "#0F172A0D") : "#00000000",
          borderColor: inGroup ? ctx.palette().rimSubtle : "#00000000",
          borderWidth: inGroup ? 1 : 0,
          radius: 999,
          opacity: quantizeOptical(pillOpacity(), 0.02, 1),
          scale: quantizeOptical(pillScale(), 0.01, 1),
        }}
      >
        <Show when={Boolean(props.glyph)}>
          <Text
            class="text-sm font-bold"
            style={{ textColor: ctx.palette().accentHex, hitPass: 1 }}
          >
            {props.glyph}
          </Text>
        </Show>
        <Show when={Boolean(props.label)}>
          <Text
            class="text-sm font-bold"
            style={{ textColor: ctx.palette().accentHex, hitPass: 1 }}
          >
            {props.label}
          </Text>
        </Show>
      </View>
    </Focusable>
  );

  return (
    <View class="relative items-center justify-center shrink-0" style={{ posType: 0 }}>
      <Show
        when={!inGroup}
        fallback={buttonPill}
      >
        <LiquidGlassSurface
          material="clear"
          priority="high"
          shape="pill"
          radius={999}
          class="relative shrink-0"
          contentClass="items-center justify-center p-0"
          style={{
            opacity: quantizeOptical(pillOpacity(), 0.02, 1),
          }}
        >
          {buttonPill}
        </LiquidGlassSurface>
      </Show>

      <LiquidGlassMenu
        open={isOpen}
        entries={props.entries}
        anchor={anchor}
        title={props.title}
        align={props.align}
        width={props.width}
        handoffPointer={handoff}
        onSelect={props.onSelect}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

/**
 * `UIContextMenuInteraction` Lifted Card Preview + Morphing Glass Menu Platter.
 *
 * Pressing/long-pressing (or triggering `open`) shrinks -> spring-lifts the preview card
 * above a frosted/dimmed scrim while morphing the action menu platter right below it!
 */
export function LiquidGlassContextMenu(props: {
  entries: readonly LiquidGlassMenuEntry[];
  previewTitle: string;
  previewSubtitle?: string;
  previewBadge?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelect?: (item: LiquidGlassMenuItem) => void;
  children: JSX.Element;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const scrollPage = useContext(ScrollablePageContext);
  const scaffold = useContext(SafeAreaScaffoldContext);

  const [internalOpen, setInternalOpen] = createSignal(false);
  const isOpen = () => (props.open !== undefined ? props.open : internalOpen());
  const setOpen = (next: boolean): void => {
    if (props.open === undefined) setInternalOpen(next);
    props.onOpenChange?.(next);
  };

  let targetNode: NodeMirror | undefined;
  const [sourceRect, setSourceRect] = createSignal<LiquidGlassAnchorRect | undefined>(
    undefined,
  );
  const [pressing, setPressing] = createSignal(false);

  const syncRect = (): void => {
    const r = measureViewportRect(targetNode, scrollPage);
    if (r) setSourceRect(r);
  };

  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  const clearHold = (): void => {
    if (holdTimer !== undefined) {
      clearTimeout(holdTimer);
      holdTimer = undefined;
    }
    setPressing(false);
  };
  onCleanup(clearHold);

  createGesture({
    axis: "any",
    panSlop: 8,
    region: {
      node: () => (!isOpen() ? targetNode : undefined),
    },
    onDown: () => {
      syncRect();
      setPressing(true);
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        setPressing(false);
        setOpen(true);
      }, 340);
    },
    onPanStart: () => clearHold(),
    onUp: () => clearHold(),
    onCancel: () => clearHold(),
  });

  const pressShrink = createGlassSpring(() => (pressing() ? 0.965 : 1), {
    preset: "tactile",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.005,
  });

  const lift = createGlassSpring(() => (isOpen() ? 1 : 0), {
    preset: "morph",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.005,
  });

  const previewCardAnchor = createMemo((): LiquidGlassAnchorRect => {
    const vpW = scaffold.geometry().width || 390;
    const raw = sourceRect();
    const w = Math.min(vpW - 32, raw?.width ?? vpW - 32);
    const x = Math.max(16, Math.min(vpW - w - 16, raw?.x ?? 16));
    const y = Math.max(64, Math.min(220, raw?.y ?? 128));
    const h = Math.min(156, Math.max(84, raw?.height ?? 108));
    return { x, y, width: w, height: h };
  });

  return (
    <View class="relative w-full" style={{ posType: 0 }}>
      <Focusable
        class="w-full"
        onPress={() => {
          syncRect();
          setOpen(true);
        }}
      >
        <View
          ref={(node) => {
            targetNode = node;
            syncRect();
          }}
          class="w-full"
          style={{
            scale: quantizeOptical(pressShrink(), 0.005, 1),
            opacity: isOpen() ? 0.15 : 1,
          }}
        >
          {props.children}
        </View>
      </Focusable>

      {/* Lifted preview card rendered inside Modal when context menu opens */}
      <Show when={isOpen() || lift() > 0.01}>
        <Modal
          open
          backdropClass="bg-transparent"
          class="absolute inset-0 z-40"
          panelClass="absolute inset-0 bg-transparent"
        >
          <View
            class="absolute inset-0 w-full h-full"
            style={{
              posType: 1,
              insetT: 0,
              insetR: 0,
              insetB: 0,
              insetL: 0,
              bgColor: ctx.palette().dark ? "#02061799" : "#0F172A52",
              opacity: Math.max(0, Math.min(1, lift())),
              hitPass: 1,
            }}
          />
          <View
            class="absolute"
            style={{
              posType: 1,
              insetL: Math.round(previewCardAnchor().x),
              insetT: Math.round(previewCardAnchor().y),
              width: Math.round(previewCardAnchor().width),
              scale: quantizeOptical(0.96 + 0.07 * lift(), 0.005, 1),
              opacity: Math.max(0, Math.min(1, lift() * 1.2)),
              hitPass: 1,
            }}
          >
            <LiquidGlassSurface
              material="regular"
              priority="critical"
              shape="rounded"
              radius={22}
              magnification={1.06}
              class="w-full"
              contentClass="flex-col gap-1.5 p-4 w-full"
            >
              <View class="flex-row items-center justify-between gap-2 w-full">
                <Text
                  class="text-base font-bold"
                  style={{ textColor: ctx.palette().ink }}
                >
                  {props.previewTitle}
                </Text>
                <Show when={Boolean(props.previewBadge)}>
                  <View
                    class="px-2.5 py-0.5"
                    style={{
                      bgColor: ctx.palette().accentSubtle,
                      borderColor: ctx.palette().rimHighlight,
                      borderWidth: 1,
                      radius: 999,
                    }}
                  >
                    <Text
                      class="text-2xs font-bold"
                      style={{ textColor: ctx.palette().accentHex }}
                    >
                      {props.previewBadge}
                    </Text>
                  </View>
                </Show>
              </View>
              <Show when={Boolean(props.previewSubtitle)}>
                <MobileParagraph
                  text={props.previewSubtitle!}
                  class="text-xs"
                  style={{ textColor: ctx.palette().inkSecondary }}
                />
              </Show>
            </LiquidGlassSurface>
          </View>
        </Modal>
      </Show>

      <LiquidGlassMenu
        open={isOpen}
        entries={props.entries}
        anchor={previewCardAnchor}
        align="start"
        placement="below"
        width={248}
        onSelect={props.onSelect}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

/** Anchored Morphing Liquid Glass Popover for custom interactive content. */
export function LiquidGlassPopover(props: {
  open: boolean | (() => boolean);
  anchor?: LiquidGlassAnchorRect | (() => LiquidGlassAnchorRect | undefined);
  width?: number;
  onClose: () => void;
  children: JSX.Element;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const scaffold = useContext(SafeAreaScaffoldContext);
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);

  const morph = createGlassSpring(() => (isOpen() ? 1 : 0), {
    preset: "morph",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.005,
  });

  const mounted = () => isOpen() || morph() > 0.01;
  const box = createMemo(() => {
    const vpW = scaffold.geometry().width || 390;
    const ancRaw = typeof props.anchor === "function" ? props.anchor() : props.anchor;
    const anc = ancRaw ?? { x: vpW - 112, y: 56, width: 92, height: 34 };
    const w = Math.min(vpW - 24, props.width ?? 272);
    const x = Math.max(12, Math.min(vpW - w - 12, anc.x + anc.width - w));
    const y = Math.max(52, anc.y + anc.height + 10);
    return { x, y, width: w, anchor: anc };
  });

  return (
    <Show when={mounted()}>
      <Modal
        open
        backdropClass="bg-transparent"
        class="absolute inset-0 z-50"
        panelClass="absolute inset-0 bg-transparent"
      >
        <Focusable
          class="absolute inset-0 w-full h-full"
          onPress={() => {
            if (isOpen()) props.onClose();
          }}
        >
          <View
            class="w-full h-full"
            style={{
              bgColor: ctx.palette().dark ? "#00000033" : "#0F172A14",
              opacity: Math.max(0, Math.min(1, morph())),
            }}
          />
        </Focusable>

        <View
          class="absolute"
          style={{
            posType: 1,
            insetL: Math.round(box().x),
            insetT: Math.round(box().y),
            width: Math.round(box().width),
            scale: quantizeOptical(0.72 + 0.28 * morph(), 0.005, 1),
            translateY: quantizeOptical(-18 * (1 - morph()), 0.25, 0),
            opacity: Math.max(0, Math.min(1, morph() * 1.25)),
          }}
        >
          <LiquidGlassSurface
            material="regular"
            priority="critical"
            shape="rounded"
            radius={24}
            class="w-full"
            contentClass="flex-col gap-3 p-4 w-full"
          >
            {props.children}
          </LiquidGlassSurface>
        </View>
      </Modal>
    </Show>
  );
}

export interface LiquidGlassAlertAction {
  readonly id: string;
  readonly label: string;
  readonly style?: "default" | "cancel" | "destructive";
  readonly preferred?: boolean;
  readonly disabled?: boolean;
  readonly onSelect?: () => void;
}

/**
 * iOS 26 `AlertController` (`Alert glass group`) with Continuous Scrub Selection:
 * - Centered `292pt` refractive Liquid Glass platter (`radius: 28`)
 * - Automatically lays out 2 short actions side-by-side (`horizontal`) and stacks 3+ or
 *   long-titled actions vertically (`stacked`)
 * - Continuous press-and-scrub gesture (`LongPressGestureRecognizer` parity) highlights
 *   whichever action button your finger slides over and fires on release!
 */
export function LiquidGlassAlertModal(props: {
  open: boolean | (() => boolean);
  title?: string;
  message?: string;
  actions: readonly LiquidGlassAlertAction[];
  onAction?: (action: LiquidGlassAlertAction) => void;
  onClose: () => void;
}): JSX.Element {
  const ctx = useLiquidGlass();
  const isOpen = () => (typeof props.open === "function" ? props.open() : props.open);

  const presence = createGlassSpring(() => (isOpen() ? 1 : 0), {
    preset: "morph",
    reducedMotion: ctx.reducedMotion,
    quantizeStep: 0.005,
  });
  const clamped = () => Math.max(0, Math.min(1, presence()));

  const [scrubIndex, setScrubIndex] = createSignal<number | null>(null);
  let actionGroupNode: NodeMirror | undefined;

  createEffect(() => {
    if (!isOpen()) setScrubIndex(null);
  });

  const sideBySide = createMemo(() => {
    if (props.actions.length !== 2) return false;
    return props.actions.every((a) => a.label.length <= 13);
  });

  const resolveScrubIndex = (vx: number, vy: number): number | null => {
    const pt = resolveNodeLocalPoint(actionGroupNode, vx, vy, null, 0);
    if (!pt) return null;
    if (pt.x < -16 || pt.x > pt.width + 16 || pt.y < -12 || pt.y > pt.height + 12) {
      return null;
    }
    if (sideBySide()) {
      const idx = pt.x < pt.width * 0.5 ? 0 : 1;
      return props.actions[idx]?.disabled ? null : idx;
    }
    const count = Math.max(1, props.actions.length);
    const rowH = pt.height / count;
    const idx = Math.max(0, Math.min(count - 1, Math.floor(pt.y / Math.max(1, rowH))));
    return props.actions[idx]?.disabled ? null : idx;
  };

  const triggerAction = (action: LiquidGlassAlertAction | undefined): void => {
    if (!action || action.disabled) return;
    action.onSelect?.();
    props.onAction?.(action);
    props.onClose();
  };

  createGesture({
    axis: "any",
    panSlop: 2,
    region: {
      node: () => (isOpen() ? actionGroupNode : undefined),
    },
    onDown: (c) => {
      setScrubIndex(resolveScrubIndex(c.x, c.y));
    },
    onPanStart: (c) => {
      setScrubIndex(resolveScrubIndex(c.x, c.y));
    },
    onPanMove: (c) => {
      setScrubIndex(resolveScrubIndex(c.x, c.y));
    },
    onPanEnd: (c) => {
      const idx = resolveScrubIndex(c.x, c.y);
      setScrubIndex(null);
      if (idx !== null) triggerAction(props.actions[idx]);
    },
    onUp: () => setScrubIndex(null),
    onCancel: () => setScrubIndex(null),
  });

  const actionLabelColor = (a: LiquidGlassAlertAction): string => {
    if (a.disabled) return ctx.palette().inkMuted;
    if (a.style === "destructive") return ctx.palette().danger.fg;
    return ctx.palette().accentHex;
  };

  return (
    <Show when={isOpen() || presence() > 0.01}>
      <Modal
        open
        backdropClass="bg-transparent"
        class="absolute inset-0 z-50"
        panelClass="absolute inset-0 flex-col items-center justify-center px-6 bg-transparent"
      >
        <View
          class="absolute inset-0 w-full h-full"
          style={{
            posType: 1,
            insetT: 0,
            insetR: 0,
            insetB: 0,
            insetL: 0,
            bgColor: ctx.palette().dark ? "#00000066" : "#0F172A38",
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
          class="w-[296] shrink-0 overflow-hidden"
          style={{
            width: 296,
            opacity: clamped(),
            scale: quantizeOptical(0.86 + 0.14 * presence(), 0.005, 1),
            radius: 28,
            overflow: 1,
          }}
        >
          <LiquidGlassSurface
            material="regular"
            priority="critical"
            shape="rounded"
            radius={28}
            magnification={1.06}
            class="w-full flex-col"
            contentClass="flex-col w-full p-0"
          >
            {/* Title & Message Header */}
            <View class="flex-col items-center gap-1.5 px-5 pt-5 pb-4 w-full">
              <Show when={Boolean(props.title)}>
                <MobileParagraph
                  text={props.title!}
                  class="text-base font-bold text-center"
                  style={{ textColor: ctx.palette().ink }}
                  fallbackInsetPx={120}
                />
              </Show>
              <Show when={Boolean(props.message)}>
                <MobileParagraph
                  text={props.message!}
                  class={
                    props.title
                      ? "text-xs text-center"
                      : "text-sm text-center"
                  }
                  style={{
                    textColor: props.title
                      ? ctx.palette().inkSecondary
                      : ctx.palette().ink,
                  }}
                  fallbackInsetPx={120}
                />
              </Show>
            </View>

            {/* Hairline Separator */}
            <View
              class="w-full h-[1]"
              style={{
                height: 1,
                bgColor: ctx.palette().contourOuter,
              }}
            />

            {/* Scrubbable Action Group (`_UIAlertControllerInterfaceActionGroupView`) */}
            <View
              ref={(node) => {
                actionGroupNode = node;
              }}
              class={
                sideBySide()
                  ? "flex-row items-center w-full p-1.5 gap-1.5"
                  : "flex-col w-full p-1.5 gap-1"
              }
            >
              <For each={props.actions}>
                {(action, idx) => {
                  const active = () => scrubIndex() === idx();
                  const isBold = () =>
                    action.preferred === true || action.style === "cancel";
                  return (
                    <Focusable
                      focusable={!action.disabled}
                      class={sideBySide() ? "flex-1" : "w-full"}
                      onPress={
                        action.disabled ? undefined : () => triggerAction(action)
                      }
                    >
                      <View
                        class="h-[42] items-center justify-center px-3 w-full"
                        style={{
                          height: 42,
                          bgColor: active()
                            ? ctx.palette().dark
                              ? "#FFFFFF28"
                              : "#0F172A14"
                            : action.preferred
                              ? ctx.palette().accentSubtle
                              : ctx.palette().dark
                                ? "#FFFFFF0D"
                                : "#FFFFFF88",
                          borderColor: active()
                            ? ctx.palette().rimHighlight
                            : action.preferred
                              ? ctx.palette().accentHex
                              : ctx.palette().rimSubtle,
                          borderWidth: 1,
                          radius: 999,
                          opacity: action.disabled ? 0.45 : 1,
                        }}
                      >
                        <Text
                          class={isBold() ? "text-sm font-bold" : "text-sm"}
                          style={{
                            textColor: actionLabelColor(action),
                            hitPass: 1,
                          }}
                        >
                          {action.label}
                        </Text>
                      </View>
                    </Focusable>
                  );
                }}
              </For>
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
