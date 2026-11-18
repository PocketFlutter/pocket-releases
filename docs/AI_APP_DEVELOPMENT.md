# Pocket AI application development guide

This guide is for AI and Codex-style development agents. It documents how to use Pocket's actual build, runtime, Editor, hardware, and signed update paths without duplicating runtime or Flutter application UI.

## 1. Required development boundaries

1. Write application pages, routing, application state, component composition, update controls, and update policy in JS, TS, or TSX.
2. Keep Dart at the Flutter rendering surface, IME, lifecycle, FFI, resource IO, trust admission, and registered native capability transport boundaries.
3. Keep JS-capable logic in JS, including form reducers, navigation stacks, retry policy, update prompts, recording controls, and page composition.
4. Use the existing runtime and layout engine. Keep WebViews, mock runtime fallbacks, and fake-success placeholders out of the implementation.
5. Hardware defaults to disabled. Enable only modules the app requires. The host registers capabilities separately from the guest declaration.
6. For absent native capabilities, start with a custom plugin using `PocketPlugin` and `HostBridge`. Keep application UI in JS.
7. Use the pinned PocketJS compiler/engine and `buildGuest`. Production executes the compiled guest.
8. Rebuild QJBC and PAK after any JS, UI library, or asset change. Verify actual JS execution and an input-driven frame change.

## 2. Development sequence

```text
Confirm requirements
  → Implement the entire App/Game flow in a TCA style
  → Test State/Action/Reducer/Effect
  → Bind verified state and actions to JS UI
  → Enable required hardware and platform plugins
  → Declare capabilities and permissions in the manifest
  → Build in Editor and preview in the actual runtime
  → Validate native boundaries in simulator and on device
  → Generate QJBC and PAK with buildGuest
  → Sign with package_update and deploy
  → Verify first bundle, incremental blobs, and rollback
```

### App and Game development order

For either `app` or `game`, complete functionality in a TCA style (State, Action, Reducer, Effect), then add tests and wire UI last. TCA describes organization in the application's JS/TS. It does not require an additional package.

1. **Complete functionality.** Define complete State and Action, implement transitions in Reducer, and use Effect for timers, requests, persistence, and asynchronous boundaries. Exercise the app's business flow or the game's full start, active, pause, resume, restart, and end states before relying on rendering.
2. **Add tests.** Cover initial state, the main path, boundaries, failure, asynchronous results, application submit/return, and game pause/resume/restart/countdown completion. Verify State/Action/Reducer/Effect behavior and transitions directly.
3. **Wire UI.** Bind verified State and Action to existing `@pocket/ui`, `View`, and `Focusable` components. UI presents state and dispatches actions. Keep a single owner of application state, timers, and flow. Preserve verified interaction behavior when restyling.

This sequence is part of implementing the feature. If a change affects functionality, tests, or UI, correct the applicable State/Action/Reducer/Effect layer and verify it before continuing.

Before editing, answer these questions.

- Can the feature run entirely in JS?
- Does it need new Dart, Swift, or Kotlin? Which platform boundary requires it?
- Which capabilities, permissions, and native packages are required? Can a module be omitted?
- Which existing `@pocket/ui` control fits the page?
- Does the asset belong in the initial bundle, the on-demand network resources, or a later single-resource update?
- How will real JS input produce a verified frame change?

## 3. Create an app

The default scaffold is a thin host without hardware plugins.

```sh
bun sdk/pocket.ts init /absolute/path/to/app \
  --app-id=com.example.notes \
  --name=notes \
  --version=1.0.0
```

Keep the generated project organized by responsibility.

```text
app/
├── lib/                 # Thin Flutter host, with pages and state in JS
├── ios/ android/        # Native declarations and real platform providers
├── assets/              # QJBC, PAK, metadata, and manifest from buildGuest
└── js/                  # Application project
    ├── app.tsx
    ├── manifest.json
    ├── pocket.json
    ├── package.json
    └── assets/
```

Build the app.

```sh
cd /absolute/path/to/app/js
bun install
bun run build
```

For a project with SystemUI and multiple Mini Apps, use the existing `build:system` command. Pages share the same compiler entry point.

## 4. JS and native ownership

| JS | Dart or native boundary |
| --- | --- |
| Pages, routes, navigation stacks | `PocketView` and Flutter Canvas |
| Signals, stores, reducers | System IME and TextInputClient transport |
| Loading, error, and empty states | Lifecycle and viewport facts |
| Form validation, retry policies | FFI, file IO, and resource decoding |
| Update check and apply timing | Signature, hash, ABI, and permission admission |
| Hardware result presentation | Camera, BLE, location, and other system API providers |
| Lists, pagination, filtering | Native Texture and authorization lifecycle |
| Multi-app open, close, and return | Fact collection at official Worker and IO execution boundaries |

Common mistakes include mirroring JS routing in Dart `currentPage`, creating Flutter business widgets for each JS card, and putting retry policy into a plugin. Keep page and retry decisions in JS. A Dart plugin performs a single bounded request and returns a structured result.

## 5. UI controls and composition

Public imports

```ts
import {
  MobileThemeProvider,
  MOBILE_THEME_LIGHT,
  MobileScaffold,
  MobileAppBar,
  MobileCard,
  MobileButton,
  MobileListTile,
  MobileSwitch,
  MobileDialog,
  ScrollablePage,
  InputField,
} from "@pocket/ui";
```

Example page

```tsx
import { createSignal } from "solid-js";
import {
  MobileThemeProvider,
  MOBILE_THEME_LIGHT,
  MobileScaffold,
  MobileAppBar,
  MobileCard,
  MobileButton,
  MobileParagraph,
  ScrollablePage,
  InputField,
} from "@pocket/ui";

export function NotesPage() {
  const [title, setTitle] = createSignal("");
  const [saved, setSaved] = createSignal(false);

  return (
    <MobileThemeProvider theme={MOBILE_THEME_LIGHT}>
      <MobileScaffold appBar={<MobileAppBar title="Notes" />}>
        <ScrollablePage class="px-4 py-4 gap-3">
          <MobileCard>
            <InputField
              value={title}
              placeholder="Title"
              onInput={setTitle}
            />
            <MobileParagraph text={saved() ? "Saved" : "Not saved"} />
            <MobileButton
              label="Save"
              disabled={!title().trim()}
              onPress={() => setSaved(true)}
            />
          </MobileCard>
        </ScrollablePage>
      </MobileScaffold>
    </MobileThemeProvider>
  );
}
```

| Scenario | Existing components |
| --- | --- |
| Page shell and safe area | `MobileScaffold`, `SafeAreaScaffold` |
| Long content and keyboard avoidance | `ScrollablePage` |
| System input | `InputField`, with the application value owned by JS |
| Primary actions | `MobileButton` and Filled, Tonal, Outlined, or Text aliases |
| Settings | `MobileListTile`, `MobileSwitch`, `MobileSegmentedControl` |
| Selection | `MobileCheckbox`, `MobileRadioGroup`, `ShadcnSelect` |
| Feedback | `MobileAlert`, `MobileToast`, `MobileDialog`, `MobilePopup` |
| Navigation | `NavigationBar`, `Tabs`, with route state owned by JS |
| Apple glass | `AppleGlassButton`, `AppleGlassToolbar`, `AppleGlassNavigationBar` |
| Camera, video, and other native images | Authorized `PlatformTextureSurface` |

Pocket UI uses TSX and native PocketJS nodes. Browser libraries that rely on DOM or CSS require adaptation. See `sdk/packages/pocket_ui/src/index.ts` for the full export list.

### Preserve control behavior when styling games and apps

Start with existing control behavior and adapt the skin, colors, shapes, type, motion, and layout to the app.

1. Use existing components and theme, appearance, class, or style parameters.
2. Compose existing primitives to create custom visuals and preserve Focusable, press, disabled, and semantic behaviors.
3. Override behavior only when the product needs a different interaction model. Record which behavior required the change.

Retain press, cancel, and release transactions, focus and keyboard/gamepad navigation, disabled state, scroll arbitration and inertia, IME and keyboard avoidance, safe area, touch targets, accessibility semantics, route inactivity, lifecycle cancellation, and reduced motion. Compose with the existing controls so custom-looking buttons, inputs, lists, and dialogs preserve these behaviors.

If new behavior is necessary, verify taps and drag-out cancellation, rapid repeated actions, keyboard/gamepad, nested scrolling, route exit, orientation and size changes, accessibility, and physical-device touch. Record the behavior reused and the styling changed. Verify interactions directly.

### Game viewport and safe area

Draw backgrounds, video, atmosphere, transitions, and masks over the full viewport, outside the controls' safe-area clip. Buttons, dialogue, menus, and scene hit targets share one safe frame formed by `pageInsets`. In a standalone game root, put full-canvas visuals in the `SafeAreaScaffold` `background` slot and controls in `children` or `appBar`. The slot paints above the canvas background and below the safe content and consumes no extra insets. Nested `MobileScaffold` draws the slot in its current canvas, and `edges="none"` adds no insets. Reuse `display.viewport` and `pageInsets` geometry in custom games. Keep one layout and camera state, with no additional Dart `SafeArea` or per-control inset. For layered scenes and cameras, use the same pose for visuals and hits and document the mapping. The game chooses its camera origin.

`NovelView` supplies full-viewport scene visuals and safe controls through its built-in layout. Custom games implement those boundaries explicitly. See [visual novel mobile safe areas](VISUAL_NOVEL_MOBILE_SAFE_AREA.md) for the implementation and evidence.

The `background` slot's full-canvas container uses `hitPass: 1` so it does not claim hits. Pocket applies `hitPass` only to the node itself. Descendants still participate in hit walking, so keep `Focusable`, buttons, and gestures out of the background. Set `style={{ hitPass: 1 }}` on decorative Views that can overlap safe controls. Controls draw later as siblings and retain their `Focusable` input. Visual transparency does not change hit behavior. Preserve intentional blockers such as menu scrims. Callers using a raw View without Scaffold own full-screen and safe-content layout.

## 6. HostBridge and capability declarations

Use the same JS `HostBridge` to request native capabilities.

```ts
const result = await host.request<{ model: string }>("plugins.packageInfo", {});
```

Declare only required application capabilities in `manifest.json`.

```json
{
  "protocolVersion": 1,
  "capabilities": {
    "requires": [],
    "optional": ["plugins.packageInfo"]
  },
  "permissions": {
    "optional": []
  }
}
```

Use `engine.capabilities.requires/enhances` in `pocket.json` for features known to the pinned compiler, such as `text.glyphs.baked`. Engine names use lowercase dot-separated segments. Declare HostBridge RPCs such as `platform.widgets.publishSnapshot` and `sync.mesh.blob.putChunk` under `capabilities.requires/optional` in `manifest.json` with original spelling. A `schema.pattern /engine/capabilities/...` error usually means the declaration belongs in a different layer. If `capability.unknown` follows, check the engine feature list. Removing a misplaced engine name does not register or authorize a host provider.

Admission goes from a compiled and registered provider, to host policy, to the Guest manifest declaration, to OS authorization. Missing prerequisites return explicit errors.

## 7. Opt-in hardware modules

`--hardware` includes the full compatibility bundle. New apps should enable individual modules as needed.

```sh
# Opt in to camera and Bluetooth only
bun sdk/pocket.ts init /path/to/app --camera --bluetooth

# Opt in to motion sensors, with permission if required on iOS
bun sdk/pocket.ts init /path/to/motion \
  --sensors --permissions=hardware.sensors

# Location and weather are separate modules
bun sdk/pocket.ts init /path/to/weather --location --weather

# Network, haptics, system bars, and deep links are opt-in
bun sdk/pocket.ts init /path/to/app \
  --dio --clipboard --platform-experience --deep-link-scheme=myapp
```

Optional packages include `pocket_permissions`, `pocket_camera`, `pocket_bluetooth`, `pocket_sensors`, `pocket_location`, `pocket_biometrics`, `pocket_weather`, `pocket_platform`, `pocket_dio`, and `pocket_clipboard` (`--clipboard`, see CLIPBOARD_PLUGIN.md).

Dio's `dio.request` uses a dedicated Dart IO Worker isolate for request, stream reading, and decoding, while keeping `createPocketDioClient(host)`. Dio-only integration uses the `network` permission and plugin `allowedOrigins` without a JS `domains.worker`. Official JS `net.http` uses `domains.worker` and `workerHttpOrigins`. Each has its own authorization. Use official application Workers for expensive game calculations as needed. Web `renderWorker` controls rendering independently and defaults off.

Request OS permission only after user action. JS owns explanations, denial UI, and decisions to open Settings. The plugin reports actual OS state.

### Add a native capability

When existing modules lack a required capability, implement it as follows.

1. Implement `PocketPlugin` in a separate Flutter package.
2. Create one provider per guest generation and support teardown and cancellation.
3. Pick a stable name, for example `vendor.maps.route`.
4. Bound and validate inputs, responses, sizes, timeouts, origins, and concurrency.
5. Register it explicitly in `PocketAppConfig.pluginFactories`.
6. Declare the capability in the guest manifest and provide a small typed JS client.
7. Keep Swift and Kotlin at the system API boundary and JS in charge of policy, state, and UI.

```dart
final config = PocketAppConfig(
  appId: 'com.example.notes',
  pluginFactories: [
    (controller) => VendorMapsPlugin(controller: controller),
  ],
  additionalCapabilities: {'vendor.maps.route'},
);
```

Release a host containing new Dart, Swift, or Kotlin capabilities before declaring them in a JS update package.

## 8. Editor and Pocket Studio

Start Showcase Studio.

```sh
cd demo/js
bun run editor
# http://127.0.0.1:8791
```

Open an external project.

```sh
cd sdk
bun pocket.ts editor /absolute/path/to/js-project \
  --flutter-root=/absolute/path/to/flutter-project \
  --port=8791
```

For LAN update testing, enable the Editor's built-in read-only version backend.

```sh
bun pocket.ts editor /absolute/path/to/js-project \
  --flutter-root=/absolute/path/to/flutter-project \
  --port=8791 \
  --update-host=192.168.1.20 \
  --update-port=8792 \
  --update-host-version=3.2.0
```

Publish test package generates
`http://192.168.1.20:8792/pocket/3.2.0/<packageId>/test/latest.json`
and displays its `host.json`. The LAN listener serves signed packages, bundles, blobs, and public bootstrap. Editor API, source, and signing private keys stay on loopback.

Open **Versions** in the Editor header for **Version management**. It lists `test` and `stable`, each root and Mini App package's actual version and build, and LAN manifest and host configuration. It reads the signed release directory as the source of truth.

1. Edit and save JS, TS, or TSX.
2. Click Build and confirm actual `buildGuest` produced QJBC and PAK.
3. Test clicks, scrolling, input, and resize in the Canvas preview.
4. Use **Copy preview link** to pass it to a browser-capable development agent.
5. Deploy to simulator or device for native hardware, IME, Texture, permissions, and performance.
6. Rebuild after source edits to replace the loaded bytecode.
7. Publish/Test package uses production signing, content addressing, and the update coordinator.

Browser preview draws actual QuickJS/PocketJS frames. Device validation covers differences in Canvas and Flutter font and resource decoding.

## 9. Resource packaging

| Artifact | Purpose |
| --- | --- |
| `app.qjbc` | Executable QuickJS bytecode |
| `app.pak` | Complete canonical font, image, and other resources |
| `app.bytecode.json` | ABI, hashes, sizes, version, and build |
| `guest-manifest.json` | Capability and permission declarations |
| `app.js` | Diagnostic reproduction, outside the production load path |

Editor's `pocket.resources.json` selects which resources ship in the baseline archive and which download from the network.

```json
{
  "version": 1,
  "packages": {
    "com.example.notes": {
      "network": [
        "pak:ui:img.assets/large-cover.png",
        "asset:assets/intro.mp4"
      ]
    }
  }
}
```

- Resources enter the first bundle by default.
- `networkPakKeys` accepts only separable `ui:img.*` PAK entries.
- `networkAssets` applies to loose assets.
- Keep fonts, metadata, entry, Worker, and other required records in the baseline.
- The runtime reconstructs and verifies the complete canonical PAK for network placement too. Both use the same resource reader.
- Store identical SHA-256 content once.

Equivalent CLI flags

```sh
--network-pak-key ui:img.assets/large-cover.png
--network-asset assets/intro.mp4
--bundle-format 7z   # Default, also supports zip
--no-bundle          # Advanced cases without an initial bundle
```

## 10. Update URL layout

Production deploy layout

```text
https://<domain>/<optional-prefix>/pocket/<hostVersion>/<packageId>/<packageVersion>/
├── latest.json
├── signed-manifest.json
├── payload.json
├── bundles/bundle-<sha256>.7z
└── blobs/<sha256>
```

`<root>` can be any fixed path prefix. With `baseUrl` set to
`https://xxx.com/some-other-path`, the manifest is
`https://xxx.com/some-other-path/pocket/<hostVersion>/<packageId>/<packageVersion>/latest.json`.
The publisher can target `./public/some-other-path` with `--deploy-root`.

For example

```text
https://xxx.com/pocket/3.2.0/com.example.notes/stable/latest.json
```

The URL's `packageVersion` is the release slot.

- Stable slots such as `stable` and `beta` keep the same `latest.json`, so the client discovers newer signed payload versions there.
- Immutable slots such as `1.4.7` pin the client to that release line. Changing versions requires host configuration.
- The signed payload carries the actual package version and anti-replay build. Increase the build on every release.
- Replace `latest.json` as needed. Retain `bundles/bundle-<sha256>.*` and `blobs/<sha256>` immutably so concurrent clients read consistent content.

Host configuration

```dart
updates: const PocketUpdateConfig(
  baseUrl: 'https://xxx.com/some-other-path',
  hostVersion: '3.2.0',
  packageVersion: 'stable',
  keyId: 'release-2026',
  publicKey: '<base64-ed25519-public-key>',
  namespace: 'notes-stable',
),
```

Equivalent environment variables

```text
POCKET_UPDATE_BASE_URL=https://xxx.com/some-other-path
POCKET_HOST_VERSION=3.2.0
POCKET_PACKAGE_VERSION=stable
POCKET_UPDATE_KEY_ID=release-2026
POCKET_UPDATE_PUBLIC_KEY=<base64-public-key>
POCKET_STORE_NAMESPACE=notes-stable
```

`POCKET_UPDATE_URL` continues to specify a full manifest URL for Editor, local loopback, and existing consumers. Use it independently of structured address fields. Production uses HTTPS. Keep the private key at the publisher.

Once the app ships with the host URL and root `createPocketUpdateClient(..., { autoRefresh: true })`, publish later builds atomically to the same slot. The JS update client checks the address and downloads and verifies candidates. JS decides whether to apply immediately, prompt, or wait for restart. Dart uses the existing update coordinator.

## 11. First bundle and subsequent granular updates

The same signing protocol supports these download and scope options.

1. **First download.** When no healthy baseline exists, `auto` downloads a 7z or ZIP bundle from the manifest, verifies archive SHA-256, size, and each blob, then reconstructs the complete PAK.
2. **Subsequent update.** With a baseline, `auto` chooses granular mode, reuses content-addressed local blobs, and fetches only code or resources whose hashes changed.
3. **Single resource.** The publisher replaces one PAK key or loose asset with `patchPackageArtifacts` against the prior version. The client can use `checkResource(resource)` to restrict scope and verify other components are unchanged.
4. **Code only.** Use `checkCodeOnly()`. It rejects changes to resources or policy in the same update.

JS update checks and apply

```ts
import { createPocketUpdateClient } from "@pocket/ui";

const updates = createPocketUpdateClient(host, {
  autoRefresh: true,
  onError: (error) => console.warn("update failed", error),
});

// Refresh manually
await updates.refresh();

// Allow code-only changes
await updates.refresh({ mode: "granular", scope: "code" });

// Allow changes to the specified PAK or loose asset only
await updates.refresh({
  mode: "granular",
  scope: "resource",
  resource: "ui:img.assets/large-cover.png",
});
```

Promote a candidate only after its first frame and health window pass. A failure restores the verified lastGood/previous release or immutable bundled package.

## 12. Publishing commands

Publish the first release to the unified layout.

```sh
bun sdk/scripts/package_update.ts package \
  --app-id com.example.notes \
  --version 1.0.0 \
  --build 100 \
  --entry-format quickjs-bytecode \
  --bytecode app.qjbc \
  --runtime-abi "$(jq -r .runtimeAbi app.bytecode.json)" \
  --pak app.pak \
  --guest-manifest guest-manifest.json \
  --deploy-root ./public/some-other-path \
  --host-version 3.2.0 \
  --route-version stable \
  --key-file ./release-key.json
```

Output directory

```text
public/some-other-path/pocket/3.2.0/com.example.notes/stable/
```

Update one PAK image resource.

```sh
bun sdk/scripts/package_update.ts patch \
  --base-dir ./public/some-other-path/pocket/3.2.0/com.example.notes/stable \
  --app-id com.example.notes \
  --version 1.0.1 \
  --build 101 \
  --pak-entry ui:img.assets/large-cover.png=./new-cover.png \
  --deploy-root ./public/some-other-path \
  --host-version 3.2.0 \
  --route-version stable \
  --key-file ./release-key.json
```

Update a loose asset only.

```sh
--asset assets/intro.mp4=./intro-v2.mp4
```

Update code only.

```sh
--bytecode ./app-v2.qjbc --runtime-abi '<same-compatible-abi>'
```

Sync `public/` unchanged to object storage or a CDN. The server needs only static GET. Preserve signed JSON and blob encoding at the CDN.

## 13. Host your own update service

A custom server can replace the built-in Pocket server if it meets these requirements.

1. Serve `latest.json` at the documented path.
2. Preserve the relative URLs in manifests and their same-origin policy.
3. Serve signed bundles and `blobs/<sha256>` referenced by the manifest.
4. Use immutable caching for hashed bundles and blobs and short cache or no-cache for `latest.json`.
5. Publish atomically by uploading every hashed file before replacing `latest.json`.
6. Retain old hashed files for at least the client update and rollback window.
7. Keep the Ed25519 private key out of apps, Editor public directories, and CI artifacts.

The host trusts only its configured public key or root trust policy. HTTP is allowed only on debug loopback or explicit debug hosts. Production requires HTTPS.

## 14. Acceptance checklist

- [ ] JS owns application logic that can run in JS.
- [ ] Only used hardware and platform packages are enabled.
- [ ] Guest manifest, host allowlist, and OS permissions agree.
- [ ] UI reuses controls and handles loading, error, empty, and disabled states.
- [ ] A real Editor build changes frames after click and text input.
- [ ] For games, inspect real QJBC/DrawOps and confirm the background (image, video, or geometry) intersected with all active clips covers the full viewport. Verify visible pixels in the top status-bar and bottom home-indicator areas. Keep controls and hit targets in a single safe frame and exercise real Start and menu or equivalent game entry.
- [ ] Game safe-area checks cover iPhone, Android, portrait, landscape, and rotation round trips. Report Core, Editor, and physical-device evidence independently.
- [ ] Verify IME, permissions, Texture, or hardware at the simulator or device boundary.
- [ ] QJBC, PAK, metadata, and manifest come from the same pinned build.
- [ ] Release URLs use `/pocket/<hostVersion>/<packageId>/<packageVersion>/`.
- [ ] Without a baseline, the manifest and bundle suffice for first install.
- [ ] Subsequent code-only updates request only the changed code blob.
- [ ] Subsequent single-resource updates request only that resource blob and reuse other content.
- [ ] Invalid signature/hash, downgraded build, ABI mismatch, and startup failure fail closed.
- [ ] Private keys, caches, `.dart_tool`, `.swiftpm`, and native binaries stay out of versioned source.

## 15. Related documentation

- `SDK_INTEGRATION.md` covers Flutter consumers.
- `COMPONENTS.md` covers components and host node contracts.
- `HARDWARE_MODULES.md` covers opt-in hardware and permissions.
- `OPTIONAL_PLUGINS.md` covers Dio, platform capabilities, and optional plugins.
- `EDITOR_STUDIO.md` covers Editor, preview, and device deployment.
- `VISUAL_NOVEL_MOBILE_SAFE_AREA.md` covers full-viewport game/VN visuals, safe controls, and acceptance by layer.
- `EDITOR_RESOURCE_DELIVERY.md` covers baseline and network asset placement.
- `PACKAGE_UPDATE_MODES.md` covers first bundle and granular updates.
- `SYSTEM_UI_SELF_REFRESH.md` covers JS auto refresh and state handoff.
- `ON_DEMAND_MINI_APPS.md` covers Mini Apps downloaded on first launch.

## 16. Sources, adaptations, and verification

The source review inspected the retained parent outside `pocket_host/`.

- `pocketjs_flutter_demo/mini_apps/syslib/pocket_syslib_ota.js` supplied the responsibility split for host version gates, package versions, integrity, and failure rollback. Its `.pjc` examples and short-string SHA checks remain historical.
- `pocketjs_flutter_demo/lib/core/pocketjs_bundle_runner.dart` supplied complete bundle extraction, resource path resolution, and final complete resource admission. The SDK owns those boundaries and app rendering stays in JS.
- `pocketjs_flutter_demo/tools/compile_pocket_syslib_aot.py` supplies historical build and version metadata context. The current pipeline remains pinned `buildGuest` and QuickJS QJBC.

`PocketUpdateCoordinator`, `PocketPackageStore`, `packageArtifacts` and `patchPackageArtifacts`, Editor publishing, and the JS update client already supported first bundles, content-addressed blobs, code-only and single-resource updates, healthy promotion, and rollback. The evidenced gaps were unified production URL and directory generation and an executable guide for development agents. This increment added three things.

- Structured base, host, and package slot parsing in `PocketUpdateConfig`.
- Publishing CLI flags `--deploy-root`, `--host-version`, and `--route-version`.
- This guide and corresponding integration instructions.

Downloads, caches, update state, and resource loading reuse their existing implementations, and application UI stays in JS. Validation included Dart 3.9 and Flutter 3.35 config tests and SDK analysis, 21 publication tool tests, 14 JS update planning and refresh tests, the actual coordinator from initial bundle through code blob, single PAK resource, and loose asset, and CLI probes for first release and incremental patch in the same slot.
