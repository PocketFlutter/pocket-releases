# Windows prebuilt tools and acceptance criteria

The Windows consumer workflow uses Node.js 22.22.2 or later, preferably Node.js 24 LTS, npm,
and the CI-built `@pocket/tools-win32-x64@0.1.1`. Consumers can work without Rust, Cargo,
Python, `patch`, Visual Studio, or a C++ compiler. Rust/MSVC and C/C++ are needed on the
publisher's Windows CI runner to build the platform package.

## GitHub Actions releases

`.github/workflows/toolchain.yml` owns the full 0.1.1 release gate. Push the `sdk-v0.1.1`
version tag or dispatch the workflow manually.

```sh
gh workflow run toolchain.yml -f publish_release=true -f update_existing_release=false
```

The workflow builds platform packages from pinned source on macOS arm64 and Windows x64.
It combines `pocket-tools-darwin-arm64-0.1.1.tgz`,
`pocket-tools-win32-x64-0.1.1.tgz`, and `npm-shrinkwrap.json` into
`pocket-web-sdk-tools-darwin-arm64-0.1.1.tgz` and
`pocket-web-sdk-tools-win32-x64-0.1.1.tgz`. Each runner installs npm dependencies anew
from its standalone package and runs `npm run doctor` and
`node scripts/tests/platform_package_smoke.mjs --sdk-root=...`. When both platforms pass,
the workflow creates a GitHub release and uploads both platform SDKs, both bare platform
packages, `SHA256SUMS`, and the acceptance JSON.

The workflow publishes only to GitHub Releases. With `workflow_dispatch`, `publish_release`
defaults to `true` and `update_existing_release` defaults to `false`. To build and test
without creating a release, explicitly pass `-f publish_release=false`. Updating attachments
for an existing official release requires `-f update_existing_release=true`, which leaves
the tag in place. This document preserves historical Windows native and consumer CI evidence.
The corresponding release attachments record final archive and two-platform acceptance status.

## Publisher build

The [release workflow](https://github.com/PocketFlutter/Pocket/blob/b06cb43cac4d553cea232ae1cd1f9ed4ee0c4ff4/.github/workflows/toolchain.yml) uses MSVC, the Windows SDK, and
Rust 1.98.1 on Windows 2022. It downloads the common Web engine, prepares the pinned PocketJS
source, and builds two release binaries.

```powershell
cd sdk
npm install --ignore-scripts --legacy-peer-deps --no-audit --no-fund
python scripts/prepare_upstream.py
bun install --frozen --cwd .cache/pocketjs

# Noble install only runs node-gyp-build. Publishers explicitly build the N-API addon.
# node-gyp configure + the generated Visual Studio solution are required;
# passing /p: properties through `node-gyp build` turns them into /t switches.
node node_modules/node-gyp/bin/node-gyp.js configure `
  --directory node_modules/@abandonware/noble
msbuild node_modules/@abandonware/noble/build/binding.sln `
  /p:Configuration=Release /p:Platform=x64 `
  /p:WindowsTargetPlatformVersion=10.0.26100.0

cargo build --locked --release --manifest-path native/Cargo.toml `
  --bin pocket_probe --bin pocketjs_bytecode
bun scripts/package_toolchain.ts `
  --out=.pocket-build/toolchain-package --force
cd .pocket-build/toolchain-package
npm pack --ignore-scripts
```

The resulting archive is `pocket-tools-win32-x64-0.1.1.tgz`. The packager copies
`@abandonware/noble`'s `build/Release/binding.node` to
`noble/prebuilds/win32-x64/node.napi.node` and records the hash in `manifest.json`.
At startup, the SDK supplies `@ABANDONWARE/NOBLE_PREBUILD` so `node-gyp-build` can load
this file directly during consumer use. Windows Noble uses its WinRT binding, configured
in `node_modules/@abandonware/noble/lib/win/binding.gyp`. CI selects Windows SDK 10.0.26100.0.

`@abandonware/bluetooth-hci-socket` loads from its internal node-pre-gyp path. It currently
has no external prebuild entry that the Pocket platform package can override, so the
manifest records `hci.included: false`. Windows Noble uses WinRT. The HCI addon is for Linux.

## C11 atomics

The pinned upstream C worker uses `<stdatomic.h>` and C11 atomic operations. For MSVC targets,
`sdk/native/build.rs` passes `/std:c11` and `/experimental:c11atomics` to match pinned
`rquickjs-sys` Windows flags. Both flags are required to compile the worker or QuickJS C
source through MSVC's `stdatomic.h` stage.

Rust excludes the `clock_gettime` declaration on Windows and uses the common clock fallback
without a POSIX shim. The remaining QuickJS C ABI, bytecode compiler, and probe come
from the same pinned revision. Use those bundled components for bytecode generation and execution.

## Consumer installation and checks

On Windows, run these commands from the exported SDK.

```powershell
npm run setup
npm run doctor
npm run build:guest -- --project-root C:\work\app --outdir C:\work\app\dist
npm run editor
```

`setup` resolves the platform package for `win32/x64`, checks the SDK revision, QuickJS ABI,
file sizes, and SHA-256, and uses the npm-managed Bun. A missing package or failed check
returns an error. Compilation of platform tools belongs to publisher CI.

## Required Windows acceptance

After CI builds the package, run `npm run setup` and `npm run doctor` in a clean Windows
directory without source caches or `native/target`. Then verify these items.

1. `manifest.json` declares `platform: win32`, `arch: x64`, and Noble `included: true`.
   `node-gyp-build.resolve` points to `noble/prebuilds/win32-x64/node.napi.node` in the
   platform package. The consumer directory has no
   `@abandonware/noble/build/Release/binding.node`.
2. Verify that both App and Game templates build real `app.qjbc` and `app.pak`, and that
   theme, score, and pause/resume inputs change frames in Native Preview.
3. Verify that Windows Noble reports `poweredOn` and returns real scan, connection, GATT
   read/write, and notification streams. The JS `hardware.bluetooth.*` client must derive
   state updates from real notification frames. A write-success callback is separate from
   a device state change.
4. After exiting Preview, verify that connections, notification streams, and helper
   processes are released. Restart and verify that Studio still uses port 8791.

The GitHub Windows runner lacks physical BLE peripheral hardware. CI can test the WinRT
addon load, simulated IO, and Preview routes. Earlier CI verified Windows npm consumer
setup, loading the WinRT addon from the platform package, App and Game QJBC and PAK,
and input-driven Preview frame changes. Actual BLE peripheral connection, notifications,
battery updates, and disconnection need a Windows machine with a BLE adapter and logged
evidence. The workspace passed physical macOS Noble acceptance. Physical Windows acceptance
is still pending.

## Provenance and reused boundaries

Before implementation, review covered retained parent
`/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` excluding `pocket_host/`,
and `@abandonware/noble@1.9.2-26` BLE transport conventions.
The main Pocket paths are as follows.

- `sdk/native/Cargo.toml` pins Rust and QuickJS native dependencies.
- `sdk/native/build.rs` adapts worker C and passes MSVC C11 atomic flags.
- `sdk/editor/native/noble-bluetooth.mjs` maps Preview JSONL to Noble.
- `sdk/scripts/package_toolchain.ts` packages platform binaries, ABI, the Noble prebuild, and the hash manifest.
- `sdk/scripts/prebuilt_tools.mjs` selects and verifies platform packages and scopes the Noble prebuild environment variable.
- `.github/workflows/toolchain.yml` provides the Windows 2022 release matrix.

Business protocol, BLE notification parsing, and state orchestration stay in JS.
Any future Flutter integration with `flutter_blue_plus` uses the same `hardware.bluetooth.*`
transport contract and leaves protocol state with JS.

## Bootstrap and historical Windows CI

The pinned archive content was unchanged. GNU `patch` enforced context counts and
boundaries in the old unified-diff hunks more strictly than macOS `patch`. Six affected
patches were regenerated with standard three-line context from their actual before and
after files. Their applied content stayed byte-for-byte identical.
`/tmp/pocket-check-hybrid.log` records the first GNU patch application, idempotence on
the second run, and final source equivalence. Bootstrap requires exact patch application.

Historical Windows CI commit `e6f337e` and run `42201916294` verified the Noble WinRT
binding, two Rust executables, static CRT, and `dumpbin /dependents`. Noble runs
`node-gyp configure` and invokes `MSBuild` directly with the generated solution,
passing `/p:Configuration=Release /p:Platform=x64` and
`/p:WindowsTargetPlatformVersion=10.0.26100.0`. `node-gyp build` would convert the
`/p:` properties to incorrect `/t` switches. CI used Rust 1.98.1.

`octane@0.1.26` was found to require Node.js `>=22.22.2`. On Node 20, npm's optional
platform dependency check failed and removed the entire platform package. Historical
commit `aaf37be` moved CI to Node.js 24 LTS and set the minimum consumer version to 22.22.2.
Native build run `42204461550` produced the platform package. The final Studio step
failed because `sdk/editor/codex.ts` statically imported
`.cache/pocketjs/tools/companion/codex.ts`, absent in a standalone SDK. The current
resolution uses `POCKET_UPSTREAM_ROOT` or `resolvePrebuiltTools()`, reserving `.cache`
for explicit source mode and reusing the same toolchain.

Historical consumer run `42205580194` on commit `0247e30` reused the native build artifact.
It passed Node 24 setup and doctor, loaded the prebuilt Noble WinRT addon without a
consumer build, produced App QJBC 190738 and PAK 905744 and Game QJBC 184898 and PAK 905728,
observed actual Preview frame changes after theme, score, and pause/resume inputs, and
verified Studio start, health, status, and stop on fixed port 8791. Real Windows BLE
connection, notifications, battery, and disconnection still require a DK-META2 and
physical Windows host. The package-specific release and its acceptance JSON record
final status.
