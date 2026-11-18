# Mobile dialogs

Source-first integration retains the Modal/Portal and focus-isolation pattern
from `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/syslib/pocket_syslib_pages.js`
and the existing optical provider derived from that parent's
`shaders/liquid_glass.frag`. The pinned official JS Modal continues to own
visibility, focus and dismissal. Flutter only samples/composites the backdrop;
there is no second native dialog or animation state machine.

The earlier reference is `Screen Recording 2026-11-05 at 16.23.47.mov` (4.017s,
824×1614, 60fps). Its abrupt, tinted modal appearance is replaced by a colorless
backdrop blur that fades in, with a centered scale-and-fade transition for the
JS dialog. This supersedes the earlier black translucent scrim request.

## Current panel and text rendering (2026-11-06)

`ScreenRecording_11-06-2026 12-38-13_1.MP4` (1290×2796, 120fps,
4.927s) exposed a different problem: the complete panel subtree scaled from
0.92 to 1, so glyphs and action labels were visibly compressed before settling.
The 300ms symmetric ease also spent too much of its entrance near transparent.
The retained parent supplies Modal/Portal, focus isolation and native property
animation; it does not require text to inherit a presentation scale.

Dialog and Popup now share `MobileModalPanel`: a natural-size content layout
fades in place, while only the absolute background/border/shadow paint scales
from 0.96 to 1. Text never enters the transformed glyph-triangle path merely
because the panel is opening. The shared overlay phase is 220ms with cubic
ease-out. This is a Pocket setting, not an Apple timing requirement. Backdrop
blur and content opacity follow that same phase; exit and interrupted reopen
still traverse it backward/forward without remounting or resetting the phase.
Other presence consumers keep the existing 300ms default.

The native QJBC regression checks 320/390 widths, requires untransformed text
ops in visible fractional frames, compares title/body/action x/y/w/h throughout
entry and exit, and still verifies background scale, transparent blur, reverse
exit/reopen and single confirm dispatch. A text check based only on settled
frames would miss the original transformed-glyph defect.

Fresh Settings Web Preview verification used actual pointer clicks on Reset
appearance, two open/Cancel cycles, 390×844 at DPR 2 with Playwright Chromium
and ANGLE Metal. Before: first visible backdrop at 139/184ms and settled phase
at 367/400ms. After: 114/72ms and 296/273ms, respectively. The new title remains
at x=71, y=357, w=248, h=17 through fractional opacity frames; formerly its
normal text op appeared only after the inherited transform settled. These are
browser frame-delivery observations including input overhead, not GPU timings
or a guarantee for the recorded phone. The native regression plus scalar
motion suite passed 4 tests; the default Toast/Alert/Accordion/control-presence
suite passed another 4, including 30/60Hz and idle parking. Gallery Popup also
opened and dismissed with fixed title geometry in fractional frames and no
browser exceptions. The new Demo QJBC is 643,186 bytes.

The shared Mobile backdrop reuses `GlassSurface` in a portal before the Modal
panel. Its descriptor supplies `effect: "blur"` and `opacity` from JS animation
progress. The official Modal's additional scrim is transparent: blur does not
need a second colored overlay. Default optical glass retains its existing
material; plain modal blur skips tint, refraction, rim and shader loading.

In `sdk/packages/pocket_flutter/lib/src/pocket_surface.dart`, the plain mode
uses the existing `BackdropFilter` boundary with `ImageFilter.blur`. An outer
alpha `ColorFilter` fades that filtered sample over the unfiltered scene.
Wrapping BackdropFilter in an Opacity/saveLayer would change its sampling
boundary, so progress travels in the existing surface descriptor instead.
Opacity zero omits the filter. No native ABI or additional renderer is needed.
The browser projection in `sdk/editor/client/preview.js` likewise samples the
already-painted Canvas backdrop and composites its blurred copy with the
supplied opacity. It must preserve the glass operation's position in draw order.

Component details expose one Close action. Destructive dialogs use explicit
Delete and Cancel actions. The shared transition compares its resolved key
before restarting: whole-store invalidation with an unchanged key must not
reset panel opacity on every frame.

Validation (2026-11-05):

- `flutter test test/pocket_surface_test.dart` in `sdk/packages/pocket_flutter`:
  3 passed, including real Flutter raster samples of a red/blue backdrop at
  opacity 0, 0.5 and 1. Half progress lies between clear and blurred pixels and
  near their average; the green channel stays zero and red+blue stays 255,
  proving no white/black/colored material tint is added. Existing surface clip,
  paint order and platform-texture authorization checks also pass.
- Native-renderer ablations each fail that pixel test as intended: removing
  filtered-sample alpha destroys the intermediate frame; using optical glass
  for the plain blur adds material tint. Production code is restored afterward.
- `sdk/native/patches/modal-transparent-backdrop.patch` adds the optional scrim
  class to the pinned official Solid Modal. `prepare_upstream.py` registers it;
  the worker verified both initial application and already-present bootstrap.
  The old implementation ignored `backdropClass` and always painted a dark
  0.62-alpha scrim. Default Modal callers retain that behavior.
- Demo assets rebuilt with the pinned compiler (root QJBC 588,270 bytes).
  Fresh real Editor 8792 / native probe / Playwright Chromium input opens
  UI → For in both Light and Dark, reaches `effect=blur, tintOpacity=0,
  opacity=1`, paints exactly one Close and dismisses successfully, with no
  browser exceptions. Screenshots: `/tmp/pocket-colorless-modal-live.png` and
  `/tmp/pocket-colorless-modal-dark.png`. These settled screenshots complement
  the intermediate-frame tests; they do not by themselves prove motion timing.
- Fresh debug `pocket_probe` executes
  `sdk/packages/pocket_ui/test/mobile_dialog_native.test.ts`: 1 passed at
  390px and 320px. Real panel geometry grows through intermediate frames
  (approximately 270→290 including shadow bounds), while blur opacity advances
  0→1 with tint zero and no dark scrim. It also covers whole-store invalidation
  and a parent `<Show>` mounting/unmounting the dialog, as in Showcase details.
  At partial opacity native text may be emitted as glyph/image operations;
  intermediate detection therefore uses panel geometry and surface payloads
  instead of requiring semantic Text ops before the settled frame.
- `bun test sdk/editor/test/preview_glass_browser.test.ts`: 2 passed, including
  Canvas pixel checks and a real pinned guest repeatedly opened/closed with
  Playwright Chromium. Existing switch loading/rollback, manual slider motion
  and back-arrow native regressions also passed (2 tests).
- Ablation removed an unnecessary object memo experiment: restoring the
  original JSON-string memo still passes the native entrance test, preserves
  dynamic opacity, and suppresses identical surface registration payloads.
  Glass and PlatformTexture retain the established string ABI. Final Demo
  root QJBC after this ablation is 588,416 bytes.

## Web Preview First-Open Drawing Ablation, 2026-11-05

The user confirmed that the first-open stall occurred in Web Preview. This work reused the retained parent’s drawing resource caching principles from `lib/render/pocket_ui_components.dart` and the existing Canvas DrawOp projection. The business layer opens the dialog only on demand and uses the existing dialog state.

`sdk/editor/client/preview.js` removes two sources of cold-path work.

- `effect=blur, opacity=0` completes as an empty composite. It creates no full-screen DPR offscreen Canvas and runs no invisible blur. Nonzero frames continue to use actual backdrop blur at full resolution.
- TEX_TRI applies uniform alpha with Canvas.globalAlpha, like TEX_QUAD. Fade frames share RGB-tinted textures. The old path baked alpha into each texture, creating and uploading multiple font atlas or rounded texture variants during the first scale/fade. A warm cache hid the cost.

`preview_triangle_alpha.test.ts` exercises fresh Chromium, actual Canvas pixels, and upload counts. The input texture already has alpha. Across 31 frames with varying alpha, only the source and RGB tint upload. The first transparent blur frame allocates no offscreen Canvas and submits no filter, and a return to zero skips computation. Restoring baked TEX_TRI alpha in the negative control caused 32 uploads and failed. Restoring the transparent blur work also failed. Neither negative control overwrote production code.

A trial reduced the blur Canvas from DPR to logical dimensions. Fresh Chromium compositing tests showed no stable time savings, so full-resolution rendering was retained. Synchronous Canvas timings and double requestAnimationFrame timings each measure only part of GPU and display latency.

Later native Dialog sampling found axis-aligned TEX_QUAD throughout scaling and `textureTriangle=0`. The first glass frame had image=84, and the settled frame had image=40. The TEX_TRI ablation therefore covers redundant work at the rotated-texture boundary. The standard dialog used no triangle textures. Actual resources included three 512×128 PSM5 font pages and small rounded masks. Both opens loaded the same resource sequence. Palette expansion was changed to same-endian 32-bit RGBA entry copies, reducing main-thread per-channel decoding. Canvas pixel regressions passed for PSM5 with native alpha and a partial-word palette tail.

The same fixture’s first glass-frame probe RTT measured 45.47/44.85ms for first/second opens in debug and 8.13/7.18ms in release. Build profile accounts for most of the difference. The resolver already selects the freshly built release probe and kept that policy.

## Web Preview Idle Wakeup and Reversible Transitions, 2026-11-05

The investigation checked the retained parent’s Modal and Portal composition in `mini_apps/syslib/pocket_syslib_pages.js` and frame boundaries in `native/pocket_runtime_multi.c`. The parent has no Editor pointer HTTP or Canvas scheduling. The fix adapts existing PreviewSession and public Mobile components, keeping the pinned guest/core clock and official Modal focus isolation.

The first-open latency reproduced in `sdk/editor/preview.ts`. Native settles elapsed idle time at the external DOWN boundary and leaves equivalent credit for the next display delta. The old UP branch reset `lastTickAt`, losing the idle interval required to offset the credit. Subsequent timer frames consumed the leftover credit before advancing the JS transition, leaving opacity at zero. Removing the UP reset follows the existing rule that `tickNow(0)` preserves the display baseline.

A compiled fixture without permanent onFrame used samples 220ms apart to verify that no new frame appeared after 700ms. Chromium pointer DOWN/UP then opened Dialog. A lightweight browser trace recorded only frame, opacity, and time, avoiding repeated copies of full font resources through CDP. With the release probe, the first visible opacity appeared after about 51.4ms on initial open and 51.3ms on reopen, including intermediate fade frames. The in-process negative control restored only the UP reset and took about 1076ms. Frame delta was 57, and opacity remained zero for the first 12 frames. The test now requires under 180ms and at least one fractional opacity.

The user then requested slower motion with dismissal reversing the entrance. MobileDialog and MobilePopup shared a minimal JS presence phase. Official virtualNow advanced one linear phase over 0.3s. Smoothstep drove backdrop blur opacity, panel opacity, and scale. Closing reversed the same phase and released the official Modal at zero. Mid-transition close or reopen reversed from the current position. During exit, actions check requested state to prevent duplicate confirm or select. Inactive routes and cancellation at zero remove the overlay immediately to avoid leaving a transparent focus layer.

Showcase details removed the outer Show that unmounted immediately when open became false. One MobileDialog instance remains, and the UI package unmounts it when exit finishes. Timing comes from JS virtualNow, the deterministic simulation clock. Browser measurements report actual delivery timing separately.

A real Showcase recheck used fresh Playwright Chromium, 390×844 at DPR 2, an optimized `pocket_probe`, and root QJBC (590,550 bytes). UI → For showed multiple intermediate frames from 0 to 1 on both opens. First transparent to fully visible took about 276.5ms and 275.1ms. Closing produced more than ten monotonically decreasing opacity samples including about 0.966, 0.874, 0.5, 0.074, and 0.009 before removing the glass and Modal. Both cycles passed the requirement for fractional close opacity without increases. These results measure Canvas notifications and drawing.

The Demo rebuilt through normal buildGuest, and the optimized probe rebuilt successfully. The local Editor on 8792 restarted and rebuilt the current sources through its own build API, reaching build ready. Refreshing the existing page loads that build. The architecture check for public SDK independence from Demo and the diff whitespace check passed.

Final regression `mobile_dialog_native.test.ts` passed at both 390 and 320 widths (one test), covering about 300ms entrance and exit, continuous reversal on reopen during dismissal, and exactly-once confirm. After the final immediate-open guard adjustment, the Demo rebuilt with root QJBC of 590,574 bytes. Four `mobile_ui.test.ts` tests and one Chromium drawing regression for transparent blur, TEX_TRI, and PSM5 passed.

With the new release probe, both `preview_timing.test.ts` tests passed, covering move coalescing under slow input and elapsed ledger behavior under continuous input. The native build failure caused by concurrent edits had cleared. One existing `preview_pointer.test.ts` covering real multitouch, wheel, capture, and failure recovery also passed. This verification was scoped to the suites listed here.
