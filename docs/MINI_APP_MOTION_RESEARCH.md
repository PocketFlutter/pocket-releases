# Mini App Presentation Motion Research (2026-11-04)

## Confirmed Findings

- JS presentation in `system-surfaces.tsx` uses a 420ms symmetric cubic ease-in-out. Over an 843px travel distance, the first 50ms cover only 5.69px, and the largest mid-animation displacement at 60Hz is about 96.27px per frame. These are curve calculations. Closing during entry reverses the timeline, preserving position while reversing velocity abruptly.
- The container height stays fixed and only translateY changes. Child viewport geometry does not resize on each frame.
- Standalone native probes observed a state about every 19.5–22.7ms. In Playwright Chromium, SSE still produced state roughly every 20ms, but some states arrived in batches. Of about 11 exit states, rAF observed only four. Headless data does not establish physical-device GPU or vsync behavior or platform-wide FPS.
- No repeated per-frame asset transfer or decoding was observed. The changed resources covered 13–14 unique asset/revision pairs. A full DrawOps JSON frame weighed about 74–99KB, leaving room to optimize browser projection.

## Direction from iOS

Apple describes preserving position and velocity continuity and carrying velocity when interrupted or retargeted. Springs without bounce can also settle naturally. Apple has not published fixed sheet duration and spring parameters that apply across iOS versions. [Animate with springs](https://developer.apple.com/videos/play/wwdc2023/10158/)

Apple also emphasizes low latency and interruptible interaction and shows detents and layered presentation. JS can implement these principles while retaining ownership of application motion. [Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/) · [Customize and resize sheets in UIKit](https://developer.apple.com/videos/play/wwdc2021/10063/)

First fix launch presentation. Then run a browser ablation where rAF draws only the latest state, ensuring resource updates and the first-frame ACK survive when intermediate frames are skipped. Then replace the fixed curve with a JS spring that carries velocity, and compare tap response, displacement per frame, and energy use. Drag-to-dismiss and layered background scaling require separate interaction work. These motion optimizations were pending.

## Fixed Independent Launch Issue

Opening a mini app after Editor idle exposed a stale clock baseline. The zero delta in the input turn did not advance the idle reference time. The first frame after a new request could include stale idle duration and prematurely time out a host request on virtual time, yielding `SystemUI did not respond to platform.apps.open`.

`preview.ts` reanchors the clock at the input boundary only when native reports complete idle, with `nextWakeDelayMs` null or negative. Active timers and continuous dragging do not reanchor. The code documents this constraint. `preview_idle_mini_app.test.ts` verifies launch after idle using real qjbc, the native probe, and browser presentation ACK. The coordinator ran the idle, pointer, and preview groups, with 5 pass and 0 fail.
