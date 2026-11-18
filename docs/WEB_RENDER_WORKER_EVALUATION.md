# Evaluating the default Web render Worker setting

## Recommendation

The local comparison on 2026-11-07 supports leaving the Worker **off by default and enabling it per application**. The current default uses the main-thread renderer. Set `renderWorker: true` at runtime or pass `--render-worker` at build time to enable it. Set `renderWorker: false` or pass `--no-render-worker` to disable it explicitly.

Neither synthetic workload showed an improvement in rendering throughput or main-thread timer responsiveness. Worker execution alone establishes placement, and this local test gives no basis for predicting regressions across all real games. Enable the Worker only when measurements show a benefit for the target game on its target devices.

## Method and results

The [benchmark script](https://github.com/PocketFlutter/Pocket/blob/235b5b5589faf492f4a9fc3b7c0827bcd1d9de2c/sdk/scripts/bench_web_render_worker.ts) uses Playwright-managed Chromium, a 480×320 canvas, the same pinned engine, and identical QJBC/PAK. Only the execution location changes across modes. The light load has eight animated Views and the heavy load has 256. Each `onFrame` updates position, opacity, and a frame-count label.

Each load ran three times in each mode, in main/worker, worker/main, and main/worker order. Each run warmed up for two seconds, measured for five seconds, then closed the page. The original functional test left the preceding page open. Closing it kept the other runtime from running in the background. All 12 samples completed without runtime errors.

The table shows medians across three runs. The timer column shows the median of each run's P95 lateness for a 20 ms main-thread interval.

| Load | Mode | Completed advances per second | Mean duration per advance | Main-thread timer lateness P95 |
| --- | --- | ---: | ---: | ---: |
| 8 animated Views | Main thread | 20.32 | 0.73 ms | 78.7 ms |
| 8 animated Views | Worker | 13.78 | 0.91 ms | 114.9 ms |
| 256 animated Views | Main thread | 18.59 | 5.23 ms | 81.6 ms |
| 256 animated Views | Worker | 12.39 | 5.36 ms | 108.1 ms |

Worker completion rates were about 32% and 33% lower, respectively. Advance duration showed no significant reduction, and the timer response did not improve. These results support keeping the current default.

## Measurement scope

- Advance rate counts completed `host.advance` calls through the current UI, layout, raster, and present path. Display FPS and GPU frame time require separate measurements.
- The official host schedules continuous execution with an approximately 16 ms `setTimeout`. The benchmark reuses this path and the renderer as shipped. It uses no alternative scheduler or browser vsync.
- Main-thread timers measure event-loop scheduling. The benchmark did not measure latency from input to JS, upload to the canvas, or the displayed pixel.
- Worker stats collection includes a message round trip at the sampling endpoints. The five-second window reduces its relative impact.
- Timer lateness was high and varied across runs. The numbers apply to this local comparison. Safari, phones, energy use, real games, and long-running stability remain unmeasured.
- Earlier samples ran for about one second. This longer benchmark repeats the measurements with isolated pages and still found no benefit.

## When to enable it for an application

Compare the same scene, resources, and resolution in the actual game. Measure sustained frame rate and P95/P99 frame intervals, P95 latency from input to completed rendering, and **main-thread long tasks, IME, touch, hide/resume behavior, and memory**. Enable the Worker only when it measurably reduces main-thread blocking without unacceptable regressions in rendering throughput, input latency, or memory. Evaluate against the game's frame-rate and latency budgets.

## Reproduce

Run from the repository root with generated, matching engine and runtime artifacts.

```sh
POCKET_SOURCE_BUILD=1 \
POCKET_BYTECODE_BIN="$PWD/sdk/native/target/release/pocketjs_bytecode" \
POCKET_COMPILER_PATH="$PWD/sdk/.cache/pocketjs/tools/build.ts" \
POCKET_WEB_ENGINE="$PWD/sdk/.pocket-build/web-engine/pocketjs.wasm" \
POCKET_WEB_RUNTIME="$PWD/sdk/.pocket-build/web-engine/pocket-web.js" \
bun sdk/scripts/bench_web_render_worker.ts
```

The raw report defaults to `/tmp/pocket-worker-performance.json`. Set `POCKET_RENDER_WORKER_BENCHMARK_REPORT` to use another path. It records each run's values, sampling duration, and errors.

See [Web render Worker](WEB_RENDER_WORKER.md#sources-adaptation-and-ablation) for the parent source and implementation retained. This change adds the measurement script and closes background pages in the functional test. Both modes use the existing renderer and UI state.
