# Visual novel pause record and unfinished work on 2026-11-09

The user asked to finish the safe-area fix, pause further optimization, and record
remaining work. The complete visual novel engine goal remains open. Of 54 feature
groups, **9 passed, 36 are partially verified, and 9 are unimplemented**. When work
resumes, use the 174 checks in the [goal tracker](VISUAL_NOVEL_GOAL_TRACKER.md).

## Safe-area follow-up

The shared iOS and Android top occlusion handling and first-visible-frame geometry
ordering were corrected and have focused regressions. Android revealed that Lantern
reads its save before mounting NovelView, so an early safe-area event could be lost.
A real Core negative control with delayed save load reproduced menu y=22 against
required top=24. The existing JS HostBridge now keeps the latest complete
`display.viewport` fact for late-mounting views. Two real Core tests for the new
guest passed 72 assertions. One final Android simulator test passed without manually
resending viewport. Actual OS top and bottom insets were 24 dp, menu y=46, and bottom
text y=675. The click loop passed. See [Mobile safe area](VISUAL_NOVEL_MOBILE_SAFE_AREA.md).
iOS, physical devices, and OS rotation remain unverified. Android checked text
bounds and actual tap center. The full 44 px hit rectangle was not independently
measured, and the full PNG was not saved successfully. Both need follow-up.

## Platform and whole-game performance

| Remaining item | Existing evidence and issues | Acceptance after resumption |
| --- | --- | --- |
| Physical iOS and Android and Windows | Partial evidence from simulators, macOS, and injected dimensions | Run the same guest on actual platforms and verify initial layout, taps, IME, and lifecycle. Record artifacts and OS details per target. |
| OS rotation and full-size interaction | Core resize covers an internal boundary. Some desktop window sizes passed. | Rotate actual phones and tablets. Cover all six target sizes and keep all controls within safe bounds after keyboard appearance. |
| Whole-game 60 Hz performance | Some model windows had build P95 above 12 ms. RSS stability failed. | Profile build P95 ≤12 ms, raster P95 ≤8 ms, and frames above 16.67 ms ≤1%. After 20 model entries and exits, handles, clocks, and audio return to zero. RSS increase ≤10% and ≤20 MiB. |
| Cold start | No set of three cross-target cold starts covers final artifacts | Desktop ≤3 seconds and mobile ≤5 seconds over three runs each. Record process launch, decoding, and time to interactive separately. |
| Editor clock | The ≥54 Hz gate still fails. Under Gradle load, average frame IPC was about 24.9 ms. Idle-machine evidence is missing. | Stop compilation and rerun the original test with timings. Keep the threshold and base scheduling changes on evidence from an idle run. |
| Live2D clarity | The user deferred it. Full-body jagged edges and blur remain open. | Compare real pixels and performance A/B using the same model and camera. Keep LOD and texture settings stable when measuring frame cost. |

The partition sample ruled out the current rewrite candidate. Surface partition
P95 was about 0.273 ms or 1.67% of build. Direct sublist cost P95 was about
0.001 ms, below the 0.5 ms or 5% threshold. The speculative rewrite was dropped.
Eliminating a Float32 copy gave mixed results and was reverted in production.
See [Partition measurement](VISUAL_NOVEL_PERFORMANCE_PARTITION_SAMPLE.md) and
[Next ablation](VISUAL_NOVEL_PERFORMANCE_NEXT_ABLATION.md).

## Engine and Editor features still open

| Remaining item | Current state | Work on resumption |
| --- | --- | --- |
| X01 typed extensions and X02 dynamic Inspector | Source boundary review only | Implement one versioned declaration, static JS providers, existing variable transaction effects, shared buildGuest validation, and actual execution. Missing providers must error. See [Extension source audit](VISUAL_NOVEL_EXTENSION_SOURCE_AUDIT.md). |
| X03 MCP and X04 extension package ecosystem | Unimplemented | Implement and verify protocol, package installation and versions, and actual tool interactions per the tracker. |
| Full Editor workflow | Multiple targeted flows passed. The frozen-source workflow has no complete pass. | For all ten edit categories, exercise edit, undo and redo, save and reopen, shared buildGuest, and real input. Complete animation, audio, and native sources. |
| E06.3 all diagnostic categories | Four invalid-reference categories, draft correction, undo and redo, save and compile, and a Core tap passed. Coverage is partial. | Verify precise field locations and build failure boundaries for invalid references, conditions, and asset paths in every registry. |
| E02 advanced chapter blueprints | Basic node and route flow passed | Add expression, extension policy, chapter preprocessing, folding and grouping using the single story model. |
| T01 complex rich text | Emphasis, color, ruby, annotations, and pauses are partially verified | Verify complex shaping, overlap, and real cross-platform pixels. Preserve actual Core hit testing and save replay semantics. |
| Complete audio, video, models, and transitions across platforms | Partial execution evidence per feature | Verify each feature on final cross-platform artifacts. Native Live2D, Spine, and actual audio and video need their own playback tests. |
| Steam, cloud saves, and distribution | Open tracker entries | Implement actual integrations and verify conflicts and offline behavior through the original matrix. |

## Showcase game and final acceptance

The full goal still requires at least 200 dialogue lines, 8,000 Chinese characters,
three causally distinct endings, 12 stateful choices, two real puzzles, eight
categories of image-based UI, and first-time players independently discovering
eight types of capabilities within five minutes. Automated tours and standalone
replays do not cover unprompted first-time play or final full-route review.
Evaluate narrative depth, visual presentation, and discoverability against the
[quantified goal](VISUAL_NOVEL_GOAL.md).

## Resumption constraints

- Use the pinned PocketJS compiler and Core and the shared buildGuest path.
  JS owns business logic and UI. Dart handles platform boundaries.
- Review the retained parent source excluding `pocket_host/`. Production SDK code
  must remain independent of the Demo.
- Preserve shared-worktree changes and user drafts, assets, and saves. Do not
  automatically revert, commit, or overwrite them.
- Use a separate Android package ID and support directory for acceptance. The
  standard Demo historical PID 87428 exited. The separate Loading request later
  synced the tested new guest to all three generated Demo assets. The ordinary
  playtest package was not rebuilt or installed on a phone.
- Use Flutter 3.47.9, Rust 1.98.1, Bun 1.4.4, and the final pinned probe. Default
  Bun 1.3.9 still crashes on some new compile fixtures.
- On resumption, first verify final safe-area results and artifact hashes, then
  choose one item from this record. Feature and performance work remained paused.

## Separate request after the pause for a game loading screen

At the user's request, the game gained an image-bordered loading view, four
observed read states, and completion counts. The four required reads now run in
parallel, and thumbnail cleanup no longer blocks menu readiness. Three actual
Core tests passed 31 assertions. Both prior safe-area checks passed and generated
Demo assets were synced. The overall goal remained paused. Actual mobile cold
launch, per-phase wall-clock timing, and queue delays from older saves waiting
on background cleanup need testing. See [Save slots and startup](VISUAL_NOVEL_SLOTS.md).

## Separate request after the pause for SDK loading in Flutter-only integration

Feedback led to `loadingBuilder` and a unified startup facts model for
`PocketApp`, `PocketGuest`, and `PocketView`, using the existing first-frame gate
for resources and safe-area geometry. At this checkpoint the default displayed
runtime, first-frame image, and display adaptation stages. See
[Flutter startup loading](FLUTTER_STARTUP_LOADING.md). The user's phone app was
not rebuilt. Physical-device timing, detail inside synchronous native loading, and
later dynamic resource loading remained open. The full goal stayed paused.
