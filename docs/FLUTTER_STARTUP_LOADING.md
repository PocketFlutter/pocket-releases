# SDK startup loading in Flutter containers

## Integration scope and provenance

`PocketApp`, `PocketGuest` embedded in an existing Flutter page, and the low-level
`PocketView` all accept a `loadingBuilder`. The default UI shows progress only during
actual signed remote package or host config loading. Bundled resources, healthy caches,
and local first-frame preparation stay quiet until the frame can be shown. A custom
`loadingBuilder` receives the actual startup stages for local and remote flows.

In the retained parent tree, excluding `pocket_host/`, `lib/main.dart:8` calls runApp
immediately and warms up after the first frame. `lib/ui/mini_app_host_page.dart:57` mounts
the rendering surface directly. There was no portable resource loading API.
`PocketSession.ready` means the runtime can mount. Display of the initial game frame
still requires the resource readiness gate. This SDK retains that gate while keeping
the host UI unobstructed by default. A custom builder can render the available progress.

## Public API

```dart
PocketGuest(
  config: config,
  loadingBuilder: (context, progress) {
    final message = switch (progress.stage) {
      PocketStartupStage.preparingPackage => 'Preparing app resources…',
      PocketStartupStage.startingRuntime => 'Starting the engine and reading runtime resources…',
      PocketStartupStage.decodingInitialResources => 'Decoding first-frame images…',
      PocketStartupStage.applyingDisplayGeometry => 'Applying display geometry and preparing the first frame…',
    };
    final done = progress.resourcesDecoded;
    final total = progress.resourcesTotal;
    return Center(
      child: Text(
        done != null && total != null
            ? '$message\n$done / $total'
            : message,
      ),
    );
  },
)
```

Pass the same option to `PocketApp` or directly to `PocketView` from `package:pocket_flutter`.
The SDK public entry point exports `PocketLoadingBuilder`, `PocketStartupProgress`, and
`PocketStartupStage`. The example shows how to consume the fields. A consumer can replace
the display with a custom image-based screen. Keep the builder limited to rendering.
Loading and game state remain with their existing owners.

## Meaning of the progress fields

- `preparingPackage` reports the existing `PocketSession.stage` as `packageStage` and the
  available download facts. `downloadedBytes` and `totalBytes` are present only if the host
  knows them. Unknown totals produce indeterminate progress.
- `startingRuntime` covers actual runtime creation, package loading, and the native
  first-frame loading boundary. Synchronous FFI has no fine-grained progress ABI for
  decompression or script execution percentages.
- `decodingInitialResources` counts deduplicated images and textures referenced by the
  initial DrawList and auxiliary DrawList as their existing decode futures complete.
  The count describes the active initial frame or geometry batch. Later geometry can
  reference new resources and start another batch. The count excludes unreferenced PAK
  content, story images, and future dynamic resources.
- `applyingDisplayGeometry` consumes the current safe area and display geometry and
  obtains a zero-time layout frame. Any new resources in that frame go through the
  existing first-frame decode gate.

PocketView keeps the existing `_loading` gate, ending it through `onReady` only when
the required resources and safe-area layout are ready. Session.ready and controller
binding alone are insufficient. The default local UI stays blank. A supplied builder
can display the stage. Errors, resource timeouts, and disposal follow the existing
paths. The error surface takes precedence over the builder.

SDK loading covers runtime resources before the first JS game frame. The JS app owns
subsequent business loading, such as language and saved games. The Flutter container
keeps the existing rendering surface dimensions and safe-area forwarding while loading.

## Recorded validation

- Flutter 3.47.9 passed **4/4** upper-layer tests for custom builders, default
  compatibility, error precedence, and forwarding. It passed **39/39** first-frame
  resource, viewport, safe area, cleanup, timeout, lifecycle, idle, and timer
  regressions. A controlled decode progressed `0/2→1/2`. A failed resource
  did not count as completed or open the onReady gate. The regression caught and
  corrected default text overflow in a narrow container.
- Real QJBC compiled with pinned buildGuest and the native Core passed **1/1**,
  with zero skipped. The custom screen disappeared on onReady, actual pointer
  input turned the scene PNG from red to green, and scene capture boundaries held.
- Logs and hashes are in `sdk/.pocket-build/sdk-loading-20261109/acceptance.json`.
  The upper-layer dependency environment is in
  `sdk/.pocket-build/flutter-startup-loading-20261109/manifest.json`.
  The ignored upper-layer package config pointed to Flutter 3.35.7 before the
  test. It was refreshed offline for 3.47.9-compatible dependencies and the
  prior pubspec.lock was restored afterward. The run covers the refreshed
  dependencies. The lower-layer package lockfile stayed unchanged.

Physical phone cold-start time, internal PAK detail, and later dynamic resource
loading were outside this run. The change is in the SDK source. Consumer apps need
to reference the updated SDK and rebuild and install before seeing it.

## Download timeout and progress jumps on 2026-11-09

Flutter-only integration feedback found two existing issues. `PocketSession` previously
capped all of `updates.prepare()` at 20 seconds, shared by active download, 7z extraction,
and assembly. The stage also stayed at downloading after archive receipt until extraction
finished. The revised behavior uses a 20-second network inactivity timeout and a
120-second verification and local preparation inactivity timeout. It emits verifying
after actual EOF and successful archive length and SHA checks, before entering the
extraction worker. Timeout still cancels, foreground cleanup waits at most two
seconds, and signature, content, and health checks remain required.

The default progress bar uses download-byte ratios only in downloading and retry.
Verification and local preparation use indeterminate progress even if the caller
retains the previous byte counters. Unknown stages have no estimated percentage.
Fast transfers, large network chunks, and Flutter frame coalescing can still produce
large visible jumps. The display follows the observed samples without delaying download.

The user's LAN index reported build4 with a 14,536,995-byte 7z, 76,090,251 bytes of
declared content, and 55 files. A cold-cache desktop run observed download samples
of 0 → 179,576 → 3,165,392 → 7,436,572 → 11,070,544 → 14,536,995 bytes. The first
download stage arrived at 79 ms, last byte at 237 ms, verifying at 277 ms, and
prepare completion at 3087 ms. These measure package preparation on that computer
and network. Phone first-frame and cold-launch timing need physical-device data.
Source and raw facts are under `sdk/.pocket-build/download-progress-20261109/`.
The real extraction worker reuses the existing implementation. The retained
parent's decorative YooAsset indicator provided no signed download facts. The
existing downloader and application state remain the only paths.

The package service passed 20 cases. The default indicator and public builder passed
nine. One case passed for intermediate progress and the outer button in a real HTTP
host. One actual downloaded QJBC pointer case passed with zero skipped. The full Session
suite on the stage-timeout version passed 45 with one skipped for missing native
environment. After an equivalent watchdog simplification, both targeted cases passed
for a download lasting more than 20 seconds with continuous progress and for timeout
when stalled. Analysis found no issues. The actual native input case passed again on
final source. The full Session suite was run before the last simplification. The full
and service suite output was observed without saving raw logs. Other logs, saved
metadata, and source hashes are in the directory's `acceptance.json`. Physical-phone
testing and a wall-clock 120-second verification timeout test remained pending.

## iPhone verification stall and progress bar handoff on 2026-11-09

Physical-device feedback reported `verifying, idle: 120s`, which describes a stall
in local preparation. The prior run reported verifying once at archive EOF and hash
verification, leaving extraction, file checks, disk writes, and assembly indistinguishable.
The update reports facts from those existing I/O boundaries as they complete, independently
of when the worker returns its final result. Callbacks with unchanged progress leave the
deadline in place. Actual stalls still trigger the 20- and 120-second limits.

- The service adds `PocketPackagePreparationProgress` with `decodingArchive`,
  `verifyingFiles`, and `assemblingPackage` and the known
  `processedBytes/totalBytes` and `processedFiles/totalFiles` per stage. Decoding
  reports across the existing worker port when output grows by at least 256 KiB.
  File counts advance after SHA verification and disk writes. Assembly counts
  use the existing I/O boundaries. `PocketUpdateProgress.preparationProgress`
  shares the same fact object. Updates come from actual work and reuse the decoder's
  existing message path.
- Custom builders receive `packagePreparationStage`,
  `packageProcessedBytes/packageProcessingTotalBytes`, and
  `packageProcessedFiles/packageProcessingTotalFiles` in `PocketStartupProgress`.
  These are distinct from network bytes and first-frame image counts. The default
  text distinguishes extraction, verification, and assembly and shows real counts.
- The default download bar stays visible through verifying. When actual byte counts
  show completion, it displays “Downloaded … 100%.” The filled portion interpolates
  to the observed target over 200 ms. Text and accessibility semantics report actual
  byte facts. Later processing has its own activity indicator and completion counts.
  Download, extraction, and onReady proceed independently of animation. An initial
  verifying sample of 100% still shows a fill transition. Unknown totals and cached
  paths without a download omit download completion.
- The LZMA ablation replaces per-byte read and write calls and repeated dictionary
  checks with one validation followed by non-overlapping `Uint8List.setRange`
  expansion. It retains distance-one overlap, dictionary reset, and output limits.
  Extracted 7z files use separate non-overlapping views to avoid copying roughly
  76 MB of content again. Regression coverage verifies they remain independently
  mutable. Archive and file hash checks remain required.

On the same computer and actual archive with Dart VM `--optimization-counter-threshold=-1`,
old and new decoding took 15.396 and 11.695 seconds, about a 24% reduction. This is a
CPU comparison. iPhone acceptance requires a physical device. The retained parent
excluding pocket_host only had decorative YooAsset progress. The change adapts
the retained worker and signed package pipeline.

Evidence is under `sdk/.pocket-build/iphone-preparation-20261109/`. A read-only probe
found a FunApp debug session on an iPhone 15 Pro Max. The probe did not obtain VM
isolate state, and the log window had no attributable extraction data. Whether the
worker was suspended and whether the 120-second problem persists remained open.
Device acceptance requires updating the dependency, restarting, and observing the
new extraction byte and file progress through completion.

## Dynamic remote containers

`PocketSystemHost.fromHostConfig` displays real Session package progress and errors
while the signed catalog still awaits a matching root runtime generation and remote
preparation is in flight. After download, local catalog and mount admission remain
quiet and still gate creation of `PocketView`. Debug containers that read the host
config before calling the SDK must wire `PocketHostConfig.load` with `onProgress` and
a cancellation token. `PocketView.loadingBuilder` applies after mounting.

## Local startup on 2026-11-10

The default SDK indicator follows confirmed remote work from
`PocketSystemHostApplication` host config reads and `PocketSession` signed package
preparation. With no remote entry, delayed local catalog reads stay quiet. A healthy
already-loaded cache can show its local content while cache-first updates run in
the background. After package transfer, `PocketSystemHost` keeps the background
color while waiting for the local catalog or first frame.

Low-level `PocketView` has no separate remote source and stays blank by default
before the first frame. An explicit `loadingBuilder` still receives runtime,
first-frame resource, and display geometry progress. Host startup and PocketView
runtime or resource errors still show the error surface ahead of the custom builder.

## Default native extraction and shared app source on 2026-11-09

A follow-up added `pocket_archive` as a default `pocket_sdk` dependency. Session uses
native 7-Zip for verified 7z packages and takes that default decode path off the
Flutter debug isolate. Archive signatures, length, SHA, and per-file size and SHA
checks remain required. Native extraction takes a path and writes to private staging.
Successful verification is followed by a same-filesystem rename into storage.
Cancellation waits for the actual native future before cleaning up. At the user's
request, the pure Dart 7z encoder, decoder, and LZMA implementation were removed.
7z uses the native path only. Standalone services surface an error when no native
extractor is injected. Existing ZIP behavior is preserved. The default SDK reports
native failures directly.

FunApp's `unzip_kit` native ZIP core moved to a public package. The app keeps only a
Dart compatibility API and removes duplicate native source, plugin, and build
entry points. Password, directory replacement, and rollback tests remain. The five
Pocket packages in FunApp Dev reference the workspace. Release configuration
continues to use a pinned commit. See [Native archive integration](NATIVE_ARCHIVE_INTEGRATION.md)
for provenance, platforms, and installation.

The actual Flutter/macOS container extracted the same 14,536,995-byte package via
MethodChannel in 804 ms and 1989 ms. Both runs verified all 55 files and 76,090,251
bytes. Including Dart re-verification, timings were 1315 ms and 2646 ms. Host load
varied across samples. The FunApp iOS native target and Android host plugin AAR
built successfully. These results cover installation, compilation, and real native
extraction. iPhone startup timing after reinstallation remains separate. Flutter
3.35.7 passed the full Session suite at 46/46, including actual QJBC input without
skips. The loading UI and host suite passed 15/15 and FunApp compatibility passed 9/9.

The pure Dart LZMA experiment and timings remain historical evidence. Production
uses the single native implementation. The Dart-specific cases were removed with
the algorithm and the compressed fixture moved to native Core regressions.

After Dart 7z removal, the full service suite passed 86/86 under the Flutter runner
with clean analysis. Combined Session and Loading passed 61/61, still covering
real QJBC input. The missing-extractor regression confirmed the resource stream
remained unread.
