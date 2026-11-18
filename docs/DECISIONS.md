# Integration Assessment and Architecture Decisions

## Goal

Flutter adapts rendering and system services for PocketJS. JS/TSX defines app pages, component composition, interaction state, navigation, and business workflows. The PocketJS native engine performs layout and hit testing.

```text
JS/TSX (pages, components, state, routing)
  → pinned official compiler → precompiled QuickJS bytecode + PAK
  → QuickJS guest / PocketJS core (layout, input, DrawOps)
  → FFI frame + resources
  → Flutter Canvas / Texture (rendering, input, IME, lifecycle)

Text input uses an explicit bridge: JS InputField emits textInput.open/update/close.
PocketView mounts Flutter TextField/EditableText as the TextInputClient.
The system IME provides edit values, and edit events return to the JS draft reducer.
JS owns text, routing, and business state. The upstream GuestFrame.text hardware
keyboard lane requires separate integration.
```

The “38 components” are PocketJS contracts. Flutter consumes engine drawing and media commands. Export, compilation, real input interaction, and correct physical-device rendering each require their own evidence.

## Sources and Scope

| Source | Adopted | Excluded |
| --- | --- | --- |
| pocketjs_flutter_demo | Component and interaction requirements and host product direction | Dart business-page generator, simulated C runtime, placeholder SHA/AOT/OTA, and simulated WeChat runtime |
| PocketJSKit | Pinned compiler, Rust RquickjsGuest, FFI, Canvas painter, resource and input bridges, and Editor local project/build/publish protocol as scaffolding reference | Story GameConfig, reader and business templates, old Editor page graph and WASM preview, COS, and app state or routing outside JS |

Kit provided a closer runtime foundation but combined game templates, Editor, and release tooling. The old demo remains a reference, and this repository runs independently of its paths.

## Ownership Boundaries

- Flutter owns windows and viewports, painting, decoding, textures, input and IME, lifecycle, and explicit native capability authorization and transport. The current text-input demonstration uses the Flutter `TextField`/`EditableText` system IME bridge. Downloaded JS cannot grant itself permissions.
- Native owns QuickJS execution, PocketJS core/layout/input, resource tables, budgets, and FFI. A single owning thread executes calls in sequence.
- JS owns page structure, composition, state, actions, and in-app navigation. Swapping JS/PAK can change UI and behavior without Dart edits.
- `pocket_services` owns signed releases, rollback, capabilities, and plugin lifecycle outside the renderer. `editor/` scaffolds local development and signed packages. Game config protocols, old Editor page graph and WASM preview, cross-sandbox bus, 3D, and the legacy WeChat host were outside this integration.
- Host builds register external Flutter plugins. Update packages contain JS bytecode and assets. Business pages compose `guest/ui` in JS.
- The QuickJS compiler matches the runtime. Its output is QuickJS bytecode. Machine-code AOT and compressed or wrapped JS are different formats.
- Memory budgets, process isolation, and physical iOS/Android acceptance are separate claims. Desktop verification covers its own execution environment.

## Additional Decisions

### Editor Builds and Publishes Real QJBC

`editor/server.ts` and `editor/client/` provide project listing and creation, configuration, an `app.tsx` compatibility entry, GET/PUT for safe Guest source paths, and build, log, artifact, and publish UI. The Editor copies the repository `guest/` scaffold and invokes the pinned compiler, `native/target/*/pocketjs_bytecode`, and `scripts/package_update.ts`. It publishes `app.qjbc`, PAK blobs, `latest.json`, and `host.json`. The multifile API rejects traversal, symlinks, build directories, keys, and writes to QJBC/PAK. `app.js` serves diagnostics only. Runtime requires bytecode. HostSession consumes manifests, blobs, and host.json directly. `.tar.gz` serves offline export.

The local Editor workflow centers on QJBC, PAK, and signing ABI. The old Kit page graph, WASM preview, reader/story templates, and COS integration were outside that scope.

### Surface QUAD Allowlisted Provider Kinds

JS uses `pocket.registerSurface` with `glass` or `platformTexture`. Native retains handle, geometry, clip, and order and emits `SURFACE_QUAD`. Dart `PocketHostSurfaceOp` selects the renderer. `platformTexture` requires prior host authorization via `PocketViewController.authorizePlatformTexture`. Video is one use of this provider. Arbitrary compositors, native views, and JS-supplied texture handles are outside the contract.

`pocket_surface.dart` uses Impeller refraction when shader filters work and `liquid_glass.frag` loads. Non-Impeller, unsupported capability, and shader failure use the explicit frosted backdrop/tint fallback. JS `buildLiquidGlassRecipe` defines shape and parameters.

### JS Mobile UI and Compiled Host Capabilities

`guest/ui/mobile.tsx`, `guest/mobile-pages.tsx`, and `guest/legacy.ts` own mobile composition, four transition descriptors, glass recipes, and page state. Flutter handles native frame and surface painting and system input. `HardwarePlugin` is the compiled `flutter.hardware` provider. Downloaded JS requests it through the capability and permission bridge. Native code comes from the host build.

Source and renderer surface tests cover protocol, state, and lifecycle. Physical iOS MethodChannel, permission, and Texture validation through `hardware_native_test.dart` was still underway at this decision point.

## Ablation Acceptance

1. Build without the original Dart bundle runner, simulated C runtime, and business templates. Real JS still produces frames.
2. JS state changes and actual engine input change output frames. Dart has no corresponding business actions.
3. Different JS content changes output. Runtime initialization failure reports failure instead of displaying a Dart demo.
4. Retain required resource, IME, and media adaptation. Editing protocol and real system keyboard lifecycle regressions passed on iPhone Duo simulator. iOS and Android hardware provider unit tests and production channels were in place, with physical hardware verification still pending. Upstream `GuestFrame.text`, actual devices, and all hardware keyboards require separate acceptance. [Validation commands and results](VALIDATION.md)

Only executed and passing checks count as acceptance.

## Maintainer Decisions, 2026-11-15

### D1: Web Studio Was the Default Editor Entry

At this decision point, `bun pocket.ts editor <directory>` opened Web Studio on every platform. On macOS, `POCKET_EDITOR_UI=pocket` or `--pocket` selected Pocket Studio. `--web` always forced Web Studio, and service-only arguments implied Web Studio. The Pocket Studio host starts its service with `--web`. On host launch failure, the launcher prints guidance for `--web` and exits without fallback. This default was retained while macOS Pocket Studio was unverified.

### D2: `studio.publish.publish` Returns Manifest Identity

`studio.publish.publish` returns manifest identity (keyId, signature, payloadBase64Bytes) and URLs. Fetch signed bytes from `manifestUrl`. The Studio Guest uses only keyId, payloadSha256, and URLs. A full envelope can exceed the capability's 256 KiB return limit and report a completed publish as failed. `manifestUrl` already serves the signed bytes, avoiding a new chunked manifest capability.

### D3: macOS Acceptance Was Optional for M1–M7

Pocket Studio was Linux verified and macOS experimental and unverified at this point. The release checklist serves as a gate when changing the default `bun pocket.ts editor` entry or distributing signed/notarized applications. On Linux, text configuration checks in `sdk/scripts/tests/pocket_studio_macos_config.test.ts` cover some items. Build signing, IME, menu shortcuts, composition, performance, and self-updates require macOS. [Release checklist](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/studio/docs/RELEASE_CHECKLIST.md)

## Maintainer Decision, 2026-11-17

### D4: Repository Checkouts on macOS Default to Pocket Studio

Apple Silicon macOS completed native static library build (`bash sdk/scripts/build_native.sh macos` → `libpocket_flutter.a`), Studio Debug build (`flutter build macos --debug` in `studio/` → `pocket_studio_app.app`), and an Impeller MetalSDF smoke launch. The smoke started the real Editor service through `PocketStudioService` with `POCKET_STUDIO_BUN` and verified `/health`. Automated tests passed for `studio/test` 10/10, `studio/js` `test_guest.sh` 129 unit and 70 probe checks, `pocket_studio` 94/94 with `POCKET_REQUIRE_REAL=1`, `pocket_clipboard` 13/13, and `pocket_file_picker` 9/9.

This superseded D1 for macOS repository workspaces containing `studio/`. `bun sdk/pocket.ts editor [<directory>]` defaults there to Pocket Studio, with `sdk/scripts/pocket_studio_launcher.ts` discovering `<repoRoot>/.fvm/flutter_sdk/bin/flutter`. `--web`, `POCKET_EDITOR_UI=web`, service-only arguments, standalone Web SDK exports without `studio/`, and non-macOS hosts still use Web Studio. Interactive macOS GUI and IME candidates, COS upload with real credentials, and Apple Developer ID signing and notarization remain manual or distribution checks. [Release checklist](https://github.com/PocketFlutter/Pocket/blob/9ac11fd84d99c0038118232f7d396fb0000b8cc1/studio/docs/RELEASE_CHECKLIST.md)
