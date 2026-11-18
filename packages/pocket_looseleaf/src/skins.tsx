/**
 * @pocket/looseleaf — Crisp Vector Paper, Ink Border, Washi Tape, Highlighter & Dock Primitives.
 *
 * Renders Looseleaf's signature hand-crafted stationery surfaces (cutting-mat graph
 * backdrop, paper/graph/ruled/sticky sheets, gingham washi tape, hard offset ink
 * shadows, highlighter pills, segmented bars, dynamic marker progress strokes,
 * tactile switches, and floating dock capsules) using Retina-sharp native PocketJS
 * vector `<View>` geometry — supporting all 3 Looseleaf theme modes:
 * - `"notebook"` (sage cutting mat `#A8C8BB` + warm cream paper `#FAF5E8`)
 * - `"dark"` (charcoal-sage cutting mat `#191E1C` + chalk-ink slate paper `#24211E`)
 * - `"amber-night"` (0% blue-light `#080706` OLED night-feeding nursery palette)
 */

import { For, Show, type JSX } from "solid-js";
import { Focusable, Image, Text, View, type ViewProps } from "@pocketjs/framework/solid/components";
import { useLooseleafTheme, type LooseleafThemeMode } from "./tokens.ts";

export type LooseleafSheetVariant =
  | "paper"
  | "graph"
  | "ruled"
  | "slip"
  | "sticky-yellow"
  | "sticky-pink"
  | "sticky-green"
  | "square"
  | "tall";

export type LooseleafBadgeTone =
  | "safe"
  | "sage"
  | "trial"
  | "suspect"
  | "hi"
  | "danger"
  | "coral"
  | "neutral"
  | "outline";

export type LooseleafActionVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "outline"
  | "ghost";

function resolveEffectiveMode(
  explicitMode: LooseleafThemeMode | (() => LooseleafThemeMode) | undefined,
  explicitDark: boolean | (() => boolean) | undefined,
  src: string | undefined,
  ctxMode: LooseleafThemeMode,
): LooseleafThemeMode {
  if (explicitMode !== undefined) {
    return typeof explicitMode === "function" ? explicitMode() : explicitMode;
  }
  const darkBool =
    typeof explicitDark === "function" ? explicitDark() : explicitDark;
  if (darkBool === false) return "notebook";
  if (darkBool === true) {
    if (ctxMode === "amber-night") return "amber-night";
    if (ctxMode === "dark") return "dark";
    if (src?.includes("amber")) return "amber-night";
    return "dark";
  }
  if (src) {
    if (src.includes("amber")) return "amber-night";
    if (src.includes("dark_")) {
      return ctxMode === "amber-night" ? "amber-night" : "dark";
    }
    return "notebook";
  }
  return ctxMode;
}

function inferSheetVariant(
  src: string | undefined,
  explicit?: LooseleafSheetVariant,
): LooseleafSheetVariant {
  if (explicit) return explicit;
  if (!src) return "paper";
  if (src.includes("graph")) return "graph";
  if (src.includes("ruled")) return "ruled";
  if (src.includes("sticky_yellow")) return "sticky-yellow";
  if (src.includes("sticky_pink")) return "sticky-pink";
  if (src.includes("sticky_green")) return "sticky-green";
  if (src.includes("badge_hi")) return "sticky-yellow";
  if (src.includes("btn_secondary") || src.includes("btn_marker")) return "sticky-yellow";
  if (src.includes("slip")) return "slip";
  if (src.includes("square")) return "square";
  if (src.includes("tall")) return "tall";
  return "paper";
}

function inferBadgeTone(
  src: string | undefined,
  explicit?: LooseleafBadgeTone,
): LooseleafBadgeTone {
  if (explicit) return explicit;
  if (!src) return "outline";
  if (src.includes("safe")) return "safe";
  if (src.includes("trial")) return "trial";
  if (src.includes("danger")) return "danger";
  if (src.includes("coral")) return "coral";
  if (src.includes("hi")) return "hi";
  return "outline";
}

function inferActionVariant(
  src: string | undefined,
  explicit?: LooseleafActionVariant,
): LooseleafActionVariant {
  if (explicit) return explicit;
  if (!src) return "primary";
  if (src.includes("destructive")) return "danger";
  if (src.includes("secondary")) return "secondary";
  if (src.includes("outline")) return "outline";
  if (src.includes("badge_hi")) return "ghost";
  return "primary";
}

const DESK_H_LINES = Array.from({ length: 38 }, (_, i) => i);
const DESK_V_LINES = Array.from({ length: 18 }, (_, i) => i);
const CARD_GRAPH_H = [0, 1, 2, 3, 4, 5, 6];
const CARD_GRAPH_V = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CARD_RULED_H = [0, 1, 2, 3];
const WASHI_CHECKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const ABS_FILL = {
  posType: 1,
  insetT: 0,
  insetR: 0,
  insetB: 0,
  insetL: 0,
} as const;

/**
 * Full-bleed Looseleaf cutting-mat / notebook graph backdrop:
 * - `"notebook"`: `#A8C8BB` sage-mint day grid
 * - `"dark"`: `#191E1C` deep charcoal-sage dark grid
 * - `"amber-night"`: `#080706` zero-blue-light amber night grid
 */
export function LooseleafDeskBackdrop(props: {
  isDark?: boolean | (() => boolean);
  mode?: LooseleafThemeMode | (() => LooseleafThemeMode);
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, undefined, palette().mode);
  const baseBg = () => {
    const m = mode();
    if (m === "amber-night") return "#080706";
    if (m === "dark") return "#191E1C";
    return "#A8C8BB";
  };
  const gridLine = () => {
    const m = mode();
    if (m === "amber-night") return "#1C1711";
    if (m === "dark") return "#2C3632";
    return "#8FB0A2";
  };
  const gridAlpha = () => {
    const m = mode();
    if (m === "amber-night") return 0.55;
    if (m === "dark") return 0.52;
    return 0.38;
  };

  return (
    <View
      class="absolute inset-0 overflow-hidden"
      style={{ ...ABS_FILL, overflow: 1, bgColor: baseBg(), hitPass: 1 }}
    >
      <View
        class="absolute inset-0 flex-col justify-between py-2"
        style={{ ...ABS_FILL, opacity: gridAlpha(), hitPass: 1 }}
      >
        <For each={DESK_H_LINES}>
          {() => <View class="w-full h-[1]" style={{ bgColor: gridLine(), hitPass: 1 }} />}
        </For>
      </View>
      <View
        class="absolute inset-0 flex-row justify-between px-2"
        style={{ ...ABS_FILL, opacity: gridAlpha(), hitPass: 1 }}
      >
        <For each={DESK_V_LINES}>
          {() => <View class="h-full w-[1]" style={{ bgColor: gridLine(), hitPass: 1 }} />}
        </For>
      </View>
    </View>
  );
}

/** Checkered gingham / striped stationery washi tape strip (`og.png` & demo hero cards). */
export function LooseleafWashiTape(props: {
  tone?: "sage" | "amber" | "coral" | "dark-sage" | "dark-coral";
  width?: number;
  height?: number;
  angle?: number;
}): JSX.Element {
  const tone = () => props.tone ?? "sage";
  const baseFill = () => {
    const t = tone();
    if (t === "amber") return "#3A2810";
    if (t === "dark-sage") return "#2B3D33";
    if (t === "dark-coral") return "#573224";
    if (t === "coral") return "#F4A261";
    return "#DFEFE1";
  };
  const stripeFill = () => {
    const t = tone();
    if (t === "amber") return "#D97706";
    if (t === "dark-sage") return "#598269";
    if (t === "dark-coral") return "#D97754";
    if (t === "coral") return "#FFF6E8";
    return "#8FC09A";
  };
  const borderCol = () => {
    const t = tone();
    if (t === "amber") return "#78531E";
    if (t === "dark-sage") return "#4A6B57";
    if (t === "dark-coral") return "#8F533C";
    if (t === "coral") return "#B86B35";
    return "#739E7E";
  };

  return (
    <View
      class="relative overflow-hidden flex-row items-center justify-between px-0.5"
      style={{
        posType: 0,
        overflow: 1,
        width: props.width ?? 68,
        height: props.height ?? 12,
        bgColor: baseFill(),
        borderColor: borderCol(),
        borderWidth: 1,
        radius: 2,
        rotate: props.angle ?? -1.2,
        hitPass: 1,
      }}
    >
      <For each={WASHI_CHECKS}>
        {(idx) => (
          <View
            class="h-full"
            style={{
              width: 3,
              bgColor: idx % 2 === 0 ? stripeFill() : baseFill(),
              opacity: 0.82,
              hitPass: 1,
            }}
          />
        )}
      </For>
      <View
        class="absolute left-0 right-0 top-[5] h-[2]"
        style={{
          posType: 1,
          insetL: 0,
          insetR: 0,
          insetT: 5,
          height: 2,
          bgColor: stripeFill(),
          opacity: 0.45,
          hitPass: 1,
        }}
      />
    </View>
  );
}

/**
 * Crisp vector Looseleaf paper, graph, ruled, slip, or sticky-note container.
 * Uses explicit inline `posType` & `inset*` styles so background paper stock and
 * offset shadows never collapse regardless of Tailwind class pass-1 registration.
 */
export function LooseleafSheet(props: {
  sheetSrc?: string;
  variant?: LooseleafSheetVariant;
  isDark?: boolean;
  mode?: LooseleafThemeMode;
  washiTape?: "auto" | "sage" | "amber" | "coral" | "none";
  radius?: number;
  class?: string;
  style?: ViewProps["style"];
  children?: JSX.Element;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, props.sheetSrc, palette().mode);
  const isAmber = () => mode() === "amber-night";
  const isStdDark = () => mode() === "dark";
  const dark = () => mode() !== "notebook";
  const variant = () => inferSheetVariant(props.sheetSrc, props.variant);

  const bgFill = (): string => {
    const v = variant();
    if (isStdDark()) {
      if (v === "sticky-yellow") return "#3D351B";
      if (v === "sticky-pink") return "#3E2324";
      if (v === "sticky-green") return "#233626";
      if (v === "graph") return "#212622";
      if (v === "slip" || v === "ruled") return "#2B2723";
      if (v === "square") return "#27231F";
      return "#24211E";
    }
    if (isAmber()) {
      if (v === "sticky-yellow") return "#2B2111";
      if (v === "sticky-pink") return "#2E1716";
      if (v === "sticky-green") return "#17261B";
      if (v === "graph") return "#151310";
      if (v === "slip" || v === "ruled") return "#1B1814";
      return "#181512";
    }
    if (v === "sticky-yellow") return "#F6DF78";
    if (v === "sticky-pink") return "#F8CFC8";
    if (v === "sticky-green") return "#CFE6B5";
    if (v === "graph") return "#F8F6EE";
    if (v === "ruled" || v === "slip") return "#FAF6EC";
    return "#FAF5E8";
  };

  const borderCol = (): string => {
    const v = variant();
    if (isStdDark()) {
      if (v === "sticky-yellow") return "#9E8738";
      if (v === "sticky-pink") return "#B05A56";
      if (v === "sticky-green") return "#558C60";
      if (v === "graph") return "#637067";
      return "#6E665C";
    }
    if (isAmber()) {
      if (v === "sticky-yellow") return "#8A6D3B";
      if (v === "sticky-pink") return "#9E4740";
      if (v === "sticky-green") return "#467353";
      return "#6B5B45";
    }
    if (v === "sticky-pink") return "#B84A3E";
    if (v === "sticky-green") return "#4D7C55";
    return "#2A2420";
  };

  const shadowCol = (): string => {
    if (isStdDark()) return "#08070599";
    if (isAmber()) return "#000000B8";
    return "#2A242030";
  };
  const rad = (): number => {
    if (props.radius !== undefined) return props.radius;
    const v = variant();
    if (v === "slip") return 5;
    if (v === "square") return 6;
    return 7;
  };

  const showTape = (): "none" | "sage" | "amber" | "coral" | "dark-sage" | "dark-coral" => {
    const t = props.washiTape ?? "auto";
    if (t === "none") return "none";
    if (t === "sage") return isStdDark() ? "dark-sage" : "sage";
    if (t === "coral") return isStdDark() ? "dark-coral" : "coral";
    if (t === "amber") return "amber";
    if (variant() === "graph") {
      if (isAmber()) return "none";
      if (isStdDark()) return "dark-sage";
      return "sage";
    }
    return "none";
  };

  const isSticky = () => {
    const v = variant();
    return v === "sticky-yellow" || v === "sticky-green";
  };
  const stickyFoldBg = () => {
    if (isStdDark()) {
      return variant() === "sticky-green" ? "#314D36" : "#574B24";
    }
    if (isAmber()) return "#4A3A20";
    return variant() === "sticky-green" ? "#B2CF94" : "#E3C552";
  };

  return (
    <View
      class={props.class ?? "relative w-full p-4 flex-col gap-3"}
      style={{ posType: 0, ...(props.style ?? {}) }}
    >
      {/* Crisp hard-ink offset drop shadow */}
      <View
        class="absolute inset-0"
        style={{
          posType: 1,
          insetL: 2.5,
          insetT: 3,
          insetR: -2.5,
          insetB: -3,
          bgColor: shadowCol(),
          radius: rad(),
          hitPass: 1,
        }}
      />

      {/* Crisp vector paper stock + 1.5px felt-tip border */}
      <View
        class="absolute inset-0 overflow-hidden"
        style={{
          ...ABS_FILL,
          overflow: 1,
          bgColor: bgFill(),
          borderColor: borderCol(),
          borderWidth: 1.5,
          radius: rad(),
          hitPass: 1,
        }}
      >
        {/* Graph-paper internal grid lines */}
        <Show when={variant() === "graph"}>
          <View
            class="absolute inset-0 flex-col justify-between py-3"
            style={{ ...ABS_FILL, opacity: dark() ? 0.35 : 0.34, hitPass: 1 }}
          >
            <For each={CARD_GRAPH_H}>
              {() => (
                <View
                  class="w-full h-[1]"
                  style={{
                    bgColor: isStdDark() ? "#36423A" : isAmber() ? "#332B20" : "#B5C9B4",
                    hitPass: 1,
                  }}
                />
              )}
            </For>
          </View>
          <View
            class="absolute inset-0 flex-row justify-between px-3"
            style={{ ...ABS_FILL, opacity: dark() ? 0.32 : 0.3, hitPass: 1 }}
          >
            <For each={CARD_GRAPH_V}>
              {() => (
                <View
                  class="h-full w-[1]"
                  style={{
                    bgColor: isStdDark() ? "#36423A" : isAmber() ? "#332B20" : "#B5C9B4",
                    hitPass: 1,
                  }}
                />
              )}
            </For>
          </View>
        </Show>

        {/* Notebook ruled horizontal lines + left red margin rule */}
        <Show when={variant() === "ruled"}>
          <View
            class="absolute inset-0 flex-col justify-around py-2"
            style={{ ...ABS_FILL, opacity: dark() ? 0.36 : 0.42, hitPass: 1 }}
          >
            <For each={CARD_RULED_H}>
              {() => (
                <View
                  class="w-full h-[1]"
                  style={{
                    bgColor: isStdDark() ? "#3F5873" : isAmber() ? "#3D3326" : "#ADC4DC",
                    hitPass: 1,
                  }}
                />
              )}
            </For>
          </View>
          <View
            class="absolute top-0 bottom-0 left-[22] w-[1]"
            style={{
              posType: 1,
              insetT: 0,
              insetB: 0,
              insetL: 22,
              width: 1,
              bgColor: isStdDark() ? "#8A473E" : isAmber() ? "#6E382C" : "#DF8B80",
              opacity: dark() ? 0.55 : 0.58,
              hitPass: 1,
            }}
          />
        </Show>

        {/* Sticky-note bottom-right dog-ear fold accent */}
        <Show when={isSticky()}>
          <View
            class="absolute right-0 bottom-0 w-[10] h-[10]"
            style={{
              posType: 1,
              insetR: 0,
              insetB: 0,
              width: 10,
              height: 10,
              bgColor: stickyFoldBg(),
              borderColor: borderCol(),
              borderWidth: 1,
              radius: 2,
              hitPass: 1,
            }}
          />
        </Show>
      </View>

      {/* Optional top gingham checkered washi tape */}
      <Show when={showTape() !== "none"}>
        <View
          class="absolute left-0 right-0 top-[-6] items-center justify-center"
          style={{ posType: 1, insetL: 0, insetR: 0, insetT: -6, hitPass: 1 }}
        >
          <LooseleafWashiTape
            tone={showTape() as "sage" | "amber" | "coral" | "dark-sage" | "dark-coral"}
          />
        </View>
      </Show>

      {props.children}
    </View>
  );
}

/** Crisp vector circular stationery icon button with offset ink arc shadow. */
export function LooseleafCircleIconButton(props: {
  bgSrc?: string;
  iconSrc: string;
  isDark?: boolean;
  mode?: LooseleafThemeMode;
  active?: boolean;
  sizeClass?: string;
  iconClass?: string;
  badgeDotClass?: string;
  showBadgeDot?: boolean;
  onPress?: () => void;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, props.bgSrc, palette().mode);
  const dark = () => mode() !== "notebook";
  const isStdDark = () => mode() === "dark";
  const isActive = () =>
    props.active === true || Boolean(props.bgSrc && props.bgSrc.includes("sub"));
  const fill = () => {
    if (isStdDark()) return isActive() ? "#E87A4D" : "#2D2925";
    if (isActive()) return dark() ? "#D97706" : "#F6DF78";
    return dark() ? "#211B13" : "#F4E39A";
  };
  const border = () => {
    if (isStdDark()) return isActive() ? "#F2ECE1" : "#787066";
    return dark() ? "#8C7756" : "#2A2420";
  };

  return (
    <Focusable
      class="active:translate-x-[1] active:translate-y-[1.5] active:scale-96 transition-transform duration-150 ease-out"
      onPress={props.onPress}
    >
      <View
        class={props.sizeClass ?? "relative w-7 h-7 items-center justify-center shrink-0"}
        style={{ posType: 0 }}
      >
        <View
          class="absolute inset-0"
          style={{
            posType: 1,
            insetL: 1.5,
            insetT: 2,
            insetR: -1.5,
            insetB: -2,
            bgColor: dark() ? "#000000AA" : "#2A242038",
            radius: 999,
            hitPass: 1,
          }}
        />
        <View
          class="absolute inset-0"
          style={{
            ...ABS_FILL,
            bgColor: fill(),
            borderColor: border(),
            borderWidth: 1.5,
            radius: 999,
            hitPass: 1,
          }}
        />
        <Image
          src={props.iconSrc}
          class={props.iconClass ?? "w-4 h-4"}
          style={{ hitPass: 1 }}
        />
        <Show when={props.showBadgeDot === true}>
          <View
            class={props.badgeDotClass ?? "absolute top-0 right-0 w-2 h-2 rounded-full bg-[#C2412D]"}
            style={{ posType: 1, insetT: 0, insetR: 0, hitPass: 1 }}
          />
        </Show>
      </View>
    </Focusable>
  );
}

/** Crisp vector highlighter / ink status pill that scales cleanly to any label length. */
export function LooseleafPillBadge(props: {
  bgSrc?: string;
  tone?: LooseleafBadgeTone;
  isDark?: boolean;
  mode?: LooseleafThemeMode;
  label: string;
  textClass?: string;
  class?: string;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, props.bgSrc, palette().mode);
  const isStdDark = () => mode() === "dark";
  const isAmber = () => mode() === "amber-night";
  const tone = () => inferBadgeTone(props.bgSrc, props.tone);

  const fill = (): string => {
    const t = tone();
    if (isStdDark()) {
      if (t === "safe" || t === "sage") return "#1E3524";
      if (t === "trial") return "#1E2F45";
      if (t === "danger") return "#4A2220";
      if (t === "coral") return "#42271D";
      if (t === "hi" || t === "suspect") return "#423818";
      return "#2B2723";
    }
    if (isAmber()) {
      if (t === "safe" || t === "sage") return "#152B1E";
      if (t === "danger") return "#4A1D1A";
      if (t === "hi" || t === "suspect" || t === "coral") return "#4A3511";
      return "#241E16";
    }
    if (t === "safe" || t === "sage") return "#9BD08C";
    if (t === "trial") return "#CBE2F6";
    if (t === "danger") return "#C84332";
    if (t === "coral") return "#F5B895";
    if (t === "hi" || t === "suspect") return "#F6DF75";
    return "#FAF5E8";
  };

  const border = (): string => {
    const t = tone();
    if (isStdDark()) {
      if (t === "safe" || t === "sage") return "#6AC47E";
      if (t === "trial") return "#7BA4F7";
      if (t === "danger") return "#F07562";
      if (t === "coral") return "#E87A4D";
      if (t === "hi" || t === "suspect") return "#D9B526";
      return "#787066";
    }
    if (isAmber()) {
      if (t === "safe" || t === "sage") return "#5DA871";
      if (t === "danger") return "#E05245";
      if (t === "hi" || t === "suspect") return "#8C6D2E";
      return "#7A684D";
    }
    if (t === "hi" || t === "suspect") return "#D9BA43";
    if (t === "danger") return "#8F281C";
    return "#2A2420";
  };

  const defaultTextColor = (): string => {
    const t = tone();
    if (isStdDark()) {
      if (t === "safe" || t === "sage") return "#A7F3D0";
      if (t === "trial") return "#BFDBFE";
      if (t === "danger") return "#FECACA";
      if (t === "hi" || t === "suspect") return "#FDE68A";
      if (t === "coral") return "#FDBA74";
      return "#F2ECE1";
    }
    if (isAmber()) {
      if (t === "safe" || t === "sage") return "#6EE7B7";
      if (t === "danger") return "#FDA4AF";
      if (t === "outline" || t === "neutral") return "#F4EFE4";
      return "#FBBF24";
    }
    if (t === "danger") return "#FFFDF6";
    if (t === "safe" || t === "sage") return "#1A3820";
    return "#2A2420";
  };

  const isMarkerSwipe = () => tone() === "hi" || tone() === "suspect";

  return (
    <View
      class={props.class ?? "relative px-2.5 py-1 items-center justify-center shrink-0"}
      style={{ posType: 0 }}
    >
      <View
        class="absolute inset-0"
        style={{
          ...ABS_FILL,
          bgColor: fill(),
          borderColor: border(),
          borderWidth: isMarkerSwipe() ? 1 : 1.5,
          radius: isMarkerSwipe() ? 5 : 999,
          hitPass: 1,
        }}
      />
      <Text
        class={props.textClass ?? "text-2xs font-bold"}
        style={props.textClass ? undefined : { textColor: defaultTextColor() }}
      >
        {props.label}
      </Text>
    </View>
  );
}

/** Crisp vector 2-way or 3-way highlighter segmented control (`[ 全部 | 喂养 | 排敏 ]`). */
export function LooseleafSegmentedBar<T extends string>(props: {
  bgSrc?: string;
  isDark?: boolean;
  mode?: LooseleafThemeMode;
  items: readonly { id: T; label: string }[];
  activeId: () => T;
  onSelect: (id: T) => void;
  class?: string;
  activeTextClass?: string;
  idleTextClass?: string;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, props.bgSrc, palette().mode);
  const dark = () => mode() !== "notebook";
  const isStdDark = () => mode() === "dark";
  const trackBg = () => (isStdDark() ? "#1E1B18" : dark() ? "#181511" : "#FAF6EC");
  const activeBg = () => (isStdDark() ? "#3E351A" : dark() ? "#593E12" : "#F6DF75");
  const borderCol = () => (isStdDark() ? "#787066" : dark() ? "#7A684D" : "#2A2420");

  return (
    <View
      class={props.class ?? "relative w-full h-[32] flex-row items-center"}
      style={{ posType: 0 }}
    >
      <View
        class="absolute inset-0"
        style={{
          posType: 1,
          insetL: 1.5,
          insetT: 2,
          insetR: -1.5,
          insetB: -2,
          bgColor: dark() ? "#00000099" : "#2A242024",
          radius: 6,
          hitPass: 1,
        }}
      />
      <View
        class="relative w-full h-full flex-row items-center overflow-hidden"
        style={{
          posType: 0,
          overflow: 1,
          bgColor: trackBg(),
          radius: 6,
        }}
      >
        <For each={props.items}>
          {(item, idx) => {
            const active = () => props.activeId() === item.id;
            return (
              <View class="flex-1 h-full flex-row items-center">
                <Focusable
                  class="flex-1 h-full active:scale-97 transition-transform duration-150 ease-out"
                  onPress={() => props.onSelect(item.id)}
                >
                  <View
                    class="w-full h-full items-center justify-center transition-colors duration-150 ease-out"
                    style={{
                      bgColor: active() ? activeBg() : "#00000000",
                    }}
                  >
                    <Text
                      class={
                        active()
                          ? (props.activeTextClass ?? "text-xs font-bold")
                          : (props.idleTextClass ?? "text-xs")
                      }
                      style={
                        active()
                          ? props.activeTextClass
                            ? undefined
                            : {
                                textColor: isStdDark()
                                  ? "#F5D756"
                                  : dark()
                                    ? "#FDE68A"
                                    : "#2A2420",
                              }
                          : props.idleTextClass
                            ? undefined
                            : {
                                textColor: isStdDark()
                                  ? "#B5ADA0"
                                  : dark()
                                    ? "#A89B87"
                                    : "#5A554E",
                              }
                      }
                    >
                      {item.label}
                    </Text>
                  </View>
                </Focusable>
                <Show when={idx() < props.items.length - 1}>
                  <View
                    class="w-[1] h-full"
                    style={{ bgColor: borderCol(), opacity: 0.85, hitPass: 1 }}
                  />
                </Show>
              </View>
            );
          }}
        </For>
        <View
          class="absolute inset-0"
          style={{
            ...ABS_FILL,
            borderColor: borderCol(),
            borderWidth: 1.5,
            radius: 6,
            hitPass: 1,
          }}
        />
      </View>
    </View>
  );
}

/** Crisp dynamic hand-inked marker progress stroke (`0..1` live ratio). */
export function LooseleafProgressStroke(props: {
  trackSrc?: string;
  ratio?: number | (() => number);
  isDark?: boolean;
  mode?: LooseleafThemeMode;
  tone?: "sage" | "coral" | "amber";
  class?: string;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, props.trackSrc, palette().mode);
  const isStdDark = () => mode() === "dark";
  const isAmber = () => mode() === "amber-night";
  const pct = (): number => {
    const raw =
      typeof props.ratio === "function"
        ? props.ratio()
        : props.ratio !== undefined
          ? props.ratio
          : props.trackSrc?.includes("poem")
            ? 0.34
            : 0.85;
    return Math.max(6, Math.min(100, Math.round(raw * 100)));
  };
  const fillCol = (): string => {
    if (isStdDark()) {
      return props.tone === "sage" ? "#6AC47E" : "#E87A4D";
    }
    if (isAmber()) return "#D97706";
    if (props.tone === "coral") return "#DF6B3C";
    return "#DF6B3C";
  };

  return (
    <View class={props.class ?? "w-full h-3.5 items-center justify-center"}>
      <View
        class="w-full h-[12] p-[1.5] flex-row items-center overflow-hidden"
        style={{
          overflow: 1,
          bgColor: isStdDark() ? "#1C1917" : isAmber() ? "#241E16" : "#EDE6D6",
          borderColor: isStdDark() ? "#787066" : isAmber() ? "#7A684D" : "#2A2420",
          borderWidth: 1.5,
          radius: 4,
        }}
      >
        <View
          class="h-full"
          style={{
            grow: pct(),
            bgColor: fillCol(),
            radius: 2,
          }}
        />
        <Show when={pct() < 100}>
          <View class="h-full" style={{ grow: 100 - pct() }} />
        </Show>
      </View>
    </View>
  );
}

/** Crisp vector marker / highlighter / destructive stationery button. */
export function LooseleafPillActionButton(props: {
  bgSrc?: string;
  variant?: LooseleafActionVariant;
  isDark?: boolean;
  mode?: LooseleafThemeMode;
  label: string;
  fullWidth?: boolean;
  boxClass?: string;
  textClass?: string;
  onPress?: () => void;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, props.bgSrc, palette().mode);
  const dark = () => mode() !== "notebook";
  const isStdDark = () => mode() === "dark";
  const variant = () => inferActionVariant(props.bgSrc, props.variant);

  const fill = (): string => {
    const v = variant();
    if (v === "danger") return "#C84332";
    if (isStdDark()) {
      if (v === "primary") return "#E87A4D";
      if (v === "secondary") return "#352F29";
      if (v === "ghost") return "#3A331A";
      return "#26221F";
    }
    if (dark()) {
      if (v === "primary") return "#D97706";
      if (v === "secondary") return "#2B2112";
      if (v === "ghost") return "#3A2B12";
      return "#1D1812";
    }
    if (v === "primary") return "#DF6B3C";
    if (v === "secondary") return "#F6DF75";
    if (v === "ghost") return "#F6DF75";
    return "#FAF5E8";
  };

  const border = (): string => {
    const v = variant();
    if (isStdDark()) {
      if (v === "primary") return "#F2ECE1";
      if (v === "ghost") return "#9E8738";
      return "#8A8175";
    }
    if (dark()) {
      if (v === "ghost") return "#7A5C22";
      return "#8C7756";
    }
    if (v === "ghost") return "#D9BA43";
    return "#2A2420";
  };

  const defaultTextColor = (): string => {
    const v = variant();
    if (v === "danger") return "#FFFDF6";
    if (isStdDark()) {
      if (v === "primary") return "#1C1917";
      if (v === "ghost") return "#F5D756";
      return "#F2ECE1";
    }
    if (dark()) {
      return v === "primary" ? "#080706" : "#F4EFE4";
    }
    return "#2A2420";
  };

  const isGhost = () => variant() === "ghost";

  return (
    <Focusable
      class={
        props.fullWidth
          ? "w-full active:translate-x-[1] active:translate-y-[1.5] active:scale-98 transition-transform duration-150 ease-out"
          : "active:translate-x-[1] active:translate-y-[1.5] active:scale-97 transition-transform duration-150 ease-out"
      }
      onPress={props.onPress}
    >
      <View
        class={
          props.boxClass ??
          (props.fullWidth
            ? "relative w-full py-2.5 px-4 items-center justify-center"
            : "relative py-2 px-3.5 items-center justify-center")
        }
        style={{ posType: 0 }}
      >
        <Show when={!isGhost()}>
          <View
            class="absolute inset-0"
            style={{
              posType: 1,
              insetL: 2,
              insetT: 2.5,
              insetR: -2,
              insetB: -2.5,
              bgColor: dark() ? "#000000AA" : "#2A242033",
              radius: 6,
              hitPass: 1,
            }}
          />
        </Show>
        <View
          class="absolute inset-0"
          style={{
            ...ABS_FILL,
            bgColor: fill(),
            borderColor: border(),
            borderWidth: isGhost() ? 1 : 1.5,
            radius: isGhost() ? 999 : 6,
            hitPass: 1,
          }}
        />
        <Text
          class={props.textClass ?? (isGhost() ? "text-2xs font-bold" : "text-xs font-bold")}
          style={props.textClass ? undefined : { textColor: defaultTextColor() }}
        >
          {props.label}
        </Text>
      </View>
    </Focusable>
  );
}

/** Crisp vector toggle switch pill (`多宝同屏` toggle in Today & BabySheet). */
export function LooseleafSwitchPill(props: {
  checked: boolean;
  isDark?: boolean;
  mode?: LooseleafThemeMode;
  onPress?: () => void;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, undefined, palette().mode);
  const isStdDark = () => mode() === "dark";
  const isAmber = () => mode() === "amber-night";
  const trackBg = () => {
    if (isStdDark()) return props.checked ? "#E87A4D" : "#2B2723";
    if (isAmber()) return props.checked ? "#D97706" : "#1E1913";
    return props.checked ? "#DF6B3C" : "#ECE6D8";
  };
  const borderCol = () => (isStdDark() ? "#8A8175" : isAmber() ? "#8C7756" : "#2A2420");
  const thumbBg = () => {
    if (isStdDark()) return props.checked ? "#FFFDF6" : "#B5ADA0";
    if (isAmber()) return props.checked ? "#080706" : "#9E8B6F";
    return "#FFFDF6";
  };

  const body = (
    <View
      class="w-[44] h-[24] px-[2.5] flex-row items-center justify-start shrink-0 transition-colors duration-150 ease-out"
      style={{
        bgColor: trackBg(),
        borderColor: borderCol(),
        borderWidth: 1.5,
        radius: 999,
      }}
    >
      <View
        class="w-[17] h-[17] transition-transform duration-150 ease-out"
        style={{
          translateX: props.checked ? 19 : 0,
          bgColor: thumbBg(),
          borderColor: isStdDark() ? "#24211E" : isAmber() ? "#5C4F3D" : "#2A2420",
          borderWidth: 1.5,
          radius: 999,
        }}
      />
    </View>
  );

  return props.onPress ? (
    <Focusable
      class="active:scale-95 transition-transform duration-150 ease-out"
      onPress={props.onPress}
    >
      {body}
    </Focusable>
  ) : (
    body
  );
}

/** Vertical hand-drawn ink timeline rail row (`12:45` + terracotta dot + ink rule + card). */
export function LooseleafTimelineRow(props: {
  time: string;
  isDark: boolean;
  mode?: LooseleafThemeMode;
  isLast: boolean;
  children?: JSX.Element;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, undefined, palette().mode);
  const isStdDark = () => mode() === "dark";
  const isAmber = () => mode() === "amber-night";

  return (
    <View class="flex-row items-stretch gap-2.5 w-full">
      <View class="w-12 pt-3 flex-row items-start justify-between shrink-0">
        <Text
          class="text-2xs font-bold"
          style={{
            textColor: isStdDark() ? "#B5ADA0" : isAmber() ? "#9E8B6F" : "#2A2420",
          }}
        >
          {props.time}
        </Text>
        <View class="flex-col items-center h-full pt-1">
          <View
            class="w-2.5 h-2.5 shrink-0"
            style={{
              bgColor: isStdDark() ? "#E87A4D" : isAmber() ? "#F59E0B" : "#DF6B3C",
              borderColor: isStdDark() ? "#F2ECE1" : isAmber() ? "#080706" : "#2A2420",
              borderWidth: 1,
              radius: 999,
            }}
          />
          <Show when={!props.isLast}>
            <View
              class="flex-1 w-[1.5] mt-1"
              style={{
                bgColor: isStdDark() ? "#6B645B" : isAmber() ? "#5C4F3D" : "#2A2420",
              }}
            />
          </Show>
        </View>
      </View>
      <View class="flex-col flex-1" style={{ minW: 0 }}>
        {props.children}
      </View>
    </View>
  );
}

/** Floating crisp vector Looseleaf dock capsule with transparent outer safe-area margin. */
export function LooseleafDockCapsule(props: {
  isDark: boolean;
  mode?: LooseleafThemeMode;
  dockSrc?: string;
  bottomInset: number;
  leftInset: number;
  rightInset: number;
  children?: JSX.Element;
}): JSX.Element {
  const { palette } = useLooseleafTheme();
  const mode = () =>
    resolveEffectiveMode(props.mode, props.isDark, props.dockSrc, palette().mode);
  const isStdDark = () => mode() === "dark";
  const isAmber = () => mode() === "amber-night";
  const safeBottom = () => Math.max(10, props.bottomInset);

  return (
    <View
      style={{
        height: 62 + safeBottom(),
        paddingT: 4,
        paddingL: 14 + props.leftInset,
        paddingR: 14 + props.rightInset,
        paddingB: safeBottom(),
      }}
      class="flex-col w-full shrink-0 bg-transparent items-center justify-center"
    >
      <View
        class="relative w-full h-[56] px-2 flex-row items-center justify-between"
        style={{ posType: 0 }}
      >
        {/* Offset hard ink shadow */}
        <View
          class="absolute inset-0"
          style={{
            posType: 1,
            insetL: 2,
            insetT: 3,
            insetR: -2,
            insetB: -3,
            bgColor: isStdDark() || isAmber() ? "#000000CC" : "#2A242033",
            radius: 11,
            hitPass: 1,
          }}
        />
        {/* Crisp vector paper dock shell */}
        <View
          class="absolute inset-0"
          style={{
            ...ABS_FILL,
            bgColor: isStdDark() ? "#24211E" : isAmber() ? "#171410" : "#FAF6EC",
            borderColor: isStdDark() ? "#787066" : isAmber() ? "#7A684D" : "#2A2420",
            borderWidth: 1.5,
            radius: 11,
            hitPass: 1,
          }}
        />
        {props.children}
      </View>
    </View>
  );
}
