# npm Toolchain and Full Guest Builds

The standalone Web SDK's npm entry point invokes the existing PocketJS build implementation. `buildGuest` uses the pinned PocketJS compiler and a QuickJS compiler with the same ABI to generate `app.qjbc`. It preserves the compiler-generated `app.pak` and requires actual bytecode.

## Installation and Commands

App developers need Node.js 22.22.2+ (24 LTS recommended) and npm. `npm run setup` installs npm-managed Bun, SDK workspace dependencies, and the matching prebuilt platform tools, such as `@pocket/tools-darwin-arm64@0.1.1`. It checks SDK version, QuickJS ABI, file SHA-256 values, and platform. Rust, Python, `patch`, and C/C++ compilers are unnecessary for this path.

Run from the repository or exported SDK root.

```sh
npm run setup
npm run doctor
```

Historical local acceptance archives are `sdk/.pocket-build/pocket-tools-darwin-arm64-0.1.1.tgz` and `sdk/.pocket-build/pocket-tools-win32-x64-0.1.1.tgz`. Platform builds are distributed through standalone SDK archives outside the npm registry. Download the archive matching your platform when published.

- `pocket-web-sdk-tools-darwin-arm64-0.1.1.tgz` for macOS arm64.
- `pocket-web-sdk-tools-win32-x64-0.1.1.tgz` for Windows x64.

Each SDK archive carries its own `@pocket/tools-*` dependency and declares the matching `os` and `cpu` in `package.json`. Missing packages or mismatched versions, ABIs, and hashes fail explicitly. Maintainers can place the matching bare platform `.tgz` in `prebuilt/` or set `POCKET_TOOLS_PACKAGE=/absolute/path/to/unpacked/package`.

## GitHub Actions Releases

`.github/workflows/toolchain.yml` is the release entry point for 0.1.7. It builds platform packages from pinned source on macOS arm64 and Windows x64 runners, then creates separate standalone SDK tarballs with `npm-shrinkwrap.json`. Each archive includes its own platform package. The workflow runs `npm run setup`, `npm run doctor`, and the following smoke test in a clean directory on each target.

```sh
node scripts/tests/platform_package_smoke.mjs --sdk-root=/path/to/sdk
```

The smoke loads the actual platform Noble addon, builds App and Game QJBC/PAK, drives Preview input, and checks Studio start, health, status, and stop on port 8791. Both platforms must pass before release attachment generation. The documented attachment names are `pocket-web-sdk-tools-darwin-arm64-0.1.4.tgz` and `pocket-web-sdk-tools-win32-x64-0.1.4.tgz`, along with matching bare packages, `SHA256SUMS`, and per-platform acceptance JSON. The workflow does not run `npm publish`.

Push a version tag such as `sdk-v0.1.7`, or dispatch the workflow as follows.

```sh
gh workflow run toolchain.yml -f publish_release=true -f update_existing_release=false
```

For `workflow_dispatch`, `publish_release` defaults to `true` and `update_existing_release` defaults to `false`. Pass `-f publish_release=false` for build and acceptance only. Normal tag pushes preserve an existing official release. Explicit `-f update_existing_release=true` updates attachments for the same tag and leaves the tag in place. The historical Windows consumer evidence appears below. Use the release and both acceptance JSON attachments to verify a complete release. Local archives and single-platform CI cover only their own inputs.

This Web SDK release validates npm/Web tooling, platform `pocket_probe`, `pocketjs_bytecode`, Noble binaries, and Guest builds and Preview/Studio in a clean SDK package. It does not install Flutter or build the Flutter Showcase under `demo/` or `pocket_flutter.dll`. Flutter and Live2D consumers require independent validation in an authorized environment with the applicable Cubism Core files.

A full Guest build uses the prepared pinned compiler, prebuilt `pocketjs_bytecode`, and prebuilt `pocket_probe` by default.

```sh
npm run build:guest -- \
  --project-root=/path/to/project \
  --outdir=/path/to/project/dist
npm run build:probe
```

`build:probe` verifies the installed prebuilt probe without compiling Rust. `npm run editor` and `npm start` use the same platform package and npm-managed Bun.

Source release maintainers need Python 3, `patch`, Rust/Cargo 1.93+, and the platform C/LLVM toolchain for these commands.

```sh
npm run bootstrap:source
npm run setup:source
npm run build:probe:source
npm run build:engine:source
npm run package:tools
```

These commands generate future platform packages. The older full `build:wechat` path is also a maintainer source build. Set `POCKET_SOURCE_BUILD=1` explicitly to allow Cargo when invoking it or lower-level scripts. The npm-only path never falls back to source compilation.

`project-root` must contain `pocket.json`, `manifest.json`, and a project entry point. Outputs include:

- `app.qjbc`, admitted QuickJS bytecode.
- `app.bytecode.json`, matching ABI and metadata.
- `app.pak`, the compiler-generated asset package.
- `guest-manifest.json`. Ordinary project assets are copied to the host only with explicit `--copy-assets-to=/path/to/host/assets`.

`@pocket/ui` comes from `packages/pocket_ui` at pinned version `0.1.0` as an npm-resolvable workspace dependency. Export removes the internal `private` marker and omits tests and build caches. The platform package carries pinned compiler source and its dependency inventory. npm-managed Bun serves as the internal executor.

npm also forwards Web builds.

```sh
npm run build:web -- --project-root=/path/to/project --outdir=/path/to/web
npm run editor
```

Editor defaults to `http://127.0.0.1:8791`. `build:web` and Editor use npm-managed Bun without a global installation. The browser WebAssembly runtime must match the platform package's QJBC ABI. General prebuilt WASM acceptance on Windows and Linux remains incomplete. macOS Web output and native Preview results apply only to the verified paths.

`editor:start` and `editor:restart` reuse the running service's project binding, Flutter consumer, and update package version. The first unbound run uses the generic SDK. Startup configuration lives in the PID record and survives `editor:stop` followed by `editor:start`. Switching to a different explicit `--project-root` clears the previous Flutter consumer and update version unless specified again. Explicit `POCKET_COMPILER_PATH` and `POCKET_NATIVE_PROBE` are retained and take precedence on restart. Default npm compiler and probe resolution stays automatic.

On 2026-11-09, argument-free restart was fixed to preserve Showcase's external project binding. Stop retains the startup configuration as `pid: null` in the existing PID record. Older records can recover project, Flutter path, and update version from the same workspace's `/health`. The record stores supported fields only. Cold-start health checks wait up to 30 seconds, then terminate the child and report failure if it never becomes ready.

Six startup configuration regressions passed. The actual port 8791 service still selected `PocketJS Flutter host showcase` after argument-free restart and stop/start. The existing pinned buildGuest built Demo and its catalog apps. Playwright Chromium ran real native Preview and clicked `+1`, changing the Guest count from `00 → 01` with no page JS error. Stop/start and repeat passed. The earlier `node_modules` symlink failure was fixed by skipping the cache during copying while retaining symlink rules.

## Source Provenance and Reuse

This entry reuses `scripts/build_guest.ts`, the pinned compiler, platform packages, and `packages/pocket_ui`. The source-first review inspected `pubspec.yaml`, `lib/`, `wechat_host/`, `web_wasm_preview/index.html`, `README.md`, `docs/02_ARCHITECTURE_AND_MEMORY_DESIGN.md`, `tools/compile_pocket_syslib_aot.py`, and `native/pocket_runtime_multi.c` in `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`. Its actual hosts were Flutter and WeChat. Its WebAssembly page simulated memory and ring updates in hand-written JS without running PocketJS or QJBC. It had no full `buildGuest` or `@pocket/ui` npm package. This work uses the current pinned build pipeline and real browser runtime, leaving the simulator and historical AOT tools behind. npm consumers use release-built packages. `prepare_upstream.py`, Rust, and patch utilities stay on release/CI. `prepare_upstream.py` is the sole source for upstream revision, archive checksums, and patch inventory.

The npm wrapper installs platform packages, validates ABI and hashes, chooses npm-managed Bun, and forwards arguments. It shares the existing buildGuest, QuickJS compiler, layout engine, and runtime. `@pocket/ui` has one public workspace source.

## Platform Verification

macOS used actual prebuilt platform packages to build App and Game QJBC and PAK and execute them in Pocket Preview. Export tests check inclusion of `build_guest.ts`, `@pocket/ui`, templates, platform package resolver, and toolchain manager, with source caches, `target`, and Flutter projects excluded.

Historical Windows CI compiled and packaged `win32-x64` tooling and passed clean consumer installation, Preview smoke, and WinRT addon loading. The complete two-platform release uses `.github/workflows/toolchain.yml` with reports attached to the corresponding release. Windows CI checks DLL dependencies of `pocket_probe`, `pocketjs_bytecode`, and Noble. Flutter native builds and licensed Cubism Core files are outside this workflow. Verify Flutter/Live2D in an authorized environment. Linux needs separate CI, and Windows DK-META2 BLE needs physical hardware.

## macOS Acceptance

- Local `pocket-tools-darwin-arm64-0.1.1.tgz` and `npm run setup` passed. Sentinels under `/tmp/pocket-node-only-path` blocked `cargo`, `rustc`, `python`, `python3`, `patch`, `cc`, `gcc`, `clang`, and global `bun`. npm still passed and `/tmp/pocket-node-only-blocked.log` was 0 bytes.
- Standalone export `/tmp/pocket-node-only-sdk-acceptance` completed npm setup in about 22 seconds. It had no `.cache/pocketjs`, `native/target`, or Flutter project. Clean Guest and Web builds produced real artifacts. Playwright verified Web theme background changes and restoration without browser errors. Log: `/tmp/pocket-node-only-clean-web-test.log`.
- The exported App template generated 190738-byte QJBC and 905744-byte PAK. Game generated 184898-byte QJBC and 905728-byte PAK. Native Preview loaded both. Pointer input changed the App theme, scored a Game hit, held the timer while paused, and changed time again on resume. Log: `/tmp/pocket-node-only-preview.log`. This covers native Preview. Flutter mobile and browser WASM require separate validation.
- Real App/Game QJBC/PAK and Native Preview acceptance passed for input-driven themes, hit scoring, pause, and resume. Final test totals are recorded with consolidated acceptance.
- Source-built WASM replaced an older incompatible binary-input artifact. Chromium Canvas switched from `[248,250,252,255]` to `[13,23,38,255]` and back with no browser errors. Log: `/tmp/pocket-node-only-web-test.log`. This verifies current source WASM with QJBC/PAK. Windows and Linux Web results remain separate.
- Building that WASM required a maintainer-only temporary linker wrapper under `/tmp` to repair a damaged `rust-lld` library search path. It is outside the SDK and npm-only path.
- The Guest template's default Inter lacks Chinese glyphs, so Web screenshots may show boxes. Studio DOM Chinese displayed normally. Font coverage is still limited.
- Historical Windows CI passed Rust/MSVC platform package build, consumer, and Preview. Linux remains pending. Local acceptance focused on macOS npm installation, ABI/hash validation, QJBC/PAK build, and Preview.
- Final clean setup log: `/tmp/pocket-node-only-final-setup.log`. Noble N-API came from `/tmp/pocket-node-only-sdk-final/node_modules/@pocket/tools-darwin-arm64/noble/prebuilds/darwin-arm64/node.napi.node`, with `sourceBuildPresent:false`. `npm install --ignore-scripts` does not compile it. Node sets scoped environment variables. 0.1.0 logs describe that historical package.
- An actual Noble scan after `poweredOn` found nearby BLE devices. Log: `/tmp/pocket-node-only-final-ble.log`. DK-META2 was absent, so reconnection remained unverified. Linux reports `unsupported`. No Linux HCI prebuilt package or loader was generated, released, or accepted. Consumers need no Rust or other native toolchain.

`npm run doctor` checks platform tools, manifest, ABI, and hashes. Loading and interactions use additional tests. `patch` is only for source releases. Windows consumer and Preview smoke passed in CI. BLE acceptance still requires physical Windows hardware.

macOS arm64 passed locally. Windows x64 passed earlier CI compilation, packaging, consumer, and Preview. GitHub Release records complete two-platform release status. Linux CI remains outstanding. The workflow publishes outside the npm registry. Flutter device or simulator packaging requires the consumer's Flutter and platform SDKs, signing, and devices. This run did not exercise mobile Flutter.

The historical `python3 sdk/scripts/check_architecture.py` run failed because shared `demo/lib/main.dart` had 203 lines, exceeding the 100-line thin-host limit. The npm work did not change that Dart file.

## 0.1.1 Packaging Retest

- Clean `/tmp/pocket-sdk-0.1.1` setup verified the platform package and npm-managed Bun. Blocked source tools log remained 0 bytes.
- All 51 tests across 11 files and 359 expectations passed. Logs: `/tmp/pocket-0.1.1-tests.log` and `/tmp/pocket-0.1.1-guest-tests.log`.
- The actual Web build generated QJBC, PAK, and 16384391-byte WASM. Chromium theme change and restoration passed without browser errors. Log: `/tmp/pocket-0.1.1-web-test.log`.
- The prebuilt Noble scan passed with no local `build/Release/binding.node`. DK-META2 did not appear. Log: `/tmp/pocket-0.1.1-ble.log`.
- Separate macOS arm64 and Windows x64 SDK tarballs were created. CI built the Windows platform package and passed consumer acceptance. Linux and npm registry publishing were outside this release.

## Final Historical Windows CI Acceptance

Native run `42204461550` at `aaf37be` built Windows MSVC/Rust tooling, Noble WinRT, and the platform package. Studio's final check failed because `sdk/editor/codex.ts` statically imported `.cache/pocketjs/tools/companion/codex.ts`, absent in the standalone SDK. The fix resolves the compiler through `POCKET_UPSTREAM_ROOT` or `resolvePrebuiltTools()`. Only explicit source mode reads `.cache`.

Consumer run `42205580194` at `0247e30` reused that artifact and passed Node 24 setup/doctor and prebuilt Noble WinRT loading without consumer-side `build`. App `app.qjbc` was 190738 bytes and `app.pak` 905744 bytes. Game `app.qjbc` was 184898 bytes and `app.pak` 905728 bytes. Real Preview theme, scoring, pause, and resume changed frames. Studio start/health/status/stop passed on 8791. CI had no DK-META2. Physical Windows testing must cover connection, notifications, battery, and disconnection.

## Historical Windows Consumer Notes

Windows CI moved to Node.js 24 LTS with minimum Node.js 22.22.2 because `octane@0.1.26` declares `engines >=22.22.2`. On Node 20, npm's optional platform dependency check drops the package. Run `42205580194` passed clean install, platform resolution, Preview smoke, and Noble WinRT loading on Node 24. Linux awaits a standalone build. Windows BLE connection, notifications, battery, and disconnection are physical-device checks.
