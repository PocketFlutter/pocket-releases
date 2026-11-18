# Launch Showcase from VS Code

Open the repository root in VS Code and choose `Pocket Demo (iPhone Duo)` under **Run and Debug**. Start the Duo simulator first. Device selection uses the name, so it works independently of the local simulator UUID. Each launch configuration explicitly uses the `demo/` working directory and `demo/lib/main.dart` entry point.

For first use, follow the README to install the Bun and Flutter dependencies and Rust targets, then run `flutter pub get` in `demo/`.

| Configuration | Device | Mode | Preparation |
| --- | --- | --- | --- |
| iPhone Duo | Running iPhone Duo simulator | debug | iOS native + guest |
| iOS device | Physical iOS device selected in the VS Code status bar | debug / profile / release | iOS native + guest |
| macOS | Apple Silicon Mac (`macos`) | debug / profile / release | macOS native + guest |
| Android arm64 | arm64 Android device selected in the VS Code status bar | debug | Android native + guest |

Use debug mode on iOS simulators and profile or release on physical devices or macOS. Android native builds require an existing SDK/NDK environment. The current library supports arm64-v8a.

`.vscode/tasks.json` runs these steps in order.

1. The existing `sdk/scripts/build_native.sh` prepares the platform library. An iOS build produces device and simulator slices in one run. Cargo reuses unchanged artifacts.
2. The existing `bun run build:system` in `demo/js/` updates the SystemUI, profile, and lobby qjbc, PAK, and metadata through the pinned `buildGuest` pipeline.
3. Once preparation succeeds, Dart-Code launches Flutter and attaches the debugger.

A failed preparation task blocks launch. After changing Rust, SDK TSX, or a mini app, stop and restart debugging to rerun preparation. Hot reload and hot restart only process changes within the running Flutter process. The next launch runs the full preparation pipeline.

The old configuration treated the SDK and every plugin package as an executable Flutter app and omitted preparation tasks. These packages have no standalone app entry point and have been removed from the launch list. Their tests still run through the Dart-Code Test view.

## Provenance and Validation

- The retained parent `pocketjs_flutter_demo/.vscode/launch.json` supplied the Dart debugger and `flutterMode` conventions. The parent project's `pocket_host/` was left outside the review.
- The configuration reuses `build_native.sh`, `build:system` in `demo/js/package.json`, and `demo/js/scripts/build_mini_apps.ts`. It introduces no compiler or build cache.
- The local Dart-Code 3.146.0 launch schema verified the fields. Its device selector supports an exact name match through `deviceId`. References and paths passed for eight launch configurations and seven tasks.
- On 2026-11-05, launching `Pocket Demo (iPhone Duo)` from the actual VS Code **Run and Debug** panel completed the native iOS and guest bytecode tasks in order. After the Xcode build, the debugger reported Running / Thread 1 is not paused and the Duo home screen appeared. Clicking the real `+1` in Device Hub changed the JS count from `00` to `01` and the action text to `Incremented in JS`. The VS Code launches for macOS, physical iOS, and Android remained untested in that pass.
