# Combined Review Handoff: Remediation and Parallel Argon Work

This historical handoff asks an independent reviewer to inspect the commit that introduced this document. The comparison baseline is `e06720e5ab88e9ff211d3eedfe2d768cb77a004b`. At the time, `git diff e06720e..HEAD` showed the reviewed changes. Earlier findings are in the root `POCKET_SDK_AUDIT_REPORT_de8b051.md`.

The user requested a combined summary and commit of “mine and Argon's” work. The first group is remediation implemented by six GPT-5.6-Luna Max workers and integrated by the coordinator. The second is the concurrent performance, UI, and integration-test work already in the tree, called Argon here per the user. Two other Luna Max workers independently checked the diff, code, and logs for the parallel summary. Individual lines were not attributed based on file authorship.

## 1. Remediation Review

The ordinary e06720e suite passed while five residual issues remained reproducible.

| Issue | Implementation | Targeted evidence |
|---|---|---|
| Offload missed the next submit or cancel notification after the last reply was consumed without reopening the wake gate | `sdk/native/src/offload.rs` reuses one predicate across request, cancel, and reply, rearming when all three queues are empty under the broker lock | FFI notify_count rose from 2 to 3. Rust covers new requests, cancellation, multiple replies, and stale replies. |
| A child produced an Offstage frame and then failed, leaving the visible waiter pending until timeout | `sdk/lib/src/pocket_system_host.dart` rejects incomplete visible waiters on failure independent of hasEverProducedFrame | New `sdk/test/system_host_first_visible_ffi_test.dart` loads real QJBC and covers failure, disposal during wait, and recreation. Restoring old logic failed with TimeoutException. |
| Zero-tick frames omitted either analog stick and recentering | `sdk/native/src/lib.rs` includes zero-tick input and reuses external_work_pending to deliver recentering | Real QuickJS verifies both sticks, exactly one center release, and no extra virtual-time advance. |
| A blocking Worker HTTP read could exceed the remaining total budget | `sdk/native/src/worker.rs` sets each hop's Agent overall timeout alongside connect/read/write limits | Rust verifies delayed headers plus body and cumulative redirects. For a 300 ms budget, old read succeeded at 492 ms and fixed timed out at 301 ms. |
| WeChat admitted reentrant requests during dispose and retained references after abort or native destroy errors | `sdk/targets/wechat/template/wechat-host.js` sets disposed before abort, isolates errors per abort, and clears references before destroy | Old template passed two and failed three. New template passed five, covering reentrancy, repeated disposal, exceptions, and disposal during startup. |

Ablation removed the old scalar TraceClock C ABI and last_* cache, always-empty duplex ring export, duplicate ABI alias, unused RecordingLimitException, uncalled completed getter, Demo host re-export, buildGuest string overload, and unused target argument. `PocketAppConfig.copyWith` centralizes field copying. recordedBytes and stop retain active consumers. TraceClock closes the Worker batch before propagating quota failure, preserving v1/v2 recording semantics.

**Compatibility review.** Removed exports had no in-repo consumers or had canonical replacements. Some were public, so external consumers may need to migrate.

The detailed P0–P3 and ablation tables distinguish original findings from follow-up fixes with line references. Six module notes capture retained parent sources and decisions. [Remediation verification](REMEDIATION_E06720E_VERIFICATION.md)

## 2. Argon Work: Performance, Rendering, and Input

- `sdk/packages/pocket_flutter/lib/src/pocket_view.dart` separates scene and editor-overlay invalidation and coalesces refreshes within a batch. It retains the scene Widget and avoids rebuilding the canvas for structurally equal DrawOps. The editor keeps its existing controller, FocusNode, selection, composing state, and epoch.
- Main and auxiliary surfaces, resource completion and release, host-surface parameters and focus, video fit, DPR, and host configuration still invalidate the scene. The editor wrapper's stable key keeps canvas chunk changes from rebuilding EditableText.
- Performance callbacks run after stopping the timer, allowing synchronous wakeup without rearming a stale deadline. Intentional idle is excluded from active frame gaps and the FPS denominator.
- `pocket_performance.dart` adds `PocketLongFrameEvent`. It reuses ticker and Flutter FrameTiming for actual refresh budget, build/raster, bridge/decode, active gap, scope, and JS context. FrameTiming uses a bounded context queue and deduplicates without a persistent diagnostics ticker.
- `sdk/lib/src/performance_history.dart` retains 600 FPS samples and 240 long-frame events independently and reads older files. Event-only bursts preserve jank without introducing fps=0 into minimum FPS. Writes serialize asynchronously every ten updates and at dispose. Forced termination can lose the final batch.
- `pocket_session.dart` accepts bounded JS context through existing `runtime.performance({context})` and delivers newly recorded long-frame events to JS. `nativeMs` includes FFI, copies, and Dart decoding, and `scope=flutterView` covers the full Flutter view.

The final Flutter matrix ran `pocket_view_invalidation_test.dart` including DPR, `pocket_performance_test.dart`, and `performance_history_test.dart`.

## 3. Argon Work: Showcase, Compilation, and Integration Tests

- The JS Performance page adds actual long-frame phases, refresh budget, event history, and page/action context. FPS and long-frame histories remain independent, so event-only updates do not affect cadence.
- Per an earlier product decision, Demo temporarily removed its Liquid Glass page, Home/Gallery entry points, and associated transition choices. The SDK retains `GlassSurface`, recipes, and optical tests. Treat the hidden entries as a scope decision. Liquid Glass performance remains a separate issue.
- `sdk/packages/pocket_ui/src/mobile.tsx` registers and updates Glass surfaces through a Solid memo and one effect, removing duplicate onMount registration. Tests use the pinned Solid client runtime and retain cleanup.
- `sdk/packages/pocket_ui/src/index.ts` exports `SystemAppSurfaces` so pinned compiler public-index preload can collect default class STYLE_IDS. It uses the existing compiler and compositor.
- Demo manifest and System contract tests verify actual `create → awaitFirstFrame → platform.launch` ordering. SystemAppSurfaces verifies STYLE_IDS in a temporary real consumer and exercised native hostSurface before commit.
- `guest_interaction_test.dart` records raw, clip, and visible rectangles and prefers inputEnabled PocketView. Reveal separates 12 drags from at most four seconds of settling, retains a bounded trace, and preserves visibility requirements.
- `multi_app_test.dart` strengthens hostSurface handle, bounds, and focus, hidden ticker, prewarm reuse, and failure recovery. SystemUI retains compositor-root `isPresented=true` independently of child focus.
- The new `FrameTimingCollector` maps source build-start timing to wall time. Trace validation requires a complete Dart Frame interval for the slowest source frame. Tests cover window boundaries, ordering, invalid clocks, unclosed traces, and traces that only cover fast frames.
- New keyboard and pure Flutter comparison scripts, aggregated jank and mini-app tests, and `save_interaction_capture.ts` can save performance JSON, a recording manifest, and SHA-verified content-addressed assets. Generated archives stay outside source.
- Demo QJBC/PAK updates synchronize existing tracked consumer assets. QJBC lengths and payload SHA-256 matched metadata for main/profile/lobby. Cargo, Flutter, and node caches and device-generated archives stayed out of source.

## 4. Evidence and Scope

### Coordinator's Pre-Commit Reruns

The integration snapshot was `/tmp/pocket-fix-verify`. Source hashes confirmed no concurrent source drift after capture. Later changes were limited to the summary and wording. Logs are under `/tmp/pocket-submit-review/`.

| Check | Result | Log |
|---|---|---|
| Five packages, serial `flutter analyze --no-pub` | 0 issues in all | flutter-*-analyze.log |
| pocket_services Flutter tests | 27 passed, 0 failed, 0 skipped | flutter-services-test.log |
| pocket_flutter Flutter tests | 116 passed, 0 failed, 0 skipped | flutter-flutter-test.log |
| sdk Flutter tests with actual Worker fixture and native dylib | 62 passed, 0 failed, 0 skipped | flutter-sdk-test.log |
| demo Flutter tests | 27 passed, 0 failed, 0 skipped | flutter-demo-test.log |
| SDK `bun test` with explicit native probe | 76 passed, 0 failed | bun-sdk-with-probe.log |
| Demo JS `bun test` with explicit native probe | 14 passed, 0 failed, including actual compiler and native hostSurface handle/bounds/clip | bun-demo-with-probe.log |
| Tracked QJBC metadata | main/lobby/profile lengths and payload hashes matched | Pre-commit command output |
| `git diff --check` | Passed | Empty output, exit 0 |

This snapshot passed **232 Flutter** and **90 Bun** tests. Hardware had no `test/` directory. The previous run reported `Test directory "test" not found.` and this run did not repeat that command.

Earlier verification on the same native repair source reported **82 Rust passes**, zero failures, and one ignored manual throughput benchmark. Locked native build, pinned upstream verify-only, architecture check, actual Worker fixture, and test_guest QJBC ablation, pointer, input, host response, and stress checks passed. Replay rejected three malformed Worker turn variants. A normal child was denied compositor capability. These earlier logs remain in `/tmp/pocket-fix-e06720e/`.

The first isolated SDK Bun run lacked a native probe and had two native-test initialization errors. The full rerun passed after providing the environment below. Original failure `bun-sdk.log` remains. The explicit probe exercised optional native branches.

```sh
export CARGO_TARGET_DIR=/Volumes/ORICO/Development/Github/pocket/sdk/native/target
export POCKET_NATIVE_LIBRARY=$CARGO_TARGET_DIR/debug/libpocket_flutter.dylib
export POCKET_NATIVE_PROBE=$CARGO_TARGET_DIR/debug/pocket_probe
export POCKET_RECORDING_WORKER_FIXTURE_DIR=/tmp/pocket-worker-fixture-fixed
export TMPDIR=/tmp
# Analyze and test Flutter packages serially.
# Run SDK and demo/js Bun build tests serially to avoid dependency installation conflicts.
```

### Earlier Parallel Argon Simulator Records

Existing logs were inspected without rerunning devices during integration. The target was **iPhone Duo simulator Debug** `4D366210-290E-46DB-8BC6-3C5233700409`.

- `/tmp/pocket-no-glass-device-regression-final.log`: five scenarios plus tearDownAll, ending `+6 All tests passed!`. Covers real system keyboard lifecycle, Flutter text client, scrolling, Mobile UI navigation, and no Home/Gallery Glass entries.
- `/tmp/pocket-no-glass-miniapps-final.log`: three scenarios plus tearDownAll, ending `+4 All tests passed!`. Covers A/B messaging and results, prewarm reuse, and failure recovery. Cold 150 ms and warm 101 ms describe one run.
- `/tmp/pocket-duo-system-keyboard-final.log`: system keyboard scenario plus tearDownAll, ending `+2`.
- `/tmp/pocket-duo-jank-complete.log`: controlled real UI isolate blocking and history persistence and restoration, ending `+2`.

Earlier failures include the outdated copy assertion in `pocket-duo-jank-final.log` and the outdated SystemUI isPresented assertion in `pocket-duo-miniapp-jank-complete.log`. Review later no-glass logs alongside current assertions. Historical logs do not identify the exact current Git tree.

WeChat DevTools and physical devices, physical Android, iOS Profile/Release/AOT, GPU and energy, and all clock and refresh combinations were outside this commit's acceptance. Historical Glass and keyboard metrics based on callback arrival, and measurements taken with recording or trace enabled, are unsuitable for ordinary-run A/B. A low-FPS window alone does not establish the cause.

## 5. Independent Review Priorities

1. Verify the five P1/P2 residual fixes on their actual call paths in addition to the general suite.
2. Verify retained-scene invalidation for reload, auxiliary surfaces, async resources, fonts and DPR, config, focus, and disposal. In particular, ensure consuming pending editor work during scene batching preserves final input state.
3. Check FrameTiming's 2 ms tolerance, bounded queue, duplicate, delayed, and unmatched timings, and attribution of whole-view scope with multiple PocketViews.
4. Check ownership of old Timer, notifier, and listener when a performance callback synchronously wakes, disposes, or replaces the runtime during idle.
5. Verify whether JS/Dart history merge and dedup keys preserve distinct scope or context at the same timestamp and whether event-only history restores compatibly.
6. Check visible waiter rejection on failure, disposal, and generation changes. The new FFI test covers Offstage, failure, and disposal. Visible hostSurface and OTA replacement still need real SystemUI scenarios.
7. Review removed public exports, the Demo Glass scope decision, and how the SystemAppSurfaces public index affects compiler collection.

Suggested reviewer task:

> Independently review the code and runtime evidence in `git diff e06720e5ab88e9ff211d3eedfe2d768cb77a004b..HEAD`.
> Read this handoff and `REMEDIATION_E06720E_VERIFICATION.md` as claims to verify.
> Default to read-only. Use isolated worktrees, build caches, and scripts under /tmp as needed. Preserve the shared working tree, running services, and private keys.
> Run Flutter tests serially. Report reproducible residuals and regressions by P0/P1/P2/P3 with source lines, trigger, actual evidence, and smallest fix. Distinguish original e06720e defects, this commit's fixes, historical simulator logs, and current execution results.
