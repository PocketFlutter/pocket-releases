# Flutter 3.50 toolchain upgrade

Recorded on 2026-11-13.

## Provenance and scope

Historical branch `origin/research/flutter-3.50-nativeapi` was fetched and commit
`500ac4f` evaluated. Its [research notes](FLUTTER_3_50_NATIVEAPI_EVALUATION_20261113.md)
preserve the pre-integration state and toolchain versions. This change upgraded only
Flutter tooling. The nativeapi provider was outside scope. Public package minimums
remained Flutter >=3.35.0 and Dart ^3.9.2. The PocketJS revision, QuickJS bytecode
pipeline, and native ABI stayed fixed.

The user authorized working in `/Users/lincoln/Develop/GitHub/FPKit/pocket` because the
`/Volumes/ORICO/...` path was absent on that machine. The user also authorized Codex
after the Argon Low quota was exhausted. The retained parent
`/Volumes/ORICO/Development/Github/pocketjs_flutter_demo` was unavailable on the
machine or under `/Users/lincoln/Develop`. This round reused the provenance in
`INPUT_REUSE.md` and the retained input, FFI, and rendering regressions without adding
new native capability or replacing the migration.

Existing staged, unstaged, and unmerged index entries on historical main were preserved.
Unrelated commits between the research branch and local branch were left outside the
change. Pre-change files, binary diff, and index backups are under
`/Users/lincoln/.codex/backups/pocket-flutter-350-20261113-165006`.

## Adaptation

- Project `.fvmrc` and the local FVM default use Flutter 3.50.0.
- The CI Flutter action reads the pinned version from `.fvmrc`.
- Updated affected pub lockfiles and current toolchain docs. Historical validation
  retains its original versions.
- Retained Flutter rendering, lifecycle, and IME boundaries and JS business logic.
- Reused the research branch correction in
  `sdk/test/pocket_bundled_application_catalog_test.dart`. SystemUI actually had five
  factories for policy, recording, diagnostics, runtime, and platform-proxy. The old
  assertion still expected four. The updated assertion checks the final provider ID
  explicitly.

## Validation

The actual toolchain was Flutter **3.50.0 stable** with framework revision
`ab2912035e160d9cad6306df307576da6128ebdb`, engine revision
`371f77202a73e8dff57a8b3bff75bca55c090aee`, and Dart **3.14.0**.
`flutter doctor -v` reported no issues. Project `.fvm/flutter_sdk` and local
`~/fvm/default` both pointed to `/Users/lincoln/fvm/versions/3.50.0`. VS Code retained
`.fvm/flutter_sdk`.

| Check | Result |
| --- | --- |
| Flutter 3.47.9 baseline with identical source | Three passes for duplex pointer, pointer order, and actual JS move/delete pixels |
| pocket_flutter analyze | Exit 0 with 24 Material entry-point deprecation info messages |
| Full pocket_flutter tests | 277 passed with zero skipped using the real native library and buildGuest capture fixture |
| pocket_services analyze and test | Zero analysis issues and 89 tests passed |
| SDK analyze | Exit 0 with 16 info messages including Material deprecations and existing unnecessary imports |
| Full SDK tests | 200 passed and 10 skipped because additional Worker, update, recording, and on-demand fixtures were unavailable. The real native library was configured. |
| Showcase analyze | Exit 0 with five info messages including Material deprecations and existing package dependency and documentation hints |
| Full Showcase tests | All 54 passed after preparing local build assets. The first run failed for missing Lantern QJBC. |
| Showcase macOS debug build | Passed after official Core installation and a fresh pod install, producing `demo/build/macos/Build/Products/Debug/pocket_host.app` |
| Lockfile checks for all four entry points | pocket_flutter, pocket_services, sdk, and demo each passed `pub get --offline --enforce-lockfile`. CI enables strict lockfile checking too. |

`pocket_view_capture_native_test.dart` uses the existing
`test/fixtures/scene_capture/app.tsx` through pinned buildGuest, QuickJS QJBC and PAK,
FFI, and PocketView. A real pointer tap changes output PNG pixels from red `#ed2839`
to green `#25bd62`. The test also excludes host pixels outside the surface.
This exercise used Flutter test software rendering. Hardware Impeller, physical iOS
and Android, system Chinese input candidates, and input latency were outside the run.

Temporary logs, QJBC, and before/after PNGs are under
`/tmp/pocket-flutter-350-validation/`. Generated caches, SDK binaries, and logs were
excluded from source changes.

## Local installation and reproduction

The normal steps are `fvm install 3.50.0`, `fvm use 3.50.0 --skip-pub-get`, and
`fvm global 3.50.0`. The first local install failed because of Git bare-cache
configuration and a full clone network interruption. The exact official tag was
shallow-cloned into the FVM version directory. Its revision was verified and a stable
branch created in the SDK checkout. SDK source and version metadata were preserved.
Dart and engine download temporarily used
`FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn`, scoped to that operation.
The old 3.47.9 SDK remained available for comparison.

Local Rust 1.93.0 stripping misaligned the dylib LINKEDIT string table, so macOS 27
dyld also rejected the 3.47.9 baseline. The same source was rebuilt with
`RUSTC_WRAPPER= cargo rustc --release --locked --lib -- -C strip=none` to generate a
loadable validation library. The shared Cargo profile and runtime were preserved.
See [Rust issue 157750](https://github.com/rust-lang/rust/issues/157750).

Existing local font changes caused the default `prepare_upstream.py` to reject
reapplying the `host-native-fonts.patch` hunks for `tools/build.ts`. Local files were
preserved and the failure was logged in `build-guest.log`. The capture fixture used
the existing `POCKET_COMPILER_PATH` to select the actual installed compiler at
revision `99924de47c62fa36f526a8791055d91cbbdb3836`.

```sh
POCKET_SOURCE_BUILD=1 \
POCKET_COMPILER_PATH="$PWD/sdk/.cache/pocketjs/tools/build.ts" \
npm exec --yes --package=bun@1.4.4 -- bun sdk/scripts/build_guest.ts \
  --project-root=sdk/packages/pocket_flutter/test/fixtures/scene_capture \
  --outdir=/tmp/pocket-flutter-350-validation/scene-capture/assets

cd sdk/packages/pocket_flutter
POCKET_NATIVE_LIBRARY="$PWD/../../native/target/release/libpocket_flutter.dylib" \
POCKET_VIEW_CAPTURE_FIXTURE_DIR=/tmp/pocket-flutter-350-validation/scene-capture \
POCKET_VIEW_CAPTURE_ARTIFACT_DIR=/tmp/pocket-flutter-350-validation/scene-png \
flutter test --no-pub --reporter expanded
```

## Remaining boundaries

The user's follow-up request for local compilation resolved the two assets missing
during first Showcase acceptance. After explicit user acceptance of developer terms,
the existing `packages/pocket_live2d/scripts/bootstrap_cubism_core.sh` verified the
official Native R5 ZIP with SHA-256
`7ff3a4bbc19c0a8728965aa522ab77eb11b252916453e68a8a78d3b71188bb12`.
It generated the iOS and macOS XCFrameworks and registered them with the existing
plugin.

Existing `prepare_textures.ts` and `prepare_live2d.ts` prepared 19 runtime textures,
one SVG, and the Hiyori model with per-file hash validation. The original buildGuest
pipeline built Lantern. The missing Spine dependency was installed in local
node_modules at `@esotericsoftware/spine-core@4.3.13` from `sdk/bun.lock`, with the
package version and source lockfile preserved.

Lantern produced 1,218,814 bytes of QJBC and 69,631,776 bytes of PAK. Payload SHA-256
was `9081be97f48cc46f72d2e743a94f897b5272b506ab958ea3fb39f9b3351b5338`.
Artifacts went to the existing `demo/assets/apps/lantern/`. Generated caches were
excluded from source. Running `pod install` again after Core installation fixed the
missing vendored archive link error. Flutter 3.50 reported that three macOS local
plugins still use CocoaPods. The existing registration was retained. The shader
compiler also flagged sampler usage and multiple returns in `liquid_glass.frag` as
potential Windows risks. The macOS test shader compiled successfully and Windows was
outside the run.

Legacy Material imports still work on 3.50 with the existing minimum constraint.
A standalone Material package migration and a nativeapi provider each need their
own support matrix and platform validation.

## Consolidated review

Codex performed the consolidated review as requested. There was no independent
Argon Medium result. Review checked the version pin, `.fvmrc` as the CI source of
truth, all four strict pub lockfile checks, native and compiler revisions, actual
QJBC input to PNG evidence, and missing-fixture and skipped-test conditions.
All 48 backed-up preexisting worktree files matched. The prior staged binary diff
and unmerged entries also matched. Git index stat-cache changes reflect metadata,
while the staged contents remained the same. The commit contained toolchain
configuration, dependency lockfiles, the existing research-branch regression fix,
and documentation. Prior uncommitted work was preserved separately.

## Additional local Showcase validation on 2026-11-13

- `flutter test --no-pub --reporter expanded` passed 54/54. See `demo-test-final.log`.
- `flutter build macos --debug --no-pub` passed. See `demo-build-macos-final.log`.
- The first actual macOS drive of existing `novel_model_showcase_test.dart` failed on
  the Hiyori description text. After rebuilding and replacing the old Pocket static
  library using the existing macOS parameters, the same test and QJBC passed in
  01:03 with exit 0 and the `model-showcase` checkpoint complete. The test covered
  two-page textures and masks, animated vertex changes, background recovery, exit
  cleanup, re-entry, and preservation of the main story autosave.
- The local linker warned that some existing archives targeted a deployment version
  newer than the host's declared macOS 12. Validation ran on macOS 27.2.
- `run_macos_core_bridge_test.sh` passed 3/3 on Flutter 3.50 with the official Core
  bridge. It covered real Mao and Hiyori deformation, binary response budgets, and
  snapshot independence after update and dispose. See `live2d-core-bridge.log`.

The local Pocket static library rebuild used `MACOSX_DEPLOYMENT_TARGET=12.0` and
target-specific `-C link-arg=-mmacosx-version-min=12.0` with the same engine and
Cargo.lock. After `strip -S`, it was copied to the existing macOS Frameworks path.
Packaged library SHA-256 was
`225cfd200cf1b20972b6bb0f49b6bd1c7390e8c4164709170b33fb9f3dd33631`.

The final `demo/build/integration_response_data.json` lists required and completed
as `["model-showcase"]`. The report and four model PNGs are under
`/tmp/pocket-flutter-350-validation/model-showcase-evidence/`. Visual inspection
confirmed that the PNGs show the full Hiyori model.
