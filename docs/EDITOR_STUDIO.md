# Local Pocket Studio (Legacy Web UI)

> **Linux and Apple Silicon macOS build and startup smoke verified on 2026-11-17.** On macOS in a checkout containing `studio/`, `bun sdk/pocket.ts editor [<project>]` now defaults to native Pocket Studio. Its TSX Guest runs in a thin Flutter macOS host, and `sdk/scripts/pocket_studio_launcher.ts` discovers `<repoRoot>/.fvm/flutter_sdk/bin/flutter`. The web UI described here is selected by `--web`, `POCKET_EDITOR_UI=web`, server-only arguments, `npm start` through `editor_service.mjs`, a standalone Web SDK without `studio/`, or a platform other than macOS such as Linux or Windows. Both UIs share a backend. The web UI is legacy for feature areas covered by native Studio: project listing and local open, source editing, build, preview, resource policy and uploads, publishing and Tencent Cloud COS publishing, artifacts, versions, on-demand modules, project settings, source-workspace Git SDK upgrade, and OTA self-update. The owner retained web-only visual novel editing, WeChat preview, Noble Bluetooth, and Codex. On non-macOS platforms, explicit `--pocket` exits with an error directing users to the web UI. [Studio architecture](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/studio/docs/ARCHITECTURE.md) · [Decision D4](DECISIONS.md)

Studio edits the original JS/TS project and uses the SDK's existing `buildGuest` to produce QuickJS bytecode for interactive web preview and Flutter device deployment. The default view shows preview, test packages, and collapsed Advanced settings. **Copy preview link** opens the preview directly in the Codex browser. Built-in chat was removed. Business pages remain in JS, with no Dart pages or extra layout engine. [Preview page](EDITOR_PREVIEW_PAGE.md)

## Open an Existing Local Project

**Open Project** opens the system folder picker on macOS and Windows x64. Select a project containing `pocket.json` or a Flutter project with a `js/` folder to open it in place. Canceling creates no project. The dialog also accepts an absolute path.

The picker selects a directory on the machine running Studio. Open `http://127.0.0.1:8791` on that machine. From another LAN machine, open the project on the Studio machine first, then access the registered project over LAN. The service cannot use a path from the remote browser machine. Other platforms and unavailable pickers retain manual path entry.

The retained parent outside `pocket_host/` had no reusable standalone Studio folder picker. This implementation retains `server.ts` loopback and Origin/CSRF protection and `openLocalProject` in-place registration and persistence. It adds only the OS picker boundary without uploading or copying consumer projects. Browser verification isolates the OS dialog, and native interaction is tracked separately. On macOS, actual native cancel returned null and created no project. Playwright Chromium passed five project/browser cases covering selection through the real API, cancel, manual fallback after picker failure, and cross-origin rejection. Native Windows dialog interaction remains unverified.

## Local Project Registration and Scaffolding

The top-bar **Open Project** accepts an absolute project folder and edits it in place. It remains in the project list after restart. **New Project** defaults to the workspace or accepts a new external folder. New projects include `npm start`, `npm run build`, `npm run build:web`, and service status/stop commands. The scaffold guide covers directory structure, Flutter versus JS/Preview, path rules, and real interaction acceptance. [Scaffolding and project open](PROJECT_SCAFFOLD_AND_OPEN_20261114.md)

## Start or Restart

```sh
cd /Volumes/ORICO/Development/Github/pocket
npm run setup   # Install dependencies on first use
npm start
```

Open **http://127.0.0.1:8791**. Both `npm start` and `npm restart` restart this repository's existing Studio and clean up stale Studio instances on 8790, 8792, and 8793 without removing workspaces or projects. Use `npm run status` for status and `npm stop` to stop. If another program owns port 8791, startup fails visibly, preserves the other program, and keeps the fixed port. `bun run editor` in `demo/js` calls the same npm entry.

The launcher uses Node.js and the existing npm libraries for platform process discovery and tree termination. Windows, macOS, and Linux share startup logic. Product development needs Node.js 22.22.2+ (24 LTS recommended) and npm. npm provides the SDK-pinned Bun runtime and a platform prebuilt tools package without requiring global Bun, Rust, Python, `patch`, or C/C++ tooling. The service launches a background child, writes logs to `sdk/.pocket-build/`, and installs no login item or system service. The workspace remains at `sdk/.pocket-build/editor-workspace-8791/`. Upgrade cleanup removes old macOS launchd jobs. New startup is independent of launchctl. [find-process](https://github.com/yibn2008/find-process) · [tree-kill](https://github.com/pkrumins/node-tree-kill)

On first use, `npm run setup` installs SDK workspace dependencies, npm Bun, and prebuilt platform `pocketjs_bytecode`/`pocket_probe`. It verifies SDK version, QuickJS ABI, and file hashes without running Cargo. Daily use starts with `npm start`. The launcher verifies service health before returning successful startup. Actual Preview requires successful setup. The Windows/Linux npm dispatch paths have been adapted. The historical platform packages and native Preview at this point were not accepted on those systems. [Commands, package layout, and source builds](NPM_TOOLCHAIN.md)

Studio provides a Simplified Chinese UI. Select a project or create one from the top left, then choose the App or Game template.

Consumers can start with:

```sh
cd sdk
npm run editor -- \
  --project-root=/absolute/path/to/js-project \
  --flutter-root=/absolute/path/to/flutter-project
```

The Flutter root is trusted startup configuration. The web client cannot submit arbitrary paths or commands. Omit `--flutter-root` for web preview only. Flutter simulator or device deployment requires the consumer's own Flutter SDK, signing, and device setup, separate from the npm Preview toolchain.

npm Studio supplies Bun, the Rust native probe, and the relevant tooling through platform packages. Web Preview requires no Flutter install. `flutter-root` is needed only for Flutter simulator or device deployment.

## Create an App or Game

Use the top-left selector to switch projects, or **New Project** to open the template dialog. App is for screens, forms, and product UI. Game provides a pure-JS 3×3 target grid, a 30-second timer, score, pause/resume, and restart. The submission sends `template` to `/api/projects` and saves it to generated `editor.json`. Default is `app`.

CLI and Studio share the template parser:

```sh
cd /Volumes/ORICO/Development/Github/pocket/sdk
npm run init -- /absolute/path/to/app --template=app --sdk-root "$PWD"
npm run init -- /absolute/path/to/game --template=game --sdk-root "$PWD"
```

Both templates create `app.tsx`, `manifest.json`, `pocket.json`, and `editor.json`. CLI also creates `vendor/pocket-ui/` and `flutter/`. Studio uses the public SDK UI package and existing Preview. [Templates, arguments, build commands, and game scope](PROJECT_TEMPLATES.md)

If the platform package is absent, run `npm run setup`. `npm run build:probe` verifies the installed prebuilt probe without compiling Rust. Use `POCKET_TOOLS_PACKAGE=/absolute/path/to/unpacked/package` to select a temporary test bundle. `npm run build:probe:source` is for SDK maintainers preparing source releases.

## Local Versions and LAN Publishing

The read-only version service reuses production `packageArtifacts`, Ed25519 signing, bundle/blob, and the client update coordinator. **Publish test package** selects a private IPv4 on this machine. LAN exposes signed releases only. Editor API, project source, and signing keys stay local. The index URL uses this layout:

```text
http://<LAN_IP>:<port>/pocket/<hostVersion>/<packageId>/test/latest.json
```

To select a NIC or fixed address, launch explicitly:

```sh
npm run editor -- \
  --project-root=/absolute/path/to/js-project \
  --flutter-root=/absolute/path/to/flutter-project \
  --update-host=192.168.1.20 \
  --update-host-version=3.2.0
```

`test` is a monotonically increasing test slot. Production Publish uses `stable`. Actual version and build reside in the signed payload. On first use, give the debug host the displayed `host.json` public-key configuration. Later use Build → Publish → App Check/Apply without rebuilding Flutter. Without a LAN address, Publish can fall back to loopback for simulators and desktops. Physical devices need the displayed reachable LAN address. HTTP is for the debug allowlist. Deploy production updates over HTTPS.

Use **Versions** in the toolbar or the **Version management** panel. Opening it starts or refreshes the read-only listener. It shows service origin, hostVersion, test/stable slots, root and mini app signed payload version and build, `latest.json`, and `host.json`. The list reads the actual publish directory and keeps no separate version database.

## Editing and Preview

1. Select a project and source file, edit, and save.
2. Build and inspect the actual compiler log and QJBC/PAK.
3. Use the real runtime frames in web preview to click, scroll, type, or change viewport.
4. Select a device and deploy to inspect Flutter behavior.

Click **Build** after creating a project to compile the selected template to real QJBC/PAK, then verify input-driven frame changes in Preview. The Game timer uses official `onFrame({ continuous })` and `simulationHz()`. Pausing stops the timer, and hitting the target updates score and target. Studio scaffolds no parent Demo 3D, physics, or DrawList demonstrations. Business state stays in JS.

Display name and machine name are separate. Settings **Display name** updates `pocket.title` and preserves the existing valid `pocket.name` slug. Saves preserve custom entry points, output names, and other app fields. `editor.json` holds Editor build identity, including version and build, according to SDK precedence.

Web preview runs SDK `pocket_probe` through `preview.ts` to load built QJBC/PAK and execute PocketJS layout, Guest events, and frame logic. `client/preview.js` projects actual FrameResult DrawOps and resources into Canvas2D. The runtime's demand schedule selects the next wakeup and SSE pushes frames. No continuous idle drawing probe runs. Idle probes are released after the final browser subscriber disconnects, and active sessions are capped.

Canvas fonts, rounded-corner rasterization, and resource decoding can differ from Flutter. Browser measurements leave Flutter device FPS and power open. System catalog mapping starts real SystemUI and separate native probes for installed and built child apps. The adapter clips and scales child DrawOps to host-surface rects, isolates resource namespaces, and transforms pointer coordinates. Real JS Guest verified Showcase Profile → Lobby → result return. Child probes receive `system.runtime.create` `memory.heapLimitBytes` and `maxPakBytes`, enforced by existing native QuickJS/PAK admission. Browser does not claim GPU, Dart, or OS memory quotas. Native hardware, video, and fields that depend on native textInput require device validation and return no fabricated success. Browser keyboard forwarding covers less than native IME. Unknown host capabilities return an explicit unsupported error. Rebuild after saving source so Preview reflects the edit.

## Simulator and Device Deployment

`devices.ts` runs `flutter devices --machine` for available iOS Simulator, Android Emulator, and connected iOS/Android devices. Start simulators in Xcode or Android tools first. Wireless devices need a Flutter-recognized connection.

Deploy runs the shared SDK bytecode build and then `flutter run --machine` for the bound consumer. Consumers with System children use the existing `build:system` pipeline. Device IDs must come from actual enumeration. Fixed argv prevents browser-supplied shell commands. Log and task history are bounded. Build/start locks serialize work, and cancel terminates only Studio's own children.

`running` means Flutter launched the preview. You can continue editing, then rebuild, stop the old deploy, and deploy again. The running bytecode has no TSX automatic hot reload. Physical devices require the project's signing, developer mode, wired or wireless trust, and system permissions. Deploy logs surface errors, while the user grants permissions in the OS.

## Open Preview in Codex

Select and build the project, then choose **Copy preview link** and provide the absolute URL to the Codex browser. The standalone route is `/api/projects/<project-id>/preview`. The local page requires no Codex login and sends no model requests.

Source and builds still use the current project's files and pinned `buildGuest`. Code edits happen in external Codex. The page no longer includes built-in chat, model selection, attachments, or region annotation state. Existing callers can still use the older transport API, which the web client no longer calls.

## Implementation and Provenance

| Source | Responsibility and Reuse |
| --- | --- |
| `editor/server.ts` | Composes new routes around existing Editor file, security, build, and signed publish boundaries. |
| `editor/preview.ts`, `client/preview.js` | Reuses native probe and FrameResult with local SSE and Canvas projection. Layout stays in the engine. |
| `editor/devices.ts` | Trusted consumer binding, fixed commands, device discovery, deployment jobs, and process lifecycle. |
| `editor/codex.ts` | Reuses pinned PocketJS `tools/companion/codex.ts` CLI/App Server transport, adding project, image, region, and task boundaries. |
| `editor/client/` | Web UI for editing, preview, device logs, floating dialogs, and Studio upgrade status. |
| `scripts/editor_service.mjs` | Shared npm launcher pinned to 8791, reusing process libraries, Editor, workspace, standalone replacement, and rollback. |
| `scripts/studio_upgrade.mjs` | Stable GitHub Release check, HTTPS verification, platform archive and SHA-256 verification, safe tar extraction, staging validation, and rollback state. |

## Built-in Studio Upgrade (v0.1.12+)

The upgrade reference covers the source audit, per-file backup and custom-file transactions, cross-process locking, rollback health confirmation, and crash recovery. [Studio upgrade](STUDIO_UPGRADE.md)

### Original v0.1.12 Architecture and Upgrade Boundaries

1. **Automatic checks and semantic version filtering.** On web startup, Studio calls `/api/studio/upgrade/check` for the latest stable `sdk-v<major>.<minor>.<patch>` on GitHub Releases. The check ignores drafts, prereleases, and nonstable tags and coalesces concurrent requests. The original implementation used the historical `CodeEagle/pocket` repository. The current repository is `PocketFlutter/Pocket`.
2. **Installation mode and source protection.**
   - **Managed standalone (`standalone`).** Identify `@pocket/web-sdk-tools` or `@pocket/web-sdk-tools-<platform>` in package.json with matching provenance.json and no `.git` source markers. When a newer release appears, download the current platform's `pocket-web-sdk-tools-<platform>-<arch>-<version>.tgz` and `.sha256` and apply it.
   - **Source checkout (`source`).** In a Git checkout with markers such as `.git`, `demo/`, or `editor/test`, the toolbar still checks and reports newer versions. At this release, automatic and manual source replacement were rejected with HTTP 409 from `POST /api/studio/upgrade/apply`.
3. **Download, extraction, and staged consistency.**
   - Accept trusted GitHub HTTPS releases only. Tests can opt in to synthetic loopback fixture origins. Response bytes and timeouts are bounded.
   - After an exact `.sha256` match, parse POSIX ustar/PAX in memory and reject parent traversal (`..`), absolute paths, drive-letter paths, backslashes, top-level prefixes other than `package/`, symlinks, hard links, and special devices.
   - Stage extracted SDK under `.pocket-build/sdk-upgrade-stage-<version>` and unpack bundled `prebuilt/pocket-tools-<platform>-<arch>-<version>.tgz`. Validate target version, compiler `upstreamRevision`, QuickJS `bytecodeAbi`, and all prebuilt binary hashes across staged `package.json`, `provenance.json`, `scripts/prebuilt_tools.mjs`, and platform `manifest.json`. A new SDK can upgrade the compiler or ABI.
4. **Backup before stopping, custom-file retention, process handoff, and automatic rollback.**
   - After staged validation, a separate Node process runs `node scripts/editor_service.mjs upgrade-apply` under cross-process lock `.pocket-build/sdk-upgrade-apply.lock.json`.
   - Finish per-file backup and write `backup-complete.json` before stopping this repository's Studio on 8791. Incomplete backups block both stop and destructive rollback.
   - Update or remove only listed SDK files and `node_modules/@pocket/tools-<platform>-<arch>`. Preserve all custom consumer files and configuration under managed folders such as `packages/my-custom-package/`, `.pocket-build/`, and the root.
   - Start the new Studio and poll `/health` for the new process `pid` and `version === targetVersion`. If apply or the new health check fails, restore the completed backup and restart the old Studio. Mark `rolledBack: true` only after the old `/health` passes. If the worker dies mid-upgrade, startup calls `recoverInterruptedSdkUpgrade`.
   - Browser `/health` probes have timeouts. The page reloads only after it confirms the new version is ready.

Source-first review covered the retained `pocketjs_flutter_demo` outside `pocket_host/`, including the Guest path in `native/` and `web_wasm_preview/index.html`. Studio retained the SDK's migrated project/build flow and extended the existing native probe. The historical web graphics demo had no general Guest runner, so it was excluded. Codex reused pinned upstream `tools/companion/codex.ts` without copying user credentials or adding another auth store. Ablation removed compatibility aliases for new modules, duplicate model lists, and idle frame polling. The existing signed publishing interface remains in collapsed Advanced. npm users consume platform packages. Rust/Python/patch scripts build the next platform package on the SDK publishing side.

## Validation

On macOS on 2026-11-06, `npm run setup → npm start → npm restart → npm stop → npm start` passed. Restart replaced the PID and retired the old process. Stop freed 8791, and stale Studio instances on 8790/8792/8793 were cleaned up. A separate HTTP test process occupying 8791 was preserved and startup refused to take it over. Requests to change port also failed without affecting the 8791 service. Studio remained running on 8791. Windows/Linux use process APIs from the same libraries. This historical pass had not completed native acceptance on either platform.

Twenty-three creation/configuration/build/export regressions passed. Real browser interaction verified the Chinese Studio UI. App/Game Chinese templates passed input and timing in real bytecode Preview. Diagnostics, user project names, and business source retain their original text.

The macOS npm platform pass installed local `pocket-tools-darwin-arm64-0.1.1.tgz` via `npm run setup` without Cargo. `npm run build:guest` produced real QJBC/PAK, and Preview verified theme changes, target scoring, and pause/resume. Release CI builds Windows/Linux packages. Device Preview and Bluetooth on those platforms remained open in that pass.

The test blocked `cargo`, `rustc`, `python`, `python3`, `patch`, `cc`, `gcc`, `clang`, and global `bun` via `/tmp/pocket-node-only-path`. Default npm setup, App/Game QJBC/PAK, and Native Preview all passed. The blocker log `/tmp/pocket-node-only-blocked.log` remained 0 bytes. App theme changes, Game hits, and pause/resume produced actual frames. The coordinator records final test totals after acceptance.

Source WASM replaced the earlier binary-input mismatch. In Playwright Chromium, the Canvas background switched from `[248,250,252,255]` to `[13,23,38,255]` and restored without browser errors. See `/tmp/pocket-node-only-web-test.log`. This pass covered macOS arm64 only. Windows/Linux CI and npm registry publication were pending. Default Inter lacks Chinese glyphs, so Guest Web screenshots can show boxes. Studio DOM Chinese renders normally. The source WASM linker fix was confined to a maintainer `/tmp` wrapper outside SDK.

This pass did not run Flutter on a phone. Flutter hardware or simulator packaging still needs the consumer Flutter SDK, platform SDK, signing, and device setup. The legacy full `build:wechat` and `build:engine:source` are maintainer source paths. Cargo runs only with explicit `POCKET_SOURCE_BUILD=1`, outside npm-only support.

The clean export was `sdk/.pocket-build/pocket-web-sdk-tools-0.1.1.tgz`, with setup log `/tmp/pocket-node-only-final-setup.log`. The prebuilt Noble N-API file was `/tmp/pocket-node-only-sdk-final/node_modules/@pocket/tools-darwin-arm64/noble/prebuilds/darwin-arm64/node.napi.node`, with `sourceBuildPresent:false`. `npm install --ignore-scripts` did not compile a native module, and Node set scoped Noble environment variables. A real scan after `poweredOn` found nearby BLE devices. See `/tmp/pocket-node-only-final-ble.log`. DK-META2 was not detected, so reconnect acceptance remains pending. Linux Noble is explicitly `unsupported`. No Linux HCI prebuild was created, published, or accepted. No loader or user Rust/toolchain requirement was added. 0.1.0 logs are historical evidence.

```sh
cd sdk
bun run test:editor
python3 scripts/check_architecture.py
```

Editor regressions cover existing file/security/build/publish, Codex transport, image/region limits, real native Guest input changing frames, and fixed deployment commands, concurrency, and cancel. Live model, browser, and simulator acceptance are distinct from unit tests. Tests never fabricate model or device availability.

- `bun run test:editor` recorded 28 pass / 0 fail. Architecture and client syntax checks passed.
- Local CLI returned ChatGPT login status and eight dynamic models. A real request completed without reading or copying credential files.
- Playwright Chromium used the web UI to save and restore source, build, and click Showcase's count from `00 → 01`.
- After region selection, the real model received the screenshot and region `(25,52,325,160)`, recognizing `Made to feel native.`. Later messages kept the same thread.
- The Editor web button built real System root/child apps and ran `flutter run --machine`. iPhone 18 Pro Simulator installed and showed home. State reached `running`, and reload restored the job and Stop button.
- Moving between `390×844` phone and `768×1023` tablet verified runtime dimensions. Presets fit the 10-bit pointer coordinate range through 1023.
- Canvas verified image loading, rounded masks, ARGB tint, and resource delta replay. The actual Hero rounded-corner interior at `(28,80)` was `[49,93,235,255]`. New subscribers replay existing textures while ordinary frames send deltas only.
- Two independent Chromium clients both passed rounded-corner and icon pixel checks. The second received eight cached resources even though native sends only resource deltas.
- Physical Android was enumerated. Installation and deployment to that device were outside this pass.

Temporary evidence includes `/tmp/pocket-studio-acceptance-verified.log`, `/tmp/pocket-studio-deploy-ui-final.log`, `/tmp/pocket-studio-preview-fixed.png`, and `/tmp/pocket-studio-device-final.png`. These stay outside SDK releases.

[Test package integration, version rules, and simulator Check/Apply acceptance](EDITOR_TEST_PACKAGES.md)
