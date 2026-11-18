# Live2D Subpixel Precision and High-Resolution Acceptance

On 2026-11-08, the user reported that full-body characters looked blurry, while close-ups were somewhat sharper, as though Retina were disabled. This pass investigated display scale, source textures, and model coordinate precision independently. Large exported screenshots cannot replace device acceptance.

## Reproduced Findings

- The current macOS session's `NSScreen` reports only 1920×1080 and `backingScaleFactor=1`. A desktop window at native DPR1 establishes neither Retina device behavior nor that the application disabled Retina.
- The existing Flutter painter receives actual `View.devicePixelRatio` and paints the mesh directly on Canvas. The pipeline never scales a fixed 329×600 model bitmap. The two source model pages are 2048×2048, and LOD selection already factors in DPR.
- The pinned Core's `draw.rs::emit_tex_tri` applies `roundf` to clipped model vertices and packs integer XY. Native PFB and Dart already support float32 coordinates but cannot recover fractions lost upstream. At DPR2, rounding by 0.5 logical pixels can shift a point by a physical pixel. This establishes a precision loss. Its contribution to overall perceived blur still needs measurement.
- Source and staged PNGs have identical hashes and use 2048×2048 8-bit/channel RGBA. Staged PAK `3d775a1f…` carries two PSM8888 pages with 16,777,216B of pixels each. Standard PNG unfiltering produces bytes identical to the PAK payload, with no downscaling, 5650/4444 quantization, or lossy encoding. Flutter converts straight to premultiplied alpha once during resource decoding. The model shader performs no additional explicit premultiplication.
- Existing DrawList 8/14 and ordinary UI behavior must be preserved. Floating-point model output is a necessary adaptation of the pinned renderer and adds no layout engine or renderer.

## macOS Display-Mode Evidence

Demo's Info.plist already specifies `NSPrincipalClass=NSApplication`. Apple distinguishes automatic Cocoa adaptation from system-scaled low-resolution mode. The absence of an explicit `NSHighResolutionCapable` key cannot establish that the current app runs in low-resolution mode. This pass left the plist unchanged and logged native 1× screen metrics separately from injected 2× metrics. [High Resolution Guidelines](https://developer.apple.com/library/archive/documentation/GraphicsAnimation/Conceptual/HighResolutionOSX/Explained/Explained.html)

## Original Implementation Baseline

`lantern-letter-showcase-20261108/model-profile/` and `model-profile-dpr2/` retain real Core Profile results, screenshots, and required/completed `model-showcase` checkpoints for d139f62d… QJBC / 3d775a1f… PAK. Native DPR1 and test-view 329×600/DPR2 passed motion, masking, full-body and close-up, pause/resume, release, and main-save isolation. Manually inspected DPR2 screenshots were 658×1200 and still showed stair-stepping along the character silhouette.

The tests inject logical size and DPR. Physical Retina displays, iOS and Android devices, and OS display changes still need acceptance. The original screenshots leave the user's report open.

## Fix and Validation Method

- DrawList appends 15/16 for clamp/repeat floating-point textured triangles. Each record has 15 words: op, texture, three float32 x/y/u/v groups, and color. Existing 12-word 8/14 records are unchanged. The retained PMS1 mesh and its mask are the only users of the new records.
- Native projects new XY/UV values directly into existing PFB float32 points. The PFB version and Dart model need no new state or tag. Coverage checks truncation, non-finite coordinates and UVs, sampling modes, and JSON/PFB precision.
- Optional `POCKET_MODEL_SUBPIXEL_ABLATION` in `novel_model_showcase_test.dart` fixes one real production model frame, then draws floating-point, rounded, and downscaled 4×DPR diagnostic images with the existing painter, original textures, and LOD. It requires real noninteger coordinates through Core→DrawList→PFB. A one-variable comparison requires the identical pose.
- The 4× image is a diagnostic reference. `drawVertices` geometry antialiasing, texture sampling, and physical display pixels remain separate factors. The coordinate precision fix alone cannot establish that all blur is gone.

## Measured Results and Scope

- Final model Guest: QJBC `b4e05229c4b70f17841fe28685a86c1b1d71e92c766416072ab0d7924db1469b` (1,081,051B), PAK `3d775a1fc3e773d17d73d3d45e73618adbd2a2fa52d5d4785e839fc7bcf48876` (69,216,400B). Native static library SHA `86a75823a5a0d638294f1cefcbec74f00915166661acc14b7a7efaf1e94d20e0`. The new native-only toolkit omitted previously compiled WASM.
- Real macOS Profile at 329×600 / DPR2 passed the official Core model interactions in **59 seconds**, with complete required/completed `model-showcase` driver checkpoints. The test verified three full-body poses, close-up, masking, pause/resume, reentry, handle release, and main-save isolation. Manual inspection confirmed both shoes were fully visible in the final full-body screenshot. The actual model frame carried 3,199 Hiyori triangles and 19,194 noninteger coordinates through Core→DrawList→PFB to Flutter without prior rounding.
- The same-frame ablation captured all **98 model painter blocks** with their mesh-layer boundaries and order. Blocks may contain adjacent UI or atmosphere ops and cannot stand in for a clean full-scene composite. The variants change only whether Hiyori coordinates are rounded. Mean premultiplied RGBA pixel errors against the downscaled 4×DPR reference fell from 4.372 to 1.690 in the head crop and from 4.579 to 2.092 in the face crop. These local errors do not quantify perception, the full screen, other poses, or physical-device quality.
- The montage shows rounded coordinates on the left, floating-point coordinates in the middle, and the 4× reference on the right. The region coordinates, scripts, original PNGs, driver logs, checkpoints, and per-file hashes are in `sdk/.pocket-build/live2d-subpixel-20261108/model-profile-dpr2-final/`. Earlier candidate a40a4759… passed the same real Core test and has a separate archive. [Head crop](../.pocket-build/live2d-subpixel-20261108/model-profile-dpr2-final/head-comparison.png)
- The same final Guest and native library passed model Profile under native macOS metrics in **57 seconds**. The actual content area was 329×600 at DPR1 with `testViewMetrics=false` and no size or DPR override. Motion, masking, pause/resume, release, and save isolation passed with complete required/completed checkpoints. Seven original PNGs, coordinate ablation, and the artifact manifest are in `sdk/.pocket-build/live2d-subpixel-20261108/model-profile-natural-final/`. This verifies native scaling for the current system session.
- Native legacy repeat and new float clamp/repeat projection tests passed **2/2**. Coverage includes fractional XY/UV, samplers, JSON/PFB, truncation, and rejection of NaN and Infinity. PMS1→Core integration passed **5/5**, DrawOps decoder passed **6/6**, and targeted raster/present regressions and patch forward/reverse replay passed. Independent read-only review found no blocker in native/PFB or the same-frame ablation.
- On the new native probe, the final Guest passed **32/32** regressions (1,414 assertions) spanning three main-story endings, saves/rollback/gallery, v1/v2/v3 migrations, feature tour, and parallax. See `/tmp/pocket-subpixel-final-native-regression-20261108.log`.

The fix eliminates model coordinate precision loss and improves the measured crops. Geometric edge antialiasing in Flutter `drawVertices` remains a separate limit. The production path has yet to match the fine edges in the 4× diagnostic reference. The current session is 1×. Physical Retina, Android and iOS devices, live OS display changes, and full performance and stable RSS under the new build still need verification. The overall goal remains open.

## Standard Demo Launch Fix

The first standalone launch captured an Objective-C forwarding exception from `AppDelegate.applicationDidFinishLaunching`. The retained parent's `macos/Runner/AppDelegate.swift` has no override. Neither the local Flutter 3.47.9 `FlutterAppDelegate` implementation nor its binary method table defines `applicationDidFinishLaunching:`, an optional `NSApplicationDelegate` protocol method. Demo called `super` directly and hit the unimplemented selector. The minimal adaptation removes that call and preserves the existing window presentation without new lifecycle state. The standalone exception log remains failure evidence. Window presence and mapped libraries alone cannot establish Guest readiness.

## Standard Demo Package

Standard `lib/main.dart` macOS Profile was rebuilt and copied to `sdk/.pocket-build/lantern-playable-retina-20261108/pocket_host.app`. Six Root UI/Lantern QJBC, PAK, and metadata files matched staged assets byte for byte, and `codesign --verify --deep --strict` passed. `open -n` launched PID 84903 with an 800×632 onscreen window and Metal. The earlier AppDelegate exception did not recur, and the process exposed an authenticated VM Service listener. Editor stayed stopped and user saves were retained. Previous PID 41682 had already exited.

The first direct executable launch exited. Signature details in its log leave the cause uncertain. After standard bundle verification, `open -n` launched successfully without resigning or changing system security policy. The launch manifest, first failure log, final window observations, and asset hashes remain in the cache directory.

The pass produced no independent evidence of foreground game pixels or main-isolate business initialization. The later investigation traced the English long-form store discrepancy to redundant autosaving on locale rebuild and fixed it. T02 later passed full acceptance. [Final Flutter long-form acceptance](LANTERN_LETTER_SHOWCASE_FLUTTER.md)

## Remaining mesh-edge boundary (independent read-only check)

The pinned Flutter engine's `engine/src/flutter/display_list/dl_op_flags.h`
`kDrawVerticesFlags` excludes `kUsesAntiAlias`; `lib/ui/painting/canvas.cc`
applies that flag mask. Consequently a Dart `Paint.isAntiAlias` toggle is not
an evidenced coverage-AA fix. The current SDK's filtered mip generation and
bilinear ImageShader sampling address texture minification, not silhouette
coverage. No duplicate DPR coordinate scale was found: the production painter
uses layout/frame scale and Flutter applies the view DPR; DPR² is intentional
in the two-dimensional mip-area calculation.

The existing 4× diagnostic also gives its higher DPR to the mip selector, so
it may choose a different image level. It remains a diagnostic reference for
the float/rounded comparison, not an isolated AA comparator. Any subsequent
AA experiment must pin the same selected image level as well as pose, masks,
blocks and viewport. An engine-side coverage experiment and its pixel/frame
cost have not been implemented or accepted. Do not substitute a no-op Dart
flag or a softer filter for evidence of smoother silhouette geometry.

## Later Standard Playable Build

The standard Demo at this point was `sdk/.pocket-build/lantern-playable-locale-20261108/pocket_host.app`, PID 15377, QJBC `9c01ae0d…` / PAK `3d775a1f…`. The only change was JS autosave listener checkpoint initialization. Model geometry, textures, and the native library stayed the same. Signing, byte identity of the six embedded resources, the onscreen window, and the VM listener were verified. Foreground game pixels still lacked independent evidence. The earlier b4e model and 4× diagnostic images remain evidence for that frozen build. The 9c01 build did not remeasure model FPS, RSS, or image quality. Once the new build was ready, only the earlier standard Demo PID 84903 was stopped. Editor stayed down and user saves were retained. The new cache directory's `manifest.json` records artifacts.

## Repeat Edge Sampling with LOD Fixed

On 2026-11-08, the `9c01ae0d…` Guest completed four-pose Profile runs at DPR1 and injected DPR2. Both drivers passed and archived 48 diagnostic images and eight standard frames. This experiment fixed painter DPR, textures, and LOD inputs and changed only raster sample factor. The 2× output was closer to the 4× reference in all eight silhouette regions. Production clarity acceptance and per-frame offscreen supersampling remain separate. [Fixed-LOD edge sampling ablation](VISUAL_NOVEL_MESH_EDGE_ABLATION.md)

## Corrected Window Antialiasing Path

The pinned source shows that `FlutterDartProject.mm` returns YES when `FLTEnableImpeller` is absent, and the Demo plist leaves it enabled. Metal's `SwapchainTransientsMTL::GetMSAATexture()` uses kCount4. `SurfaceMTL` binds that attachment, and `VerticesContents` selects the pipeline by the pass sample count. The current macOS window mesh therefore has 4× coverage sampling. The missing `kUsesAntiAlias` flag only establishes that the Dart Paint switch cannot control it. The earlier inference that the window lacked mesh AA based on this flag or flutter_tester/Skia pixels was incorrect. Impeller snapshots also support MSAA, and offscreen images cannot all be treated as single-sample. Window and physical Retina quality still need acceptance. The reproduced per-batch texture LOD selection issue is the current focus. [Impeller availability](https://docs.flutter.dev/perf/impeller) · [Antialiasing](https://docs.flutter.dev/perf/antialiasing)

## SSAA2 Acceptance Progress (2026-11-08)

- One frozen Guest (QJBC `9c01ae0d…` / PAK `3d775a1f…`) completed four same-frame pose comparisons on macOS 800×600/DPR1 and test-view 329×600/DPR2: full-body, close-up, full-body idle0, and full-body tapbody. Both driver matrices passed. A/B JSON and screenshots are in `sdk/.pocket-build/mesh-span-ssaa-ab-20261108/actual-desktop-dpr1/` and `actual-mobile-dpr2/`. Actual painters replayed offscreen, so these images quantify no perceived-sharpness percentage.
- Each A/B preserves ordered mesh span partitions captured from the real widget tree and the original 32-op painter split. SampleScale 1 group replay was pixel-identical to replay of the original painters in all eight viewport/pose combinations. SampleScale 2 changed visible pixels, establishing a different sampling path. The overall blur remains open.
- The merged six-file SSAA2 focused suite passed **34/34**, and SDK analyze was clean. Post-paint `ui.Vertices` were released. Profile snapshot counters also recorded Dart `ui.Image` handle disposal. These facts do not establish completion of GPU work still in flight.
- The near-deadline Ticker experiment's five 10-second windows showed no meaningful improvement. Its flag, scheduling branch, and dedicated tests were withdrawn from the SSAA2 candidate. [Wake deadline audit](VISUAL_NOVEL_WAKE_DEADLINE_AUDIT.md)
- The standard main Demo's `POCKET_MESH_SUPERSAMPLE=2` Profile app was built, signed, and copied to `sdk/.pocket-build/lantern-playable-ssaa-20261108/pocket_host.app`. At this point it had yet to launch, and the full 20-window soak was running as session 55369. Final RSS and stability gates, normal package launch, and foreground behavior were pending.

800×600/DPR1 is the current 1× macOS session. 329×600/DPR2 overrides test viewport metrics. The evidence leaves complete blur elimination, physical Retina, and frame-rate targets open pending the full soak and normal package launch.

## Standard Package and Full 20-Window Results

The standard main `POCKET_MESH_SUPERSAMPLE=2` Profile app launched from `sdk/.pocket-build/lantern-playable-ssaa-20261108/pocket_host.app` as PID 46513. Observed facts included signing, byte-identical local and staged versions of six embedded Guest files, an 800×632 onscreen window, layer 0, and VM listener 53331. The authenticated VM-main probe failed to obtain an authenticated URL. A separate CUA/native pipe launch failed and the browser host was unavailable. The Guest main isolate and foreground game pixels remained unverified. After confirming PID 46513 was ready, the prior standard Demo PID 15377 received SIGTERM. Daemon PID 39062 and user saves were retained. Editor stayed down.

Full20 soak session 55369 exited 1. Across 20 model entry/exit cycles, handles and triangles returned to zero every time. Snapshot creation and disposal counts both reached 8,075. RSS samples in cycles 7–10 were unstable and failed the stability gate. Median RSS differed by 180,224 B (about 0.029%) between the first and last five cycles. Both growth limits were met, but stable sampling was also required. Seven full-game windows and five model windows completed. Model build P95 across the five windows was 15.013, 14.852, 14.313, 14.144, and 15.310 ms, all above the 12 ms target.

Package launch verifies the window, resources, and VM listener. Foreground content still lacks evidence. The full20 stable RSS and build P95 gates remain open, as does physical Retina and mobile validation. The overall goal remains incomplete.

## Follow-up Clarity Review and PMS1 A/B (2026-11-08)

An independent source review found no fixed low-resolution model bitmap or missing host DPR multiplication. Demo retains the parent's resizable window and 800×600 initial content area. 800×632 includes window decorations. The current native backing scale is 1. Injected DPR2 imagery cannot represent a physical Retina display. Full-body and close-up reuse the same 2048² texture with story scales of 1.5 and 3.5, giving the close-up head more final pixels. SSAA2 on a 1× display still resolves to the same physical pixel budget. Neither blur resolution nor an incorrect mip selection follows from that fact. The next comparison fixes one 2× snapshot, LOD, partitions, and pose and varies only low/medium/high downsampling to inspect texture and edges.

The retained small JS PMS1 batched-write candidate ran one sequential A/B in real Flutter Profile. Each condition had five 10-second model windows and two rounds of handle release. Both drivers exited 0. Median window P95 changed from 9.964 to 9.547 ms native, 14.462 to 14.039 ms build, 0.485 to 0.524 ms raster, and 25.126 to 24.973 ms totalSpan. Median overBudget stayed at 5. The candidate changes no image quality and remains above 12 ms build. Original artifacts are in `sdk/.pocket-build/pms1-real-profile-20261108/comparison.json`. [CPU sampling](VISUAL_NOVEL_CPU_SAMPLING.md)

Candidate QJBC `396b07fc…` / PAK `3d775a1f…` was staged and the existing Guest was backed up verbatim. Standard PID 46513 was still the earlier standalone 9c01 SSAA2 build. The next full20 first failed during build at a generated framework with lipo EEXIST. After archiving that single file, Git in the Flutter wrapper reported `.git/config: Operation not permitted`. Calling the cached same-version Flutter tool directly read the version, but xcodebuild could not read the Demo macos directory. The attempts never entered runtime and establish neither full20 nor image quality. Source permissions, user saves, and the existing window and daemon were preserved. Logs and state are in `sdk/.pocket-build/pms1-real-profile-20261108/full20/manifest.json`.

### Recovery Checks and Filter Test Entry Point

Explicit `xcodebuild -list -project Runner.xcodeproj` resolved the existing local Swift packages. The cached same-version Flutter tool still reported an unreadable directory during auto-discovery. Explicit workspace compilation also resolved dependencies, but the official Prepare Flutter Framework Script called the Flutter wrapper and hit Git EPERM on `.git/config`, so it produced no app. Source review found no supported switch that skips preparation while preserving the dependency system. The pubspec SPM configuration, Flutter wrapper, and system permissions stayed intact. macOS supports `--use-application-binary`, but this pass had no new binary to run. See `recovery-environment-probe.json` in the same full20 directory.

The existing `novel_mesh_span_diagnostics.dart` gained opt-in `captureNovelMeshSpanFilterAblation`. The showcase test calls it at full/closeup capture points only with `POCKET_MODEL_MESH_FILTER_ABLATION=true`. It records one transparent, full-surface 2× snapshot from actual captured ordered partitions. It varies low/medium/high on that same image and records a separate direct 1× reference with different DPR/LOD. Actual model bounds support later manual eye, hair, and clothing crops without an automatic crop layer. This full-surface async picture replay changes only the final filter and makes no claim of pixel identity with production cropped `toImageSync`. Dart format and two-file analyze passed. The coordinator later added one message documenting the method's limits. It had yet to run or capture images, so no quality conclusion or production filter change followed. Test status and source hash are in `sdk/.pocket-build/pms1-real-profile-20261108/filter-test-status.json`.

System screen capture permission preflight returned false. The pass neither prompted for access nor bypassed it. The normal app's foreground pixels and physical Retina still lacked independent evidence. The test entry point and static checks cannot substitute for actual interactive model, window quality, and performance/RSS acceptance.

### Clarity Acceptance Still Open

Existing native DPR1 `ordinary-full.png` and `ordinary-closeup.png` are both 800×600. Close-up gives the face more final pixels. This observation establishes neither correct downsampling nor that the user's device causes the full-body detail loss. Production filters, models, system DPR, and the standard standalone package stayed intact.

To distinguish macOS app build failure from Dart Canvas test failure, the cached pinned 3.47.9 `flutter_tools.snapshot test --no-pub` was invoked directly. Loading `pocket_mesh_span_sampling_test.dart` immediately reported a shell subprocess segmentation fault before the test body started. The shell's `tee` exit status could not establish success, and the runner explicitly marked failure. A successful future software test cannot replace standard Metal window and physical Retina acceptance. See `/tmp/pocket-mesh-span-sampling-cached-snapshot-20261108.log`.

A test-only copy in `/private/tmp` retained the same 3.47.9 Dart, Flutter packages, engine, and absolute dependency paths. After adding the existing shaders and package graph, Flutter exited 1 preparing test assets. Official `impellerc` exited -11 for `stretch_effect.frag` and threw `ShaderCompilerException`. The test body never started. Production code, Flutter wrapper, and system permissions stayed intact and no comparison images were produced. Log: `/tmp/pocket-mesh-span-sampling-isolated-20261108.log`. Crash report: `/private/tmp/pocket-mesh-span-copy-cb5hqnw2/flutter_01.log`.

### Recovery with the Same SDK on an Internal Path (2026-11-08)

A minimal experiment copied the signed `impellerc` to `/private/tmp` and retained SHA-256 `87ba94547f2bd1ae172b812c3053cd13b2aab4a18ba02affb23800ed680af4d6`. Running `--help` changed from exit 139 on the original path to exit 0 on the internal path. The binary, signature, and permissions were preserved. A temporary copy of the same Flutter 3.47.9 included `.git`, `bin`, `packages`, and root configuration. Dart, impellerc, flutter_tester, and tools snapshot hashes matched the originals. The copy's official `bin/flutter --version` succeeded and sampling tests passed 3/3 with exit 0. The software Skia test cannot substitute for Metal. Original SDK and source permissions stayed intact. See `/private/tmp/pocket-flutter-sdk-3.47.9-20261108/isolation-check.json`, `isolated-sampling-test.json`, and `/tmp/pocket-mesh-span-sampling-isolated-sdk-copy-20261108.log`.

A temporary Demo build copy used the original SDK via links and byte-identical assets, with source content unchanged. Official `pub get --offline` and macOS Profile compilation passed. The first test failed on an assertion for a clipped entry in the new title menu. The model test now uses actual scrolling to find the entry and the visible start button to confirm returning to the title, keeping real replay/resume/disk checks. It neither injects hidden text nor changes production navigation. Later results document interaction separately from compilation.

### Final Filter Comparison on One Snapshot

Official Flutter 3.47.9 on the internal path ran the real macOS Profile model driver, which exited 0 with `01:12 +2: All tests passed` and complete required/completed `model-showcase` checkpoints. The same v6 Guest `88ef9081…` / PAK `b08e3f07…` ran Spine, Hiyori motion, masking, pause/resume, two cycles of release and reentry, main auto-save disk preservation, and main-story continuation. This passes model functionality. Full-game performance, stable RSS, and clarity remain open.

At 800×600 / DPR1, full and close-up each recorded one 1600×1200 snapshot and produced low/medium/high from that same image. Medium and high PNGs matched byte for byte for both poses. Low and medium differed in RGBA at 205 full-body pixels and 521 close-up pixels out of 480,000 per image. These are difference counts, not clarity scores. Visual review of low/medium close-up found no useful improvement explaining the user report. Production retained medium and added no filter switch. The high-only candidate was closed, and overall clarity remained unaccepted.

Reports, 10 filter/reference PNGs, four standard screenshots, the driver log, original test source, Guest hashes, and matching tool hashes are in `sdk/.pocket-build/live2d-filter-internal-20261108/attempt5/`. `attempt4/` documents the separate final title assertion failure and is excluded from the pass. The final test source SHA `c9275af5…d7834` matched the mirror. `testSourceSha256:null` in the report is supplemented by the adjacent manifest's source snapshot, which does not apply to failed attempt4. Physical Retina, mobile devices, and pixel identity with the cropped production snapshot remain unverified. The current metrics explicitly override the test view to 800×600/DPR1.

## Same-Frame LOD Availability Ablation (2026-11-08)

The experiment reused this document's retained parent audit and the migrated `PocketMeshSpanPainter`. It cleared Hiyori span `meshImageLevels` only during diagnostic replay. The same captured frame retained its DrawOp list, original `ui.Image` objects, partition order, masks, other painters, SSAA2, mesh low, and final medium. The production renderer and runtime were unchanged. The older pre-SSAA mip on/off experiment cannot establish this combination.

Both official same-source Flutter 3.47.9 macOS Profile runs on the internal path exited 0 with `+2 All tests passed`: 01:25 at 800×600/DPR1 and 01:33 at 800×600/DPR2. Each covered full-body, close-up, idle, real pointer tap, and model exit/release/reentry. The Guest used `88ef9081…` QJBC, `b08e3f07…` PAK, and `157a56f7…` metadata. Both test sources and helpers, logs, report, PNGs, and hashes are frozen at `sdk/.pocket-build/live2d-lod-availability-20261108/{dpr1,dpr2}/`.

Manual same-frame PNG inspection found visible source-only noise and seams in DPR1 full-body, with insufficient close-up benefit. The candidate was rejected. DPR2 outputs were 1600×1200. Both close-up arm crops matched in raw RGBA, and full-body/idle/tap had 39,029 / 38,763 / 38,931 differing pixels, respectively. These are differences rather than clarity scores, and disabling generated levels did not resolve the user report. Production LOD was retained.

The system still reported 1920×1080 and `backingScaleFactor=1`. At the end of testing, loginwindow was frontmost and actual Retina window pixels could not be verified. Test-view DPR2 establishes the high-density output path. Physical Retina, Live2D blur, performance, and RSS acceptance remain open.

## Follow-up Ablation Promoting Only the Coarsest Selection (2026-11-08)

The historical per-triangle Local LOD and medium source-image experiments left open the effect of promoting only a whole batch's coarsest level by one. Existing batch diagnostics read actual selections from the same frame at captured DPR × SSAA2. For each partition/asset, the test removes the coarsest selected level and all coarser levels, then replays with the same real span painter. Each batch stays unchanged or advances exactly one level to 2× size. The test preserves batch boundaries, op/image objects, order, masks, both filters, snapshot budget, and SSAA2. No new production algorithm or state was added.

The input-fix Guest `a5fed263…` / `b08e3f07…` / `0fefee84…` passed the macOS Profile 800×600/DPR1 driver at exit 0, 01:26 / +2. Promoted/unchanged batch counts for the four poses were 107/0, 90/2, 106/1, and 108/0. Raw RGBA pixel differences were 14,940, 34,020, 14,489, and 14,685. Manual full-body and close-up PNG inspection found fine internal seams and noise without consistent useful clarity gains. The 1× target window regressed, so DPR2 and performance runs were unnecessary for the rejected candidate. Production kept existing LOD. The report, eight PNGs, logs, sources, and hashes are in `sdk/.pocket-build/live2d-coarsest-promotion-20261108/dpr1/`. Counts describe image differences only.

The input handoff fix passed full main/tour regressions independently and shipped in the standard main Profile package `sdk/.pocket-build/lantern-playable-v6-handoff-20261108/pocket_host.app`, PID 3303. Six resources, signing, the main isolate, and the 800×632 window were verified. After model testing, PID 3303 returned to the foreground and was observed again. The package excludes both LOD candidates. Input fixes and driver success leave the Live2D blur report open.

Current PAK source-fidelity follow-up: `b08e3f07…` was independently decoded and compared again; both 2048² Hiyori atlas buffers match official/staged PNG pixels exactly. Old `3d775a…` byte-audit evidence is not relabelled as current. See [current texture audit](LIVE2D_TEXTURE_QUALITY_AUDIT.md#current-ordinary-bundle-pak-follow-up-2026-11-08). Ordinary app computer-use inspection again failed at native-pipe startup, so no new ordinary-window pixels or physical Retina evidence were obtained. This is not a renderer fix and does not change the unresolved quality gate.

### Density Review after Repeated Blur Report (2026-11-08)

Independent read-only review found no verified incorrect DPR multiplier or accidental second frame-fit. Provenance checks covered DPR propagation in retained parent `../pocketjs_flutter_demo/lib/render/pocket_ui_components.dart:3913–4008` and `lib/core/ffi_bridge.dart`. The parent has no directly reusable Live2D mesh/snapshot implementation. Current `PocketView` takes the current FlutterView DPR and retains logical frame/surface dimensions. Live2D local coordinates travel through PMS1 float32 XYUV. SSAA crop is in physical pixels, snapshot size is crop×sampleScale, paint scale is DPR×sampleScale, and the composite destination is crop÷DPR. Source review found no extra frame-fit. No plist key, filter, or scale change followed.

Standard PID 3303 persisted. Native system queries reported foreground `com.apple.loginwindow`, 1920×1080, and backingScaleFactor=1. CUA native pipe launch failed. `screencapture -l18877` returned 1 with `could not create image from window`. Records are in `sdk/.pocket-build/live2d-window-density-20261108/`. System display scale cannot replace same-frame FlutterView metrics or real window pixels. The user was asked to unlock the desktop. The quality report remained open. The next check needs actual window physicalSize/DPR, frame/paint/snapshot sizes, and final pixels from one frame, then an official-renderer comparison of the same model, pose, and scale.

### Actual In-App Capture After Unlock and Official Reference (2026-11-08)

After desktop unlock, OS window capture remained unavailable. System queries returned `CGPreflightScreenCaptureAccess=false` and `AXIsProcessTrusted=false`, and CUA native pipe launch failed. Standard PID 3303 also failed `_flutter.screenshot`. Its log explicitly stated that Impeller does not support compressed screenshots. Unlock alone was insufficient. The pass obtained no OS pixels from the standard window or evidence of physical Retina.

The ignored QA directory reused the retained parent's Flutter layer capture method from `test/pocket_38_components_screenshot_test.dart:39–53`. The temporary entry point called real `main.dart` and registered metrics, root layer capture, and real GestureBinding pointer injection. Production UI, renderer, and SDK API were unchanged. The QA bundle used the separate `com.example.pocketHost.live2dDiagnostic` container, retaining original PID 3303 and user saves. The copied bundle's generated App.framework was ad-hoc signed with the original DebugProfile entitlements. Deep strict verification exited 0.

Two macOS Profile QA builds exited 0. Actual input changed the counter from 00 to 01, then navigated via drag, game entry, Model Theater, Hiyori, Idle0, and full-body/close-up selections. Root layer capture was 800×600. The same running scene reported FlutterView DPR1, physicalSize and logical size 800×600, mesh span sampleScale2, 95 partitions, and two 2048×2048 `ui.Image` objects. Both captures were manually reviewed, and clarity acceptance remained open. Capture and metrics were adjacent calls with animation running, so the geometry was not frozen for a filter A/B.

Evidence in `sdk/.pocket-build/live2d-window-unlocked-20261108/` includes `live-idle0-full-{scene.png,metrics.json}` and `live-idle0-close-{scene.png,metrics.json}`. Full PNG SHA-256 is `baeb731fe0eec6c91b5d435005d1632595d246d64da0de5540660c5bf955add9` and close PNG SHA-256 is `1270a6fd00803ba24009a165c97b57670f6cd05fb9c649c698d058853bbcb119`. These are actual Demo Flutter root scenes from the isolated diagnostic process. Standard PID 3303 did not supply an OS screenshot.

An isolated copy of official Native 5-r.5 macOS OpenGL Sample built with pinned GLEW2.2.0/GLFW3.4 and performed actual readback at 800×600, contentScale1, on Apple M4/OpenGL2.1 Metal. Original MOC and two atlases matched the official resources byte for byte. Motion, physics, and blink scheduling were disabled. Core defaults alone leave multiple hands visible, so the static pose cannot be directly compared with game Idle0. Export preserved 134 drawables, 2,822 vertices, 10,278 indices, 70 parameters, and all MVP/XY/UV/index/masks/blend and framebuffer state for controlled comparison at identical geometry and scale. The official default FBO has no MSAA samples. Reproduction scripts, patches, PNG, runtime facts JSON, and manifest are in `sdk/.pocket-build/live2d-official-reference-20261108/`. Production sampling is unchanged and root cause still open. Overall blur, performance, and RSS gates remain unmet.

After capture, the full executable path verified the newly created PID 16641 before stopping it and restoring standard PID 3303 to the foreground. The temporary mirror's AppInfo.xcconfig matched its restored backup byte for byte. See `cleanup.json` and `mirror-restoration.json` for cleanup facts and SHA. Standard saves were preserved and Editor stayed down.

The Sample/Framework source sets texture MIN `GL_LINEAR_MIPMAP_LINEAR` and MAG `GL_LINEAR`, with 12 mip levels generated from 2048², default anisotropy 0, and no sample override. The CPU does not premultiply the input atlas. The standard shader outputs premultiplied color and uses ONE/ONE_MINUS_SRC_ALPHA blending. Mask defaults to one 256² RGBA8 texture with nearest filtering, no mip, and regular precision. These settings come from source inspection. No glGetTexParameter/glGetTexLevelParameter calls ran. FBO, viewport, samples, driver, and readback were observed at runtime. The official native Sample exited, leaving no diagnostic Demo process.

Later review found that although `open -a` for the normal bundle exited 0, AppKit again reported `com.apple.loginwindow` frontmost around 17:40. This confirms the foreground request and process survival but leaves final foreground status unverified. Offline same-frame comparisons do not require unlocking, and the user was not asked again.

### Independent Composition Ablation Audit

Read-only review of `demo/macos/Runner/Base.lproj/MainMenu.xib:333–339` and `MainFlutterWindow.swift:4–13` found an 800×600 initial content area and resizable window. No new resize acceptance ran. `pocket_ui/src/display.ts:194–221` and `pocket_vn/src/view.tsx:328–337` already subscribe to viewport changes. Hiyori uses scale1.5/y80 in `demo/js/apps/lantern/story.json:3299–3337`. `live2d.ts:64–66` maps Core to canonical 240×350, `viewport.ts:76–92` computes artScale=min(1.35,w/360,h/640), and `view.tsx:287–310` applies artScale once to the inner layer, with no extra artScale². At 800×600 the full body is about 386px tall. A linear estimate of the same pose at 1920×1080 gives about 556px with the cap and 695px without it, against about 980px of available height with no panel. These are composition estimates without a new capture, Retina evidence, or sampling fix. The formula, occlusion bands, and sources are in ignored `sdk/.pocket-build/live2d-composition-ablation-20261108/{audit.md,calculations.json}`. No unverified scaling or window change was adopted.

### Software Replay of the Official Default Frame with the Production Painter

`official_frame_replay_test.dart` uses the same frame's MVP to project Core XY into a fixed 800×600 logical canvas. It flips UV Y using the existing Live2D adapter and preserves source images, indices, renderOrder, and all eight masks. Among 134 drawables, 129 are visible and four zero-index entries have no fragments. Existing `live2d.ts` filtering leaves 125 renderable items. The fixture checks all-normal, default-tint, and non-inverted constraints. Mask semantics and topology stay intact, but the official 256² nearest FBO and Flutter mask raster differ in size and cannot establish pixel identity.

The software test runner under the internal copy of Flutter 3.47.9 exited 0 in the key DPR1/sample2 and all four runs. DPR1 produced 800×600 and DPR2 1600×1200. Sample2 created and disposed exactly one snapshot, with zero budget, ineligible, or failure bypasses. DPR1 generated 390176 snapshot pixels and DPR2 1530360. Three 112×112 logical ROIs (face/eyes, hairline, clothing) use labelled nearest-neighbor magnification. DPR1 broadly resembles the official 800×600 reference and DPR2 records more native sampling detail. Sample1/2 show no useful new clarity gain. Pixel counts are not quality scores, and injected DPR2 imagery does not claim to be a physical Retina window.

The coordinator viewed the complete DPR1/sample2 image and ROI contact sheet. Results do not support using higher SSAA as a substitute for actual DPR2. They establish neither an OS backing1 software error nor production Metal/Skia equivalence. Rendering changes need a real Profile/Impeller frozen-frame comparison first. PNGs, report, and fixture are in `live2d-official-reference-20261108/flutter-replay-production-painter-20261108/` and its ignored QA parent directory. Production source stayed intact and overall clarity remained unaccepted.

### Frozen-Frame Check in Real Profile / Impeller Metal

An isolated QA entry point called the real main, registered diagnostic-only officialReplay, and loaded facts and two atlases with official-matching SHA hashes from a private container. It reused the preceding conversion and both production painters. Profile compilation using the internal matching Flutter 3.47.9 exited 0. The copied QA bundle received ad-hoc signing and passed deep strict verification. PID 67263 logged `Using the Impeller rendering backend (MetalSDF)`, directly establishing the backend. Host FlutterView was 800×600/DPR1. Identical frozen geometry yielded 800×600 at DPR1/sample1 and sample2, with 157 ops, 133 triangle ops, and eight mask passes. Sample2 created and disposed one 390176-pixel snapshot with zero bypasses of all three types.

The coordinator viewed both complete PNGs and a same-pixel 112² nearest×2 ROI comparison across NativeGL/Skia1/Skia2/Metal1/Metal2. No obvious Metal-specific extra blur appeared in this frozen frame. Sample2 lacked a useful detail gain that could resolve the user report. This result covers Core defaults at DPR1 and physical 800×600. It excludes live Idle0, other batches and masks, standard-window OS composition, physical Retina, and mobile devices. Additional detail in the actual DPR2 software images is consistent with DPR1's lower density. It does not establish that backing1 is an SDK configuration error or turn injected test DPR2 into physical evidence.

Evidence is in `sdk/.pocket-build/live2d-window-unlocked-20261108/official-metal-{process.log,response.json,manifest.json,host-metrics.json,cleanup.json}` and `official-metal-output/`. Metal PNG SHA-256 values are sample1 `941dac665046f855c1661195d6b8a66319c05f31a386794d0473c454eae48567` and sample2 `24b9613d1706e0fec7ca592b3b90d3b06017017628ba01798859c8b4064efae0`. Five-column ROI SHA-256 is `131da58bf70369fba876e5e1dad6e13209495dcc80670b6fc5c03337357f3d4e`. The full executable path verified diagnostic PID 67263 before termination. Mirrored AppInfo was restored byte for byte. Standard PID 3303 survived and received a foreground request. The final OS frontmost observation remained loginwindow, so a successful `open` alone did not establish visibility. No production filter, DPR override, character scaling, or window config changed. The blur report remains open and the goal stays active.

### Desktop-scroll resource refresh (2026-11-08)

Final scroll/IME rebuild uses QJBC `ceb1faf8…`, PAK `212b5f26…`, metadata
`d243cb49…`. The original texture audit was rerun against this exact PAK:
both Hiyori atlases remain 2048² RGBA8 and pixel-exact to official originals
(`desktop-scroll-20261108/audit-result.json`, exit0). No production Live2D
sampling or density change was adopted. New input/scroll regressions do not
upgrade the unresolved model-quality or physical Retina gate.


The ordinary main bundle was subsequently refreshed to
`lantern-playable-desktop-scroll-20261108/pocket_host.app`, PID32713;
main isolate runnable and 12 resource hashes checked before retiring PID3303.
Current AppKit observation again reports 1920×1080, backingScale1 and
frontmost loginwindow, with screen-recording access false. No new claim of
physical Retina or model-quality acceptance follows from this deployment.


Independent source review retained a bounded packaging hypothesis rather than
adopting a speculative fix: Runner and the ordinary built Info.plist omit
`NSHighResolutionCapable`; this omission alone does not prove low-resolution
execution. Pinned FlutterView inherits layer contentsScale from its window and
publishes backing-converted physical size; PocketView consumes current Flutter
DPR for painting and mesh LOD. No second forced 1x path was evidenced. The next
useful density experiment needs a real 2x screen: record NSScreen scale, NSWindow
backingScaleFactor, FlutterView layer contentsScale and Flutter physicalSize/DPR
in the same ordinary frozen scene; only if inconsistent compare a single-key
YES plist variant. Current backing1 environment cannot distinguish that
hypothesis, and forcing logical DPR2 is not a substitute.


### Exact native view and current functional capture

The [native density diagnostic](VISUAL_NOVEL_NATIVE_DENSITY.md) now distinguishes
FlutterViewWrapper from actual FlutterView and verifies window/Flutter/Guest
size propagation during actual NSWindow resizing. The engine metrics layer
is NSViewBackingLayer, so its scale is not relabelled as a direct Metal-texture
measurement. Current real-view density remains1 even in a subsequently key,
foreground QA window. Current candidate189ec94e passes the original model
showcase Profile test with QJBC ceb1faf8 / PAK212b5f26 and natural800×600/DPR1
captures (no test-view metric override). Root reviewed Idle0 full-body PNG;
functional pass does not upgrade quality. The 20-cycle follow-up is incomplete,
and no new sampling/DPR/asset-quality change was adopted.


Latest ordinary Demo is now `lantern-playable-delta-base-20261108/pocket_host.app`,
PID85465, after main readiness, signature and twelve-resource checks. Final
AppKit observation confirms ordinary bundle foreground and its800×632 onscreen
window, still1920×1080/backing1. This supersedes the earlier lock observation
for final foreground state, not the missing physical2x evidence. The deployed
change is resource ownership only; model-quality acceptance remains open.


## Actual Idle0 official-renderer comparison

See [same-pose evidence](VISUAL_NOVEL_IDLE0_RENDER_COMPARISON.md). The actual
Profile Guest capture passed; both 2048² atlases and bounded 2× SSAA were active.
Official GL showed no obvious sharper facial detail in the controlled 1×
comparison. Raw dynamic-history flags and full triangle-key coverage retain
explicit limitations. No production quality fix or physical Retina acceptance
is claimed; the user-reported clarity issue remains open. Group totals and
the full Goal scope are unchanged.
