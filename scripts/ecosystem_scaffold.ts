/**
 * On-demand scaffolding for Apple & Android full-ecosystem device adaptation
 * and system widget/extension surfaces.
 *
 * Design invariants:
 * 1. Zero default bloat: `initProject` and Studio `createProject` write NO
 *    extra files, config fields, or capabilities when `ecosystemModules` is
 *    omitted or empty (`[]`).
 * 2. Single-engine pixel identity: scaffolded widget/extension modules compile
 *    into the exact same `app.qjbc + app.pak` bundle via `@pocket/ui/surfaces`,
 *    sharing `FrameResult` DrawOps and `<WidgetActionLink>` deep-link hotspots
 *    between Studio live preview and native WidgetKit / Glance hosts.
 * 3. Non-destructive incremental creation: adding modules later creates only
 *    missing `surfaces/<module>.tsx` files (never overwriting user edits),
 *    regenerates `surfaces/index.tsx` (`ProjectSurfaceRoot`), and idempotently
 *    wires `app.tsx` when safe.
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { EcosystemId } from "../packages/pocket_ui/src/surface-catalog.ts";

export type EcosystemModuleId =
  | "apple-devices"
  | "apple-today"
  | "apple-lock"
  | "apple-live-activity"
  | "apple-watch"
  | "apple-clip"
  | "android-devices"
  | "android-widgets"
  | "android-live"
  | "android-wear"
  | "android-instant";

export interface EcosystemModuleSpec {
  readonly id: EcosystemModuleId;
  readonly ecosystem: EcosystemId;
  readonly label: string;
  readonly description: string;
  /** Relative source file created under the project when scaffolded (if any). */
  readonly entryFile?: string;
  /** Preview profile IDs unlocked in Pocket Studio when this module is enabled. */
  readonly profileIds: readonly string[];
  /** Whether this module renders a dedicated system widget/extension surface. */
  readonly isSystemExtension: boolean;
}

export const ECOSYSTEM_MODULES: readonly EcosystemModuleSpec[] = Object.freeze([
  Object.freeze({
    id: "apple-devices",
    ecosystem: "apple",
    label: "Apple 全家桶多端设备",
    description: "iPhone / iPad Pro & 分屏 / macOS 窗口与菜单栏 / Apple TV / Vision Pro / CarPlay",
    profileIds: Object.freeze([
      "iphone-16-pro",
      "iphone-se",
      "ipad-pro",
      "ipad-split",
      "macos-window",
      "macos-menubar",
      "apple-tv",
      "vision-pro",
      "carplay",
    ]),
    isSystemExtension: false,
  }),
  Object.freeze({
    id: "apple-today",
    ecosystem: "apple",
    label: "iOS / iPadOS Today 与主屏小组件",
    description: "WidgetKit Small / Medium / Large / iPad Extra Large 桌面与负一屏组件",
    entryFile: "surfaces/apple-today.tsx",
    profileIds: Object.freeze([
      "ios-widget-small",
      "ios-widget-medium",
      "ios-widget-large",
      "ipad-widget-xl",
    ]),
    isSystemExtension: true,
  }),
  Object.freeze({
    id: "apple-lock",
    ecosystem: "apple",
    label: "iOS 锁屏小组件",
    description: "Lock Screen Circular / Rectangular / Inline 毛玻璃锁屏配件",
    entryFile: "surfaces/apple-lock.tsx",
    profileIds: Object.freeze([
      "ios-lock-circular",
      "ios-lock-rectangular",
      "ios-lock-inline",
    ]),
    isSystemExtension: true,
  }),
  Object.freeze({
    id: "apple-live-activity",
    ecosystem: "apple",
    label: "iOS 灵动岛与实时活动",
    description: "Dynamic Island Compact / Minimal / Expanded 与锁屏 Live Activity",
    entryFile: "surfaces/apple-live-activity.tsx",
    profileIds: Object.freeze([
      "ios-island-compact",
      "ios-island-minimal",
      "ios-live-activity-expanded",
      "ios-lock-live-activity",
    ]),
    isSystemExtension: true,
  }),
  Object.freeze({
    id: "apple-watch",
    ecosystem: "apple",
    label: "Apple Watch 应用、叠放与表盘复杂功能",
    description: "watchOS 45mm 主应用、Smart Stack 智能叠放与 Corner 表盘角落组件",
    entryFile: "surfaces/apple-watch.tsx",
    profileIds: Object.freeze([
      "apple-watch-45mm",
      "watchos-smart-stack",
      "watchos-complication-corner",
    ]),
    isSystemExtension: true,
  }),
  Object.freeze({
    id: "apple-clip",
    ecosystem: "apple",
    label: "iOS App Clip 轻应用卡片",
    description: "免安装即扫即用 App Clip 宿主卡片与深链入口",
    entryFile: "surfaces/apple-clip.tsx",
    profileIds: Object.freeze(["ios-app-clip"]),
    isSystemExtension: false,
  }),
  Object.freeze({
    id: "android-devices",
    ecosystem: "android",
    label: "Android 全家桶多端设备",
    description: "Pixel / 折叠屏外屏与展开双屏铰链 / Android 平板 / Android TV / Android Auto",
    profileIds: Object.freeze([
      "pixel-9",
      "android-fold-cover",
      "android-fold-open",
      "android-tablet",
      "android-tv",
      "android-auto",
    ]),
    isSystemExtension: false,
  }),
  Object.freeze({
    id: "android-widgets",
    ecosystem: "android",
    label: "Android 桌面微件 AppWidget / Glance",
    description: "Material You 2×2 / 4×2 / 4×4 桌面微件与动态着色",
    entryFile: "surfaces/android-widgets.tsx",
    profileIds: Object.freeze([
      "android-widget-small",
      "android-widget-medium",
      "android-widget-large",
    ]),
    isSystemExtension: true,
  }),
  Object.freeze({
    id: "android-live",
    ecosystem: "android",
    label: "Android 速览 At-a-Glance 与 Live Update",
    description: "锁屏/首屏 At-a-Glance 速览条与 Android 16 实时状态栏胶囊",
    entryFile: "surfaces/android-live.tsx",
    profileIds: Object.freeze([
      "android-at-a-glance",
      "android-live-update",
    ]),
    isSystemExtension: true,
  }),
  Object.freeze({
    id: "android-wear",
    ecosystem: "android",
    label: "Wear OS 圆表应用与磁贴 Tile",
    description: "圆形表盘安全内切边距适配、Always-On 常亮省电态与快速磁贴",
    entryFile: "surfaces/android-wear.tsx",
    profileIds: Object.freeze([
      "wear-os-round",
      "wear-os-tile",
    ]),
    isSystemExtension: true,
  }),
  Object.freeze({
    id: "android-instant",
    ecosystem: "android",
    label: "Android Instant App 免安装体验",
    description: "Google Play Instant 免安装唤起与深链直达入口",
    entryFile: "surfaces/android-instant.tsx",
    profileIds: Object.freeze(["android-instant-app"]),
    isSystemExtension: false,
  }),
]);

const MODULE_BY_ID = new Map<string, EcosystemModuleSpec>(
  ECOSYSTEM_MODULES.map((spec) => [spec.id, spec]),
);

const CANONICAL_ORDER = new Map<EcosystemModuleId, number>(
  ECOSYSTEM_MODULES.map((spec, idx) => [spec.id, idx]),
);

const OPTIONAL_SURFACE_CAPABILITIES = [
  "platform.surface.get",
  "platform.widgets.publishSnapshot",
  "platform.links.initial",
  "platform.links.latest",
  "platform.links.events",
] as const;

export function getEcosystemModule(id: string): EcosystemModuleSpec | undefined {
  return MODULE_BY_ID.get(id);
}

/**
 * Parse and validate an array or comma-separated list of module IDs or shorthand
 * group tokens (`"apple"`, `"android"`, `"all"`). Rejects unknown names before
 * any filesystem mutation.
 */
export function resolveEcosystemModules(
  raw: unknown,
  label = "ecosystemModules",
): EcosystemModuleId[] {
  if (raw === undefined || raw === null || raw === "") return [];
  const items: string[] = [];
  if (typeof raw === "string") {
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (trimmed) items.push(trimmed);
    }
  } else if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== "string") {
        throw new Error(`${label} must contain module ID strings`);
      }
      for (const part of entry.split(",")) {
        const trimmed = part.trim();
        if (trimmed) items.push(trimmed);
      }
    }
  } else {
    throw new Error(`${label} must be an array or comma-separated string of module IDs`);
  }

  const resolved = new Set<EcosystemModuleId>();
  for (const token of items) {
    if (token === "none") continue;
    if (token === "all") {
      for (const spec of ECOSYSTEM_MODULES) resolved.add(spec.id);
      continue;
    }
    if (token === "apple") {
      for (const spec of ECOSYSTEM_MODULES) {
        if (spec.ecosystem === "apple") resolved.add(spec.id);
      }
      continue;
    }
    if (token === "android") {
      for (const spec of ECOSYSTEM_MODULES) {
        if (spec.ecosystem === "android") resolved.add(spec.id);
      }
      continue;
    }
    const spec = MODULE_BY_ID.get(token);
    if (!spec) {
      throw new Error(
        `unknown ecosystem/widget module "${token}" in ${label} (expected one of: ${ECOSYSTEM_MODULES.map((m) => m.id).join(", ")}, apple, android, all)`,
      );
    }
    resolved.add(spec.id);
  }

  return [...resolved].sort(
    (left, right) => (CANONICAL_ORDER.get(left) ?? 0) - (CANONICAL_ORDER.get(right) ?? 0),
  );
}

/** Return the ordered set of preview profile IDs unlocked by `modules`. */
export function enabledProfileIdsForModules(
  modules: readonly EcosystemModuleId[],
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };
  const hasApple = modules.some((id) => MODULE_BY_ID.get(id)?.ecosystem === "apple");
  const hasAndroid = modules.some((id) => MODULE_BY_ID.get(id)?.ecosystem === "android");
  // Ensure companion host phones are always selectable when a widget/watch/clip
  // module is enabled so Studio's "打开宿主 App ↗" deep-link jump works out of the box.
  if (hasApple) add("iphone-16-pro");
  if (hasAndroid) add("pixel-9");
  for (const id of modules) {
    const spec = MODULE_BY_ID.get(id);
    if (!spec) continue;
    for (const profileId of spec.profileIds) add(profileId);
  }
  return ordered;
}

function readJsonSafe(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) return undefined;
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Read currently configured on-demand modules from `editor.json` or `pocket.json`. */
export function readProjectEcosystemModules(projectDir: string): EcosystemModuleId[] {
  const root = resolve(projectDir);
  const editor = readJsonSafe(join(root, "editor.json"));
  if (editor?.ecosystemModules !== undefined) {
    try {
      return resolveEcosystemModules(editor.ecosystemModules, "editor.ecosystemModules");
    } catch {
      return [];
    }
  }
  const pocket = readJsonSafe(join(root, "pocket.json"));
  const surfaces = pocket?.surfaces;
  if (surfaces && typeof surfaces === "object" && !Array.isArray(surfaces)) {
    const rawModules = (surfaces as Record<string, unknown>).modules;
    if (rawModules !== undefined) {
      try {
        return resolveEcosystemModules(rawModules, "pocket.surfaces.modules");
      } catch {
        return [];
      }
    }
  }
  return [];
}

function moduleTemplateSource(id: EcosystemModuleId, appTitle: string): string | undefined {
  const safeTitle = JSON.stringify(appTitle || "Pocket App");
  switch (id) {
    case "apple-today":
      return `import type { JSX } from "solid-js";
import { TodayWidgetCard } from "@pocket/ui/surfaces";

export function AppleTodayWidgetSurface(): JSX.Element {
  return (
    <TodayWidgetCard
      eyebrow="TODAY WIDGET"
      title={${safeTitle}}
      primaryValue="Ready"
      subtitle="Single-Engine QuickJS + pocket_core"
      badge="Live"
      primaryHref="pocket://app/home?from=apple-today"
      metrics={[
        { id: "status", label: "Engine", value: "QJBC" },
        { id: "sync", label: "State", value: "Synced" },
      ]}
      actions={[
        { id: "open-main", label: "打开应用", href: "pocket://app/home?from=apple-today" },
      ]}
    />
  );
}
`;
    case "apple-lock":
      return `import type { JSX } from "solid-js";
import { LockAccessoryWidget } from "@pocket/ui/surfaces";

export function AppleLockWidgetSurface(): JSX.Element {
  return (
    <LockAccessoryWidget
      glyph="✦"
      shortValue="OK"
      title={${safeTitle}}
      detail="点击从锁屏直达应用"
      inlineText={\`\${${safeTitle}} · 已同步\`}
      href="pocket://app/home?from=apple-lock"
    />
  );
}
`;
    case "apple-live-activity":
      return `import type { JSX } from "solid-js";
import { LiveActivityBanner } from "@pocket/ui/surfaces";

export function AppleLiveActivitySurface(): JSX.Element {
  return (
    <LiveActivityBanner
      leadingBadge="LIVE"
      trailingMetric="100%"
      title={${safeTitle}}
      subtitle="灵动岛与实时活动共享同一套渲染与状态"
      progress={0.75}
      primaryActionLabel="查看详情"
      primaryHref="pocket://app/home?from=live-activity"
    />
  );
}
`;
    case "apple-watch":
      return `import type { JSX } from "solid-js";
import { WearTileSurface } from "@pocket/ui/surfaces";

export function AppleWatchSurface(): JSX.Element {
  return (
    <WearTileSurface
      eyebrow="APPLE WATCH"
      metric="Ready"
      unit="watchOS"
      caption={${safeTitle}}
      actionLabel="同步"
      href="pocket://app/home?from=apple-watch"
    />
  );
}
`;
    case "apple-clip":
      return `import type { JSX } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { WidgetActionLink, WidgetSurface } from "@pocket/ui/surfaces";

export function AppleAppClipBanner(): JSX.Element {
  return (
    <WidgetSurface class="w-full flex-row items-center justify-between px-4 py-3">
      <View class="flex-col gap-0.5">
        <Text class="text-xs font-bold" style={{ textColor: "#38BDF8" }}>APP CLIP</Text>
        <Text class="text-sm font-bold" style={{ textColor: "#F8FAFC" }}>{${safeTitle}}</Text>
      </View>
      <WidgetActionLink
        id="app-clip-full"
        href="pocket://app/home?from=app-clip"
        label="获取完整体验"
        class="px-3 py-1.5"
        style={{ bgColor: "#2563EB", radius: 999 }}
      >
        <Text class="text-xs font-bold" style={{ textColor: "#FFFFFF" }}>继续</Text>
      </WidgetActionLink>
    </WidgetSurface>
  );
}
`;
    case "android-widgets":
      return `import type { JSX } from "solid-js";
import { TodayWidgetCard } from "@pocket/ui/surfaces";

export function AndroidAppWidgetSurface(): JSX.Element {
  return (
    <TodayWidgetCard
      eyebrow="ANDROID WIDGET"
      title={${safeTitle}}
      primaryValue="Ready"
      subtitle="Material You 单引擎微件渲染"
      badge="Glance"
      primaryHref="pocket://app/home?from=android-widget"
      metrics={[
        { id: "engine", label: "Runtime", value: "QJBC" },
        { id: "tint", label: "Palette", value: "Dynamic" },
      ]}
      actions={[
        { id: "open-android", label: "打开应用", href: "pocket://app/home?from=android-widget" },
      ]}
    />
  );
}
`;
    case "android-live":
      return `import { Show, type JSX } from "solid-js";
import { LiveActivityBanner, LockAccessoryWidget, useSurfaceEnvironment } from "@pocket/ui/surfaces";

export function AndroidLiveSurface(): JSX.Element {
  const env = useSurfaceEnvironment();
  return (
    <Show
      when={env().family === "atAGlance"}
      fallback={
        <LiveActivityBanner
          leadingBadge="LIVE"
          trailingMetric="Active"
          title={${safeTitle}}
          subtitle="Android 16 Live Update 实时胶囊"
          progress={0.8}
          primaryActionLabel="打开应用"
          primaryHref="pocket://app/home?from=android-live"
        />
      }
    >
      <LockAccessoryWidget
        glyph="◈"
        shortValue="Live"
        title={${safeTitle}}
        detail="At a Glance 速览直达"
        href="pocket://app/home?from=at-a-glance"
      />
    </Show>
  );
}
`;
    case "android-wear":
      return `import type { JSX } from "solid-js";
import { WearTileSurface } from "@pocket/ui/surfaces";

export function AndroidWearTileSurface(): JSX.Element {
  return (
    <WearTileSurface
      eyebrow="WEAR OS TILE"
      metric="Ready"
      unit="Round"
      caption={${safeTitle}}
      actionLabel="打开"
      href="pocket://app/home?from=wear-tile"
    />
  );
}
`;
    case "android-instant":
      return `import type { JSX } from "solid-js";
import { Text, View } from "@pocketjs/framework/solid/components";
import { WidgetActionLink, WidgetSurface } from "@pocket/ui/surfaces";

export function AndroidInstantBanner(): JSX.Element {
  return (
    <WidgetSurface class="w-full flex-row items-center justify-between px-4 py-3">
      <View class="flex-col gap-0.5">
        <Text class="text-xs font-bold" style={{ textColor: "#2DD4BF" }}>INSTANT APP</Text>
        <Text class="text-sm font-bold" style={{ textColor: "#F8FAFC" }}>{${safeTitle}}</Text>
      </View>
      <WidgetActionLink
        id="instant-open"
        href="pocket://app/home?from=instant-app"
        label="免安装体验"
        class="px-3 py-1.5"
        style={{ bgColor: "#0D9488", radius: 999 }}
      >
        <Text class="text-xs font-bold" style={{ textColor: "#FFFFFF" }}>打开</Text>
      </WidgetActionLink>
    </WidgetSurface>
  );
}
`;
    default:
      return undefined;
  }
}

function generateSurfacesIndexSource(modules: readonly EcosystemModuleId[]): string {
  if (modules.length === 0) {
    return `/**
 * Auto-maintained on-demand ecosystem & widget router (\`surfaces/index.tsx\`).
 * All ecosystem modules are currently disabled; rendering passes straight
 * through with zero @pocket/ui/surfaces bundle overhead.
 */
import type { JSX } from "solid-js";

export function ProjectSurfaceRoot(props: { children: JSX.Element }): JSX.Element {
  return props.children;
}
`;
  }
  const has = (id: EcosystemModuleId) => modules.includes(id);
  const branches: Array<{ condition: string; render: string }> = [];
  const moduleImports: string[] = [];

  if (has("apple-today")) {
    moduleImports.push(`import { AppleTodayWidgetSurface } from "./apple-today.tsx";`);
    branches.push({
      condition: `env().ecosystem === "apple" && env().kind === "widget"`,
      render: `<AppleTodayWidgetSurface />`,
    });
  }
  if (has("apple-lock")) {
    moduleImports.push(`import { AppleLockWidgetSurface } from "./apple-lock.tsx";`);
    branches.push({
      condition: `env().ecosystem === "apple" && env().kind === "lock-accessory"`,
      render: `<AppleLockWidgetSurface />`,
    });
  }
  if (has("apple-live-activity")) {
    moduleImports.push(`import { AppleLiveActivitySurface } from "./apple-live-activity.tsx";`);
    branches.push({
      condition: `env().ecosystem === "apple" && env().kind === "live-activity"`,
      render: `<AppleLiveActivitySurface />`,
    });
  }
  if (has("apple-watch")) {
    moduleImports.push(`import { AppleWatchSurface } from "./apple-watch.tsx";`);
    branches.push({
      condition: `env().ecosystem === "apple" && (env().kind === "tile" || env().kind === "complication")`,
      render: `<AppleWatchSurface />`,
    });
  }
  if (has("android-widgets")) {
    moduleImports.push(`import { AndroidAppWidgetSurface } from "./android-widgets.tsx";`);
    branches.push({
      condition: `env().ecosystem === "android" && env().kind === "widget"`,
      render: `<AndroidAppWidgetSurface />`,
    });
  }
  if (has("android-live")) {
    moduleImports.push(`import { AndroidLiveSurface } from "./android-live.tsx";`);
    branches.push({
      condition: `env().ecosystem === "android" && (env().kind === "live-activity" || env().family === "atAGlance")`,
      render: `<AndroidLiveSurface />`,
    });
  }
  if (has("android-wear")) {
    moduleImports.push(`import { AndroidWearTileSurface } from "./android-wear.tsx";`);
    branches.push({
      condition: `env().ecosystem === "android" && env().kind === "tile"`,
      render: `<AndroidWearTileSurface />`,
    });
  }
  if (has("apple-clip")) {
    moduleImports.push(`import { AppleAppClipBanner } from "./apple-clip.tsx";`);
    branches.push({
      condition: `env().ecosystem === "apple" && env().kind === "clip"`,
      render: `<AppleAppClipBanner />`,
    });
  }
  if (has("android-instant")) {
    moduleImports.push(`import { AndroidInstantBanner } from "./android-instant.tsx";`);
    branches.push({
      condition: `env().ecosystem === "android" && env().kind === "clip"`,
      render: `<AndroidInstantBanner />`,
    });
  }

  const imports: string[] = [
    branches.length > 0
      ? `import { Show, type JSX } from "solid-js";`
      : `import type { JSX } from "solid-js";`,
    ...(branches.length > 0 ? [`import { View } from "@pocketjs/framework/solid/components";`] : []),
    branches.length > 0
      ? `import { SurfaceEnvironmentProvider, WidgetSnapshotProvider, useSurfaceEnvironment } from "@pocket/ui/surfaces";`
      : `import { SurfaceEnvironmentProvider, WidgetSnapshotProvider } from "@pocket/ui/surfaces";`,
    ...moduleImports,
  ];

  let switchTree = `props.children`;
  for (let idx = branches.length - 1; idx >= 0; idx -= 1) {
    const branch = branches[idx]!;
    const inner = idx === branches.length - 1 ? `{props.children}` : switchTree;
    switchTree = `<Show when={!(${branch.condition})} fallback={<View class="w-full h-full flex-col overflow-hidden" style={{ bgColor: "#00000000" }}>${branch.render}</View>}>${inner}</Show>`;
  }

  return `/**
 * Auto-maintained on-demand ecosystem & widget router (\`surfaces/index.tsx\`).
 * Individual surface files under \`surfaces/*.tsx\` are yours to customize and
 * are never overwritten when you add more modules later.
 */
${imports.join("\n")}

function SurfaceDispatcher(props: { children: JSX.Element }): JSX.Element {
  ${branches.length > 0 ? `const env = useSurfaceEnvironment();\n  return (\n    ${switchTree}\n  );` : `return props.children;`}
}

export function ProjectSurfaceRoot(props: { children: JSX.Element }): JSX.Element {
  return (
    <SurfaceEnvironmentProvider>
      <WidgetSnapshotProvider>
        <SurfaceDispatcher>{props.children}</SurfaceDispatcher>
      </WidgetSnapshotProvider>
    </SurfaceEnvironmentProvider>
  );
}
`;
}

function wireAppEntryIfNeeded(entryPath: string): boolean {
  if (!existsSync(entryPath) || lstatSync(entryPath).isSymbolicLink()) return false;
  const source = readFileSync(entryPath, "utf8");
  if (source.includes("ProjectSurfaceRoot") || source.includes("./surfaces/index")) {
    return false;
  }
  const mountPattern = /mount\(\s*\(\)\s*=>\s*(<App\s*\/>)\s*\)\s*;?/;
  if (!mountPattern.test(source)) return false;
  const updated =
    `import { ProjectSurfaceRoot } from "./surfaces/index.tsx";\n` +
    source.replace(
      mountPattern,
      `mount(() => (\n  <ProjectSurfaceRoot>\n    <App />\n  </ProjectSurfaceRoot>\n));`,
    );
  writeFileSync(entryPath, updated);
  return true;
}

export interface ScaffoldEcosystemOptions {
  /** Merge with existing project modules (`"add"`) or replace module list (`"set"`). Default `"set"`. */
  mode?: "add" | "set";
  /** Optional display title used when generating new widget card templates. */
  appTitle?: string;
  /** Whether to auto-wrap `mount(() => <App />)` in `app.tsx` when extensions are present. Default `true`. */
  wireEntry?: boolean;
}

export interface ScaffoldEcosystemResult {
  readonly modules: EcosystemModuleId[];
  readonly enabledProfileIds: string[];
  readonly createdFiles: string[];
  readonly updatedFiles: string[];
  readonly entryWired: boolean;
}

/**
 * Create or update on-demand Apple & Android ecosystem/widget modules inside
 * `projectDir`. Safe to call during `initProject`, `createProject`, or later
 * from Studio / CLI.
 */
export function scaffoldEcosystemModules(
  projectDir: string,
  requestedModules: unknown,
  options: ScaffoldEcosystemOptions = {},
): ScaffoldEcosystemResult {
  const root = resolve(projectDir);
  const parsedRequested = resolveEcosystemModules(requestedModules);
  const priorModules = options.mode === "add" ? readProjectEcosystemModules(root) : [];
  const modules = resolveEcosystemModules([...priorModules, ...parsedRequested]);

  const createdFiles: string[] = [];
  const updatedFiles: string[] = [];

  const editorPath = join(root, "editor.json");
  const pocketPath = join(root, "pocket.json");
  const manifestPath = join(root, "manifest.json");

  const editorDoc = readJsonSafe(editorPath);
  const pocketDoc = readJsonSafe(pocketPath);
  const manifestDoc = readJsonSafe(manifestPath);

  const inferredTitle =
    options.appTitle?.trim() ||
    (typeof editorDoc?.title === "string" && editorDoc.title.trim()) ||
    (typeof editorDoc?.name === "string" && editorDoc.name.trim()) ||
    (typeof pocketDoc?.title === "string" && pocketDoc.title.trim()) ||
    "Pocket App";

  if (editorDoc) {
    if (modules.length > 0) {
      editorDoc.ecosystemModules = modules;
    } else {
      delete editorDoc.ecosystemModules;
    }
    writeFileSync(editorPath, `${JSON.stringify(editorDoc, null, 2)}\n`);
    updatedFiles.push("editor.json");
  }

  if (pocketDoc) {
    if (modules.length > 0) {
      const prevSurfaces =
        pocketDoc.surfaces && typeof pocketDoc.surfaces === "object" && !Array.isArray(pocketDoc.surfaces)
          ? (pocketDoc.surfaces as Record<string, unknown>)
          : {};
      pocketDoc.surfaces = { ...prevSurfaces, modules };
    } else {
      delete pocketDoc.surfaces;
    }
    writeFileSync(pocketPath, `${JSON.stringify(pocketDoc, null, 2)}\n`);
    updatedFiles.push("pocket.json");
  }

  if (manifestDoc && modules.length > 0) {
    const capabilities =
      manifestDoc.capabilities && typeof manifestDoc.capabilities === "object" && !Array.isArray(manifestDoc.capabilities)
        ? (manifestDoc.capabilities as Record<string, unknown>)
        : {};
    const existingOptional = Array.isArray(capabilities.optional)
      ? capabilities.optional.filter((item): item is string => typeof item === "string")
      : [];
    const mergedOptional = [...new Set([...existingOptional, ...OPTIONAL_SURFACE_CAPABILITIES])];
    manifestDoc.capabilities = { ...capabilities, optional: mergedOptional };
    writeFileSync(manifestPath, `${JSON.stringify(manifestDoc, null, 2)}\n`);
    updatedFiles.push("manifest.json");
  }

  let entryWired = false;
  const needsSurfaceFiles = modules.some((id) => Boolean(MODULE_BY_ID.get(id)?.entryFile));

  if (needsSurfaceFiles || existsSync(join(root, "surfaces/index.tsx"))) {
    mkdirSync(join(root, "surfaces"), { recursive: true });
    for (const moduleId of modules) {
      const spec = MODULE_BY_ID.get(moduleId);
      if (!spec?.entryFile) continue;
      const targetPath = join(root, spec.entryFile);
      if (!existsSync(targetPath)) {
        const template = moduleTemplateSource(moduleId, inferredTitle);
        if (template) {
          mkdirSync(dirname(targetPath), { recursive: true });
          writeFileSync(targetPath, template);
          createdFiles.push(spec.entryFile);
        }
      }
    }
    const indexRel = "surfaces/index.tsx";
    const indexExisted = existsSync(join(root, indexRel));
    writeFileSync(join(root, indexRel), generateSurfacesIndexSource(modules));
    if (indexExisted) updatedFiles.push(indexRel);
    else createdFiles.push(indexRel);

    if (options.wireEntry !== false && needsSurfaceFiles) {
      const entryRel =
        typeof editorDoc?.entry === "string" && editorDoc.entry
          ? editorDoc.entry
          : "app.tsx";
      const entryPath = join(root, entryRel);
      if (wireAppEntryIfNeeded(entryPath)) {
        entryWired = true;
        updatedFiles.push(entryRel);
      }
    }
  }

  const flutterDir = join(root, "flutter");
  if (existsSync(flutterDir) && lstatSync(flutterDir).isDirectory()) {
    const descriptorPath = join(flutterDir, "pocket_surfaces.json");
    if (modules.length > 0) {
      const descriptorExisted = existsSync(descriptorPath);
      const descriptor = {
        schemaVersion: 1,
        engine: "pocket-qjbc-single-engine",
        modules,
        enabledProfiles: enabledProfileIdsForModules(modules),
        appleTargets: modules
          .filter((id) => MODULE_BY_ID.get(id)?.ecosystem === "apple")
          .map((id) => ({ module: id, profiles: MODULE_BY_ID.get(id)!.profileIds })),
        androidTargets: modules
          .filter((id) => MODULE_BY_ID.get(id)?.ecosystem === "android")
          .map((id) => ({ module: id, profiles: MODULE_BY_ID.get(id)!.profileIds })),
      };
      writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
      if (descriptorExisted) updatedFiles.push("flutter/pocket_surfaces.json");
      else createdFiles.push("flutter/pocket_surfaces.json");
    } else if (existsSync(descriptorPath)) {
      rmSync(descriptorPath, { force: true });
      updatedFiles.push("flutter/pocket_surfaces.json");
    }
  }

  return {
    modules,
    enabledProfileIds: enabledProfileIdsForModules(modules),
    createdFiles,
    updatedFiles,
    entryWired,
  };
}
