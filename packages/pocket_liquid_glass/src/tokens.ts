/**
 * @pocket/liquid_glass — Optical Material Recipes, Concentric Geometry & Semantic Palettes.
 *
 * Engineered from the real rendering architecture of `https://uikit.even.how/`:
 * - Display-P3 / extended-luminance inspired directional specular rim & hairline contour tokens
 * - Four optical material tiers (`clear`, `regular`, `thick`, `chrome`) mapping cleanly onto
 *   PocketJS's retained GPU `liquid_glass.frag` (Snell refraction `1/1.520`, 48-tap golden-angle
 *   disk / 13-tap clear lens) AND zero-pass Specular Vector Glass fallback for dense lists,
 *   budget-capped surfaces, and WeChat Mini Program hosts.
 * - Full 3-mode support: `light`, `dark`, and blue-channel-free `amber-night` (`#RRGG00`).
 * - Strict PocketJS native style compliance: never emits `"transparent"` in `style` color props
 *   (uses `"#00000000"`).
 */

export type LiquidGlassThemeMode = "light" | "dark" | "amber-night";

export type LiquidGlassNamedAccent =
  | "blue"
  | "cyan"
  | "indigo"
  | "violet"
  | "teal"
  | "green"
  | "amber"
  | "orange"
  | "coral"
  | "rose"
  | "neutral";

export type LiquidGlassAccent = LiquidGlassNamedAccent | `#${string}`;

export type LiquidGlassDensity = "comfortable" | "compact";

/**
 * Optical material hierarchy:
 * - `clear`: Pure refractive lens (`blur = 0`, sharp center backdrop, edge bevel refraction + rim).
 *   Ideal for floating `NavigationBar` capsules, `Toolbar`, active `Switch`/`Slider` droplet lenses,
 *   and standalone `LiquidGlassButton`.
 * - `regular`: Balanced frosted refractive glass (`blur = 10`, 48-point golden-angle disk).
 *   Ideal for floating cards, alerts, toasts, and popovers.
 * - `thick`: High-legibility modal glass (`blur = 16`, stronger neutral veil).
 *   Ideal for `Dialog` and `BottomSheet` over busy backdrops.
 * - `chrome`: Zero-pass Specular Vector Glass (`0` GPU `BackdropFilter` passes).
 *   Uses native `gradFrom`/`gradTo` specular sheen + `1px` top-lit luminous rim + outer contour
 *   for dense list tiles, badges, chips, inputs, and 120fps budget-capped surfaces.
 */
export type LiquidGlassMaterial = "clear" | "regular" | "thick" | "chrome";

export interface LiquidGlassOpticalRecipe {
  readonly material: LiquidGlassMaterial;
  readonly usesGpuBackdrop: boolean;
  readonly shaderMaterial: "clear" | "regular";
  readonly blurSigma: number;
  readonly materialStrength: number;
  readonly materialTintArgb: number;
  readonly tintOpacity: number;
  readonly warp: boolean;
  readonly sheenFrom: string;
  readonly sheenTo: string;
  readonly rimTop: string;
  readonly borderOuter: string;
  readonly shadowColor: string;
}

export interface LiquidGlassStatusTriplet {
  readonly fg: string;
  readonly subtle: string;
  readonly border: string;
  readonly solid: string;
  readonly solidFg: string;
}

export interface LiquidGlassPalette {
  readonly mode: LiquidGlassThemeMode;
  readonly dark: boolean;
  readonly accentName: LiquidGlassNamedAccent;
  readonly accentHex: string;
  readonly accentStrong: string;
  readonly accentSubtle: string;
  readonly accentForeground: string;
  // Canvas & mesh orbs (gives refractive bevels rich chromatic edges to bend)
  readonly canvasBg: string;
  readonly canvasGradFrom: string;
  readonly canvasGradTo: string;
  readonly orbPrimary: string;
  readonly orbSecondary: string;
  readonly orbTertiary: string;
  // Surfaces & fallback fills
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceMuted: string;
  readonly surfaceSolidSheet: string;
  readonly scrim: string;
  // Specular optical tokens
  readonly rimHighlight: string;
  readonly rimSubtle: string;
  readonly contourOuter: string;
  readonly sheenLightFrom: string;
  readonly sheenLightTo: string;
  readonly shadowAmbient: string;
  // Typography
  readonly ink: string;
  readonly inkSecondary: string;
  readonly inkMuted: string;
  // Status triplets
  readonly success: LiquidGlassStatusTriplet;
  readonly warning: LiquidGlassStatusTriplet;
  readonly danger: LiquidGlassStatusTriplet;
  readonly info: LiquidGlassStatusTriplet;
  // Concentric Liquid Glass geometry
  readonly radiusControl: number;
  readonly radiusSurface: number;
  readonly radiusPanel: number;
  readonly radiusPill: number;
}

export const LIQUID_GLASS_ACCENTS: readonly LiquidGlassNamedAccent[] = [
  "blue",
  "cyan",
  "indigo",
  "violet",
  "teal",
  "green",
  "amber",
  "orange",
  "coral",
  "rose",
  "neutral",
] as const;

interface AccentSpec {
  readonly light: string;
  readonly lightStrong: string;
  readonly lightSubtle: string;
  readonly lightFg: string;
  readonly dark: string;
  readonly darkStrong: string;
  readonly darkSubtle: string;
  readonly darkFg: string;
}

const ACCENT_SPECS: Readonly<Record<LiquidGlassNamedAccent, AccentSpec>> = {
  blue: {
    light: "#007AFF",
    lightStrong: "#005EC4",
    lightSubtle: "#E5F1FF",
    lightFg: "#FFFFFF",
    dark: "#2E92FF",
    darkStrong: "#64AEFF",
    darkSubtle: "#122947",
    darkFg: "#FFFFFF",
  },
  cyan: {
    light: "#0096D6",
    lightStrong: "#0074A8",
    lightSubtle: "#E3F6FF",
    lightFg: "#FFFFFF",
    dark: "#32ADE6",
    darkStrong: "#70C8F2",
    darkSubtle: "#102E3D",
    darkFg: "#061821",
  },
  indigo: {
    light: "#5856D6",
    lightStrong: "#4240B3",
    lightSubtle: "#ECEBFF",
    lightFg: "#FFFFFF",
    dark: "#7876F5",
    darkStrong: "#9E9CFA",
    darkSubtle: "#1E1D42",
    darkFg: "#FFFFFF",
  },
  violet: {
    light: "#7C3AED",
    lightStrong: "#6426D1",
    lightSubtle: "#F2EBFF",
    lightFg: "#FFFFFF",
    dark: "#9B6BFF",
    darkStrong: "#BCA0FF",
    darkSubtle: "#251842",
    darkFg: "#FFFFFF",
  },
  teal: {
    light: "#0D9488",
    lightStrong: "#0B766C",
    lightSubtle: "#E6FAF7",
    lightFg: "#FFFFFF",
    dark: "#2DD4BF",
    darkStrong: "#5EEAD4",
    darkSubtle: "#102E2B",
    darkFg: "#051B18",
  },
  green: {
    light: "#248A3D",
    lightStrong: "#1B6E30",
    lightSubtle: "#E8F8EC",
    lightFg: "#FFFFFF",
    dark: "#30D158",
    darkStrong: "#63E082",
    darkSubtle: "#112D19",
    darkFg: "#06190B",
  },
  amber: {
    light: "#D97706",
    lightStrong: "#B45309",
    lightSubtle: "#FEF3C7",
    lightFg: "#FFFFFF",
    dark: "#FF9F0A",
    darkStrong: "#FFB840",
    darkSubtle: "#332209",
    darkFg: "#140C02",
  },
  orange: {
    light: "#EA580C",
    lightStrong: "#C2410C",
    lightSubtle: "#FFEDD5",
    lightFg: "#FFFFFF",
    dark: "#FF6B2C",
    darkStrong: "#FF8F5E",
    darkSubtle: "#331A10",
    darkFg: "#FFFFFF",
  },
  coral: {
    light: "#E0533C",
    lightStrong: "#BF3E28",
    lightSubtle: "#FDECE9",
    lightFg: "#FFFFFF",
    dark: "#FF6E57",
    darkStrong: "#FF9280",
    darkSubtle: "#331915",
    darkFg: "#FFFFFF",
  },
  rose: {
    light: "#E11D48",
    lightStrong: "#BE123C",
    lightSubtle: "#FFE6EC",
    lightFg: "#FFFFFF",
    dark: "#FF375F",
    darkStrong: "#FF6E8B",
    darkSubtle: "#36131C",
    darkFg: "#FFFFFF",
  },
  neutral: {
    light: "#1D1D1F",
    lightStrong: "#000000",
    lightSubtle: "#EBEBF0",
    lightFg: "#FFFFFF",
    dark: "#F5F5F7",
    darkStrong: "#FFFFFF",
    darkSubtle: "#2C2C2E",
    darkFg: "#111113",
  },
};

const HEX6_RE = /^#([0-9a-fA-F]{6})$/;

/** Parse `#RRGGBB` into unsigned 32-bit ARGB (`0xFFRRGGBB`). */
export function hexToArgb(hex: string, fallback = 0xff007aff): number {
  const m = HEX6_RE.exec(hex.trim());
  if (!m) return fallback;
  const rgb = Number.parseInt(m[1]!, 16);
  return Number.isFinite(rgb) ? ((0xff000000 | rgb) >>> 0) : fallback;
}

/**
 * Concentric corner radius calculation (`inner = max(minRadius, outer - padding)`),
 * keeping nested controls optically concentric with outer Liquid Glass capsules and sheets.
 */
export function concentricGlassRadius(
  outerRadius: number,
  padding: number,
  minRadius = 8,
): number {
  if (!Number.isFinite(outerRadius) || !Number.isFinite(padding)) return minRadius;
  if (outerRadius >= 999) return 999;
  return Math.max(minRadius, Math.round((outerRadius - Math.max(0, padding)) * 10) / 10);
}

/**
 * Clinical 0%-Blue-Light Amber Night palette (`#RRGG00` — zero blue emission across every token).
 */
const AMBER_NIGHT_PALETTE: Omit<LiquidGlassPalette, "accentName"> = {
  mode: "amber-night",
  dark: true,
  accentHex: "#FF9A00",
  accentStrong: "#FFB800",
  accentSubtle: "#2E1C00",
  accentForeground: "#0A0600",
  canvasBg: "#070500",
  canvasGradFrom: "#0C0800",
  canvasGradTo: "#160E00",
  orbPrimary: "#362000",
  orbSecondary: "#291600",
  orbTertiary: "#1F1300",
  surface: "#140D00CC",
  surfaceRaised: "#1D1300E6",
  surfaceMuted: "#191000B3",
  surfaceSolidSheet: "#170F00",
  scrim: "#050300CC",
  rimHighlight: "#FFBB0066",
  rimSubtle: "#996A0044",
  contourOuter: "#473000",
  sheenLightFrom: "#2B1C00CC",
  sheenLightTo: "#140D0099",
  shadowAmbient: "#000000CC",
  ink: "#FFE000",
  inkSecondary: "#CCA000",
  inkMuted: "#8F6D00",
  success: {
    fg: "#A6E000",
    subtle: "#1B2600",
    border: "#425C00",
    solid: "#78AD00",
    solidFg: "#080600",
  },
  warning: {
    fg: "#FFB700",
    subtle: "#2E1F00",
    border: "#664600",
    solid: "#E69500",
    solidFg: "#080600",
  },
  danger: {
    fg: "#FF6600",
    subtle: "#301200",
    border: "#702B00",
    solid: "#D94500",
    solidFg: "#FFF000",
  },
  info: {
    fg: "#F0B800",
    subtle: "#291E00",
    border: "#574000",
    solid: "#CC9200",
    solidFg: "#080600",
  },
  radiusControl: 14,
  radiusSurface: 22,
  radiusPanel: 30,
  radiusPill: 999,
};

export function resolveLiquidGlassPalette(
  modeInput: LiquidGlassThemeMode | boolean = "light",
  accentInput: LiquidGlassAccent = "blue",
): LiquidGlassPalette {
  const mode: LiquidGlassThemeMode =
    typeof modeInput === "boolean" ? (modeInput ? "dark" : "light") : modeInput;

  const customMatch =
    typeof accentInput === "string" ? HEX6_RE.exec(accentInput.trim()) : null;
  const customHex = customMatch ? `#${customMatch[1]!.toUpperCase()}` : undefined;
  const named: LiquidGlassNamedAccent = (
    (LIQUID_GLASS_ACCENTS as readonly string[]).includes(accentInput)
      ? accentInput
      : "blue"
  ) as LiquidGlassNamedAccent;

  if (mode === "amber-night") {
    return {
      ...AMBER_NIGHT_PALETTE,
      accentName: named,
    };
  }

  const spec = ACCENT_SPECS[named];
  if (mode === "dark") {
    const accHex = customHex ?? spec.dark;
    return {
      mode: "dark",
      dark: true,
      accentName: named,
      accentHex: accHex,
      accentStrong: customHex ?? spec.darkStrong,
      accentSubtle: spec.darkSubtle,
      accentForeground: customHex ? "#FFFFFF" : spec.darkFg,
      canvasBg: "#080D1A",
      canvasGradFrom: "#0B1326",
      canvasGradTo: "#181029",
      orbPrimary: "#1E3B70",
      orbSecondary: "#4C2359",
      orbTertiary: "#124E48",
      surface: "#172033A8",
      surfaceRaised: "#1E2940CC",
      surfaceMuted: "#121A2B99",
      surfaceSolidSheet: "#141C2E",
      scrim: "#03060DB8",
      rimHighlight: "#FFFFFF42",
      rimSubtle: "#FFFFFF24",
      contourOuter: "#33446388",
      sheenLightFrom: "#2A3957B8",
      sheenLightTo: "#141D3088",
      shadowAmbient: "#00000088",
      ink: "#F5F7FA",
      inkSecondary: "#BAC5D8",
      inkMuted: "#7E8CA3",
      success: {
        fg: "#34D399",
        subtle: "#0F2920CC",
        border: "#1F543F",
        solid: "#28C840",
        solidFg: "#061A0A",
      },
      warning: {
        fg: "#FBBF24",
        subtle: "#2E210DCC",
        border: "#5E4318",
        solid: "#FF9F0A",
        solidFg: "#140C02",
      },
      danger: {
        fg: "#FF6961",
        subtle: "#301518CC",
        border: "#63272D",
        solid: "#FF453A",
        solidFg: "#FFFFFF",
      },
      info: {
        fg: "#64AEFF",
        subtle: "#122642CC",
        border: "#25497D",
        solid: "#2E92FF",
        solidFg: "#FFFFFF",
      },
      radiusControl: 14,
      radiusSurface: 22,
      radiusPanel: 30,
      radiusPill: 999,
    };
  }

  // Light mode (modeled after uikit.even.how `#f2f2f7` iOS 26 gallery canvas + translucent glass)
  const accHex = customHex ?? spec.light;
  return {
    mode: "light",
    dark: false,
    accentName: named,
    accentHex: accHex,
    accentStrong: customHex ?? spec.lightStrong,
    accentSubtle: spec.lightSubtle,
    accentForeground: customHex ? "#FFFFFF" : spec.lightFg,
    canvasBg: "#F2F4FA",
    canvasGradFrom: "#EEF3FF",
    canvasGradTo: "#FDF4EC",
    orbPrimary: "#BBD2FF",
    orbSecondary: "#FFD4CC",
    orbTertiary: "#BEEFE2",
    surface: "#FFFFFFB8",
    surfaceRaised: "#FFFFFFD9",
    surfaceMuted: "#E8ECF5B3",
    surfaceSolidSheet: "#F7F9FC",
    scrim: "#0F172A52",
    rimHighlight: "#FFFFFFE6",
    rimSubtle: "#FFFFFF99",
    contourOuter: "#CBD5E6B3",
    sheenLightFrom: "#FFFFFFE0",
    sheenLightTo: "#F2F6FFB0",
    shadowAmbient: "#0F1C381A",
    ink: "#151C28",
    inkSecondary: "#4E5B73",
    inkMuted: "#7B879E",
    success: {
      fg: "#16794B",
      subtle: "#E6F7EECC",
      border: "#B2E6CA",
      solid: "#248A3D",
      solidFg: "#FFFFFF",
    },
    warning: {
      fg: "#AD5700",
      subtle: "#FFF3D9CC",
      border: "#F5D28C",
      solid: "#D97706",
      solidFg: "#FFFFFF",
    },
    danger: {
      fg: "#C91D38",
      subtle: "#FFE8ECCC",
      border: "#F7B7C2",
      solid: "#E11D48",
      solidFg: "#FFFFFF",
    },
    info: {
      fg: "#0062CC",
      subtle: "#E6F1FFCC",
      border: "#B5D6FF",
      solid: "#007AFF",
      solidFg: "#FFFFFF",
    },
    radiusControl: 14,
    radiusSurface: 22,
    radiusPanel: 30,
    radiusPill: 999,
  };
}

/**
 * Resolve exact GPU & Vector fallback optical parameters for a given material tier and theme.
 */
export function resolveOpticalRecipe(
  material: LiquidGlassMaterial,
  palette: LiquidGlassPalette,
): LiquidGlassOpticalRecipe {
  if (palette.mode === "amber-night" || material === "chrome") {
    return {
      material,
      usesGpuBackdrop: false,
      shaderMaterial: "clear",
      blurSigma: 0,
      materialStrength: 0,
      materialTintArgb: palette.mode === "amber-night" ? 0xff191000 : 0xfff2f4fa,
      tintOpacity: 0,
      warp: false,
      sheenFrom: palette.sheenLightFrom,
      sheenTo: palette.sheenLightTo,
      rimTop: palette.rimHighlight,
      borderOuter: palette.contourOuter,
      shadowColor: palette.shadowAmbient,
    };
  }

  if (material === "clear") {
    return {
      material: "clear",
      usesGpuBackdrop: true,
      shaderMaterial: "clear",
      blurSigma: 0,
      materialStrength: palette.dark ? 0.06 : 0.02,
      materialTintArgb: palette.dark ? 0xff161f33 : 0xfff7f9ff,
      tintOpacity: palette.dark ? 0.06 : 0.03,
      warp: false,
      sheenFrom: palette.sheenLightFrom,
      sheenTo: palette.sheenLightTo,
      rimTop: palette.rimHighlight,
      borderOuter: palette.contourOuter,
      shadowColor: palette.shadowAmbient,
    };
  }

  if (material === "thick") {
    return {
      material: "thick",
      usesGpuBackdrop: true,
      shaderMaterial: "regular",
      blurSigma: 16,
      materialStrength: palette.dark ? 0.68 : 0.58,
      materialTintArgb: palette.dark ? 0xff141c2e : 0xfff7f9fc,
      tintOpacity: palette.dark ? 0.28 : 0.22,
      warp: false,
      sheenFrom: palette.surfaceRaised,
      sheenTo: palette.surface,
      rimTop: palette.rimHighlight,
      borderOuter: palette.contourOuter,
      shadowColor: palette.shadowAmbient,
    };
  }

  // `regular`
  return {
    material: "regular",
    usesGpuBackdrop: true,
    shaderMaterial: "regular",
    blurSigma: 10,
    materialStrength: palette.dark ? 0.28 : 0.20,
    materialTintArgb: palette.dark ? 0xff182238 : 0xfff5f8ff,
    tintOpacity: palette.dark ? 0.14 : 0.10,
    warp: true,
    sheenFrom: palette.sheenLightFrom,
    sheenTo: palette.sheenLightTo,
    rimTop: palette.rimHighlight,
    borderOuter: palette.contourOuter,
    shadowColor: palette.shadowAmbient,
  };
}
