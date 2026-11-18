# Web Render Worker

## Capabilities

When explicitly enabled, the standalone Web SDK moves the existing Pocket UI runtime, QuickJS UI QJBC, layout, DrawList, WASM software rasterization, and Canvas2D upload into one browser Worker. The main thread retains the HTML canvas, pointer, keyboard, gamepad, DOM IME, localStorage, and registered permission and native capability boundaries. The same JS application owns UI, state, and controls.

The upstream business Worker has no UI namespace, as documented in `engine/worker/README.md`. Applications still run `domains.worker` as independent Worker QJBC and communicate with UI over the official channel protocol. The render Worker changes only where the existing UI engine runs.

Main-thread rendering is the default. Enable the Worker with runtime `renderWorker: true` or `config.renderWorker: true`, or build with `--render-worker`. Disable it explicitly with `renderWorker: false` or `--no-render-worker`. Flutter rendering and the native renderer are outside the feature's scope. Flutter and web hardware capabilities still require their existing grants.

## Prebuilt SDK

A Worker-enabled build includes matching `pocket-web.js`, `pocket-render-worker.js`, and `engine/pocketjs.wasm`. The app uses the same `app.qjbc` and `app.pak`. Consumers need no Flutter, Rust, or Worker entry compilation.

```sh
bun scripts/build_web.ts --project-root=/path/to/app --outdir=/path/to/output
```

Default builds use the main-thread renderer and omit `pocket-render-worker.js`. To include the Worker, add the enable flag.

```sh
bun scripts/build_web.ts --project-root=/path/to/app --outdir=/path/to/output \
  --render-worker
```

Use the disable flag to build explicitly for main-thread rendering.

```sh
bun scripts/build_web.ts --project-root=/path/to/app --outdir=/path/to/output \
  --no-render-worker
```

Worker-enabled bundles let the host choose either mode for comparison. Omit `renderWorker` to use the main thread.

```js
import { PocketWebRuntime } from './pocket-web.js';

const config = await fetch('./pocket.config.json').then(response => response.json());
const runtime = new PocketWebRuntime({
  canvas: document.querySelector('canvas'),
  engineUrl: './engine/pocketjs.wasm',
  qjbcUrl: './app.qjbc',
  pakUrl: './app.pak',
  config,
  renderWorker: true, // Opt in. Main-thread rendering is the default.
  renderWorkerUrl: './pocket-render-worker.js', // Defaults to the pocket-web.js directory.
  gameInput: true, // Enable game keyboard and standard gamepad input as needed.
  onError: error => console.error(error),
});
await runtime.mount();
```

Explicit `renderWorker: false` overrides config. Before enabling Worker mode, leave the HTML canvas without a context so it can transfer control to the Worker. Missing Worker, `transferControlToOffscreen`, or OffscreenCanvas 2D support, or CSP or network blocking of the asset, causes an explicit error. After failure or disposal, use a new HTML canvas when mounting again. A transferred canvas can only be transferred once.

Serve over HTTP(S), make the Worker entry available from the same origin, and allow the module Worker in CSP. The host independently configures the business Worker's HTTP origin allowlist.

## Input and Browser Capabilities

Use existing `registerCapability()` and `setPermissionHandler()`. The Worker forwards calls to the main-thread registry, which owns permission policies. Async handlers use `context.signal` for cancellation. Hiding or disposing cancels pending boundary requests and discards late responses. Fields such as `ok` and `result` within returned capability objects are application data and pass through unchanged.

localStorage retains existing host namespaces, quotas, and serialization. Only browser storage access crosses threads. The DOM IME stays on the main thread and sends edit results to the Worker that owns the UI QJBC. JS updates the UI. Custom UI should reskin existing control behavior and keep state in the application.

`hide()`, `show()`, resize, and `dispose()` forward to the owning host. Existing upstream work-state and deadlines drive scheduling without continuous polling. Business Workers pause and resume with the same lifecycle.

## Runtime Observations

```js
const { nodes } = await runtime.inspect();
const stats = await runtime.stats();
// Mode/thread, frameCount, cumulative frameDurationMs, logical and pixel sizes, and more.
```

Both modes read from the actual owning host. `frameCount` counts successful `host.advance` calls. `frameDurationMs` accumulates runtime advance, present, and canvas upload time, which measures host time. Calculate observed FPS from the change in frameCount over an interval. Application tickHz describes simulation frequency.

In Worker mode, the owning Worker holds the one WebAssembly instance and UI tree. Debugging reads real engine state over messages. Input and control allow at most 64 in-flight requests. Browser capability calls allow at most 32. Excess requests fail explicitly, and disposal has a separate cleanup path.

## Sources, Adaptation, and Ablation

The source review covered the retained parent outside `pocket_host/`.

- `web_wasm_preview/index.html:204-260` implements `wasmWorkerStepEcho` as a synchronous ring buffer demonstration. Its actual `renderLoop` runs on the main thread.
- `lib/core/ffi_bridge.dart:1994-2025` implements a simulated Worker echo.
- `lib/core/pocketjs_bundle_runner.dart` and `lib/render/pocket_ui_components.dart` implement a Dart scene and Canvas path outside the JS-owned UI architecture.

This work preserves QJBC boot, input, resources, binary bridge, scheduling, and drawing in `targets/wechat/template/wechat-host.js`. `targets/web/render_worker.js` adapts the browser Worker environment. `render_worker_transport.js` retains main-thread DOM and device boundaries. `render_observations.js` provides the same actual diagnostics in both modes. The existing host module owns the capability registry.

Ablation runs the same compiled QJBC/PAK in both modes. Main-thread WASM instantiation count, node changes, screenshots, frame counts, and timings verify execution placement with the same app and rasterizer. The owning Worker presents directly through OffscreenCanvas and avoids per-frame RGBA postMessage copies.

## Running Verification

Build matching browser host and Worker entries with the pinned engine.

```sh
bun build targets/web/browser_runtime.js --target=browser --format=esm \
  --outfile=.pocket-build/web-engine/pocket-web.js
bun build targets/web/render_worker.js --target=browser --format=esm \
  --outfile=.pocket-build/web-engine/pocket-render-worker.js

POCKET_SOURCE_BUILD=1 \
POCKET_COMPILER_PATH="$PWD/.cache/pocketjs/tools/build.ts" \
POCKET_WEB_ENGINE="$PWD/.pocket-build/web-engine/pocketjs.wasm" \
POCKET_WEB_RUNTIME="$PWD/.pocket-build/web-engine/pocket-web.js" \
bun test scripts/tests/web_render_worker_browser.test.ts
```

This suite uses Playwright-managed Chromium. Safari, mobile browsers, and actual game workloads require separate measurements. The local lightweight sample covers that workload only.

## Measured Results

In Playwright Chromium, the same QJBC/PAK in both modes changed main-thread WASM instantiations from one to zero. Actual nodes and canvas changed on input. Keyboard, DOM IME, storage round trips, custom capabilities, permissions, resize, hide/restore, and explicit unsupported errors passed. The business Worker completed 12 actual HTTP requests in each mode, exercising ACK slot reuse beyond eight requests.

One local lightweight run sampled about one second of completed `host.advance` activity.

| Mode | Sample duration | Completed frames | Completion rate | Mean advance time |
| --- | --- | --- | --- | --- |
| Main thread | 1056 ms | 18 | 17.05/s | 0.52 ms |
| Render Worker | 1053 ms | 14 | 13.30/s | 0.99 ms |

The sample verifies that the UI engine and drawing moved off the main thread. Its completion rate decreased. Thread communication adds overhead, so measure main-thread responsiveness and heavier workloads in the target game before opting in. Safari, mobile, and Flutter render offload were outside this acceptance.

Build, distribution, and input unit checks passed 17 tests and 155 assertions. Real business Worker HTTP across both modes passed two tests and 54 assertions. The render placement and interaction comparison passed one test and 44 assertions. A combined run timed out at 120 seconds in the second HTTP mode. An isolated rerun and an instrumented two-mode rerun passed. The timeout was not reproducible in those runs. Broader browser and stress coverage remains open.

Default-off regression passed seven tests with 87 assertions, covering omitted `renderWorker`, explicit enablement, and clear failure without required Worker capabilities.

## Default Setting Evaluation

The default is off, consistent with repeat workload comparisons. Applications can opt in after measuring their own workloads. See [measurement methodology, results, and limitations](WEB_RENDER_WORKER_EVALUATION.md).
