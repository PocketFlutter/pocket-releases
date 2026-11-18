# Remote Container Loading Progress

## Loading Sequence

A remote Editor App URL loads in two stages. First it reads the package index, host descriptor, and bootstrap metadata. The existing signed update coordinator then downloads and verifies QJBC and PAK. Flutter reports essential startup resource IO before JS can run. JS owns business UI, routing, and application data requests.

`PocketSystemHostApplication` and `PocketGuestSession` share the internal startup indicator. It shows the current stage and received bytes. It displays a percentage when a trusted total is available and an indeterminate bar otherwise. Host configuration counts bytes for the current HTTP resource. Package downloads use the update coordinator's cumulative file counts. Progress can restart between stages because each has its own scope. Verification and runtime preparation still follow 100% download.

## Sources and Adaptation

The source-first review inspected the retained parent, excluding `pocket_host/`.

- `pocketjs_flutter_demo/lib/ui/mini_app_host_page.dart` separates the host surface and JS content, but lacks signed remote package progress.
- `pocketjs_flutter_demo/lib/core/pocketjs_bundle_runner.dart` has YooAsset stage labels. The current SDK requires its own actual network byte counts.

The implementation reuses `PocketUpdateCoordinator` streaming byte feedback. `PocketSession._prepareOnOpen` previously stored only a stage without notifying the host and discarded byte counts. It now exposes read-only `transferProgress`, notifies existing listeners, and clears progress on completion, failure, or cancellation. Update checks still send `updates.progress` to JS from the same observation function.

Host configuration loads before session creation. A dedicated resource IO callback covers this gap and uses existing source, redirect, size, hash, and trust checks.

Remote container acceptance also found default black configuration error text on black backgrounds. Startup errors now use Chinese messages and a contrasting color. When a link changes, FutureBuilder ignores old results for the new request and late progress from the old request cannot overwrite current state.

The Lantern remote link runs `pocket.demo.lantern` as root. The former default always used generic SystemUI policy and ignored the approved local policy for the same ID, so the roughly 69 MB PAK exceeded the default 8 MB limit. Root resolution now prefers the matching local app policy and falls back to SystemUI policy. `withNativePolicy` still preserves remote package identity, update source, and compositor data. The global limit stays the same, and resource allowances come from local policy.

## Ablation and Ownership

- Reuse the existing downloader, network byte reporting, and update lifecycle.
- Replace both unlabeled startup spinners with one stateless internal component.
- Keep startup feedback outside running SystemUI business UI. The compositor and first-frame admission gates still apply.
- The SDK default entry connects automatically. Consumers awaiting `PocketHostConfig.load` before `runApp` should render their own feedback using `onProgress`, because the SDK is not yet mounted.
- JS handles remote data and image loads inside the app. Lantern reuses its own startup page to show four actual reads, without duplicating its state in the host.

## Consumer Integration

The default `PocketSystemHostApplication` receives its URL through `POCKET_HOST_CONFIG_URL` and shows both startup stages automatically.

### Exit and Cancellation During Load

A Debug page should push the container route first so the SDK can load asynchronously within that route. Pass dynamic URLs directly to `PocketSystemHostApplication.hostConfigUrl` for managed progress and cancellation. A host back-and-exit control remains usable while JS initializes. System back and Esc also work.

On exit, return to the outer Navigator first, preserving its state, then clean up asynchronously. A standalone host without an outer route opens its bundled main screen. Consumers can handle navigation with `onExit`. SDK network and plugin cleanup outside that callback does not delay departure. Changing URLs, exiting, and unmounting cancel the current config request. Disposal of the surface cancels the remote session's download. Late Future completions cannot remount the container.

`PocketHostConfig.load` and `loadFromEnvironment` accept optional `PocketCancellationToken cancellation`. Custom `loadHostConfig` retains its old signature. Custom loaders own their IO cancellation token, while the SDK suppresses late results. Use `hostConfigUrl` for built-in cancellation.

A custom Debug URL input page can use the optional callback if it owns config loading.

```dart
final config = await PocketHostConfig.load(
  Uri.parse(appUrl),
  onProgress: (PocketHostLoadProgress progress) {
    // Update the startup UI with stage, downloadedBytes, and totalBytes.
    // Use indeterminate progress when totalBytes is null.
  },
);
```

Existing `PocketSession` ChangeNotifier subscribers can read `stage` and `transferProgress`. Progress reports received bytes only. The existing verification chain still governs resource admission. Discard the previous progress object on reopening, failure, or closure.

## Acceptance Record

Acceptance covered actual chunked HTTP notifications, known and unknown totals, stage transitions, and cleanup after success, failure, cancellation, and reopening. The startup indicator appeared on desktop, the user's remote Lantern package opened, and keyboard input entered the story. A separately generated pinned-compiler QJBC/PAK fixture was downloaded and executed natively. A button click changed `Downloaded count 0` to `Downloaded count 1`.

On 2026-11-09 the real LAN index read passed. Progress callbacks reported `index 2374/2374`, `descriptor 3352/3352`, and bytes for two bootstrap assets. macOS Demo opened the same link, showed host initialization progress, and reached the Lantern title page. Return entered a character dialogue scene. The test process detached and the desktop app remained running.

```sh
cd sdk
flutter test test/pocket_startup_indicator_test.dart \
  test/pocket_host_config_test.dart test/pocket_host_loading_test.dart \
  test/pocket_background_test.dart test/pocket_system_host_test.dart \
  test/pocket_bundled_application_catalog_test.dart

POCKET_NATIVE_LIBRARY="$PWD/native/target/release/libpocket_flutter.dylib" \
POCKET_ON_DEMAND_FIXTURE_DIR=/tmp/pocket-on-demand-fixture-verify \
  flutter test test/session_download_on_open_test.dart
```

The second command needs a compiled native library and a fixture from `scripts/tests/on_demand_fixture.ts` through pinned `buildGuest`. FFI input testing used an existing fixture. The actual remote Lantern package was verified independently on desktop.

The startup indicator, config, background, policy, and host group passed 25 tests. The session group passed 39, including FFI input. Total 64, zero skipped. Changed Dart files passed static analysis.

### Separate Limitation in Remote Lantern

The supplied index identifies the ordinary Lantern app as a SystemUI root package through `aggregateHostConfig` and release index generation in `sdk/editor/server.ts`. Lantern does not install `installPocketSystem`, while `PocketSystemHost` routes `platform.*` to the root JS kernel. In the old test package, each storage request waited 30 seconds before the app's catch handler opened the home page. Current Lantern reads concurrently and falls back on genuine bridge timeouts. This is independent of package progress.

A later fix should distinguish single-app containers from multi-app SystemUI releases. Either host the ordinary app in a SystemUI shell that installs the JS kernel or provide JS and storage capabilities matching the single-app host. Keep app routing in JS and report actual storage outcomes. The storage routing issue remains open.

### Cancellation and In-Game Loading Acceptance (2026-11-09)

The implementation preserves cancellation-token and chunked-read semantics from parent `pocket_services/lib/src/pocket_package.dart` and `pocket_update.dart`. Configuration uses the shared SDK cancellation token to abort the active HTTP request while preserving any shared consumer HttpClient. Bootstrap hashing runs in a background isolate. Cancellation while awaiting its result prevents requests for later resources.

`flutter test test/pocket_host_loading_test.dart test/pocket_host_config_test.dart` passed 13 tests for waiting on headers, chunked bodies, subsequent shared-client requests, suppression of progress and resource requests after cancellation, button/Esc/system back, and stale result isolation. In macOS Demo, leaving Lantern's actual remote startup page returned to the bundled main screen. Clicking the counter changed JS text from 00 to 01. Widget routing tests verify retention of outer-route state.

The fixed test index started at `0.1.0-test.2`, whose game loading page displayed only `正在翻开雾港手机` (opening the Mist Harbor phone). Current Lantern JS already provides a title, decoration, and four actual startup read indicators. The existing local Editor publish endpoint updated the same index to `0.1.0-test.3`, then to `0.1.0-test.4` after removing startup artwork. `bun test tests/novel_startup_native.test.ts` passed three tests and 31 assertions for actual bytecode frames from 0/4 through 3/4, concurrent read timeout, and clicking into the story. These indicators track app initialization. Host IO feedback still covers package delivery.

ZIP and 7z extraction and per-file hashing reuse existing verification in a terminable isolate. Only file paths cross the boundary. Cancellation terminates the worker and finally cleanup removes temporary directories. Verified blobs enter cache only after validation, without advancing active or healthy pointers. `pocket_package_update_test.dart` covers main-isolate heartbeat during 12 MiB ZIP/7z processing and cancellation of 32 MiB 7z processing. Synchronous runtime loading of QJBC and PAK remains at the native FFI boundary. Runtime initialization latency varies with input size.

Desktop review showed that verified healthy cache can still start an older release under existing update policy. For a cold test of the new package, the cache directory `host_0618ad6020ecb93001bf39ee` was backed up by renaming it with `.before-loading-test3-120758`, preserving old data. The new package home appeared after download. Publishing to a fixed index and a consumer running Check/Apply are separate events.

The Lantern startup fallback replaced decorative `NovelSkinFrame` imagery with the existing background color and a simple border. All four read states, labels, and readiness conditions remained. Startup feedback no longer depends on image decoding. After rebuilding through the pinned buildGuest, new QJBC, PAK, and metadata were downloaded to `/tmp/pocket-lantern-loading-final` for native tests. Three tests and 33 assertions passed. Initial and 1/4 frames had no image or textureTriangle operations. The later 2/4, 3/4, title page, and story entry were also verified. Device timing governs the first-frame gate, with no artificial delay.

The final run of `session_download_on_open_test.dart` passed all 39 tests including real native pointer input. Together with the 13 configuration/back tests and three Lantern tests, 55 passed. Extraction worker tests are counted separately. Static analysis passed for five changed host files.

Final test package `0.1.0-test.4` retained the fixed URL. The test3 cold-start cache was backed up separately as `.before-loading-test4`. Local acceptance backups are excluded from source and SDK delivery.

The same new assertion failed against old bundled QJBC, detecting 18 image draws on the first startup frame. Recompiled QJBC had zero and passed all three tests. Using the fixed URL, macOS Demo displayed the Lantern title, `正在读取语言偏好` (reading language preference), `已完成 0 / 4 项启动读取` (0 of 4 startup reads complete), and individual read states. The host back control remained visible. Flutter visibility was verified in addition to native Guest tests.

The package update file passed all 17 tests. The heartbeat test measures from the final download block to processing completion and tracks the longest timer gap. It requires at least ten responses and a longest gap below half the processing window. Cancellation covered actual 32 MiB 7z. Combined with the earlier 55, final results were 72 passed, none skipped. Targeted package source and tests passed static analysis and `git diff --check`.

### Black Background While Waiting for the Dynamic Catalog

`PocketSystemHost.fromHostConfig` uses a dynamic signed catalog. It previously returned a `ColoredBox` while the catalog was not bound to the current runtime generation, obscuring both package progress and errors from `PocketGuestSession`. Outer config loading and a standalone `PocketGuest` test cover only parts of that consumer path. The same catalog gate now reuses `PocketStartupIndicator` with root session `stage` and `transferProgress`, prioritizing errors. `PocketView` creation and compositor startup still wait for catalog verification. The implementation adds no download or startup lifecycle.

FUN App enters through `funapp/common_lib/packages/tryfun_pocket/lib/src/pocket_remote_container.dart`. It loads host configuration before entering the SDK and needs `PocketHostConfig.load(onProgress:)` to display byte counts in its own UI. Retrying, changing URLs, and unmounting should cancel existing IO to prevent stale reports. FUN App pins a Git dependency, so update its pinned commit, rebuild, and restart the mobile app after integrating this change.

On Flutter 3.35.7, `system_host_catalog_loading_test.dart` uses a real signed package and chunked HTTP. It asserts that stage text refreshes as bytes increase from 64 KB to 128 KB, `PocketView` stays absent while the dynamic catalog is held, outer buttons work, and catalog failure shows an error. Together with `pocket_system_host_test.dart`, five tests passed, as did targeted static analysis. Restoring only the old `9765d2a` gate in isolation made the regression fail because the progress bar was absent. The new implementation passed. This verifies the Flutter widget and real HTTP path. FUN's actual mobile page requires separate acceptance.
