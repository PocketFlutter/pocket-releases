# Native Editing in the Editor Web Preview

## Evidence Before the Fix

On 2026-11-04, connecting real Chromium to Showcase on port 8792, clicking `Tap to type` on the home screen, and typing `Pocket web` left the active element as CANVAS and the editable DOM element count at zero. The guest continued to render `Draft: (empty)`. See `/tmp/pocket-web-input-before.log`.

The preview mixed two protocols. Canvas keydown forwards the core `input.text` protocol. Showcase's `@pocket/ui` InputField uses the host editing session protocol, `textInput.open/update/close` and `textInput.edit/submit/closed`. Keyboard commits to the first protocol cannot update the second or give the non-editable canvas native IME support.

## Provenance and Ownership

The search covered the retained `pocketjs_flutter_demo` parent, excluding `pocket_host` and build caches. The textarea in `pocketjs_super_app_demo.html:2105` only copies source and has no reusable IME bridge. The authoritative behavior comes from InputField, parseTextInputParams, and deliverTextInputEvent in `sdk/packages/pocket_ui/src/ui.tsx`, and from the host editing session boundary in `pocket_flutter`.

The browser adds a real DOM editing adapter. It reuses the JS session, text, selection, composing state, revision/jsRevision, and instance generation. PocketJS still owns UI, page scroll, and controlled-value policy. The adapter avoids adding a web state machine to Dart or reconstructing strings from canvas keydown.

Rectangle and clipping updates only move the input. Rewriting the native value or selection would interrupt composing. The adapter distinguishes explicit JS force updates from edit echoes. The existing core `input.text` keyboard channel stays available to its own components. The host editing session receives each commit once.

## Implementation and Ablation

`client/preview.js` activates one native textarea on demand. Each edit sends complete editing facts and an incrementing revision. Canvas keydown no longer assembles text for host sessions. `preview.ts` combines existing video event buffering into ordered `pendingBrowserEvents` and preserves editing session events from intermediate settled frames. This removes a duplicate queue and cleanup path. Browser events and rendering drive synchronization without input probes, periodic DOM scans, or continuous refresh polling.

Root and child inputs both validate the instance generation token. Child rectangles project into the actual slot. Rectangle-only updates leave text, selection, and composing state intact. Stale echoes cannot overwrite current editing. After a web reload loses its local textarea while the guest session remains open, a complete update can restore editing. Rectangle changes alone do not restore focus. Browser close and blur use the existing closed and submit events.

## Acceptance

```sh
bun test sdk/editor/test/preview_input_browser.test.ts
bun test sdk/editor/test/preview_video_browser.test.ts sdk/editor/test/preview_pointer_recovery.test.ts sdk/editor/test/preview_regions.test.ts
```

The coordinator ran the input acceptance test in real Chromium and recorded **1/1**. Coverage includes English input, direct insertText, Backspace, selection replacement, Chinese Unicode, the composition event protocol, blur, and editing an existing value after iframe reload. See `/tmp/pocket-web-input-browser-final.log`. Constructed composition events establish protocol behavior. OS candidate windows still require physical device acceptance. Video, pointer recovery, and gesture region regressions passed **3/3**. See `/tmp/pocket-web-input-regression.log`. A worker also reported **3/3** on the existing `preview.test.ts`.

The first Chinese input test exposed an incorrect caret expectation. Replacing a selection in `hello` produced `hio` with the caret between `i` and `o`. To verify appending, the test now explicitly moves the caret to the end before inserting, preserving the real guest Draft assertion.

The user confirmed port **8793**. That instance restarted with the new adapter and its existing workspace, project-root, and flutter-root arguments. The coordinator connected to `http://127.0.0.1:8793/api/projects/pocket-host-showcase/preview` and verified English, Chinese, Backspace, and select-all replacement. The DOM textarea and guest Draft both displayed the exact test value “已修复” (“fixed”). See `/tmp/pocket-web-input-live-8793.log`. With the editing session open, reloading the page, clicking the existing value, and continuing to type produced `Refresh中文 OK` on both sides. See `/tmp/pocket-web-input-live-refresh-8793.log`. Port 8792 was the pre-fix reproduction address. This pass changed no Dart/Flutter or guest compiler source.
