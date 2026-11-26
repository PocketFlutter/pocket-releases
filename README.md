# Pocket Web SDK

Standalone PocketJS Web SDK and Editor. Flutter, Dart, CocoaPods, Xcode and the Android SDK are not required for the Web toolchain.

The Web target uses the pinned PocketJS compiler, admitted QuickJS bytecode (QJBC), PAK resources and the real PocketJS runtime compiled to WebAssembly. The browser boundary is standard `WebAssembly.instantiate` + Canvas2D with Pointer, IME, resize and visibility lifecycle support. There is no mock runtime or source-evaluation fallback.

## SDK manual

Use the [Pocket SDK manual](docs/manual/Home.md) or the [GitHub Wiki](https://github.com/PocketFlutter/pocket-releases/wiki) to install, build, and verify Pocket apps. The [agent guide](docs/manual/Agent-Guide.md) maps tasks to SDK entry points and the [optimization guide](docs/manual/Performance-Loop.md) provides a repeatable app and game performance workflow.

## API Reference

Start with the [Pocket API overview](docs/API.md), then use its navigation for [JavaScript / TypeScript](docs/JS_API.md), [Tooling](docs/TOOLING_API.md), [Flutter API](docs/FLUTTER_API.md), [Hybrid Host API](docs/HYBRID_HOST_API.md), and [Hybrid Flutter Tab Host](docs/HYBRID_FLUTTER_TAB_HOST.md). The Flutter references describe integrating the source Pocket SDK into a Flutter app; this standalone Web package does not contain the Flutter/Dart runtime or native Flutter plugins. Source-only references link to the exact exported source commit.

## AI development: required reading

Read the following guides in order before editing code. Reuse the existing runtime, layout system, and control behavior.

| Order | Document | What to learn |
| --- | --- | --- |
| 1 | [AI_APP_DEVELOPMENT.md](docs/AI_APP_DEVELOPMENT.md) | Development workflow, JS/host boundaries, controls, Editor, resource packaging, publishing, and live updates. |
| 2 | [COMPONENTS.md](docs/COMPONENTS.md) | Component contracts; custom skins must inherit interaction, focus, keyboard/gamepad, IME, accessibility, and lifecycle behavior. |
| 3 | [EDITOR_STUDIO.md](docs/EDITOR_STUDIO.md) | Editor startup, real Preview, version backend, LAN publishing, and preview entry points. |
| 4 | [EDITOR_TEST_PACKAGES.md](docs/EDITOR_TEST_PACKAGES.md) | Test/stable packages, signed artifacts, version management, and LAN live-update tests. |
| 5 | [PACKAGE_UPDATE_MODES.md](docs/PACKAGE_UPDATE_MODES.md) | Initial full packages and subsequent fine-grained updates by resource/content hash. |
| 6 | [HARDWARE_MODULES.md](docs/HARDWARE_MODULES.md) | Enable hardware and permissions as needed; register real application adapters for capabilities missing in browsers. |
| 7 | [WEB_SDK_EXPORT.md](docs/WEB_SDK_EXPORT.md) | Web SDK provenance, retained implementation, required adaptations, ablation, and runtime evidence. |
| 7a | [GAME_INPUT_IMPLEMENTATION.md](docs/GAME_INPUT_IMPLEMENTATION.md) | Opt-in keyboard, buttons, dual-stick controls, and merged input sources. |
| 7b | [WEB_WORKER_IMPLEMENTATION.md](docs/WEB_WORKER_IMPLEMENTATION.md) | Independent Worker QJBC, HTTP, channels, backpressure, and lifecycle. |
| 7c | [LARGE_IMAGE_IMPLEMENTATION.md](docs/LARGE_IMAGE_IMPLEMENTATION.md) | Large-image preprocessing, packaging, and runtime verification boundaries. |
| 7d | [WEB_RENDER_WORKER.md](docs/WEB_RENDER_WORKER.md) | Explicit render Worker opt-in, OffscreenCanvas, main-thread boundaries, and A/B verification. |
| 7e | [WEB_LIVE2D.md](docs/WEB_LIVE2D.md) | Web Live2D Moc allowlist, Cubism Core inputs, and export boundaries. |
| 8 | [NPM_TOOLCHAIN.md](docs/NPM_TOOLCHAIN.md) | npm installation, cross-platform toolchain entry points, buildGuest/QJBC/PAK builds, and verification boundaries. |
| 9 | [PROVENANCE.md](docs/PROVENANCE.md) | Pinned upstream version, provenance, and verification boundaries. |
| 10 | [WECHAT_HOST_IMPLEMENTATION.md](docs/WECHAT_HOST_IMPLEMENTATION.md) | Read for WeChat targets: WXWebAssembly, Canvas2D, and platform limits. |

Business UI, state, routing, and composition belong in JS. Declare hardware capabilities as needed; return unsupported/unconfigured for missing capabilities. New interfaces inherit existing controls. Web and Editor use the pinned buildGuest/QJBC/PAK pipeline without a mock runtime or source-evaluation fallback.

## Install and build

[One-command installation](docs/INSTALL_STUDIO.md) downloads and verifies the official standalone release. Find the Web SDK archives and Native Studio installers on the [Pocket releases page](https://github.com/PocketFlutter/pocket-releases/releases). For signed `studio-v*` updates, see [Native Pocket Studio releases](docs/NATIVE_STUDIO_RELEASE.md).

Only Node.js 22.22.2+ (Node.js 24 LTS recommended) and npm are required. Bun is installed and managed by npm; compiler/probe binaries and the prepared pinned compiler are supplied by the platform package. Run:

```sh
npm run setup
```

`npm run setup` installs npm dependencies and verifies the prebuilt tools (platform, SDK revision, QuickJS ABI and SHA-256). It does not invoke Rust/Cargo, Python or C/C++ tools, and will fail clearly if the platform package is unavailable. Source builds are maintainer-only commands ending in :source. No Flutter command is run by setup or by the Web build.

A project root contains `pocket.json`, `manifest.json` and its JS/TS entry. Build the complete guest artifacts directly with npm:

```sh
npm run build:guest -- --project-root=/path/to/app --outdir=/path/to/app/dist
npm run build:web -- --project-root=/path/to/app --outdir=/path/to/web
```

The guest build invokes the pinned `buildGuest` implementation, emits `app.qjbc`, `app.bytecode.json` and `app.pak`, and includes the vendored `@pocket/ui` workspace package. It does not require Flutter. The Web build additionally emits `pocket-web.js`, `engine/pocketjs.wasm`, `pocket.config.json`, build metadata, types and usage instructions.

The bundle includes macOS arm64 and Windows x64 platform archives. Windows CI has verified clean npm setup/doctor, Noble WinRT addon loading, real App/Game QJBC/PAK builds and input-driven Preview frames, plus Studio start/health/status/stop on fixed port 8791. Windows physical BLE device connections/notifications and Linux native BLE remain unverified or unsupported as documented. The npm packages have not been published to a registry yet. See docs/NPM_TOOLCHAIN.md and docs/WINDOWS_BUILD.md for evidence and limits.

## Editor

```sh
npm run editor
# open http://127.0.0.1:8791
```

The Editor includes project management, real Guest preview, input/IME inspection, version management, signed packages and LAN test publishing. Device deployment remains an optional host integration and is not required for Web development.

## UI ownership

Business UI, state, routing and component composition belong in JS. Reuse the existing controls and inherit their focus, press/cancel, disabled, keyboard/gamepad, scrolling, IME, safe-area, accessibility, route and lifecycle behavior before changing skins or adding evidenced behavior. See [AI_APP_DEVELOPMENT.md](docs/AI_APP_DEVELOPMENT.md) and [COMPONENTS.md](docs/COMPONENTS.md).

## Updates

The canonical update route is `<root>/<optional-prefix>/pocket/<hostVersion>/<packageId>/<packageVersion>/latest.json`. Initial install may fetch the complete PAK; subsequent releases can fetch only changed content-addressed resource parts. The Editor version backend can publish and test this layout on a LAN.

## Maintainer CI

[Pocket source CI and Web SDK releases](docs/POCKET_SOURCE_CI.md) covers source verification, benchmarks, platform acceptance, and GitHub Actions setup.

## Licensing

Pocket and its first-party wrappers are licensed under the [MIT License](LICENSE). See [LICENSING.md](LICENSING.md) for component scope. No separate commercial authorization is required under the MIT terms.

The upstream PocketJS and MicroTS notice is preserved in [LICENSES/PocketJS-MIT.txt](LICENSES/PocketJS-MIT.txt). Third-party code and assets, including Cubism sources and Core, retain their independent terms and notices.
