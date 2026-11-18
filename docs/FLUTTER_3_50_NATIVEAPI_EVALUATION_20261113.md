# Flutter 3.50 and nativeapi integration evaluation

Recorded on 2026-11-13 on historical branch `research/flutter-3.50-nativeapi`.
The baseline was `2fb3ece74bf8c0bc0e2d3a5bd447257e2c500d44` and the source in the
working tree at that point.

## Decision at the time of evaluation

Flutter 3.50 warranted an isolated version comparison. Nativeapi warranted research
as an optional desktop-first system service backend. This round created the research
branch, checked official material and released source, and recorded follow-up work.
It made no changes to `.fvmrc`, dependencies, build configuration, or runtime.

At the time, `.fvmrc` pinned Flutter 3.47.9. `sdk/pubspec.yaml` required Flutter 3.35
and Dart 3.9.2 or newer. Raising the minimum for all SDK consumers requires separate
evaluation of the optional nativeapi provider. Existing uncommitted Editor edits and
root review files were preserved outside the research changes.

## Provenance and reuse boundaries

Source-first review covered the retained parent, excluding `pocket_host/`.

- `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/core/real_hardware_bridge.dart`
  establishes actual permission, hardware, and native callback boundaries. It
  contains historical simulated-success behavior and no reusable desktop tray,
  global shortcut, or file dialog provider.
- `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/core/ffi_bridge.dart`
  and `lib/render/pocket_ui_components.dart` establish the retained FFI and rendering
  routes. The existing layout, engine, and rendering path stay in use.

Current reusable entry points are:

- `sdk/packages/pocket_flutter/lib/src/pocket_runtime.dart` for PocketJS through the existing pinned C FFI ABI.
- `sdk/packages/pocket_flutter/lib/src/pocket_view.dart` for CustomPainter and Texture surfaces, input queues, Ticker, resource decoding, and IME.
- `sdk/packages/pocket_services/lib/src/pocket_plugin.dart` for capability schemas, registration, grants, budgets, and disposal.
- `sdk/packages/pocket_ui/src/platform.ts` and `platform-experience.ts` for JS requests and business orchestration through the existing RPC.
- `sdk/packages/pocket_platform/lib/src/platform_plugin.dart` for deep links, system UI, and haptics. Keep capabilities already served by official Flutter APIs.
- `sdk/packages/pocket_hardware_core/lib/src/hardware_plugin.dart` and the hardware packages for camera, Bluetooth, location, sensor, and related specialized boundaries.
- `sdk/docs/IOS_SWIFT_PACKAGE_MANAGER.md` for the validated SwiftPM migration of seven reusable iOS plugins.
- `sdk/docs/UPSTREAM_CAPABILITY_AUDIT_2026-11-07.md` for known gaps in system services, input, and clipboard. At the time, the JS and Dart SDK search found no general clipboard provider. Implementation requires checking official protocols per target.

## Flutter 3.50 relevance to Pocket

Flutter released 3.50 with Dart 3.14 on 2026-11-11. These are expected effects.
Performance requires project-specific measurements.

| Update | Relevance | Validation and limits |
| --- | --- | --- |
| Earlier iOS touch and frame scheduling | High. Pocket consumes Flutter PointerEvent. | Flutter reports one frame less input latency. Pocket still passes through duplex or host queues, Ticker, and JS. Measure active animation and idle wake-up end to end. |
| Impeller rendering optimizations and texture or GPU fixes | High. Canvas and Texture use the Flutter backend. | Test each actual platform and backend. Desktop SDF measurements cover that case only. Measure JS layout and decoding separately. |
| Stable Objective-C FFIgen and Java/Kotlin JNIgen | Medium. Candidates for new capabilities or measured hotspots. | PocketJS already uses C FFI. MethodChannel changes and JS-to-host transport need separate implementation. |
| Material and Cupertino move to separate packages and old entry points are deprecated | Maintenance impact. | PocketView, the SystemHost, monitors, and related code still import material.dart. Reduce unnecessary dependencies and evaluate the independent packages where components are needed. Deprecated imports remain available at this stage. |
| Android Release Intent checking tightened | Compatibility impact. | Validate deep links, entry points, diagnostics, and prebuilt binary launch scripts. Release Intents cannot be used to inject engine arguments. |
| HCPP | Low expected benefit for the main Canvas. | PocketView creates neither AndroidView nor UiKitView. Platform View results measure a different path. |
| Flutter GPU 2D texture arrays | Requires separate adaptation. | Canvas and Texture do not gain custom batching automatically. Keep one renderer. |
| Flutter Web Wasm and browser text layout | Separate from native FFI. | Verify the standalone Web SDK and Editor Preview separately. Flutter Web benchmarks measure their own stack. |

The Android baseline was AGP 8.11.1, Kotlin 2.2.20, and Gradle 8.14. The app's Java
and Kotlin compiler target was 11. Runtime JDK verification was outside this round.
Keep the Flutter version experiment separate from AGP 9 and built-in Kotlin migration.
Generated-project defaults need compatibility checks before applying them to an existing project.

## nativeapi 0.6.0 release sources

The pub.dev JSON API supplied the three 0.6.0 archives. Each was downloaded and
checked against its SHA-256. The ignored cache is
`.cache/flutter-350-nativeapi-research/`. Third-party sources and binaries stay
outside the project source commit.

| Package | Requirements and purpose | Release archive SHA-256 |
| --- | --- | --- |
| nativeapi 0.6.0 | Dart `^3.14.0`. Dart-facing system APIs. | `c71a5e10aacd177fe1c3eef279179beeba6fd08132f0d36e0a7e081e13906749` |
| cnativeapi 0.6.0 | Dart `^3.14.0`. C ABI, FFI, and native build hook. | `bcf1d65504a397cd1b1eeaea582baf08250f38d46074739fddb3c5437f1b9e06` |
| nativeapi_flutter 0.6.0 | Flutter `>=3.50.0` and Dart `^3.14.0`. Widgets, type conversion, and optional window bridge. | `3709b58224473298349375c8a0404d19dc0b5f151397cae2f127fe49a3a1a491` |

The release API is `https://pub.dev/api/packages/{nativeapi,cnativeapi,nativeapi_flutter}`.
All three packages were published on 2026-11-12 UTC. The release archive versions and
hashes identify the evidence.

| Path relative to the corresponding 0.6.0 archive | Finding | Effect on Pocket |
| --- | --- | --- |
| nativeapi: `lib/src/clipboard.dart` | Exposes text, HTML, image, and filePaths. | Rich clipboard is worth investigating. Support for each type needs platform tests. |
| cnativeapi: `cxx_impl/src/platform/android/android_runtime.h` and `.cpp` | `Initialize(ANativeActivity*)` requires a UI thread and Looper and takes over or forwards focus and destroy callbacks. | Standard FlutterActivity does not supply this automatically. Mobile support requires explicit integration. |
| cnativeapi: `cxx_impl/src/platform/android/clipboard_android.cpp` | Implements actual JNI clipboard access and focus and monitoring behavior. | Flutter Android use depends on initialization and OS authorization. |
| cnativeapi: `cxx_impl/src/platform/{android/file_dialog_android.cpp,ios/file_dialog_ios.mm}` | `IsSupported()` returns false and Open fails. | Android and iOS file pickers need another provider. |
| cnativeapi: `cxx_impl/src/platform/{macos/file_dialog_macos.mm,linux/file_dialog_linux.cpp,windows/file_dialog_windows.cpp}` | macOS IsSupported returns false. Linux and Windows return true and have implementations. | Limit file dialog evaluation to Linux and Windows. |
| cnativeapi: `cxx_impl/src/platform/{android/notification_manager_android.cpp,ios/notification_manager_ios.mm}` | IsSupported, Initialize, and Show return false. | Mobile notifications remain a gap. |
| cnativeapi: `cxx_impl/src/platform/{android/secure_storage_android.cpp,ios/secure_storage_ios.mm}` | Stubs return false on write, defaults on read, and false for IsAvailable. | Mobile secure storage remains a gap and default reads are not success. |
| cnativeapi: `cxx_impl/src/platform/{macos/secure_storage_macos.mm,macos/notification_manager_macos.mm}` | macOS secure storage is a stub and notification IsSupported returns false. | macOS secure storage and notifications remain gaps. |
| cnativeapi: `cxx_impl/src/platform/{android/shortcut_manager_android.cpp,ios/shortcut_manager_ios.mm}` | IsSupported and RegisterShortcut return false. | Global shortcuts are desktop candidates only. |
| nativeapi_flutter: `lib/windowing.dart` and `lib/src/windowing/flutter_window.dart` | Bridges internal Flutter `_window*.dart` and native window handles. | Keep multi-window experiments optional. The upstream “checked with 3.50.0” describes a tested version only. |
| nativeapi: `lib/nativeapi.dart` and `lib/src/web/*` | Web conditional exports avoid dart:ffi. Platform operations provide no real services on Web. | Browser compilation establishes compatibility at build time only. |
| cnativeapi: `hook/build.dart` | Builds vendored C++17 and an event-loop shim. Android uses a static C++ runtime, Linux needs GTK3/X11/Xi, and Windows excludes the WinUI3 backend. | Adds build, size, signing, and platform dependency costs. Test clean and incremental builds in addition to the Dart API. |

The package was marked WIP. The 0.6.0 changelog records callback, close and exit, hot
restart, and Release AOT fixes. The separate `standalone.dart` runner lacks Dart 3.14
support. Ordinary nativeapi imports do not load it.

The 0.6.0 Dart build hook lists Android, iOS, Linux, macOS, and Windows only.
Upstream HarmonyOS change notes are source history. A native HarmonyOS port and an
Android APK running through Zhuoyitong need separate validation and remain outside support.

## Candidate capabilities

| Priority | Candidate | Approach |
| --- | --- | --- |
| P1 | Desktop rich clipboard and change events | First optional-provider experiment. Compare plain text against Flutter Clipboard, then add the dependency for proven gains such as rich formats or monitoring. |
| P1 | Desktop window properties and display queries or events | Investigate size, always on top, display information, and window state. Keep existing Flutter display information where sufficient and one source for native coordinate conversion. |
| P2 | Desktop tray, native menu, global shortcuts, Linux and Windows file dialogs | Integrate per product requirement. The release source lacks macOS file dialog support. JS defines menu data and business actions. The host registers OS resources and forwards events. |
| P2 | Window occlusion and idle power | Forward native occlusion to existing lifecycle and scheduling. Treat unknown as its own state. |
| Deferred | Multiple windows and a separate native widget tree | Internal experimental APIs and extra views and layout increase maintenance. Keep existing JS UI and Pocket engine. |
| Retained | Camera, Bluetooth, location, sensors, audio and video, JS Worker, package storage and OTA | Current implementations cover boundaries the release source did not demonstrate replacing. |

Use the existing JS SDK, capability RPC and admission, a minimal Dart provider,
nativeapi, and the OS. Keep the dependency in optional packages that use it.
Consider nativeapi_flutter only if Flutter type conversion is needed. Start with
nativeapi for system services to avoid coupling to the multi-window bridge.

Register by platform and actual initialization result. Return unsupported, denied,
or error as observed. Dispose host objects, callbacks, listeners, and handles with
the session. Host paths remain subject to guest isolation. Forward menu clicks,
shortcuts, and close requests to JS for the business decision.

Integrate individual capabilities through the existing registry, message bus, cache,
and window policy. If a native path is replaced, remove the superseded implementation
after validation so one path owns listeners and state.

## Staged verification and ablation

1. **A, existing Flutter 3.47.9.** Pin PocketJS revision and ABI, guest bytecode, resources,
   device, and Profile or Release mode. Save the baseline.
2. **B, Flutter 3.50 alone.** Leave nativeapi and AGP 9 outside this run. Verify tap and drag
   to visible change, idle wake, Chinese IME, video and Live2D, and background recovery.
   Compare end-to-end latency, build/raster/native/decode P95, and idle power.
   Measure input-to-photon separately from FrameTiming.
3. **C, add one nativeapi provider to B.** Start with rich clipboard and monitoring on
   macOS. Verify declared HTML and image formats, cross-app use in both directions,
   cancellation and denial, focus, actual JS event-driven frames, and cleanup on exit.
   Compare plain text with Flutter Clipboard before adding a dependency for that case.
4. **Ablation.** Disable the new provider or restore the old backend and confirm the
   added behavior or measured gain disappears. Measure install size, clean build,
   and hot restart. Interaction acceptance needs actual use beyond API return values or static checks.
5. **Platform expansion.** Verify Windows, macOS, and Linux individually, with separate
   Linux X11 and Wayland coverage. Establish initialization and the support matrix
   before Android and iOS claims. Keep unverified capabilities unavailable.
   Decide whether to update `.fvmrc` and public constraints after these results.

Reuse `sdk/packages/pocket_flutter/test/pocket_view_input_test.dart`,
`pocket_view_pointer_wake_test.dart`, `pocket_view_pointer_order_ffi_test.dart`,
`pocket_duplex_pointer_ffi_test.dart`, `pocket_frame_binary_ffi_test.dart`,
`demo/integration_test/input_regression_test.dart`, and `video_playback_test.dart`.
They are planned entry points. This review did not run them under Flutter 3.50.

## Recorded validation and review

- Checked official release material, package constraints, all three release archive
  hashes, and key platform sources. Flutter 3.50 builds, real platform capability
  exercises, and performance experiments remained future work.
- Argon Low delegation returned `RESOURCE_EXHAUSTED` from the personal quota.
  The lead agent performed the source review and wrote these notes without substituting
  a model.
- After documentation and path and version checks, the requested consolidated Argon
  Medium review also returned `RESOURCE_EXHAUSTED`. No independent model review result
  was obtained. This is a research record.
- The lead agent's follow-up found macOS file dialog, notification, and secure
  storage stubs and corrected the table to describe actual desktop limits.

## Official material

- [Flutter 3.50 announcement](https://flutter.dev/blog/whats-new-in-flutter-3-50)
- [Flutter 3.50 release notes](https://docs.flutter.dev/release/release-notes/release-notes-3.50.0)
- [Flutter native interoperability](https://docs.flutter.dev/interop)
- [Material and Cupertino migration](https://docs.flutter.dev/release/breaking-changes/material-ui-and-cupertino-ui)
- [Android built-in Kotlin migration requirements](https://docs.flutter.dev/release/breaking-changes/migrate-to-built-in-kotlin/for-app-developers)
- [nativeapi package](https://pub.dev/packages/nativeapi/versions/0.6.0) and [changelog](https://pub.dev/packages/nativeapi/changelog)
- [cnativeapi package](https://pub.dev/packages/cnativeapi/versions/0.6.0) and [nativeapi_flutter package](https://pub.dev/packages/nativeapi_flutter/versions/0.6.0)
- [nativeapi repository](https://github.com/libnativeapi/nativeapi) and [nativeapi-core repository](https://github.com/libnativeapi/nativeapi-core)
