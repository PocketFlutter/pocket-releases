# Browser video preview in the Editor

On 2026-11-04, `client/preview.js` still skipped all `video` DrawOps as unsupported native
surfaces. The image atlas and PAK resource projection can supply URLs, while MP4 playback
also requires decoding.

## Provenance and scope

Review covered AuxiliarySurface video fields in the retained project's
`pocketjs_flutter_demo/mini_apps/syslib/pocket_syslib_flutter_ui.js`, the video example in
`pocket_syslib_pages.js`, and the current lifecycle protocol in
`sdk/packages/pocket_ui/src/video.tsx` and `media.ts`. The legacy sample counts synthetic
frames. A search of the retained tree excluding pocket_host and build caches found no
reusable MP4 HTTP Range service. The implementation adds the browser resource and
drawing boundaries while reusing official PocketJS bytecode, DrawOps, existing JS playback
policy, and layout.

- The browser decodes local video in a real muted, inline-playing HTMLVideoElement.
  Canvas draws its frame at the original DrawOp location with the assigned clipping,
  corners, BoxFit, and draw order.
- `requestVideoFrameCallback` redraws new frames. Older browsers use the media element's
  `timeupdate` event. Playback adds no polling for preview/input, snapshots, or frames.
- `video.play`, `video.pause`, and `video.release` use the existing guest events. The
  native probe may execute several frames for a single input. Commands from intermediate
  frames must reach the browser publish boundary along with the final settled frame.
  The full batch is consolidated before media resources are reconciled.
- Removing a video from the visible DrawList releases its element. Playback intent and
  explicit deregistration are handled separately. `video.state` comes from real media
  events. Instance generations in child-app diagnostics prevent a late decoder callback
  from affecting a reopened app.
- GET and HEAD `/api/projects/:id/preview/media?asset=...` serve project video assets.
  Supports single ranges, suffix ranges, 206/416 responses, and correct MIME types.
  Streams from a validated file descriptor to keep the full MP4 out of JS memory.
  Only video files under assets are eligible. Rejects traversal, source access,
  directories, and symlink escapes. Child-app assets resolve within their registered
  app scope.
- Editor and tests share `sdk/scripts/native_probe_path.ts`. The default selects the newest
  probe after validating input timestamps, so stale release binaries cannot hide fixes.
  This checks timestamp freshness only. Callers supplying a probe path own its validation.

## Validation

```sh
bun test sdk/editor/test/preview_media_assets.test.ts sdk/scripts/tests/native_probe_path.test.ts
bun test sdk/editor/test/preview_video_browser.test.ts
```

Five asset and probe tests passed with 31 asset assertions. A real Playwright bundled
Chromium run verified MP4 decoding, advancing currentTime after Play, pixel changes inside
the Canvas video ROI, a stable media clock when paused, no continuous preview/input polling
during playback, and element cleanup after changing route. The assertions observe actual
media behavior and Canvas output.

Validation covered Chromium with local video. Safari, Firefox, remote streams, HLS, DRM,
and physical device power usage remain outside these results. Codec availability depends on
the browser. Native hardware plugins and general hostSurface operations retain their own
platform boundaries.

Lead agent run logs record 6/6 asset, scope, and probe cases in
`/tmp/pocket-web-video-assets-final.log`, 3/3 existing route, page, and cache regressions in
`/tmp/pocket-web-video-regression.log`, and 1/1 real Chromium validation in
`/tmp/pocket-web-video-browser-final.log`. Port 8792 loaded the updated code and rebuilt
`pocket-host-showcase`. A real browser run against that service passed again, recorded in
`/tmp/pocket-web-video-live-8792.log`. It verified a 320×180 MP4, an HTTP 206 Range response,
advancing playback time, the same time before and after a 0.555-second pause interval,
and route cleanup.

The browser test reacquires Canvas geometry before clicking and waits for initial resize
and layout to settle. Cached first-frame coordinates can miss the target after layout.
Initial misclicks and lost intermediate events are preserved as debugging evidence. The
final test still asserts real media-clock and video ROI pixel changes.

The repository-wide architecture check failed because a parallel change made
`demo/lib/main.dart` 130 lines, above the existing 100-line thin-host limit. This video
change did not modify that file.
