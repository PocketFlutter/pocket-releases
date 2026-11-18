# Video and Duo: Argon High independent review and lead follow-up

Date: 2026-11-04. Original disposition: **Hold the merge until playback protocol and lifecycle issues are fixed.**

This record retains pre-fix evidence and line numbers. Post-fix acceptance is at the end. The original failing tests and earlier iOS logs apply only to their respective snapshots.

Model: `agy gemini-4-argon-high`, effort `high`, session `ae80b5ef-d033-44b1-ba5b-4e8b977641c7`. The first attempt lacked read permission and produced no review. The formal review reached 20 minutes, then the same session finished a complete report. The conclusions below incorporate the lead agent's verification.

The baseline comprised **41 working-tree files** on HEAD `c88c2496c95d44d57a73e45f7e676c09368902b4`, including untracked media, Video, and test files. Snapshot, SHA-256, raw output, reproductions, and logs are under `/tmp/pocket-argon-video-review-20261104/`. Parallel changes during review fall outside complete coverage. See the version boundary below. The review left production code, commits, and the index untouched.

## Independently reproduced defects

### P1: Initial offscreen pause was dropped and the video played on first visibility

- Locations: `sdk/packages/pocket_flutter/lib/src/pocket_view.dart:2907`, `:4326`, `:3292`, `sdk/native/src/lib.rs:567`, and `sdk/packages/pocket_ui/src/media.ts:154`.
- Trigger: JS registers a paused video whose first frame is fully clipped by scrolling or transition and emits no `PocketVideoOp`. It later enters the viewport.
- Cause: The host admitted IDs only through visible DrawOps and dropped `video.pause` for an unadmitted ID. JS recorded it as applied and did not resend it. First visibility used native hard-coded `autoplay=true`. JS and player state diverged, and setting the same paused state could still send nothing.
- Temporary lead regression: Send `video.pause(hero)` in a frame without the DrawOp, then a frame with only the visible VideoOp. Calls included `play:1` and failed the no-play assertion.
- Proposed change: Admit valid bounded registration and playback independently of visibility. Default JS-managed videos to paused while explicitly preserving raw surface compatibility. Retain explicit playback commands.
- Acceptance gap: Real iOS Retry allowed `playing` as successful recovery and omitted the native pause assertion for `playing={false}`. Its passing result missed this defect.

### P1: The 128-ID cap accumulated for the lifetime of PocketView

- Locations: `pocket_view.dart:3076` (`_admitVideoId`) and `:3123` (`_releaseVideoPermanently`). The lead review added this finding.
- Trigger: A long-lived host displays then permanently releases distinct IDs one by one, as in a long video feed. At most one is active.
- Cause: `_videoKnownIds` denies every new ID once it reaches 128. Permanent release preserves the entry and capacity returns only on view recreation, as the comment states.
- Temporary lead regression: Display and permanently release 129 IDs in sequence. Actual `create` calls were **128/129**.
- Proposed change: Track active registrations, pending asynchronous resources, and retired generations. Return capacity on permanent release and retain enough generation information to reject late frames. Preserve tombstones for stale DrawOps.

### P2: One play/pause batch caused an intermediate platform play

- Locations: `pocket_view.dart:2452`, `:4311`, and `:4333`.
- Cause: Resource scanning ran before events and the event loop started the playback pump for each event. A batch ending paused could still send play. A same-batch release could also load a new DrawOp unnecessarily.
- Temporary lead regression: Send `[video.play, video.pause]` once to an initialized paused video, with no later events. Calls included `play:1` followed by `pause:1`. Final state converged. The confirmed impact is extra native work and transient playback, rated P2 after the original P1.
- Proposed change: Reconcile final commands for the whole batch, reconcile resources once, and pump once per ID. Preserve asynchronous serialization and generation guards, with no new ticker or polling.

### P2: Permanent release left failed-resource cache entries and blocked retries

- Locations: `pocket_view.dart:600`, `:3123`, `:3265`, and `:3324`.
- Trigger: An initial load fails for `(id, asset)`. The resource recovers and the app releases and reregisters it, or returns to that source after switching.
- Cause: `_failedVideos` retained the key after release. Re-registration hit the cache and returned. Failed assets also accumulated.
- Temporary lead regression: Make platform create throw once, recover the platform, release, and register the same ID and asset. Calls contained only `[init]` with no new create.
- Proposed change: Define retry, permanent release, and resource generation boundaries. Clear and bound failure history without retrying bad files every frame.

## Findings from source review awaiting full runtime reproduction

- **P2, cleanup after rejected registration can throw.** `video.tsx:101` called `releaseSurface(id)` unconditionally without catching errors. Registration under a host-owned name can fail and use fallback, while unmount reaches the host-owned rejection at `lib.rs:1258`. Track registration ownership and clean up only acquired surfaces. The latest `registered()` value may be insufficient.
- **P2, default probe can be stale.** `media_native.test.ts:11` and `duo_close_native.test.ts:20` preferred any existing release probe without freshness checks. This review used an explicit debug path. Default test selection needs build provenance or freshness checks.
- **Pending, group exclusivity and controlled props.** One effect at `video.tsx:95` handles `active` and `playing`. Changing only active could reapply a stale playing prop and overwrite group-cleared intent. Add a focused real Video regression. Define API behavior for calling play on inactive group entries before classifying it.

## Tests and evidence

Argon reported running Flutter video **17/17**, SDK media/platform/system/Duo **28/28**, Demo video **4/4**, and architecture checks. It also read earlier iOS passing logs. Those cases had not covered the new reproductions.

The lead agent copied an existing fake-platform test harness to `/tmp` and added independent reproductions outside the formal test tree:

```sh
cd /Volumes/ORICO/Development/Github/pocket/sdk
flutter test /tmp/pocket-argon-video-review-20261104/regression_test.dart \
  --no-pub --reporter expanded --plain-name 'review:'
```

The first run produced **three expected failures** (`root-reproduction.log`) and the capacity run **one** (`root-capacity.log`). Logs captured incorrect `play:1`, extra same-batch `play:1 -> pause:1`, absent create after recovery, and `128 / 129` capacity. These are pre-fix controls.

The raw scripts, logs, and Argon report remain in the same `/tmp` directory. Physical-device power or stutter, Android native decoding, and touch during real Duo posture transitions need separate verification.

## Changes to Argon's original assessment

1. `media.ts` preserves IDs. `nonEmpty()` checks original length and does not trim, so the proposed cross-boundary mismatch was removed.
2. `_admitVideoId` never evicted old IDs. There was no FIFO recycling of known IDs and epochs, and the 129th distinct ID failed.
3. A fully absent DrawOp releases the decoder and retains intent. Only a retained but invisible op takes the pause branch.
4. The verified issue in `retryPlaying` was insufficient assertions. The original report's motive inference lacked evidence.
5. Some drift descriptions and individual log or line references were inaccurate. This record uses the 41-file snapshot and the source and reproductions checked by the lead agent.
6. Rebuild the fixed guest through the project's `cd demo/js && bun run build:system` entry.

## Recommended acceptance after fixes

Keep playback policy in JS and resource handling and safe command transport in the host. Prioritize offscreen initial commands and cumulative capacity, then batch reconciliation, same-source retries, and cleanup. Promote the temporary cases to regressions. Add actual decoder coverage for initial offscreen pause, long feeds, and same-source retry. Specify default probe provenance and verify real Flutter pointers on open Duo and during posture transitions.

## Version boundary

Midway through the Argon review, `responsive.ts` and `ui.tsx` had drifted. After the lead reproduction and write-up, a parallel integration moved HEAD to `39df545`. Twelve snapshot files then differed: `demo/js/app.tsx`, `sdk/native/src/lib.rs`, `pocket_view.dart`, `pocket_ui/package.json`, `platform.ts`, `display.ts`, `responsive.ts`, `mobile.tsx`, `ui.tsx`, `system.ts`, `host.ts`, and `responsive_occlusion.test.ts`.

The lead checked `pocket_view.dart` against the snapshot. The diff added queue encoding/decoding via `PocketBinaryCodec` and left admission, event handling, and failure caching in place. The four temporary failures reflect code at execution time. The later binary channel and merged version require their own review and a fixed-commit rerun. Repository-wide `git diff --check` also found a trailing blank line in concurrent `sdk/editor/wechat.ts:497`, left untouched in this round.

## Fixes and reruns on 2026-11-04

JS still owns playback policy. `Video` explicitly registers `autoplay:false`, handles active and playing independently, and releases only surfaces it acquired, with local error handling. Rust conveys the actual autoplay value in JSON and PFB1. Legacy callers omitting it retain true. Dart reconciles frame commands and manages resources and bounded identities within the existing scheduler.

- Valid offscreen play/pause can be admitted before the first DrawOp.
- Permanent release returns active capacity. Filter retired IDs while their old DrawOps are still present. A global monotonic ticket protects pending loads against reused ID generations.
- Batch commands converge before resource reconciliation. Nonvideo events, input, and first-frame ready retain ordering boundaries.
- Permanent release clears an ID's failure history. Source changes reload and failure caching is bounded. No per-frame retry.
- Real Solid effect and cleanup tests cover registration and group exclusivity. Explicit play on an inactive entry selects it and pauses peers. Playback waits for active.
- Default probes use input timestamp freshness. Older release probes no longer win by presence alone. Timestamps are a heuristic. Explicit `POCKET_NATIVE_PROBE` is a caller override.

The lead reran the original independent temporary tests. **4/4 changed from fail to pass** in `/tmp/pocket-video-remediation-independent.log`: no erroneous play, no intermediate batch play, a new create after same-source recovery, and **129/129** creation. Formal regression additionally retains retirement markers for stale DrawOps under release pressure.

Lead verification also passed Flutter video **27/27** (`/tmp/pocket-video-remediation-video-widget.log`), nonvideo input/first-frame/idle/viewport/compositor **52/52** (`/tmp/pocket-video-remediation-widget.log`), SDK media/Video/actual bytecode/Duo close/probe **15/15** (Bun terminal output), and Demo Video and native **4/4** (`/tmp/pocket-video-remediation-demo-js.log`). Architecture checks passed. The JS/native worker separately reported all **88 Rust tests** passing.

The iPhone 18 Pro iOS 27.2 simulator rerun recorded **+1 All tests passed** in `/tmp/pocket-video-remediation-ios-integration-rerun.log`. Actual MP4 progress, pause, source switching, release and recreation, retry retaining pause, offscreen first visibility retaining pause, scroll-out release and return recovery, and two real mini-app covers and returns passed. An earlier strengthened run failed because its reveal helper only swiped up and could not return to the top. A real down gesture fixed the test. Its failure log was retained and player assertions were preserved.

The confirmed video defects passed within this scope. Other concurrent work and the hardware-plugin split have separate review boundaries. Android decoding, physical-device power and high-refresh behavior, and dynamic Duo postures remain open.

Final independent review caught two identity cases. A delimited string key could collide for IDs containing NUL, and ticket zero could equal the missing epoch fallback `?? 0`. The fix uses structured `(id, asset)` keys and nonzero tickets starting at one. An added regression returns the first async initialize after retirement history was evicted.

Final formally executed video regressions expanded to **30/30** in `/tmp/pocket-video-remediation-final-video-widget.log`. They cover NUL ID isolation, sibling-safe cleanup, and late first initialize after retirement eviction. The lead then strengthened the last test to assert the old load emits neither `ready` nor `playing` before registration, ruling out brief stale reinstallation followed by disposal. Its focused rerun passed in `/tmp/pocket-video-remediation-stale-final.log`. Flutter package analysis was clean in `/tmp/pocket-video-remediation-final-analyze.log`.

The normal Showcase was rebuilt and launched on Duo as `com.example.pocketHost`. Folded home capture: `/tmp/pocket-video-remediation-duo-folded.png`. Dynamic open and fold gestures were outside this round. Build log: `/tmp/pocket-video-remediation-final-build.log`. The kernel postdates final production changes, and later changes only strengthened test assertions. Code and docs remained uncommitted in the worktree.
