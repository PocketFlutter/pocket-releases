# VN Float32 snapshot ablation

On 2026-11-09, the experiment tested whether little-endian `toJson` could omit the second
full byte copy once it owned a Float32 snapshot. The ownership copy from FFI into a detached
snapshot stayed in place. The candidate showed mixed end-to-end results and failed the
memory gate. The candidate was rejected and production source was restored to baseline.

## Source paths and ablation boundary

- In the retained parent
  `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/core/ffi_bridge.dart:1691-1705`,
  `getZeroCopyTransformView` returns `floatPtr.asTypedList(...)`. Its fallback also returns
  a shared buffer. This borrowed view of mutable storage can only be consumed within a
  synchronous call boundary before an await, native update, or dispose. A long-lived
  snapshot must own its data. The retained implementation established the borrowing
  boundary for the SDK experiment.
- The SDK baseline in `baseline-source/pocket_live2d_ffi.dart:274-285,441-445` creates a
  detached read-only array with `Float32List.fromList(source.asTypedList(...))`.
  `baseline-source/pocket_live2d_types.dart:170-178` copies the entire float byte range
  again with `Uint8List.fromList(...)`. These copies serve ownership and serialization,
  respectively.
- The rejected candidate in `candidate-source/pocket_live2d_ffi.dart:262-286,441-447`
  passes the borrowed view synchronously to `PocketLive2dDrawable.detached`.
  `candidate-source/pocket_live2d_types.dart:132-165,217-247` still copies once to create
  the detached read-only Float32 snapshot. Little-endian serialization then returns a
  read-only byte view of that snapshot. The normal constructor still copies response bytes
  to isolate mutable injected-provider data. Big-endian serialization stays on its original
  path. Only the second little-endian byte copy was removed.
- Hiyori used 134 drawables and 6,716 dynamic Float32 components each frame, totaling
  26,864 bytes across positions, multiply RGBA, and screen RGBA. The measurement excludes
  static UV and index topology, so the full serialized packet has additional data.
  See `owned-ffi/results.txt:10`.

## Regression evidence and baseline gates

- Flutter 3.47.9 ran three real Mao/Hiyori Core bridge tests and 18 snapshot/plugin
  tests. All exited 0 with zero skipped. They covered detached read-only snapshots,
  offset views, mutable provider isolation, Core updates, and old packet byte stability
  after disposal. Commands, results, and source SHA-256 values are in
  `.pocket-build/game-performance-20261109/owned-ffi/{commands.txt,results.txt,source-hashes.txt}`.
- The Profile build exited 0 with SSAA=2, as recorded in `baseline-build-result.json`.
  `asset-equality.json` records matching baseline and candidate QJBC (`fd670db3…`),
  PAK (`54c923d8…`), and bytecode metadata hashes. The baseline soak completed seven
  whole windows, five real-model 10-second windows, and 20 handle cycles. The
  `model-stable-rss` checkpoint required by `pocketAcceptance` did not complete. The drive
  exited 1 and the baseline failed the gate.
- Only 16 of 20 RSS sample windows were stable. Cycles 10, 15, 17, and 19 were unstable.
  The medians for the first and last five cycles were 481,214,464 and 519,766,016 bytes.
  The increase of 38,551,552 bytes (36.77 MiB, 8.011%) was below the relative limit of
  10% and above the absolute limit of 20 MiB, giving `gatePassed=false`.
- Across the five baseline model windows, `buildP95` ranged from 12.957 to 14.536 ms,
  `rasterP95` from 0.507 to 0.570 ms, and `nativeP95` from 10.156 to 11.427 ms. Each
  10-second window had 360–404 frame timing samples, 349–389 native calls, and 4–10
  over-budget samples. These ranges establish the comparison baseline.
- `frameTimingCount` and adjacent vsync-start intervals record delivered timing
  samples. Measuring presented FPS would require separate evidence. The current
  over-budget count uses build and raster durations and can omit the
  `toImageSync` snapshot task. GPU completion and memory bandwidth were unmeasured.
  See `timingLimits` per window in `baseline-response.json`.

## A/B results and rejection

Both runs used macOS 27.0.1 on Mac16,10, Flutter 3.47.9 Profile, SSAA2, the same soak
harness, and identical QJBC, PAK, metadata, guest manifest, and native-asset manifest.
The FlutterMacOS and pocket_live2d native libraries had identical binary hashes.
`baseline-build-result.json` and `candidate-build-result.json` identify the source
used to compile the prebuilt packages. The worktree hash recorded at drive time
identifies only that worktree. Two independent timeline tests also changed in the
recorded diff and were outside the soak target's imports.

| Model scenario (10 seconds each) | Baseline build P95 (ms) | Candidate build P95 (ms) |
| --- | ---: | ---: |
| idle 0 | 13.629 | 14.039 |
| idle 1 | 12.957 | 14.059 |
| closeup | 13.272 | 13.143 |
| idle 0 repeat | 14.293 | 14.365 |
| idle 1 repeat | 14.536 | 14.116 |

Candidate model raster P95 ranged from 0.475 to 0.516 ms. Over-budget samples were
35/1941 (1.803%) for baseline and 32/1811 (1.767%) for candidate. Both exceeded the
1% target, and build P95 exceeded 12 ms in every model window for both builds. Lower
FrameTiming sample counts do not establish a change in presented FPS. The sequential
A/B produced both increases and decreases, so a repeatable speedup was unproven.

The candidate also completed seven whole windows, five model windows, and 20 cycles.
Normal saves were preserved, and model handles and drawn triangles returned to zero.
RSS stabilized in 18/20 windows, with cycles 1 and 12 unstable. The medians for the
first and last five cycles were 445,956,096 and 483,016,704 bytes, an increase of
37,060,608 bytes (35.34 MiB, 8.310%). This still exceeded 20 MiB. Both runs failed to
complete `model-stable-rss` and exited 1. The tests kept the original thresholds and
included unstable windows. The original `stableWindowCount=20` records total sampled
windows. See `comparison.json` for the derived stable counts.

The new constructor, ownership flag, and byte-view path in the two runtime files were
reverted, along with candidate-only tests. The 21 passing tests establish functional
behavior only. The rejected candidate source remains in
`.pocket-build/game-performance-20261109/candidate-source/`. The same evidence
directory contains prebuilt packages, commands, source and artifact hashes, and full
failure reports to reproduce the decision.

Full game performance validation still needs five 10-second windows each for
weather, text, and menu, three cold starts, physical mobile devices, Windows, and GPU
completion timing. Live2D visual clarity was deferred at the user's request. The
experiment reused existing caches, sample settings, and rendering protocol.
Packed/indexed meshes remain a separate unimplemented candidate.
