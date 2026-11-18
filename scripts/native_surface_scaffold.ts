/**
 * Opt-in Native Project Scaffolder for Apple & Android Ecosystem Surfaces
 * (`sdk/scripts/native_surface_scaffold.ts`).
 *
 * Bridges declarative `pocket_surfaces.json` / `pocket.ts surfaces` module
 * selections onto real iOS (XcodeGen `ios/project.yml` + WidgetKit / Lock Screen /
 * ActivityKit Dynamic Island + App Group shared
 * container) and Android (`AppWidgetProvider` 2×2/4×2/4×4 + `RemoteViews` +
 * Ongoing notification permissions + Foldable/TV manifest traits) targets.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { EcosystemModuleId } from "./ecosystem_scaffold.ts";
import { patchDeepLinkPlatforms, resolvePlatformExperience } from "./platform_scaffold.ts";

export interface SyncNativeEcosystemOptions {
  readonly modules: readonly EcosystemModuleId[];
  readonly bundleId?: string;
  readonly teamId?: string;
  readonly appTitle?: string;
  readonly deepLinkScheme?: string;
  /** Generate & maintain `ios/project.yml` + `ios/generate-xcodeproj.sh` for XcodeGen. */
  readonly useXcodeGen?: boolean;
  /**
   * Actively embed `PocketWidgetsExtension` (`<bundleId>.widgets`) targets inside `ios/project.yml` and attach App Group
   * entitlements to `Runner`. When `false`, Swift extension sources are still
   * scaffolded under `ios/PocketWidgets/` ready for one-flag activation once
   * sub-bundle provisioning profiles are registered on Apple Developer Portal.
   */
  readonly embedIosExtensions?: boolean;
  /** Run `xcodegen generate` immediately if `xcodegen` is installed. */
  readonly runXcodeGen?: boolean;
}

export interface SyncNativeEcosystemResult {
  readonly flutterRoot: string;
  readonly bundleId: string;
  readonly appGroupId: string;
  readonly createdFiles: string[];
  readonly updatedFiles: string[];
  readonly xcodegenExecuted: boolean;
}

function nativeFileWriter(root: string, created: string[], updated: string[]) {
  const indexPath = join(root, ".pocket-native-surfaces.json");
  const indexBefore = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : undefined;
  const hashes = new Map<string, string>(Object.entries(indexBefore ? JSON.parse(indexBefore) : {}));
  const digest = (content: string) => createHash("sha256").update(content).digest("hex");

  return {
    write(path: string, content: string): boolean {
      const rel = path.slice(root.length + 1);
      const existing = lstatSync(path, { throwIfNoEntry: false });
      if (existing) {
        if (!existing.isFile()) return false;
        const previous = readFileSync(path, "utf8");
        if (previous === content) return hashes.get(rel) === digest(content);
        if (hashes.get(rel) !== digest(previous)) return false;
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf8");
      hashes.set(rel, digest(content));
      (existing ? updated : created).push(rel);
      return true;
    },
    save(): void {
      if (hashes.size === 0) return;
      const next = JSON.stringify(Object.fromEntries(hashes), null, 2) + "\n";
      if (next !== indexBefore) writeFileSync(indexPath, next, "utf8");
    },
  };
}

export function detectFlutterRoot(projectDir: string): string | undefined {
  const root = resolve(projectDir);
  if (existsSync(join(root, "pubspec.yaml")) && (existsSync(join(root, "ios")) || existsSync(join(root, "android")))) {
    return root;
  }
  const nested = join(root, "flutter");
  if (existsSync(join(nested, "pubspec.yaml"))) {
    return nested;
  }
  const parent = resolve(root, "..");
  if (existsSync(join(parent, "pubspec.yaml")) && (existsSync(join(parent, "ios")) || existsSync(join(parent, "android")))) {
    return parent;
  }
  return undefined;
}

function inferIosBundleId(flutterRoot: string): string | undefined {
  const projectYml = join(flutterRoot, "ios/project.yml");
  if (existsSync(projectYml)) {
    const m = readFileSync(projectYml, "utf8").match(/PRODUCT_BUNDLE_IDENTIFIER:\s*["']?([A-Za-z0-9._-]+)["']?/);
    if (m?.[1] && !m[1].endsWith(".RunnerTests") && !m[1].endsWith(".widgets")) return m[1];
  }
  const pbx = join(flutterRoot, "ios/Runner.xcodeproj/project.pbxproj");
  if (existsSync(pbx)) {
    const matches = [...readFileSync(pbx, "utf8").matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([A-Za-z0-9._-]+)"?\s*;/g)];
    for (const m of matches) {
      const candidate = m[1];
      if (candidate && !candidate.endsWith(".RunnerTests") && !candidate.endsWith(".widgets") && !candidate.endsWith(".Clip")) {
        return candidate;
      }
    }
  }
  const gradleKts = join(flutterRoot, "android/app/build.gradle.kts");
  if (existsSync(gradleKts)) {
    const m = readFileSync(gradleKts, "utf8").match(/applicationId\s*=\s*"([A-Za-z0-9._-]+)"/);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function inferIosTeamId(flutterRoot: string): string | undefined {
  const projectYml = join(flutterRoot, "ios/project.yml");
  if (existsSync(projectYml)) {
    const m = readFileSync(projectYml, "utf8").match(/DEVELOPMENT_TEAM:\s*["']?([A-Z0-9]{10})["']?/);
    if (m?.[1]) return m[1];
  }
  const pbx = join(flutterRoot, "ios/Runner.xcodeproj/project.pbxproj");
  if (existsSync(pbx)) {
    const m = readFileSync(pbx, "utf8").match(/DEVELOPMENT_TEAM\s*=\s*"?([A-Z0-9]{10})"?\s*;/);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function inferAndroidNamespace(flutterRoot: string, fallbackBundleId: string): string {
  const gradleKts = join(flutterRoot, "android/app/build.gradle.kts");
  if (existsSync(gradleKts)) {
    const m = readFileSync(gradleKts, "utf8").match(/namespace\s*=\s*"([A-Za-z0-9._]+)"/);
    if (m?.[1]) return m[1];
  }
  const gradleGroovy = join(flutterRoot, "android/app/build.gradle");
  if (existsSync(gradleGroovy)) {
    const m = readFileSync(gradleGroovy, "utf8").match(/namespace\s+["']([A-Za-z0-9._]+)["']/);
    if (m?.[1]) return m[1];
  }
  return fallbackBundleId;
}

// ── iOS Swift Extension & XcodeGen Templates ─────────────────────────────────

function buildPocketSharedSurfaceStoreSwift(appGroupId: string, defaultScheme: string): string {
  return `import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(AppIntents)
import AppIntents
#endif
#if canImport(WidgetKit)
import WidgetKit
#endif

enum PocketSurfaceSharedConfig {
  static let defaultAppGroupId = ${JSON.stringify(appGroupId)}
  static let defaultScheme = ${JSON.stringify(defaultScheme)}
  static let snapshotKey = "dev.pocketjs.surfaces.snapshot.v1"
  static let pendingActionsKey = "dev.pocketjs.surfaces.pending_actions.v1"

  static var appGroupId: String {
    if let configured = Bundle.main.object(forInfoDictionaryKey: "PocketAppGroupIdentifier") as? String,
       !configured.isEmpty {
      return configured
    }
    return defaultAppGroupId
  }

  static var sharedDefaults: UserDefaults {
    UserDefaults(suiteName: appGroupId) ?? .standard
  }
}

struct PocketSurfaceMetricItem: Codable, Hashable {
  var id: String
  var label: String
  var value: String
  var href: String?
}

struct PocketSurfaceActionItem: Codable, Hashable {
  var id: String
  var label: String
  var href: String
}

struct PocketSurfaceSnapshotPayload: Codable {
  var profileId: String?
  var renderMode: String?
  var eyebrow: String?
  var title: String?
  var primaryValue: String?
  var subtitle: String?
  var badge: String?
  var primaryHref: String?
  var progress: Double?
  var metrics: [PocketSurfaceMetricItem]?
  var actions: [PocketSurfaceActionItem]?

  static func loadCurrent(appTitle: String) -> PocketSurfaceSnapshotPayload {
    let defaults = PocketSurfaceSharedConfig.sharedDefaults
    if let raw = defaults.string(forKey: PocketSurfaceSharedConfig.snapshotKey),
       let data = raw.data(using: .utf8),
       let decoded = try? JSONDecoder().decode(PocketSurfaceSnapshotPayload.self, from: data) {
      return decoded
    }
    return PocketSurfaceSnapshotPayload(
      profileId: nil,
      renderMode: "fullColor",
      eyebrow: appTitle.uppercased(),
      title: appTitle,
      primaryValue: "Tap to record",
      subtitle: "Latest records from the app",
      badge: "Ready",
      primaryHref: "\\(PocketSurfaceSharedConfig.defaultScheme)://app/today",
      progress: 0.0,
      metrics: [],
      actions: []
    )
  }
}

#if canImport(ActivityKit)
@available(iOS 16.2, *)
public struct PocketSharedLiveActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var leadingBadge: String
    public var trailingMetric: String
    public var title: String
    public var subtitle: String
    public var progress: Double
    public var primaryActionLabel: String
    public var primaryHref: String
    public var secondaryActionLabel: String?
    public var secondaryHref: String?
  }

  public var activityKey: String
  public init(activityKey: String) {
    self.activityKey = activityKey
  }
}
#endif

#if canImport(AppIntents)
@available(iOS 17.0, *)
struct PocketWidgetActionIntent: AppIntent {
  static var title: LocalizedStringResource = "Trigger Pocket Widget Action"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Action ID")
  var actionId: String

  @Parameter(title: "Deep Link URI")
  var href: String

  init() {
    self.actionId = "open"
    self.href = "\\(PocketSurfaceSharedConfig.defaultScheme)://app/today"
  }

  init(actionId: String, href: String) {
    self.actionId = actionId
    self.href = href
  }

  func perform() async throws -> some IntentResult {
    let defaults = PocketSurfaceSharedConfig.sharedDefaults
    var queue = (defaults.array(forKey: PocketSurfaceSharedConfig.pendingActionsKey) as? [[String: Any]]) ?? []
    if queue.count >= 32 {
      queue.removeFirst(queue.count - 31)
    }
    queue.append([
      "id": actionId,
      "href": href,
      "source": "ios-widget-intent",
      "timestampMs": Int(Date().timeIntervalSince1970 * 1000),
    ])
    defaults.set(queue, forKey: PocketSurfaceSharedConfig.pendingActionsKey)
    #if canImport(WidgetKit)
    WidgetCenter.shared.reloadAllTimelines()
    #endif
    return .result()
  }
}
#endif
`;
}

function buildPocketTodayAndLockWidgetSwift(
  appTitle: string,
  includeToday: boolean,
  includeLock: boolean,
): string {
  const families: string[] = [];
  if (includeToday) {
    families.push(".systemSmall", ".systemMedium", ".systemLarge");
  }
  if (includeLock) {
    families.push(".accessoryCircular", ".accessoryRectangular", ".accessoryInline");
  }
  return `import SwiftUI
import WidgetKit

struct PocketSurfaceTimelineEntry: TimelineEntry {
  let date: Date
  let snapshot: PocketSurfaceSnapshotPayload
}

struct PocketSurfaceTimelineProvider: TimelineProvider {
  private let appTitle = ${JSON.stringify(appTitle)}

  func placeholder(in context: Context) -> PocketSurfaceTimelineEntry {
    PocketSurfaceTimelineEntry(
      date: Date(),
      snapshot: PocketSurfaceSnapshotPayload.loadCurrent(appTitle: appTitle)
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (PocketSurfaceTimelineEntry) -> Void) {
    completion(
      PocketSurfaceTimelineEntry(
        date: Date(),
        snapshot: PocketSurfaceSnapshotPayload.loadCurrent(appTitle: appTitle)
      )
    )
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<PocketSurfaceTimelineEntry>) -> Void) {
    let entry = PocketSurfaceTimelineEntry(
      date: Date(),
      snapshot: PocketSurfaceSnapshotPayload.loadCurrent(appTitle: appTitle)
    )
    let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }
}

struct PocketSurfaceWidgetEntryView: View {
  @Environment(\\.widgetFamily) var family
  var entry: PocketSurfaceTimelineEntry

  private var primaryUrl: URL {
    URL(string: entry.snapshot.primaryHref ?? "\\(PocketSurfaceSharedConfig.defaultScheme)://app/today")
      ?? URL(string: "\\(PocketSurfaceSharedConfig.defaultScheme)://app/today")!
  }

  var body: some View {
    switch family {
    case .accessoryInline:
      Text("\\(entry.snapshot.title ?? ${JSON.stringify(appTitle)}) · \\(entry.snapshot.primaryValue ?? "")")
        .widgetURL(primaryUrl)
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        VStack(spacing: 1) {
          Text(entry.snapshot.badge ?? "●")
            .font(.caption2.bold())
          Text(entry.snapshot.primaryValue ?? "--")
            .font(.caption.bold())
            .minimumScaleFactor(0.7)
        }
      }
      .widgetURL(primaryUrl)
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.snapshot.title ?? ${JSON.stringify(appTitle)})
          .font(.headline)
          .lineLimit(1)
        Text(entry.snapshot.primaryValue ?? "")
          .font(.subheadline.bold())
          .lineLimit(1)
        Text(entry.snapshot.subtitle ?? "")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      .widgetURL(primaryUrl)
    default:
      VStack(alignment: .leading, spacing: 6) {
        HStack {
          Text(entry.snapshot.eyebrow ?? ${JSON.stringify(appTitle.toUpperCase())})
            .font(.caption2.bold())
            .foregroundStyle(.secondary)
          Spacer()
          if let badge = entry.snapshot.badge, !badge.isEmpty {
            Text(badge)
              .font(.caption2.bold())
              .padding(.horizontal, 6)
              .padding(.vertical, 2)
              .background(Color.accentColor.opacity(0.16))
              .clipShape(Capsule())
          }
        }
        Spacer(minLength: 0)
        Text(entry.snapshot.primaryValue ?? "Tap to record")
          .font(.title2.bold())
          .lineLimit(1)
        Text(entry.snapshot.title ?? ${JSON.stringify(appTitle)})
          .font(.subheadline.bold())
          .lineLimit(1)
        Text(entry.snapshot.subtitle ?? "")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
        if let actions = entry.snapshot.actions, !actions.isEmpty, family != .systemSmall {
          HStack(spacing: 8) {
            ForEach(actions.prefix(2), id: \\.id) { action in
              if let dest = URL(string: action.href) {
                Link(destination: dest) {
                  Text(action.label)
                    .font(.caption.bold())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 5)
                    .background(Color.accentColor.opacity(0.18))
                    .clipShape(Capsule())
                }
              }
            }
          }
        }
      }
      .padding(12)
      .widgetURL(primaryUrl)
    }
  }
}

struct PocketTodayAndLockWidget: Widget {
  let kind: String = "PocketTodayAndLockWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: PocketSurfaceTimelineProvider()) { entry in
      if #available(iOS 17.0, *) {
        PocketSurfaceWidgetEntryView(entry: entry)
          .containerBackground(.fill.tertiary, for: .widget)
      } else {
        PocketSurfaceWidgetEntryView(entry: entry)
      }
    }
    .configurationDisplayName(${JSON.stringify(appTitle)})
    .description("App status and quick actions")
    .supportedFamilies([${families.join(", ")}])
  }
}
`;
}

function buildPocketLiveActivityWidgetSwift(): string {
  return `#if canImport(ActivityKit)
import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.2, *)
struct PocketLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PocketSharedLiveActivityAttributes.self) { context in
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Text(context.state.leadingBadge)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.green.opacity(0.2))
            .clipShape(Capsule())
          Text(context.state.title)
            .font(.subheadline.bold())
            .lineLimit(1)
          Spacer()
          Text(context.state.trailingMetric)
            .font(.subheadline.monospacedDigit().bold())
        }
        Text(context.state.subtitle)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        ProgressView(value: min(max(context.state.progress, 0.0), 1.0))
      }
      .padding(14)
      .widgetURL(URL(string: context.state.primaryHref))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(context.state.leadingBadge)
            .font(.caption.bold())
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.trailingMetric)
            .font(.subheadline.monospacedDigit().bold())
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(context.state.title)
              .font(.subheadline.bold())
            ProgressView(value: min(max(context.state.progress, 0.0), 1.0))
            HStack(spacing: 8) {
              if let url = URL(string: context.state.primaryHref) {
                Link(context.state.primaryActionLabel, destination: url)
                  .font(.caption.bold())
              }
              if let secLabel = context.state.secondaryActionLabel,
                 let secHref = context.state.secondaryHref,
                 let secUrl = URL(string: secHref) {
                Link(secLabel, destination: secUrl)
                  .font(.caption)
              }
            }
          }
        }
      } compactLeading: {
        Text(context.state.leadingBadge)
          .font(.caption2.bold())
      } compactTrailing: {
        Text(context.state.trailingMetric)
          .font(.caption2.monospacedDigit().bold())
      } minimal: {
        Text("●")
          .font(.caption2.bold())
      }
      .widgetURL(URL(string: context.state.primaryHref))
    }
  }
}
#endif
`;
}

function buildPocketWidgetsBundleSwift(
  includeTodayOrLock: boolean,
  includeLiveActivity: boolean,
): string {
  return `import SwiftUI
import WidgetKit

@main
struct PocketWidgetsBundle: WidgetBundle {
  var body: some Widget {
${includeTodayOrLock ? "    PocketTodayAndLockWidget()\n" : ""}${
    includeLiveActivity
      ? `    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      PocketLiveActivityWidget()
    }
    #endif\n`
      : ""
  }  }
}
`;
}

function buildWidgetExtensionInfoPlist(appGroupId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>$(DEVELOPMENT_LANGUAGE)</string>
\t<key>CFBundleDisplayName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundleExecutable</key>
\t<string>$(EXECUTABLE_NAME)</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundlePackageType</key>
\t<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
\t<key>CFBundleShortVersionString</key>
\t<string>$(FLUTTER_BUILD_NAME)</string>
\t<key>CFBundleVersion</key>
\t<string>$(FLUTTER_BUILD_NUMBER)</string>
\t<key>NSExtension</key>
\t<dict>
\t\t<key>NSExtensionPointIdentifier</key>
\t\t<string>com.apple.widgetkit-extension</string>
\t</dict>
\t<key>PocketAppGroupIdentifier</key>
\t<string>${appGroupId}</string>
</dict>
</plist>
`;
}

function buildAppGroupEntitlementsPlist(appGroupId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>com.apple.security.application-groups</key>
\t<array>
\t\t<string>${appGroupId}</string>
\t</array>
</dict>
</plist>
`;
}

export interface GenerateIosXcodeGenSpecOptions {
  readonly flutterRoot: string;
  readonly bundleId: string;
  readonly teamId?: string;
  readonly includeWidgetsExtension: boolean;
  readonly useAppGroupEntitlements: boolean;
}

export function buildIosXcodeGenProjectYml(opts: GenerateIosXcodeGenSpecOptions): string {
  const iosDir = join(opts.flutterRoot, "ios");
  const hasFlutterSpm = existsSync(
    join(iosDir, "Flutter/ephemeral/Packages/FlutterGeneratedPluginSwiftPackage/Package.swift"),
  );
  const teamLine = opts.teamId ? `\n    DEVELOPMENT_TEAM: "${opts.teamId}"` : "";

  const hasPodsProj = existsSync(join(iosDir, "Pods/Pods.xcodeproj"));
  const packagesSection = [
    hasFlutterSpm
      ? `\npackages:\n  FlutterGeneratedPluginSwiftPackage:\n    path: Flutter/ephemeral/Packages/FlutterGeneratedPluginSwiftPackage`
      : "",
    hasPodsProj ? `\nprojectReferences:\n  Pods:\n    path: Pods/Pods.xcodeproj` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const runnerDeps: string[] = [];
  if (hasFlutterSpm) {
    runnerDeps.push(
      `      - package: FlutterGeneratedPluginSwiftPackage\n        product: FlutterGeneratedPluginSwiftPackage`,
    );
  }
  if (opts.includeWidgetsExtension) {
    runnerDeps.push(`      - target: PocketWidgetsExtension\n        embed: true`);
  }
  const depsBlock =
    runnerDeps.length > 0 ? `\n    dependencies:\n${runnerDeps.join("\n")}` : "";

  const runnerEntitlementsLine = opts.useAppGroupEntitlements
    ? `\n        CODE_SIGN_ENTITLEMENTS: Runner/Runner.entitlements`
    : "";

  const widgetsTargetBlock = opts.includeWidgetsExtension
    ? `
  PocketWidgetsExtension:
    type: app-extension
    platform: iOS
    deploymentTarget: "16.2"
    configFiles:
      Debug: Flutter/Generated.xcconfig
      Profile: Flutter/Generated.xcconfig
      Release: Flutter/Generated.xcconfig
    sources:
      - path: PocketWidgets
        excludes:
          - Info.plist
          - "*.entitlements"
    dependencies:
      - sdk: WidgetKit.framework
      - sdk: SwiftUI.framework
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: ${opts.bundleId}.widgets
        PRODUCT_NAME: PocketWidgetsExtension
        INFOPLIST_FILE: PocketWidgets/Info.plist
        GENERATE_INFOPLIST_FILE: NO
        CODE_SIGN_STYLE: Automatic
        CODE_SIGN_ENTITLEMENTS: PocketWidgets/PocketWidgets.entitlements
        CURRENT_PROJECT_VERSION: "$(FLUTTER_BUILD_NUMBER)"
        MARKETING_VERSION: "$(FLUTTER_BUILD_NAME)"
        SWIFT_VERSION: "5.0"
        SKIP_INSTALL: YES
        LD_RUNPATH_SEARCH_PATHS:
          - "$(inherited)"
          - "@executable_path/Frameworks"
          - "@executable_path/../../Frameworks"
`
    : "";

  return `# Generated and maintained via XcodeGen (\`xcodegen generate\`).
# Preserves full Flutter iOS build pipeline (\`Debug.xcconfig\`, \`Release.xcconfig\`,
# \`xcode_backend.sh\`, CocoaPods, and \`FlutterGeneratedPluginSwiftPackage\`) plus
# opt-in Pocket ecosystem extension targets.

name: Runner

options:
  bundleIdPrefix: ${opts.bundleId.split(".").slice(0, -1).join(".") || "dev.pocketjs"}
  deploymentTarget:
    iOS: "15.0"
  defaultConfig: Release
  createIntermediateGroups: true
  generateEmptyDirectories: true

configs:
  Debug: debug
  Profile: release
  Release: release

settings:
  base:${teamLine}
    IPHONEOS_DEPLOYMENT_TARGET: "15.0"
    SDKROOT: iphoneos
    SUPPORTED_PLATFORMS: "iphoneos iphonesimulator"
    SUPPORTS_MACCATALYST: NO
    SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: NO
    DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER: NO
    TARGETED_DEVICE_FAMILY: "1,2"
    ARCHS: arm64
    ALWAYS_SEARCH_USER_PATHS: NO
    CLANG_ENABLE_MODULES: YES
    CLANG_ENABLE_OBJC_ARC: YES
    ENABLE_BITCODE: NO
    ENABLE_STRICT_OBJC_MSGSEND: YES
    ENABLE_USER_SCRIPT_SANDBOXING: NO
    STRING_CATALOG_GENERATE_SYMBOLS: YES
    SWIFT_VERSION: "5.0"
  configs:
    Debug:
      COPY_PHASE_STRIP: NO
      DEBUG_INFORMATION_FORMAT: dwarf
      ENABLE_TESTABILITY: YES
      GCC_DYNAMIC_NO_PIC: NO
      GCC_OPTIMIZATION_LEVEL: "0"
      GCC_PREPROCESSOR_DEFINITIONS:
        - "DEBUG=1"
        - "$(inherited)"
      MTL_ENABLE_DEBUG_INFO: YES
      ONLY_ACTIVE_ARCH: YES
      SWIFT_ACTIVE_COMPILATION_CONDITIONS: DEBUG
      SWIFT_OPTIMIZATION_LEVEL: "-Onone"
    Profile:
      COPY_PHASE_STRIP: NO
      DEBUG_INFORMATION_FORMAT: dwarf-with-dsym
      ENABLE_NS_ASSERTIONS: NO
      MTL_ENABLE_DEBUG_INFO: NO
      SUPPORTED_PLATFORMS: iphoneos
      VALIDATE_PRODUCT: YES
    Release:
      COPY_PHASE_STRIP: NO
      DEBUG_INFORMATION_FORMAT: dwarf-with-dsym
      ENABLE_NS_ASSERTIONS: NO
      MTL_ENABLE_DEBUG_INFO: NO
      SUPPORTED_PLATFORMS: iphoneos
      SWIFT_COMPILATION_MODE: wholemodule
      SWIFT_OPTIMIZATION_LEVEL: "-O"
      VALIDATE_PRODUCT: YES
${packagesSection}
targets:
  Runner:
    type: application
    platform: iOS
    deploymentTarget: "15.0"
    configFiles:
      Debug: Flutter/Debug.xcconfig
      Profile: ${existsSync(join(iosDir, "Flutter/Profile.xcconfig")) ? "Flutter/Profile.xcconfig" : "Flutter/Release.xcconfig"}
      Release: Flutter/Release.xcconfig
    sources:
      - path: Runner
        excludes:
          - Info.plist
          - "*.entitlements"
      - path: Flutter/AppFrameworkInfo.plist
        buildPhase: resources${depsBlock}
    preBuildScripts:
      - name: Run Script
        script: |
          /bin/sh "$FLUTTER_ROOT/packages/flutter_tools/bin/xcode_backend.sh" build
        basedOnDependencyAnalysis: false
    postBuildScripts:
      - name: Thin Binary
        script: |
          /bin/sh "$FLUTTER_ROOT/packages/flutter_tools/bin/xcode_backend.sh" embed_and_thin
        inputFiles:
          - "\${TARGET_BUILD_DIR}/\${INFOPLIST_PATH}"
        basedOnDependencyAnalysis: false
    settings:
      base:
        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
        CODE_SIGN_STYLE: Automatic${runnerEntitlementsLine}
        CURRENT_PROJECT_VERSION: "$(FLUTTER_BUILD_NUMBER)"
        MARKETING_VERSION: "$(FLUTTER_BUILD_NAME)"
        GENERATE_INFOPLIST_FILE: NO
        INFOPLIST_FILE: Runner/Info.plist
        LD_RUNPATH_SEARCH_PATHS:
          - "$(inherited)"
          - "@executable_path/Frameworks"
        PRODUCT_BUNDLE_IDENTIFIER: ${opts.bundleId}
        PRODUCT_NAME: "$(TARGET_NAME)"
        SWIFT_OBJC_BRIDGING_HEADER: Runner/Runner-Bridging-Header.h
        VERSIONING_SYSTEM: apple-generic

  RunnerTests:
    type: bundle.unit-test
    platform: iOS
    deploymentTarget: "15.0"
    sources:
      - path: RunnerTests
    dependencies:
      - target: Runner
    settings:
      base:
        BUNDLE_LOADER: "$(TEST_HOST)"
        CODE_SIGN_STYLE: Automatic
        CURRENT_PROJECT_VERSION: "1"
        GENERATE_INFOPLIST_FILE: YES
        MARKETING_VERSION: "1.0"
        PRODUCT_BUNDLE_IDENTIFIER: ${opts.bundleId}.RunnerTests
        PRODUCT_NAME: "$(TARGET_NAME)"
        SWIFT_VERSION: "5.0"
        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/Runner.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/Runner"
${widgetsTargetBlock}
schemes:
  Runner:
    build:
      parallelizeBuild: false${
        hasFlutterSpm
          ? `\n      preActions:\n        - name: Run Prepare Flutter Framework Script\n          script: |\n            /bin/sh "$FLUTTER_ROOT/packages/flutter_tools/bin/xcode_backend.sh" prepare\n          settingsTarget: Runner`
          : ""
      }
      targets:${hasPodsProj ? "\n        Pods/Pods-Runner: [running, testing, profiling, archiving, analyzing]" : ""}
        Runner: all
        RunnerTests: [test]${opts.includeWidgetsExtension ? "\n        PocketWidgetsExtension: all" : ""}
    run:
      config: Debug
    test:
      config: Debug
      targets:
        - RunnerTests
    profile:
      config: Profile
    analyze:
      config: Debug
    archive:
      config: Release
`;
}

function buildGenerateXcodeprojSh(): string {
  return `#!/usr/bin/env bash
# Regenerates \`Runner.xcodeproj\` from \`project.yml\` via XcodeGen and re-links CocoaPods.
set -euo pipefail

IOS_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
export LANG="\${LANG:-en_US.UTF-8}"
export LC_ALL="\${LC_ALL:-en_US.UTF-8}"
export PATH="/opt/homebrew/bin:/usr/local/bin:\${PATH}"

if [[ -z "\${DEVELOPER_DIR:-}" ]]; then
  for cand in "/Applications/Xcode.app/Contents/Developer" "/Applications/Xcode-beta.app/Contents/Developer" "\${HOME}/Applications/Xcode.app/Contents/Developer"; do
    if [[ -d "\${cand}" ]]; then
      export DEVELOPER_DIR="\${cand}"
      break
    fi
  done
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "Error: xcodegen not found. Install via: brew install xcodegen" >&2
  exit 1
fi

cd "\${IOS_DIR}"
echo "==> Generating Runner.xcodeproj from ios/project.yml via XcodeGen..."
xcodegen generate --spec project.yml

if [[ -f "Podfile" ]] && command -v pod >/dev/null 2>&1; then
  echo "==> Linking CocoaPods workspace (pod install)..."
  COCOAPODS_DISABLE_STATS=true pod install
fi
echo "==> Done: ios/Runner.xcodeproj & ios/Runner.xcworkspace updated."
`;
}

// ── Android AppWidget & Manifest Scaffolding ─────────────────────────────────

function buildAndroidWidgetKotlin(pkgName: string, defaultScheme: string, appTitle: string): string {
  return `package ${pkgName}.surfaces

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import ${pkgName}.R
import org.json.JSONArray
import org.json.JSONObject

/**
 * Auto-scaffolded Pocket Single-Engine Home Screen AppWidget providers.
 * Reads snapshots published by \`PocketSurfaceBridgePlugin\` into
 * \`SharedPreferences("dev.pocketjs.surfaces")\` and binds interactive deep-link
 * hotspots back into the host Activity.
 */
abstract class BasePocketSurfaceWidgetProvider(
    private val sizeVariant: String,
) : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (widgetId in appWidgetIds) {
            val views = buildRemoteViews(context, widgetId, sizeVariant)
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }

    companion object {
        private const val PREFS_NAME = "dev.pocketjs.surfaces"
        private const val SNAPSHOT_KEY = "snapshot_v1"
        private const val DEFAULT_HREF = "${defaultScheme}://app/today"

        fun buildRemoteViews(context: Context, widgetId: Int, variant: String): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.pocket_surface_widget)
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val rawJson = prefs.getString(SNAPSHOT_KEY, null)
            val snap = try {
                if (rawJson.isNullOrBlank()) JSONObject() else JSONObject(rawJson)
            } catch (_: Exception) {
                JSONObject()
            }

            val eyebrow = snap.optString("eyebrow", ${JSON.stringify(appTitle.toUpperCase())})
            val title = snap.optString("title", ${JSON.stringify(appTitle)})
            val primaryValue = snap.optString("primaryValue", "Tap to record")
            val subtitle = snap.optString("subtitle", "Synced with the app")
            val badge = snap.optString("badge", "")
            val primaryHref = snap.optString("primaryHref", DEFAULT_HREF).ifBlank { DEFAULT_HREF }

            views.setTextViewText(R.id.pocket_widget_eyebrow, eyebrow)
            views.setTextViewText(R.id.pocket_widget_value, primaryValue)
            views.setTextViewText(R.id.pocket_widget_title, title)
            views.setTextViewText(R.id.pocket_widget_subtitle, subtitle)

            if (badge.isNotBlank() && variant != "small") {
                views.setTextViewText(R.id.pocket_widget_badge, badge)
                views.setViewVisibility(R.id.pocket_widget_badge, View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.pocket_widget_badge, View.GONE)
            }

            views.setViewVisibility(
                R.id.pocket_widget_subtitle,
                if (variant == "small") View.GONE else View.VISIBLE,
            )

            views.setOnClickPendingIntent(
                R.id.pocket_widget_root,
                deepLinkIntent(context, primaryHref, widgetId * 10 + 1),
            )

            val actions: JSONArray? = snap.optJSONArray("actions")
            if (variant == "large" && actions != null && actions.length() > 0) {
                val first = actions.optJSONObject(0)
                if (first != null) {
                    val actLabel = first.optString("label", "Open")
                    val actHref = first.optString("href", primaryHref)
                    views.setTextViewText(R.id.pocket_widget_action_primary, actLabel)
                    views.setViewVisibility(R.id.pocket_widget_action_primary, View.VISIBLE)
                    views.setOnClickPendingIntent(
                        R.id.pocket_widget_action_primary,
                        actionBroadcastIntent(
                            context,
                            first.optString("id", "primary"),
                            actHref,
                            widgetId * 10 + 2,
                        ),
                    )
                } else {
                    views.setViewVisibility(R.id.pocket_widget_action_primary, View.GONE)
                }
            } else {
                views.setViewVisibility(R.id.pocket_widget_action_primary, View.GONE)
            }
            return views
        }

        private fun deepLinkIntent(context: Context, href: String, reqCode: Int): PendingIntent {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(href)).apply {
                setPackage(context.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            return PendingIntent.getActivity(
                context,
                reqCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun actionBroadcastIntent(
            context: Context,
            actionId: String,
            href: String,
            reqCode: Int,
        ): PendingIntent {
            val intent = Intent(context, PocketSurfaceActionReceiver::class.java).apply {
                action = "dev.pocketjs.platform.SURFACE_WIDGET_ACTION"
                putExtra("action_id", actionId)
                putExtra("href", href)
            }
            return PendingIntent.getBroadcast(
                context,
                reqCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
    }
}

class PocketSmallWidgetProvider : BasePocketSurfaceWidgetProvider("small")
class PocketMediumWidgetProvider : BasePocketSurfaceWidgetProvider("medium")
class PocketLargeWidgetProvider : BasePocketSurfaceWidgetProvider("large")

class PocketSurfaceActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("action_id")?.trim().orEmpty()
        val href = intent.getStringExtra("href")?.trim().orEmpty()
        if (href.isEmpty()) return
        try {
            val storeCls = Class.forName("dev.pocketjs.pocket_platform.PocketSurfaceBridgeStore")
            val method = storeCls.getMethod(
                "enqueueWidgetAction",
                Context::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
            )
            method.invoke(null, context, id.ifEmpty { "widget-tap" }, href, "android-widget")
        } catch (_: Exception) {
            // Host plugin optional fallback: launch deep link directly below.
        }
        val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse(href)).apply {
            setPackage(context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        context.startActivity(openIntent)
    }
}
`;
}

const ANDROID_WIDGET_BG_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#FAF6EE" />
    <corners android:radius="20dp" />
    <stroke android:width="1dp" android:color="#E5DEC9" />
</shape>
`;

const ANDROID_WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/pocket_widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="14dp"
    android:background="@drawable/pocket_surface_widget_bg">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal">
        <TextView
            android:id="@+id/pocket_widget_eyebrow"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:textSize="11sp"
            android:textStyle="bold"
            android:textColor="#5B8C7A"
            android:singleLine="true" />
        <TextView
            android:id="@+id/pocket_widget_badge"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:textSize="11sp"
            android:textStyle="bold"
            android:textColor="#2C4F9E"
            android:visibility="gone" />
    </LinearLayout>

    <TextView
        android:id="@+id/pocket_widget_value"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="6dp"
        android:textSize="22sp"
        android:textStyle="bold"
        android:textColor="#2A2420"
        android:singleLine="true" />

    <TextView
        android:id="@+id/pocket_widget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="2dp"
        android:textSize="13sp"
        android:textStyle="bold"
        android:textColor="#2A2420"
        android:singleLine="true" />

    <TextView
        android:id="@+id/pocket_widget_subtitle"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="2dp"
        android:textSize="12sp"
        android:textColor="#6B7280"
        android:maxLines="2" />

    <TextView
        android:id="@+id/pocket_widget_action_primary"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:gravity="center"
        android:paddingTop="6dp"
        android:paddingBottom="6dp"
        android:textSize="12sp"
        android:textStyle="bold"
        android:textColor="#2C4F9E"
        android:visibility="gone" />
</LinearLayout>
`;

function buildAndroidWidgetInfoXml(minW: number, minH: number, cellsW: number, cellsH: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="${minW}dp"
    android:minHeight="${minH}dp"
    android:targetCellWidth="${cellsW}"
    android:targetCellHeight="${cellsH}"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/pocket_surface_widget"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen" />
`;
}

// ── Info.plist / SceneDelegate / AndroidManifest Patchers ────────────────────

function patchIosSurfacePlists(
  flutterRoot: string,
  appGroupId: string,
  hasAppleWidgetsOrClip: boolean,
  hasLiveActivity: boolean,
  embedWidgetExtension: boolean,
  updated: string[],
  created: string[],
): void {
  if (!hasAppleWidgetsOrClip && !embedWidgetExtension) return;
  const result = spawnSync("python3", ["-c", `
import plistlib, sys
from pathlib import Path

root = Path(sys.argv[1])
group = sys.argv[2]
has_live, embed = [arg == "1" for arg in sys.argv[3:]]
changes = []

def update(relative, patch, create=False):
    path = root / relative
    existed = path.exists()
    if not existed and not create:
        return
    original = path.read_bytes() if existed else None
    state = plistlib.loads(original) if existed else {}
    if not isinstance(state, dict):
        raise ValueError(f"{relative} must have a root dictionary")
    patch(state)
    if not existed or state != plistlib.loads(original):
        fmt = plistlib.FMT_BINARY if original and original.startswith(b"bplist") else plistlib.FMT_XML
        changes.append((relative, path, existed, plistlib.dumps(state, fmt=fmt, sort_keys=False)))

def info(state):
    state["PocketAppGroupIdentifier"] = group
    if has_live:
        state["NSSupportsLiveActivities"] = True
        state["NSSupportsLiveActivitiesFrequentUpdates"] = True

def entitlements(state):
    groups = state.setdefault("com.apple.security.application-groups", [])
    if not isinstance(groups, list):
        raise ValueError("com.apple.security.application-groups must be an array")
    if group not in groups:
        groups.append(group)

update("ios/Runner/Info.plist", info)
if embed:
    update("ios/Runner/Runner.entitlements", entitlements, create=True)
for relative, path, existed, content in changes:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    print(("updated" if existed else "created") + " " + relative)
`, flutterRoot, appGroupId, hasLiveActivity ? "1" : "0", embedWidgetExtension ? "1" : "0"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`cannot configure iOS surfaces: ${result.error?.message ?? result.stderr.trim()}`);
  }
  for (const line of result.stdout.trim().split("\n").filter(Boolean)) {
    const separator = line.indexOf(" ");
    (line.startsWith("created ") ? created : updated).push(line.slice(separator + 1));
  }
}

function patchAndroidEcosystemManifest(
  flutterRoot: string,
  pkgNamespace: string,
  modules: readonly EcosystemModuleId[],
  updated: string[],
): void {
  const manifestPath = join(flutterRoot, "android/app/src/main/AndroidManifest.xml");
  if (!existsSync(manifestPath)) return;
  const before = readFileSync(manifestPath, "utf8");
  let text = before;

  const hasWidgets = modules.includes("android-widgets");
  const hasLive = modules.includes("android-live");
  const hasDevices = modules.includes("android-devices");

  if (hasLive && !text.includes("android.permission.POST_NOTIFICATIONS")) {
    text = text.replace(
      /<application\b/,
      `<!-- Opt-in Android 14-16 Live Update ongoing notifications -->\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n\n    <application`,
    );
  }

  if (hasDevices && !text.includes("android.software.leanback")) {
    text = text.replace(
      /<application\b/,
      `<!-- Opt-in Android TV / Foldable multi-form-factor compatibility -->\n    <uses-feature android:name="android.software.leanback" android:required="false" />\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n\n    <application`,
    );
  }

  if (hasDevices && !text.includes("android:resizeableActivity=")) {
    text = text.replace(
      /(<activity\s+[^>]*android:name="\.MainActivity")/,
      `$1\n            android:resizeableActivity="true"`,
    );
  }

  const markerStart = "<!-- POCKET_ECOSYSTEM_SURFACES_START -->";
  const markerEnd = "<!-- POCKET_ECOSYSTEM_SURFACES_END -->";
  const markerRegex = new RegExp(`\\s*${markerStart}[\\s\\S]*?${markerEnd}`, "m");
  text = text.replace(markerRegex, "");

  if (hasWidgets) {
    const fqPrefix = `${pkgNamespace}.surfaces`;
    const widgetBlock = `
        ${markerStart}
        <receiver
            android:name="${fqPrefix}.PocketSmallWidgetProvider"
            android:exported="true"
            android:label="Small Widget (2x2)">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/pocket_widget_small_info" />
        </receiver>
        <receiver
            android:name="${fqPrefix}.PocketMediumWidgetProvider"
            android:exported="true"
            android:label="Medium Widget (4x2)">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/pocket_widget_medium_info" />
        </receiver>
        <receiver
            android:name="${fqPrefix}.PocketLargeWidgetProvider"
            android:exported="true"
            android:label="Large Widget (4x4)">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/pocket_widget_large_info" />
        </receiver>
        <receiver
            android:name="${fqPrefix}.PocketSurfaceActionReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="dev.pocketjs.platform.SURFACE_WIDGET_ACTION" />
            </intent-filter>
        </receiver>
        ${markerEnd}`;
    text = text.replace(/\n(\s*)<\/application>/, `${widgetBlock}\n$1</application>`);
  }

  if (text !== before) {
    writeFileSync(manifestPath, text, "utf8");
    updated.push("android/app/src/main/AndroidManifest.xml");
  }
}

export function syncNativeEcosystemProject(
  flutterRootDir: string,
  options: SyncNativeEcosystemOptions,
): SyncNativeEcosystemResult {
  const { deepLinkScheme } = resolvePlatformExperience(options);
  const flutterRoot = resolve(flutterRootDir);
  const createdFiles: string[] = [];
  const updatedFiles: string[] = [];

  const bundleId =
    options.bundleId?.trim() ||
    inferIosBundleId(flutterRoot) ||
    "dev.pocketjs.app";
  const teamId = options.teamId?.trim() || inferIosTeamId(flutterRoot);
  const appGroupId = `group.${bundleId}`;
  const appTitle = options.appTitle?.trim() || "Pocket App";
  const scheme = deepLinkScheme ?? "pocket";
  const generated = nativeFileWriter(flutterRoot, createdFiles, updatedFiles);
  const linkTargets = ["ios/Runner/Info.plist", "ios/Runner/AppDelegate.swift", "android/app/src/main/AndroidManifest.xml"];
  const beforeLinks = deepLinkScheme === undefined ? [] : linkTargets
    .filter((path) => existsSync(join(flutterRoot, path)))
    .map((path) => ({ path, content: readFileSync(join(flutterRoot, path)) }));
  patchDeepLinkPlatforms(flutterRoot, deepLinkScheme);
  for (const { path, content } of beforeLinks) {
    if (!content.equals(readFileSync(join(flutterRoot, path)))) updatedFiles.push(path);
  }
  const modules = options.modules;

  const hasIosDir = existsSync(join(flutterRoot, "ios")) && lstatSync(join(flutterRoot, "ios")).isDirectory();
  const hasAndroidDir =
    existsSync(join(flutterRoot, "android")) && lstatSync(join(flutterRoot, "android")).isDirectory();

  const includeToday = modules.includes("apple-today");
  const includeLock = modules.includes("apple-lock");
  const includeLiveActivity = modules.includes("apple-live-activity");
  const hasAppleWidgetFamily = includeToday || includeLock || includeLiveActivity;
  const embedIosExt =
    options.embedIosExtensions === true || process.env.POCKET_EMBED_IOS_EXTENSIONS === "1";

  let managedXcodeGenSpec = false;
  if (hasIosDir) {
    if (hasAppleWidgetFamily) {
      const widgetsDir = join(flutterRoot, "ios/PocketWidgets");
      generated.write(
        join(widgetsDir, "PocketSharedSurfaceStore.swift"),
        buildPocketSharedSurfaceStoreSwift(appGroupId, scheme),
      );
      if (includeToday || includeLock) {
        generated.write(
          join(widgetsDir, "PocketTodayAndLockWidget.swift"),
          buildPocketTodayAndLockWidgetSwift(appTitle, includeToday, includeLock),
        );
      }
      if (includeLiveActivity) {
        generated.write(
          join(widgetsDir, "PocketLiveActivityWidget.swift"),
          buildPocketLiveActivityWidgetSwift(),
        );
      }
      generated.write(
        join(widgetsDir, "PocketWidgetsBundle.swift"),
        buildPocketWidgetsBundleSwift(includeToday || includeLock, includeLiveActivity),
      );
      generated.write(
        join(widgetsDir, "Info.plist"),
        buildWidgetExtensionInfoPlist(appGroupId),
      );
      generated.write(
        join(widgetsDir, "PocketWidgets.entitlements"),
        buildAppGroupEntitlementsPlist(appGroupId),
      );
    }

    patchIosSurfacePlists(
      flutterRoot,
      appGroupId,
      hasAppleWidgetFamily || modules.includes("apple-clip"),
      includeLiveActivity,
      options.useXcodeGen === true && embedIosExt && hasAppleWidgetFamily,
      updatedFiles,
      createdFiles,
    );

    if (options.useXcodeGen === true) {
      const projectYmlPath = join(flutterRoot, "ios/project.yml");
      managedXcodeGenSpec = generated.write(
        projectYmlPath,
        buildIosXcodeGenProjectYml({
          flutterRoot,
          bundleId,
          teamId,
          includeWidgetsExtension: embedIosExt && hasAppleWidgetFamily,
          useAppGroupEntitlements: embedIosExt && hasAppleWidgetFamily,
        }),
      );
      const genScriptPath = join(flutterRoot, "ios/generate-xcodeproj.sh");
      if (generated.write(
        genScriptPath,
        buildGenerateXcodeprojSh(),
      )) spawnSync("chmod", ["+x", genScriptPath]);
    }
  }

  let xcodegenExecuted = false;
  if (managedXcodeGenSpec && options.runXcodeGen) {
    const envWithBrew = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}`,
    };
    const res = spawnSync("xcodegen", ["generate", "--spec", "project.yml"], {
      cwd: join(flutterRoot, "ios"),
      env: envWithBrew,
      encoding: "utf8",
    });
    xcodegenExecuted = res.status === 0;
  }

  if (hasAndroidDir) {
    const pkgNamespace = inferAndroidNamespace(flutterRoot, bundleId);
    if (modules.includes("android-widgets")) {
      const pkgRel = pkgNamespace.replaceAll(".", "/");
      generated.write(
        join(
          flutterRoot,
          `android/app/src/main/kotlin/${pkgRel}/surfaces/PocketSurfaceAppWidgetProviders.kt`,
        ),
        buildAndroidWidgetKotlin(pkgNamespace, scheme, appTitle),
      );
      generated.write(
        join(flutterRoot, "android/app/src/main/res/drawable/pocket_surface_widget_bg.xml"),
        ANDROID_WIDGET_BG_XML,
      );
      generated.write(
        join(flutterRoot, "android/app/src/main/res/layout/pocket_surface_widget.xml"),
        ANDROID_WIDGET_LAYOUT_XML,
      );
      generated.write(
        join(flutterRoot, "android/app/src/main/res/xml/pocket_widget_small_info.xml"),
        buildAndroidWidgetInfoXml(110, 110, 2, 2),
      );
      generated.write(
        join(flutterRoot, "android/app/src/main/res/xml/pocket_widget_medium_info.xml"),
        buildAndroidWidgetInfoXml(250, 110, 4, 2),
      );
      generated.write(
        join(flutterRoot, "android/app/src/main/res/xml/pocket_widget_large_info.xml"),
        buildAndroidWidgetInfoXml(250, 250, 4, 4),
      );
    }

    patchAndroidEcosystemManifest(
      flutterRoot,
      pkgNamespace,
      modules,
      updatedFiles,
    );
  }

  generated.save();
  return {
    flutterRoot,
    bundleId,
    appGroupId,
    createdFiles,
    updatedFiles: [...new Set(updatedFiles)],
    xcodegenExecuted,
  };
}
