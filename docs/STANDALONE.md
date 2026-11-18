# Standalone Repository Migration

The standalone project lives at `/Volumes/ORICO/Development/Github/pocket`. The reusable implementation is in `sdk/`, and `demo/` is the Showcase entry point. The repository was copied from `pocketjs_flutter_demo/pocket_host`, which remains as a provenance copy. The audit cleanup removed the old `pocket_flutter_poc` historical source archive. The parent project `pocketjs_flutter_demo` remains available for reference, and the current build is independent of it.

The copy preserved production source, tests, documentation, Showcase bytecode assets, Flutter plugin static libraries, and the projects and signing material in the local Editor workspace. Those materials enabled continued validation of the then-current `0.1.1` update chain. The Editor private key is exclusively for the local service. Keep it outside releases and never commit or upload it.

The migration omitted `.dart_tool/`, Flutter `build/`, Pods, dependency caches such as `.cache/pocketjs/node_modules`, the `native/target` compiler cache, temporary `.pocket-build` artifacts, logs, and simulator output. To recreate these locally, follow the README to prepare the pinned upstream, install with Bun, build native and JS artifacts, and run `flutter pub get`.

## Checks After the Migration

```sh
cd /Volumes/ORICO/Development/Github/pocket/sdk
python3 scripts/prepare_upstream.py
bun install
python3 scripts/check_architecture.py
cd ../demo/js && bun install && bun run build
cd .. && flutter pub get && flutter analyze
```

Run the local Editor service with `bash scripts/editor_service.sh start|status|stop`. It listens on loopback by default. Run `start` again after logging out or restarting. Building Duo still requires Xcode with iOS SDK 27.1 or later. The minimum iOS version is 15.0.

Pinned upstream sources are retained in `.cache/pocketjs` and can be verified and rebuilt by revision. The migration copied the two verified static libraries, the bytecode compiler, and the native probe. Rust intermediate artifacts were omitted.

The audit cleanup removed the historical migration checklist along with the archive. The results below describe the migration environment and do not establish that the current commit passes.

The standalone checkout installed dependencies without existing compiler `node_modules` and generated a 235139-byte qjbc and a 333472-byte PAK. The real native probe, mobile geometry assertions, architecture boundary checks, and Flutter analyze passed. The migration fixed an early static import of the compiler in `build_guest.ts`. The shared CLI and Editor pipeline now prepares upstream and installs dependencies before loading the JSX transformer.

The Editor moved from the old directory's launchd job to this checkout, retaining `http://127.0.0.1:8790` and the revision 18 / 0.1.1 signing trust chain.

At migration time, this directory had been initialized as an independent Git repository and had yet to receive its first commit. The `.cache` directory, build artifacts, and Editor private key stayed ignored.

For final device validation, `flutter run -d 4D366210-290E-46DB-8BC6-3C5233700409` from the standalone `demo/` built and launched Duo. Flutter's package_config, Generated.xcconfig, and environment scripts referenced only the new checkout. The iOS XCFramework supplies arm64 slices for devices and Apple Silicon simulators, and the Swift package supports those two slices. The Editor also recompiled successfully from the new path.
