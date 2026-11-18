# Editor Preview connection and reconnection

Editor Preview receives native PocketJS FrameResult over a single EventSource. An on-demand Guest may go a long time without sending frames when there is no input, animation, or resource change.

## Source and fix boundaries

The source review inspected `pocketjs_flutter_demo/lib/` and `pocketjs_flutter_demo/pocketjs_super_app_demo.html`, excluding `pocket_host/`. The retained parent had no Editor HTTP/SSE implementation. The changes reuse `editor/server.ts`, `editor/preview.ts`, and `editor/client/preview.js` and keep the existing rendering, transport, and reconnect paths.

The server's `idleTimeout: 120` used to apply to idle SSE responses too. It could interrupt a streaming response. Only successful Preview `text/event-stream` responses now call `server.timeout(request, 0)`. Normal endpoints and errors keep their original timeouts and handling. [Bun streaming response documentation](https://bun.com/docs/runtime/http/server#idletimeout)

The client uses EventSource automatic reconnect. A temporary disconnect shows Reconnecting. Receiving an actual replayed frame restores Ready. Native runtime errors and malformed frames use the existing error channel. EventSource CLOSED shows a closed connection. Disconnect invalidates queued MOVE/UP from old gestures and sends best-effort CANCEL. Normal input errors still surface, and stale gestures never replay after reconnect.

## Ablation and acceptance

`editor/test/fixtures/counter` builds with pinned buildGuest into actual QJBC/PAK and runs in native pocket_probe. Playwright Chromium projects frames and sends input. `editor/test/preview_stream_idle.test.ts` starts the actual Editor HTTP server, waits for the counter's first frame, idles 125 seconds without input or polling, then verifies a single SSE connection and taps the counter from `count=0` to `count=1`.

Browser regressions separately inject transport faults to check reconnect and UI. Those fixtures verify transport and messaging.

On 2026-11-09, production configuration kept one SSE request throughout 125 seconds idle, with no disconnect or reconnect message. An actual click produced `count=1`. An ablation in a temporary same-directory copy removed only the request timeout exemption and shortened the HTTP idle limit to one second for fast reproduction. The same guest hit the disconnect assertion and showed Reconnecting. The copy was removed. The existing connection requires no heartbeat, continuous rendering, or additional reconnect timer.

Related runs: two `preview_stream_reconnect_browser.test.ts` tests passed with transport fixtures, `preview_pointer.test.ts` and `preview_pointer_recovery.test.ts` passed two actual input tests, and `editor_server.test.ts` passed 10. Local Studio on 8791 restarted and Chromium opened the workspace in Ready without JS exceptions.

## Frame notifications to the parent omit texture bytes

The path reuses native SSE FrameResult in `sdk/editor/preview.ts` and Canvas2D projection in `sdk/editor/client/preview.js`. Source review inspected the retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`, including `pocketjs_super_app_demo.html`, `web_wasm_preview/index.html`, and `lib/core/pocketjs_bundle_runner.dart`. Its browser preview was a concept panel and its Dart runner served the legacy Flutter Demo. Editor SSE, texture notifications, and Lantern Editor Preview required adaptation in the current SDK.

Previously the client decoded resources from SSE, drew Canvas, and sent the same complete FrameResult to the Editor parent through `preview.frame` postMessage. The parent used it only for preview readiness. The parent's `resources` now carries `asset/revision/width/height/psm/linear/pixelsBytes/paletteBytes`. Raw texture content stays in SSE input and the Canvas decoding cache. `getFrame()` returns the received frame with numeric arrays in the old stream or transferred Uint8Array in the Worker stream below. `preview.capture.result` and annotation messages retain the original protocol. DrawOps, events, inputBounds, presentationTokens, and releasedResources stay in the parent notification for readiness, input bounds, and first-presentation barriers.

`editor/test/preview_frame_notification.test.ts` uses real Playwright Chromium to verify PSM5 and palette Canvas pixels, `getFrame()` original resource arrays, omission of pixels and palettes from parent notification with accurate byte sizes, same-asset revision replacement, and release. Run `cd sdk && bun test ./editor/test/preview_frame_notification.test.ts --timeout 30000`. This verifies data boundaries and rendering. Performance measurements follow.

## Browser Worker handling of large resources (2026-11-09)

The first visible Lantern frame carries four 512×512 RGBA textures. The old path expanded 4 MiB of pixels into about 12.5 MB of JSON numbers, then parsed and decoded them on the render thread and copied them to the parent. Removing the parent copy alone left long tasks. Compact JSON alone was also insufficient.

All App and Game previews shared two changes.

- The browser explicitly negotiates compact texture encoding through `resources=base64`. Send and reconnect replay share the serializer. Unnegotiated subscribers still receive numeric arrays. Native FrameResult, recording, resource revision/cache, and snapshot API keep their canonical representation.
- The production Preview document enables a browser IO Worker. Native EventSource in the Worker receives and reconnects automatically. It parses JSON, unpacks textures, and transfers ArrayBuffer in the same place. The render thread receives Uint8Array and keeps its existing Canvas/DrawOps, input, and presentation ACK. The Worker adds no reconnect timer or duplicate layout, application state, resource cache, or PocketJS runtime. Closing Preview terminates it. Hosts without Worker continue using direct EventSource.

SSE errors and readiness still use the existing connection state and pointer CANCEL logic. Draw after resources decode, then send the existing two-RAF presentation ACK. These changes do not preload hidden games or reduce texture resolution.

Measurement used the same 8791 service and Showcase/Lantern QJBC in Playwright Chromium 156 at 375×812 and DPR 2, driven by an actual list click. Temporary instrumentation measured synchronous JSON.parse and postMessage durations, long tasks, and RAF intervals without walking or serializing large pixel arrays.

| Local observation | Original path | Compact encoding and Worker |
| --- | ---: | ---: |
| First texture-frame JSON | About 12.5 MB | About 5.7 MB |
| Render-thread frame JSON.parse | About 16 ms | On Worker |
| Parent copy of 4 MiB pixels | About 19 ms | No pixel copy |
| Render-thread long task on open | 196 ms | No task over 50 ms in two runs |
| Click to title | 1.568 s | 1.031 / 1.202 s |

Ablation with parent notification trimming alone still produced a 157 ms long task. Compact encoding alone produced 90–181 ms tasks across runs, so the IO Worker remained. Native Guest/IO startup and local load affect launch duration, and another original-path run took 3.772 s. These samples characterize local behavior only. Display/GPU 60 FPS and Flutter mobile rendering require independent measurement.

`preview_frame_notification.test.ts` also verifies legacy arrays, compact PSM5 palette and RGBA, fallbacks without fromBase64 or Worker, actual SSE Worker parsing outside the render thread, transferred pixels, reconnect replay, revision replacement, and release. Existing tint and pointer reconnect regressions passed. Actual Preview navigated Start → Journal → Continue Reading and captured the resumed story without JS errors. Evidence is in `sdk/.pocket-build/editor-lantern-stream-20261109/`.

## Child startup waits must release the SystemUI frame queue

The Worker ablation covered browser long tasks. The user still saw a startup pause in Chrome, which led to the server-side `handleSystemRuntimeRequest → createChildRuntime` path. While root Guest handled `system.runtime.create`, the Preview's serial frame/input queue awaited child probe startup and bytecode/PAK load. Even a loading message already emitted by JS could reach the browser only after loading finished.

A temporary service used the actual compiled Showcase revision 19 and native Lantern Guest, injecting a two-second transport delay only into Lantern's `loadBytecode`. The old path produced a 2.255-second frame gap and showed loading at 2.268 seconds after the click. A 160 px scroll during loading left the list text at y=624. This established that native startup waits blocked root frames and input, separately from JSON or texture work. The service used an OS-assigned port and left everyday Editor on 8791. Raw results and scripts are in `sdk/.pocket-build/editor-lantern-startup-20261109/`.

The source review inspected the retained parent's `lib/core/pocketjs_bundle_runner.dart`, `lib/ui/mini_app_host_page.dart`, and `native/pocket_runtime_multi.c`, excluding `pocket_host/`. The legacy implementation had routing and native sandboxing, with no Editor queue boundary for current `system.runtime.create`. Existing JS SystemUI owns opening policy and loading state. Preview adapts asynchronous native child-process completion.

With asynchronous startup under the same conditions, loading appeared in about 33 ms. A 160 px scroll at 350 ms moved list text from y=624 to y=464 while the read remained delayed. Lantern reached title at about 3.18 seconds, including the injected two seconds, after actual child load, render, and presentation ACK, with no premature success or browser JS errors. This shows visible and responsive waiting. The loading card shows actual stage text without a percentage, spinner, or cancel button. Underlying list input establishes responsiveness.

Returning child registration and initial events to the original serial queue still let the slow run scroll 624→464 while waiting, with title at about 3.33 seconds. An independent run without injection reached title in about 1.25 seconds. Actual mouse input navigated Begin Journey → Journal → Continue Reading. A screenshot after the station asset and transition settled showed a full-viewport background and normal story text, characters, and controls. These are functional acceptance samples.

`preview_child_startup_nonblocking.test.ts` uses a controlled probe delay to verify continuing root frames and input and no late registration after disposal. A temporary ablation pointed it at pre-fix HEAD `preview.ts` and failed the assertion that root frames and input must occur while child bytecode is loading. Restoring the fix passed. Temporary source and test copies were cleaned up. On-demand ticks, JS opening policy, and first-frame ACK stayed on their original paths. Only the unnecessary serial queue wait was removed.

After restarting port 8791, the actual Chrome window showed loading and then the complete Lantern title. Concurrent Profile manifest changes caused a new build to fail because the compiler rejected `app.presentation`. The run reused preserved revision 19 and left concurrent changes intact. Seven related regressions passed. AGY `gemini-4-argon-medium` returned no blocker in a consolidated read-only review of this work and the safe-area change.

## Textures and scheduling during game entry

The first-frame signal can precede title assets. Lantern's first native frame is its own `0/4` storage loading screen. Title images appear after subsequent storage responses. Waiting for title resources inside `awaitFirstFrame` would change the contract for all Guests and could block storage requests forwarded by SystemUI.

The boundary reuses actual frames, resources, and multiple runtimes from the retained parent's `lib/core/pocketjs_bundle_runner.dart`, `lib/ui/mini_app_host_page.dart`, and `native/pocket_runtime_multi.c`, excluding `pocket_host/`. Editor adapts those facts across Node and browser through asynchronous child probes and resource transport.

The ablation removed three unnecessary waits.

- The native probe accepts explicit `rawFrame:true`. With tracing off, it validates native JSON as a stream and writes the existing response envelope directly, removing full-frame serde Value materialization and serialization. Default and trace commands retain existing behavior. If Node already knows the entire response is within budget, it avoids stringifying for a second size count. Otherwise the existing exact check remains.
- Ordinary child frame IO releases the root serial frame/input queue. Each child probe has at most one outstanding frame request. Completion returns to the existing queue to validate generation and install an actual frame, retaining previous output while waiting. Recording keeps its deterministic synchronous lane. Lifecycle commands remain in probe order.
- With `resources=http`, SSE carries resource descriptors and HTTP delivers raw pixel and palette bytes. URL includes session scope, asset, and revision. Old or released resources return 404. Restart rotates scope to prevent stale requests from replacing new resources. Native frames, recording, and resource cache retain their formats. Presentation ACK waits for decoding and actual drawing of current resources. Geometry frames continue during the wait and old decoded images remain available.

SystemUI uses the existing opening stage and surface binding. It shows status during `preparing` and hides it at `firstFrame` when the matching binding is ready. That clears the card before game entry and preserves it when a resident re-prepares, without another timer or loading state.

Independent native runs on the same Showcase/Lantern package measured maximum entry geometry-frame gaps of about 269 ms with only the native envelope optimization, 246 ms with asynchronous child frames and base64 SSE, 84 ms with HTTP images, and 67 ms after disabling the SSE Worker once the heavy byte payload was removed. The last two had no browser long tasks. This machine still spends roughly 29–31 ms parsing native JSON. The benchmark preserves real execution, input, and painting with the original animation duration.

A final repeat reached a maximum entry frame gap of about 80 ms, with no browser long tasks or page errors. Entry frames no longer showed the SystemUI “Loading app…” card. The game still displayed its storage loading message. Begin Journey → Journal → Continue Reading passed, with the story background filling the viewport. Performance, delayed-resource, and review evidence is in `sdk/.pocket-build/editor-entry-hitch-20261109/`. Twelve targeted regressions and one native loading render regression passed. Consolidated read-only AGY `gemini-4-argon-medium` review found no blocker.

With the prepared compiler selected explicitly, actual probe recording, export, and native replay passed. One manual Bun restart without `POCKET_COMPILER_PATH` selected old installed tools without `inline-fonts`. Restoring the compiler configuration saved by the npm launcher resolved it. The existing `inline-text-core.patch` and `prepare_upstream.py` already supply the module and subpath.
