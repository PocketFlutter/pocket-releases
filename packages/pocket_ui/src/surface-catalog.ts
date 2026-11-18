/**
 * Pure TypeScript Apple & Android Full-Ecosystem + System Widget/Extension
 * Surface Catalog (`@pocket/ui/surface-catalog`).
 *
 * Shared directly between Guest SDK (`@pocket/ui/surfaces`) and Pocket Studio
 * (`sdk/editor/preview_device.ts`) so there is zero duplicate device/widget
 * geometry table and zero JSX runtime dependency in Node/Bun editor tooling.
 */

import {
  EMPTY_DISPLAY_GEOMETRY,
  availableDisplayPanes,
  deriveResponsiveLayout,
  type DisplayGeometry,
  type DisplayInsets,
  type DisplayRegion,
} from "./responsive.ts";

export const SURFACE_CONTEXT_EVENT = "platform.surface";
export const WIDGET_SNAPSHOT_EVENT = "widget.snapshot";
export const WIDGET_ACTION_EVENT = "widget.action";
export const MAX_WIDGET_HOTSPOTS = 64;

export type EcosystemId = "apple" | "android";

export type SurfaceCatalogGroup =
  | "apple-device"
  | "apple-widget"
  | "android-device"
  | "android-widget";

export type SurfaceKind =
  | "device"
  | "widget"
  | "lock-accessory"
  | "live-activity"
  | "complication"
  | "tile"
  | "clip";

export type SurfaceFamily =
  | "phone"
  | "foldable"
  | "tablet"
  | "desktop"
  | "menubar"
  | "watch"
  | "tv"
  | "spatial"
  | "automotive"
  | "systemSmall"
  | "systemMedium"
  | "systemLarge"
  | "systemExtraLarge"
  | "accessoryCircular"
  | "accessoryRectangular"
  | "accessoryInline"
  | "dynamicIslandCompact"
  | "dynamicIslandMinimal"
  | "dynamicIslandExpanded"
  | "lockLiveActivity"
  | "watchSmartStack"
  | "watchCorner"
  | "appClip"
  | "appWidgetSmall"
  | "appWidgetMedium"
  | "appWidgetLarge"
  | "atAGlance"
  | "liveUpdate"
  | "wearTile"
  | "instantApp";

export type SurfaceRenderMode =
  | "fullColor"
  | "vibrant"
  | "accented"
  | "alwaysOn";

export type SurfaceScreenShape = "rect" | "round" | "capsule";

export type SurfaceInputModality =
  | "touch"
  | "pointer"
  | "crown"
  | "dpad"
  | "spatial";

export type SurfaceShellVariant =
  | "phone-island"
  | "phone-notch"
  | "phone-home"
  | "phone-punch"
  | "tablet"
  | "foldable-open"
  | "macos-window"
  | "macos-menubar"
  | "watch-rect"
  | "watch-round"
  | "tv"
  | "spatial-glass"
  | "car-console"
  | "widget-home"
  | "widget-lock"
  | "dynamic-island"
  | "app-clip";

export type SurfaceWallpaperBackdrop =
  | "ios-aurora"
  | "ios-lock"
  | "watch-face"
  | "material-you"
  | "spatial-room"
  | "none";

export interface SurfaceShellSpec {
  readonly variant: SurfaceShellVariant;
  readonly borderRadius: number;
  readonly bezel: number;
  readonly wallpaper: SurfaceWallpaperBackdrop;
  readonly statusBarHeight: number;
  readonly homeIndicatorWidth: number;
  readonly homeIndicatorHeight: number;
  readonly homeIndicatorBottom: number;
  readonly cutoutWidth: number;
  readonly cutoutHeight: number;
}

export interface EcosystemSurfaceProfile {
  readonly id: string;
  readonly ecosystem: EcosystemId;
  readonly group: SurfaceCatalogGroup;
  readonly kind: SurfaceKind;
  readonly family: SurfaceFamily;
  readonly label: string;
  readonly shortLabel: string;
  /** Logical width in [1, 1023] (preserving 1:1 10-bit native pointer wire). */
  readonly width: number;
  /** Logical height in [1, 1023] (preserving 1:1 10-bit native pointer wire). */
  readonly height: number;
  readonly pixelRatio: number;
  readonly safeArea: DisplayInsets;
  readonly reservedRegions: readonly DisplayRegion[];
  readonly screenShape: SurfaceScreenShape;
  readonly cornerRadius: number;
  readonly contentPadding: number;
  readonly defaultRenderMode: SurfaceRenderMode;
  readonly supportedRenderModes: readonly SurfaceRenderMode[];
  readonly inputModality: SurfaceInputModality;
  readonly isSystemSurface: boolean;
  /** Default companion full-screen device when launching a widget deep link. */
  readonly companionDeviceId?: string;
  readonly shell: SurfaceShellSpec;
}

export interface SurfaceEnvironment {
  readonly profileId: string;
  readonly ecosystem: EcosystemId;
  readonly kind: SurfaceKind;
  readonly family: SurfaceFamily;
  readonly renderMode: SurfaceRenderMode;
  readonly screenShape: SurfaceScreenShape;
  readonly inputModality: SurfaceInputModality;
  readonly isSystemSurface: boolean;
  readonly cornerRadius: number;
  readonly contentPadding: number;
  readonly entryUri?: string;
}

const ZERO_INSETS: DisplayInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

function freezeInsets(
  top = 0,
  right = 0,
  bottom = 0,
  left = 0,
): DisplayInsets {
  return Object.freeze({ top, right, bottom, left });
}

function freezeRegion(
  id: string,
  kind: "division" | "occlusion",
  left: number,
  top: number,
  width: number,
  height: number,
): DisplayRegion {
  return Object.freeze({
    id,
    kind,
    frame: Object.freeze({ left, top, width, height }),
    margins: ZERO_INSETS,
    active: true,
  });
}

function freezeShell(
  variant: SurfaceShellVariant,
  borderRadius: number,
  bezel: number,
  wallpaper: SurfaceWallpaperBackdrop = "none",
  extras: Partial<Omit<SurfaceShellSpec, "variant" | "borderRadius" | "bezel" | "wallpaper">> = {},
): SurfaceShellSpec {
  return Object.freeze({
    variant,
    borderRadius,
    bezel,
    wallpaper,
    statusBarHeight: extras.statusBarHeight ?? 0,
    homeIndicatorWidth: extras.homeIndicatorWidth ?? 0,
    homeIndicatorHeight: extras.homeIndicatorHeight ?? 0,
    homeIndicatorBottom: extras.homeIndicatorBottom ?? 0,
    cutoutWidth: extras.cutoutWidth ?? 0,
    cutoutHeight: extras.cutoutHeight ?? 0,
  });
}

/**
 * Compute the inscribed square inset `ceil(D * (1 - sqrt(1/2)) / 2)` for a
 * circular watch face or Wear OS tile so rectangular flex rows never clip
 * against the round bezel.
 */
export function inscribedRoundInset(width: number, height = width): number {
  const diameter = Math.max(0, Math.min(width, height));
  if (!Number.isFinite(diameter) || diameter <= 0) return 0;
  return Math.ceil((diameter * (1 - Math.SQRT1_2)) / 2);
}

const DEVICE_MODES: readonly SurfaceRenderMode[] = Object.freeze([
  "fullColor",
  "alwaysOn",
]);
const WIDGET_MODES: readonly SurfaceRenderMode[] = Object.freeze([
  "fullColor",
  "accented",
  "vibrant",
  "alwaysOn",
]);
const LOCK_MODES: readonly SurfaceRenderMode[] = Object.freeze([
  "vibrant",
  "accented",
  "alwaysOn",
  "fullColor",
]);

function defineProfile(profile: EcosystemSurfaceProfile): EcosystemSurfaceProfile {
  return Object.freeze({
    ...profile,
    reservedRegions: Object.freeze([...profile.reservedRegions]),
  });
}

export const ECOSYSTEM_SURFACE_PROFILES: readonly EcosystemSurfaceProfile[] = Object.freeze([
  // ── 1. Apple Ecosystem Devices ────────────────────────────────────────────
  defineProfile({
    id: "iphone-16-pro",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "phone",
    label: "iPhone 16 Pro · 灵动岛",
    shortLabel: "iPhone 16 Pro",
    width: 393,
    height: 852,
    pixelRatio: 3,
    safeArea: freezeInsets(59, 0, 34, 0),
    reservedRegions: [
      freezeRegion("display-feature-island", "occlusion", 134, 11, 125, 37),
    ],
    screenShape: "rect",
    cornerRadius: 46,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("phone-island", 46, 12, "none", {
      statusBarHeight: 54,
      homeIndicatorWidth: 138,
      homeIndicatorHeight: 5,
      homeIndicatorBottom: 8,
      cutoutWidth: 125,
      cutoutHeight: 37,
    }),
  }),
  defineProfile({
    id: "iphone-se",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "phone",
    label: "iPhone SE · 经典小屏",
    shortLabel: "iPhone SE",
    width: 375,
    height: 667,
    pixelRatio: 2,
    safeArea: freezeInsets(20, 0, 0, 0),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 18,
    contentPadding: 14,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("phone-home", 18, 14, "none", {
      statusBarHeight: 20,
    }),
  }),
  defineProfile({
    id: "ipad-pro",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "tablet",
    label: "iPad Pro 11\" · 竖屏",
    shortLabel: "iPad Pro",
    width: 768,
    height: 1023,
    pixelRatio: 2,
    safeArea: freezeInsets(24, 0, 20, 0),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 24,
    contentPadding: 20,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("tablet", 24, 14, "none", {
      statusBarHeight: 24,
      homeIndicatorWidth: 160,
      homeIndicatorHeight: 5,
      homeIndicatorBottom: 7,
    }),
  }),
  defineProfile({
    id: "ipad-split",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "tablet",
    label: "iPad Split View · 分屏窄栏",
    shortLabel: "iPad Split",
    width: 375,
    height: 1023,
    pixelRatio: 2,
    safeArea: freezeInsets(24, 0, 20, 0),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 20,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("tablet", 20, 10, "none", {
      statusBarHeight: 24,
      homeIndicatorWidth: 120,
      homeIndicatorHeight: 5,
      homeIndicatorBottom: 7,
    }),
  }),
  defineProfile({
    id: "macos-window",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "desktop",
    label: "macOS 桌面窗口 · 红黄绿标题栏",
    shortLabel: "macOS Window",
    width: 1023,
    height: 680,
    pixelRatio: 2,
    safeArea: freezeInsets(28, 0, 0, 0),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 12,
    contentPadding: 20,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "pointer",
    isSystemSurface: false,
    shell: freezeShell("macos-window", 12, 2, "none", {
      statusBarHeight: 28,
    }),
  }),
  defineProfile({
    id: "macos-menubar",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "menubar",
    label: "macOS MenuBar Extra · 菜单栏弹窗",
    shortLabel: "MenuBar Extra",
    width: 340,
    height: 420,
    pixelRatio: 2,
    safeArea: freezeInsets(12, 0, 10, 0),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 14,
    contentPadding: 14,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "pointer",
    isSystemSurface: false,
    companionDeviceId: "macos-window",
    shell: freezeShell("macos-menubar", 14, 2, "ios-aurora"),
  }),
  defineProfile({
    id: "apple-watch-45mm",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "watch",
    label: "Apple Watch Series 10 · 45mm",
    shortLabel: "Apple Watch",
    width: 198,
    height: 242,
    pixelRatio: 2,
    safeArea: freezeInsets(22, 6, 12, 6),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 42,
    contentPadding: 10,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "crown",
    isSystemSurface: false,
    shell: freezeShell("watch-rect", 42, 10, "none", {
      statusBarHeight: 22,
    }),
  }),
  defineProfile({
    id: "apple-tv",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "tv",
    label: "Apple TV · tvOS 10-Foot",
    shortLabel: "Apple TV",
    width: 960,
    height: 540,
    pixelRatio: 2,
    safeArea: freezeInsets(32, 48, 32, 48),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 10,
    contentPadding: 32,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "dpad",
    isSystemSurface: false,
    shell: freezeShell("tv", 10, 10, "none"),
  }),
  defineProfile({
    id: "vision-pro",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "spatial",
    label: "Apple Vision Pro · visionOS 空间玻璃",
    shortLabel: "Vision Pro",
    width: 960,
    height: 600,
    pixelRatio: 2,
    safeArea: freezeInsets(20, 20, 28, 20),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 34,
    contentPadding: 24,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "spatial",
    isSystemSurface: false,
    shell: freezeShell("spatial-glass", 34, 4, "spatial-room"),
  }),
  defineProfile({
    id: "carplay",
    ecosystem: "apple",
    group: "apple-device",
    kind: "device",
    family: "automotive",
    label: "Apple CarPlay · 车载中控",
    shortLabel: "CarPlay",
    width: 800,
    height: 480,
    pixelRatio: 2,
    safeArea: freezeInsets(12, 16, 12, 72),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 18,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("car-console", 18, 10, "none"),
  }),

  // ── 2. Apple System Widgets, Lock Screen, Live Activities & Complications ─
  defineProfile({
    id: "ios-widget-small",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "widget",
    family: "systemSmall",
    label: "Today / 主屏小组件 · 小号 (Small)",
    shortLabel: "Widget Small",
    width: 158,
    height: 158,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 22,
    contentPadding: 14,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("widget-home", 22, 0, "ios-aurora"),
  }),
  defineProfile({
    id: "ios-widget-medium",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "widget",
    family: "systemMedium",
    label: "Today / 主屏小组件 · 中号 (Medium)",
    shortLabel: "Widget Medium",
    width: 338,
    height: 158,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 22,
    contentPadding: 14,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("widget-home", 22, 0, "ios-aurora"),
  }),
  defineProfile({
    id: "ios-widget-large",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "widget",
    family: "systemLarge",
    label: "Today / 主屏小组件 · 大号 (Large)",
    shortLabel: "Widget Large",
    width: 338,
    height: 354,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 22,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("widget-home", 22, 0, "ios-aurora"),
  }),
  defineProfile({
    id: "ipad-widget-xl",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "widget",
    family: "systemExtraLarge",
    label: "iPad / macOS 桌面小组件 · 特大号 (XL)",
    shortLabel: "Widget XL",
    width: 700,
    height: 354,
    pixelRatio: 2,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 24,
    contentPadding: 18,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "ipad-pro",
    shell: freezeShell("widget-home", 24, 0, "ios-aurora"),
  }),
  defineProfile({
    id: "ios-lock-circular",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "lock-accessory",
    family: "accessoryCircular",
    label: "iOS 锁屏圆形小组件 (Circular)",
    shortLabel: "Lock Circular",
    width: 76,
    height: 76,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "round",
    cornerRadius: 38,
    contentPadding: 8,
    defaultRenderMode: "vibrant",
    supportedRenderModes: LOCK_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("widget-lock", 38, 0, "ios-lock"),
  }),
  defineProfile({
    id: "ios-lock-rectangular",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "lock-accessory",
    family: "accessoryRectangular",
    label: "iOS 锁屏矩形小组件 (Rectangular)",
    shortLabel: "Lock Rectangular",
    width: 172,
    height: 76,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 16,
    contentPadding: 10,
    defaultRenderMode: "vibrant",
    supportedRenderModes: LOCK_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("widget-lock", 16, 0, "ios-lock"),
  }),
  defineProfile({
    id: "ios-lock-inline",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "lock-accessory",
    family: "accessoryInline",
    label: "iOS 锁屏时间上方行内组件 (Inline)",
    shortLabel: "Lock Inline",
    width: 234,
    height: 28,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "capsule",
    cornerRadius: 14,
    contentPadding: 6,
    defaultRenderMode: "vibrant",
    supportedRenderModes: LOCK_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("widget-lock", 14, 0, "ios-lock"),
  }),
  defineProfile({
    id: "ios-island-compact",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "live-activity",
    family: "dynamicIslandCompact",
    label: "灵动岛 · 紧凑态 (Compact)",
    shortLabel: "Island Compact",
    width: 236,
    height: 37,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [
      freezeRegion("dynamic-island-cutout", "occlusion", 74, 0, 88, 37),
    ],
    screenShape: "capsule",
    cornerRadius: 19,
    contentPadding: 10,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("dynamic-island", 19, 0, "ios-aurora", {
      cutoutWidth: 88,
      cutoutHeight: 37,
    }),
  }),
  defineProfile({
    id: "ios-island-minimal",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "live-activity",
    family: "dynamicIslandMinimal",
    label: "灵动岛 · 极简气泡 (Minimal)",
    shortLabel: "Island Minimal",
    width: 45,
    height: 37,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "capsule",
    cornerRadius: 19,
    contentPadding: 6,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("dynamic-island", 19, 0, "ios-aurora"),
  }),
  defineProfile({
    id: "ios-live-activity-expanded",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "live-activity",
    family: "dynamicIslandExpanded",
    label: "灵动岛 · 展开态实时活动 (Expanded)",
    shortLabel: "Island Expanded",
    width: 366,
    height: 160,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 36,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("dynamic-island", 36, 0, "ios-aurora", {
      cutoutWidth: 112,
      cutoutHeight: 24,
    }),
  }),
  defineProfile({
    id: "ios-lock-live-activity",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "live-activity",
    family: "lockLiveActivity",
    label: "iOS 锁屏实时活动横幅 (Live Activity)",
    shortLabel: "Lock Live Activity",
    width: 366,
    height: 128,
    pixelRatio: 3,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 24,
    contentPadding: 14,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("widget-lock", 24, 0, "ios-lock"),
  }),
  defineProfile({
    id: "watchos-smart-stack",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "complication",
    family: "watchSmartStack",
    label: "watchOS 智能叠放卡片 (Smart Stack)",
    shortLabel: "Watch Smart Stack",
    width: 178,
    height: 82,
    pixelRatio: 2,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 20,
    contentPadding: 10,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "crown",
    isSystemSurface: true,
    companionDeviceId: "apple-watch-45mm",
    shell: freezeShell("widget-lock", 20, 0, "watch-face"),
  }),
  defineProfile({
    id: "watchos-complication-corner",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "complication",
    family: "watchCorner",
    label: "watchOS 表盘复杂功能 (Complication)",
    shortLabel: "Watch Complication",
    width: 68,
    height: 68,
    pixelRatio: 2,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "round",
    cornerRadius: 34,
    contentPadding: 8,
    defaultRenderMode: "accented",
    supportedRenderModes: LOCK_MODES,
    inputModality: "crown",
    isSystemSurface: true,
    companionDeviceId: "apple-watch-45mm",
    shell: freezeShell("widget-lock", 34, 0, "watch-face"),
  }),
  defineProfile({
    id: "ios-app-clip",
    ecosystem: "apple",
    group: "apple-widget",
    kind: "clip",
    family: "appClip",
    label: "iOS App Clip 轻应用半屏卡片",
    shortLabel: "App Clip",
    width: 393,
    height: 520,
    pixelRatio: 3,
    safeArea: freezeInsets(16, 0, 28, 0),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 32,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "iphone-16-pro",
    shell: freezeShell("app-clip", 32, 8, "ios-aurora", {
      homeIndicatorWidth: 134,
      homeIndicatorHeight: 5,
      homeIndicatorBottom: 8,
    }),
  }),

  // ── 3. Android Ecosystem Devices ──────────────────────────────────────────
  defineProfile({
    id: "pixel-9",
    ecosystem: "android",
    group: "android-device",
    kind: "device",
    family: "phone",
    label: "Google Pixel 9 · 居中挖孔屏",
    shortLabel: "Pixel 9",
    width: 412,
    height: 915,
    pixelRatio: 2.625,
    safeArea: freezeInsets(48, 0, 24, 0),
    reservedRegions: [
      freezeRegion("display-feature-cutout", "occlusion", 194, 12, 24, 24),
    ],
    screenShape: "rect",
    cornerRadius: 38,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("phone-punch", 38, 12, "none", {
      statusBarHeight: 44,
      homeIndicatorWidth: 108,
      homeIndicatorHeight: 4,
      homeIndicatorBottom: 8,
      cutoutWidth: 22,
      cutoutHeight: 22,
    }),
  }),
  defineProfile({
    id: "android-fold-cover",
    ecosystem: "android",
    group: "android-device",
    kind: "device",
    family: "foldable",
    label: "Android 折叠屏 · 闭合外屏 (Cover)",
    shortLabel: "Fold Cover",
    width: 384,
    height: 884,
    pixelRatio: 3,
    safeArea: freezeInsets(44, 0, 24, 0),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 28,
    contentPadding: 14,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("phone-punch", 28, 12, "none", {
      statusBarHeight: 42,
      homeIndicatorWidth: 104,
      homeIndicatorHeight: 4,
      homeIndicatorBottom: 8,
      cutoutWidth: 20,
      cutoutHeight: 20,
    }),
  }),
  defineProfile({
    id: "android-fold-open",
    ecosystem: "android",
    group: "android-device",
    kind: "device",
    family: "foldable",
    label: "Android 折叠屏 · 展开双栏铰链 (Unfolded)",
    shortLabel: "Fold Open",
    width: 840,
    height: 960,
    pixelRatio: 2.5,
    safeArea: freezeInsets(32, 0, 24, 0),
    reservedRegions: [
      freezeRegion("display-feature-hinge", "division", 416, 0, 8, 960),
    ],
    screenShape: "rect",
    cornerRadius: 28,
    contentPadding: 20,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("foldable-open", 28, 12, "none", {
      statusBarHeight: 32,
      homeIndicatorWidth: 140,
      homeIndicatorHeight: 4,
      homeIndicatorBottom: 8,
    }),
  }),
  defineProfile({
    id: "android-tablet",
    ecosystem: "android",
    group: "android-device",
    kind: "device",
    family: "tablet",
    label: "Android 平板横屏 · 1023 × 640",
    shortLabel: "Android Tablet",
    width: 1023,
    height: 640,
    pixelRatio: 2,
    safeArea: freezeInsets(24, 0, 20, 0),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 22,
    contentPadding: 20,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("tablet", 22, 12, "none", {
      statusBarHeight: 24,
      homeIndicatorWidth: 148,
      homeIndicatorHeight: 4,
      homeIndicatorBottom: 7,
    }),
  }),
  defineProfile({
    id: "wear-os-round",
    ecosystem: "android",
    group: "android-device",
    kind: "device",
    family: "watch",
    label: "Wear OS 圆表 · Pixel Watch 45mm",
    shortLabel: "Wear OS Watch",
    width: 227,
    height: 227,
    pixelRatio: 2,
    safeArea: freezeInsets(34, 34, 34, 34),
    reservedRegions: [],
    screenShape: "round",
    cornerRadius: 114,
    contentPadding: 34,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "crown",
    isSystemSurface: false,
    shell: freezeShell("watch-round", 114, 12, "none"),
  }),
  defineProfile({
    id: "android-tv",
    ecosystem: "android",
    group: "android-device",
    kind: "device",
    family: "tv",
    label: "Android TV / Google TV · 遥控焦点",
    shortLabel: "Android TV",
    width: 960,
    height: 540,
    pixelRatio: 2,
    safeArea: freezeInsets(28, 48, 28, 48),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 8,
    contentPadding: 28,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "dpad",
    isSystemSurface: false,
    shell: freezeShell("tv", 8, 10, "none"),
  }),
  defineProfile({
    id: "android-auto",
    ecosystem: "android",
    group: "android-device",
    kind: "device",
    family: "automotive",
    label: "Android Auto · 车载信息娱乐屏",
    shortLabel: "Android Auto",
    width: 800,
    height: 480,
    pixelRatio: 2,
    safeArea: freezeInsets(28, 16, 48, 16),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 16,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: false,
    shell: freezeShell("car-console", 16, 10, "none"),
  }),

  // ── 4. Android AppWidgets, At-a-Glance, Live Updates & Wear OS Tiles ──────
  defineProfile({
    id: "android-widget-small",
    ecosystem: "android",
    group: "android-widget",
    kind: "widget",
    family: "appWidgetSmall",
    label: "Android 桌面微件 · 2 × 2 紧凑",
    shortLabel: "AppWidget 2×2",
    width: 180,
    height: 118,
    pixelRatio: 2.625,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 24,
    contentPadding: 12,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "pixel-9",
    shell: freezeShell("widget-home", 24, 0, "material-you"),
  }),
  defineProfile({
    id: "android-widget-medium",
    ecosystem: "android",
    group: "android-widget",
    kind: "widget",
    family: "appWidgetMedium",
    label: "Android 桌面微件 · 4 × 2 标准横卡",
    shortLabel: "AppWidget 4×2",
    width: 364,
    height: 180,
    pixelRatio: 2.625,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 28,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "pixel-9",
    shell: freezeShell("widget-home", 28, 0, "material-you"),
  }),
  defineProfile({
    id: "android-widget-large",
    ecosystem: "android",
    group: "android-widget",
    kind: "widget",
    family: "appWidgetLarge",
    label: "Android 桌面微件 · 4 × 4 大看板",
    shortLabel: "AppWidget 4×4",
    width: 364,
    height: 364,
    pixelRatio: 2.625,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 28,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "pixel-9",
    shell: freezeShell("widget-home", 28, 0, "material-you"),
  }),
  defineProfile({
    id: "android-at-a-glance",
    ecosystem: "android",
    group: "android-widget",
    kind: "lock-accessory",
    family: "atAGlance",
    label: "Android 锁屏 / 负一屏速览 (At a Glance)",
    shortLabel: "At a Glance",
    width: 364,
    height: 84,
    pixelRatio: 2.625,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 22,
    contentPadding: 12,
    defaultRenderMode: "accented",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "pixel-9",
    shell: freezeShell("widget-lock", 22, 0, "material-you"),
  }),
  defineProfile({
    id: "android-live-update",
    ecosystem: "android",
    group: "android-widget",
    kind: "live-activity",
    family: "liveUpdate",
    label: "Android 16 实时进度通知胶囊 (Live Update)",
    shortLabel: "Live Update",
    width: 380,
    height: 108,
    pixelRatio: 2.625,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 24,
    contentPadding: 14,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "pixel-9",
    shell: freezeShell("widget-lock", 24, 0, "material-you"),
  }),
  defineProfile({
    id: "wear-os-tile",
    ecosystem: "android",
    group: "android-widget",
    kind: "tile",
    family: "wearTile",
    label: "Wear OS 圆形速览磁贴 (Tile)",
    shortLabel: "Wear OS Tile",
    width: 227,
    height: 227,
    pixelRatio: 2,
    safeArea: ZERO_INSETS,
    reservedRegions: [],
    screenShape: "round",
    cornerRadius: 114,
    contentPadding: 34,
    defaultRenderMode: "fullColor",
    supportedRenderModes: WIDGET_MODES,
    inputModality: "crown",
    isSystemSurface: true,
    companionDeviceId: "wear-os-round",
    shell: freezeShell("watch-round", 114, 10, "watch-face"),
  }),
  defineProfile({
    id: "android-instant-app",
    ecosystem: "android",
    group: "android-widget",
    kind: "clip",
    family: "instantApp",
    label: "Android Instant 免安装即时卡片",
    shortLabel: "Instant App",
    width: 412,
    height: 540,
    pixelRatio: 2.625,
    safeArea: freezeInsets(16, 0, 24, 0),
    reservedRegions: [],
    screenShape: "rect",
    cornerRadius: 28,
    contentPadding: 16,
    defaultRenderMode: "fullColor",
    supportedRenderModes: DEVICE_MODES,
    inputModality: "touch",
    isSystemSurface: true,
    companionDeviceId: "pixel-9",
    shell: freezeShell("app-clip", 28, 8, "material-you", {
      homeIndicatorWidth: 108,
      homeIndicatorHeight: 4,
      homeIndicatorBottom: 8,
    }),
  }),
]);

const PROFILE_BY_ID = new Map<string, EcosystemSurfaceProfile>(
  ECOSYSTEM_SURFACE_PROFILES.map((profile) => [profile.id, profile]),
);

const LEGACY_PROFILE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  mobile: "iphone-16-pro",
  tablet: "ipad-pro",
  desktop: "macos-window",
});

export function getSurfaceProfile(id: string | null | undefined): EcosystemSurfaceProfile | undefined {
  if (!id) return undefined;
  return PROFILE_BY_ID.get(id) ?? PROFILE_BY_ID.get(LEGACY_PROFILE_ALIASES[id] ?? "");
}

export function listSurfaceProfiles(filter?: {
  readonly ecosystem?: EcosystemId;
  readonly group?: SurfaceCatalogGroup;
  readonly isSystemSurface?: boolean;
}): readonly EcosystemSurfaceProfile[] {
  if (!filter) return ECOSYSTEM_SURFACE_PROFILES;
  return ECOSYSTEM_SURFACE_PROFILES.filter((profile) => {
    if (filter.ecosystem && profile.ecosystem !== filter.ecosystem) return false;
    if (filter.group && profile.group !== filter.group) return false;
    if (filter.isSystemSurface !== undefined && profile.isSystemSurface !== filter.isSystemSurface) {
      return false;
    }
    return true;
  });
}

export function surfaceGeometryForProfile(
  profileOrId: EcosystemSurfaceProfile | string,
): DisplayGeometry {
  const profile = typeof profileOrId === "string"
    ? getSurfaceProfile(profileOrId)
    : profileOrId;
  if (!profile) return EMPTY_DISPLAY_GEOMETRY;
  return {
    width: profile.width,
    height: profile.height,
    safeArea: { ...profile.safeArea },
    keyboardInset: 0,
    reservedRegions: profile.reservedRegions.map((region) => ({
      id: region.id,
      kind: region.kind,
      frame: { ...region.frame },
      margins: { ...region.margins },
      active: region.active,
    })),
  };
}

export function surfaceEnvironmentFromProfile(
  profile: EcosystemSurfaceProfile,
  overrides?: {
    readonly renderMode?: SurfaceRenderMode;
    readonly entryUri?: string;
  },
): SurfaceEnvironment {
  const requestedMode = overrides?.renderMode;
  const renderMode = requestedMode && profile.supportedRenderModes.includes(requestedMode)
    ? requestedMode
    : profile.defaultRenderMode;
  return {
    profileId: profile.id,
    ecosystem: profile.ecosystem,
    kind: profile.kind,
    family: profile.family,
    renderMode,
    screenShape: profile.screenShape,
    inputModality: profile.inputModality,
    isSystemSurface: profile.isSystemSurface,
    cornerRadius: profile.cornerRadius,
    contentPadding: profile.contentPadding,
    ...(overrides?.entryUri ? { entryUri: overrides.entryUri } : {}),
  };
}

export const DEFAULT_SURFACE_ENVIRONMENT: SurfaceEnvironment = Object.freeze(
  surfaceEnvironmentFromProfile(PROFILE_BY_ID.get("iphone-16-pro")!),
);

function isRenderMode(value: unknown): value is SurfaceRenderMode {
  return value === "fullColor" || value === "vibrant" || value === "accented" || value === "alwaysOn";
}

function isEcosystem(value: unknown): value is EcosystemId {
  return value === "apple" || value === "android";
}

function isSurfaceKind(value: unknown): value is SurfaceKind {
  return (
    value === "device" ||
    value === "widget" ||
    value === "lock-accessory" ||
    value === "live-activity" ||
    value === "complication" ||
    value === "tile" ||
    value === "clip"
  );
}

function isScreenShape(value: unknown): value is SurfaceScreenShape {
  return value === "rect" || value === "round" || value === "capsule";
}

function isInputModality(value: unknown): value is SurfaceInputModality {
  return (
    value === "touch" ||
    value === "pointer" ||
    value === "crown" ||
    value === "dpad" ||
    value === "spatial"
  );
}

/** Parse a `platform.surface` host event payload or fallback cleanly. */
export function parseSurfaceEnvironment(
  raw: unknown,
  fallback: SurfaceEnvironment = DEFAULT_SURFACE_ENVIRONMENT,
): SurfaceEnvironment {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const record = raw as Record<string, unknown>;
  const rawProfileId = typeof record.profileId === "string" && record.profileId
    ? record.profileId
    : typeof record.id === "string" && record.id
      ? record.id
      : undefined;
  const known = rawProfileId ? getSurfaceProfile(rawProfileId) : undefined;
  const base = known ? surfaceEnvironmentFromProfile(known) : fallback;
  const renderMode = isRenderMode(record.renderMode) ? record.renderMode : base.renderMode;
  const entryUri = typeof record.entryUri === "string" && record.entryUri.length > 0
    ? record.entryUri
    : base.entryUri;
  return {
    profileId: known?.id ?? rawProfileId ?? base.profileId,
    ecosystem: isEcosystem(record.ecosystem) ? record.ecosystem : base.ecosystem,
    kind: isSurfaceKind(record.kind) ? record.kind : base.kind,
    family: (typeof record.family === "string" && record.family ? record.family : base.family) as SurfaceFamily,
    renderMode,
    screenShape: isScreenShape(record.screenShape) ? record.screenShape : base.screenShape,
    inputModality: isInputModality(record.inputModality) ? record.inputModality : base.inputModality,
    isSystemSurface: typeof record.isSystemSurface === "boolean"
      ? record.isSystemSurface
      : base.isSystemSurface,
    cornerRadius: typeof record.cornerRadius === "number" && Number.isFinite(record.cornerRadius) && record.cornerRadius >= 0
      ? record.cornerRadius
      : base.cornerRadius,
    contentPadding: typeof record.contentPadding === "number" && Number.isFinite(record.contentPadding) && record.contentPadding >= 0
      ? record.contentPadding
      : base.contentPadding,
    ...(entryUri ? { entryUri } : {}),
  };
}

export type EcosystemFormFactor =
  | "system-surface"
  | "watch"
  | "foldable-dual"
  | "tv-spatial"
  | "wide"
  | "compact";

export function deriveSurfaceFormFactor(
  geometry: DisplayGeometry,
  env: SurfaceEnvironment,
): EcosystemFormFactor {
  if (env.isSystemSurface) return "system-surface";
  if (env.family === "watch" || Math.max(geometry.width, geometry.height) <= 260) {
    return "watch";
  }
  const panes = availableDisplayPanes(geometry);
  if (panes.length >= 2) return "foldable-dual";
  if (env.family === "tv" || env.family === "spatial") return "tv-spatial";
  const responsive = deriveResponsiveLayout(geometry);
  return responsive.mode === "wide" ? "wide" : "compact";
}
