# Pocket Source CI in `PocketFlutter/pocket-releases`

The [Pocket Source CI workflow](../.github/workflows/pocket-source-ci.yml) runs Pocket's full source continuous integration and optional vector/SVG benchmark suites on GitHub-hosted runners in [`PocketFlutter/pocket-releases`](https://github.com/PocketFlutter/pocket-releases/actions) while keeping the private `PocketFlutter/Pocket` source repository and diagnostics confidential.

## Source-First Provenance and Retained Test Lanes

The retained parent at `../pocketjs_flutter_demo` (excluding `pocket_host/`) contains the early local verification entry points `run_tests.sh`, `tests/verify_architecture.py`, and `test/pocket_38_components_screenshot_test.dart`, and documents local verification in `docs/04_DEVELOPER_GUIDE_AND_VERIFICATION.md`. Those parent verification scripts had no GitHub Actions workflows or cross-repo private source isolation boundaries.

The canonical source repository `PocketFlutter/Pocket` defines the active CI and benchmark coverage in `.github/workflows/ci.yml` and `.github/workflows/vector-benchmark.yml` (documented in [CI gating and batched semantics layout/diffing optimization](CI_AND_SEMANTICS_BATCH_OPTIMIZATION_20261111.md) and [Lantern guest build in CI](LANTERN_CI_GUEST_BUILD.md)). `pocket-source-ci.yml` consolidates both workflows into a single manual-dispatch workflow in `PocketFlutter/pocket-releases` and preserves every active job, command, runtime check, pinned version (Node 24, Bun 1.3.9, Rust 1.98.1, Flutter 3.35.7 minimum host-font lane and `.fvmrc` workspace Flutter), Windows working-directory default, and benchmark suite:

| Job / Lane | Runner | Trigger | Preserved Coverage & Commands |
| --- | --- | --- | --- |
| `architecture-and-rust` | `ubuntu-24.04` | Always on dispatch | `python3 sdk/scripts/check_architecture.py`, `python3 sdk/scripts/check_api_docs.py`, `bun sdk/scripts/check_registry_conformance.ts --json`, `prepare_upstream.py`, `cargo clippy --locked --all-targets`, 20-iteration `AddressSanitizer` memory-safety loop (`-Zsanitizer=address`), 20-iteration native teardown stress loop, and `gdb` core crash diagnosis step condition |
| `studio-upgrade-windows` | `windows-latest` | Always on dispatch | `timeout-minutes: 10`, job-level `defaults.run.working-directory: pocket-source/sdk` (`shell: bash`), Chocolatey `patch`, `python scripts/prepare_upstream.py`, `npm install --ignore-scripts --legacy-peer-deps`, Playwright Chromium, and `bun@1.4.4` Windows Studio standalone/source upgrade test suite (`POCKET_SOURCE_BUILD=1`) |
| `js-sdk-and-guest` | `ubuntu-24.04` | Always on dispatch | `wasm32-unknown-unknown` WebAssembly engine build (`build_web_engine.ts`), release `pocket_probe` and `pocketjs_bytecode`, public sparse checkout of `Live2D/CubismNativeSamples` (`b8024738f108e6003e4925193e8d5ec04cd18196`, `Samples/Resources/Hiyori`) into `pocket-source/sdk/.cache/cubism-native-samples` with `persist-credentials: false`, standalone Lantern guest build (`build_mini_apps.ts --mini-app=lantern`), Linux Studio upgrade suite, isolated `bun scripts/test_js.ts` across all SDK packages and Editor preview suites, and `bash demo/js/scripts/test_guest.sh` (`POCKET_REQUIRE_REAL=1`) |
| `flutter-host-fonts-minimum-sdk` (`flutter-host-fonts-dart-3.9.2`) | `ubuntu-24.04` | Always on dispatch | Flutter `3.35.7` (`stable`), `flutter pub get`, and `flutter test test/pocket_host_fonts_test.dart` in `sdk/packages/pocket_flutter` |
| `flutter-sdk-and-demo` | `ubuntu-24.04` | Always on dispatch (`needs: js-sdk-and-guest`, runs unless cancelled) | `.fvmrc` Flutter version, `librsvg2-bin` (`rsvg-convert`) + `bun sdk/scripts/svg_fidelity_check.ts --emit-fixtures /tmp/svg-fidelity-fixtures.json`, and `flutter pub get --enforce-lockfile` + `flutter analyze --no-fatal-infos lib test` + `flutter test` across `sdk/packages/pocket_services`, `sdk/packages/pocket_flutter`, `sdk`, and `demo` (`POCKET_REQUIRE_REAL=1`) |
| `rust-and-js-vector-bench` (`Rust & JS Vector Benchmark`) | `ubuntu-24.04` | Optional (`inputs.run_vector_benchmarks == true`) | Architecture/API doc checks, `node --check sdk/editor/client/preview.js`, `cargo clippy`, Rust vector unit tests (`pocket_flutter`, `pocketjs-core`, `pocket-draw-ops`, `pocket-present`, `pocket-raster`), release `pocket_probe` + `pocketjs_bytecode`, `bun test sdk/scripts/tests/svg_vector.test.ts`, and `bun sdk/scripts/benchmarks/svg_vector_bench.ts` |
| `flutter-vector-bench` (`Flutter Vector Rasterizer Benchmark`) | `ubuntu-24.04` | Optional (`inputs.run_vector_benchmarks == true`) | `.fvmrc` Flutter version, `rsvg-convert` SVG fidelity fixture generation, `flutter pub get --enforce-lockfile`, `flutter analyze --no-fatal-infos lib test`, and `flutter test test/pocket_vector_benchmark_test.dart test/pocket_vector_fidelity_test.dart --reporter expanded` |

## Visual regression

`visual-regression` runs on Ubuntu in a regular source CI dispatch. It builds the pinned native Pocket runtime and runs the Flutter pixel comparison with that library. The job fails if the visual test fails or skips. Public logs contain the pass and skip counts, and the runner uploads no screenshots.

To validate just the visual comparison, dispatch with `run_visual_regression=true`. For a reviewed Pocket PR, pass its canonical `source_branch` and its exact tip as `source_sha`. Run the visual check before merging a change to the renderer or frame protocol. This dispatch remains manual.

## Security and Confidentiality Boundaries

`PocketFlutter/pocket-releases` publishes workflow metadata, including the selected commit and the Git checkout status. The workflow limits source execution to trusted revisions and keeps test output, crash dumps, and benchmark tables out of public logs and artifacts.

1. **Protected manual dispatch only (`workflow_dispatch`)**:
   - The workflow triggers exclusively on `workflow_dispatch` and every job enforces `if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'`.
   - No `pull_request` or `pull_request_target` trigger exists; untrusted forks or PR refs can never access private source or credentials.
2. **Environment and shared SSH key (`pocket-source-ci` + `POCKET_SOURCE_SSH_KEY`)**:
   - Every job runs in the `pocket-source-ci` environment restricted to `main`. Set `POCKET_SOURCE_SSH_KEY` once under the repository's Actions secrets to share it with [Native Studio release packaging](NATIVE_STUDIO_RELEASE.md). The matching public key must have read access to `PocketFlutter/Pocket`.
   - Both the private `PocketFlutter/Pocket` checkout and the public `Live2D/CubismNativeSamples` sparse checkout set `persist-credentials: false`.
3. **Independent SHA and canonical `main` ancestry verification in every job**:
   - Every job runs on a fresh GitHub-hosted runner and executes the shared YAML anchor steps `*validate_source_inputs`, `*checkout_source`, and `*verify_source_ancestry` before running any source script or build tool.
   - `*validate_source_inputs` verifies `POCKET_SOURCE_SSH_KEY` is non-empty and `inputs.source_sha` is an exact 40-character hexadecimal SHA.
   - `*verify_source_ancestry` verifies `git rev-parse --verify HEAD` matches the lowercased `source_sha` and `git merge-base --is-ancestor "$expected" refs/remotes/origin/main` succeeds against `PocketFlutter/Pocket` `main`.
4. **Zero source-derived caches or uploaded artifacts**:
   - All `actions/cache` steps from the private source workflows are removed, `actions/setup-node@v7` sets `package-manager-cache: false`, and `subosito/flutter-action@v2` sets `cache: false`.
   - All `actions/upload-artifact` steps (including failure diagnostic uploads) are removed so no private source files, logs, or core dumps are persisted in public Actions storage.
5. **Suppressed stdout/stderr and safe step summaries**:
   - Every step executing source commands redirects stdout and stderr to `/dev/null` (`exec 3>&1; trap 'echo "::error::<Step Name> failed" >&3' ERR; exec >/dev/null 2>&1`), suppressing test failure traces, compiler output, `gdb` crash dumps, and benchmark output while surfacing the exact named step outcome on failure.
   - Each job writes only a safe status line (`- **<job-id>**: <status>`) to `$GITHUB_STEP_SUMMARY` and removes `pocket-source` and temporary files in an `if: always()` cleanup step.

## Cutover Plan and Staged Automatic Source Branch/PR Dispatch

1. **Keep original source workflows live until cutover**:
   - Keep `.github/workflows/ci.yml` and `.github/workflows/vector-benchmark.yml` active in `PocketFlutter/Pocket` until `pocket-source-ci.yml` has been merged to `PocketFlutter/pocket-releases` `main`, the `pocket-source-ci` environment is configured, and a full dispatch (with `run_vector_benchmarks=true`) passes on `PocketFlutter/pocket-releases`.
   - Preserve existing credentials and environments (`studio-native-build`, `studio-native-signing`, `POCKET_SOURCE_SSH_KEY`, `STUDIO_UPDATE_SIGNING_KEY`) untouched for [`studio-native-release.yml`](NATIVE_STUDIO_RELEASE.md).
2. **Manual dispatch command (Phase 1 — immediate with existing `POCKET_SOURCE_SSH_KEY`)**:
   ```sh
   gh workflow run pocket-source-ci.yml \
     --repo PocketFlutter/pocket-releases \
     --ref main \
     -f source_sha=<40-char-sha-on-PocketFlutter/Pocket-main> \
     -f run_vector_benchmarks=false
   ```
   Pass `-f run_vector_benchmarks=true` to include `rust-and-js-vector-bench` and `flutter-vector-bench`.
3. **Staged automatic source push/PR dispatch (Phase 2 — requires an additional cross-repo dispatch credential)**:
   - Automatic cross-repository runs need GitHub API credentials with Actions write permission on `PocketFlutter/pocket-releases`. The source SSH credential grants Git access.
   - To automate triggering from `PocketFlutter/Pocket` pushes to `main` (or vetted internal branches after policy expansion), provision a fine-grained Personal Access Token or GitHub App installation token in `PocketFlutter/Pocket` (for example `POCKET_RELEASES_DISPATCH_TOKEN`) scoped only to `PocketFlutter/pocket-releases` with `Actions: Read and write` permission.
   - Once that token is provisioned in `PocketFlutter/Pocket`, a thin trigger workflow in `PocketFlutter/Pocket` can call `gh workflow run pocket-source-ci.yml --repo PocketFlutter/pocket-releases --ref main -f source_sha="$GITHUB_SHA"` on `push` to `main`, and the heavy compilation/test jobs in `PocketFlutter/Pocket` can be retired.

## Web SDK release builds and acceptance

Dispatch [Pocket Web SDK Release](../.github/workflows/web-sdk-release.yml) on `main` with `source_sha` set to the Pocket source commit. The workflow uses the same SSH secret and environment as Pocket Source CI. Leave `publish_release` unchecked to build and exercise the complete macOS arm64 and Windows x64 archives. Both platforms must pass installation, diagnostics, real App/Game execution, input-driven Preview, and Studio lifecycle checks before publishing.

Give `PocketFlutter/pocket-releases` Actions read access to the published `@pocketflutter` SDK packages used by the export. The bundle job reads them using its `GITHUB_TOKEN`. Package publishing and its registry write permission are separate. See [GitHub Packages Actions access](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#ensuring-workflow-access-to-your-package).

Publishing requires the matching `sdk-v<version>` source tag on the selected Pocket commit so authorized source checkouts can fetch it. The release workflow publishes the accepted archives and SHA-256 files as a stable `sdk-v<version>` release in `pocket-releases`. Retire the source repository's tag-triggered archive publisher after this workflow has passed acceptance, before tagging subsequent versions.
