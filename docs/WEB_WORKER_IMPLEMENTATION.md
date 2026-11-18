# Standalone Web Worker: Official QJBC and Browser Transport

## Source and Scope

The retained parent's `pocketjs_flutter_demo/web_wasm_preview/index.html` contains a ring-buffer demonstration, `wasmWorkerStepEcho`, with no reusable independent Worker QJBC execution. This implementation reuses pinned PocketJS `99924de47c62fa36f526a8791055d91cbbdb3836` sources `engine/worker/src/worker.c`, `quickjs.c`, `framework/src/io.ts`, and the Worker channel contract.

The browser Worker loads the same `pocketjs.wasm` and runs `app.worker.qjbc` in an independent QuickJS realm. The Blob bootstrap is host transport code. Applications execute as QJBC and do not use `eval`, `importScripts`, or `app.worker.js`. UI and Worker use separate WASM memories. The existing UI QuickJS realm mirrors bounded declared snapshots and queues. The official C core retains resource requests, facts, and Worker execution.

Adaptation files:

- `targets/web/src/worker_bridge.c/.h` wraps the official C Worker core for WASM. It handles outbound HTTP, inbound resource facts, cooperative steps, and disposal.
- `targets/web/src/worker_runtime.rs` validates QJBC envelope and hash, runtime ABI, binding generation, tickHz, declarations, and capabilities.
- `targets/web/src/worker_channels.rs` mirrors UI channels across memory and invalidates per frame using existing binary transport.
- `targets/web/worker_transport.js` manages the browser Worker, fetch, HTTP origin policy, and lifecycle.

`build_wechat.ts` compiles these layers and pinned upstream C into the existing Web engine. QuickJS remains 0.12.2. The Worker managed stack is 512 KiB, matching the UI realm. The WASM link stack is 1 MiB. Native stack settings need separate adaptation for WASM.

## App Development

Keyboard-driven official demos require host opt-in through `PocketWebRuntime({ ..., gameInput: true })`. Game keyboard and controller sampling is off by default. [Game input APIs](GAME_INPUT_IMPLEMENTATION.md)

Declare `domains.worker` in `pocket.json` and use official Worker nodes/channels and `@pocketjs/framework/io`. Declare `runtime.worker` in the manifest and add `net.http` for HTTP. The host grants network origins separately.

Pass allowed origins at host build time.

```sh
bun scripts/build_web.ts --project-root=/path/to/app --outdir=/path/to/output \
  --worker-http-origin=https://api.example.com
```

Repeat `--worker-http-origin` for multiple origins. Runtime `workerHttpOrigins` is trusted host policy. Remote apps cannot change it. Redirects are not followed automatically. Bounded response chunks return through official facts. I2C and UART have no browser providers.

Output includes `app.worker.qjbc`, `app.worker.bytecode.json`, and the complete descriptor. An older npm engine without Worker ABI fails the build. Maintainers run `scripts/build_web_engine.ts` to generate a matching engine and host bundle. Consumers use prebuilt SDK tooling without Flutter or native compilers.

## Acceptance

```sh
POCKET_SOURCE_BUILD=1 \
POCKET_COMPILER_PATH="$PWD/.cache/pocketjs/tools/build.ts" \
POCKET_WEB_ENGINE=/path/to/engine/pocketjs.wasm \
POCKET_WEB_RUNTIME=/path/to/engine/pocket-web.js \
bun test scripts/tests/web_worker_browser.test.ts
```

The test uses Playwright-managed Chromium, compiles official worker-http UI and Worker QJBC, starts a real local HTTP server, drives keyboard requests, and verifies UI status, bytes, and canvas pixels. Provide newly generated matching engine and host files. Missing engine environment skips this integration test.

Local Chromium acceptance passed on 2026-11-07. Keyboard input triggered one actual HTTP request. UI showed `Complete`, 15 bytes, and status 0. The screenshot hash changed and page and host reported no errors. Additional checks covered 12 consecutive requests across the eight-item IPC window, hide/show recovery, and rejection and cleanup of a descriptor with incorrect SHA. Combined build, input, official Demo, and browser regressions passed 12 tests and 96 assertions. Physical hardware and Safari were outside the run.

The native C facade executed real worker-http QJBC and verified emit/finish, INVALID for late events after finish, and successful destruction. Upstream native regressions cover admission, cancellation, streams, generations, timers, channels, realms, quotas, and interruption. Browser and Safari require separate verification.

Physical-device providers, the full Safari matrix, server CORS configuration, and preemptive termination of unbounded computation are outside the support claim. Unsupported contracts fail explicitly.

## Ablations and Shared Implementation

- Remove the application JavaScript fallback. QJBC is required, and older engines without the ABI fail at build time.
- Finish HTTP using the official `finish` only. Browser regression reproduced the redundant manual END being rejected as INVALID, and that duplicate call was removed.
- UI and Worker share the binary bridge and official channel semantics. Cross-memory byte conversion happens at the host boundary.
- Official step and deadline behavior plus real input and IO wakeups drive on-demand execution. There is no polling ticker. Hiding pauses the pump and freezes Worker virtual time.

Flutter config, Session admission, and input regressions passed 33 tests. The complete maintainer engine build also passed. The local pinned Rust 1.98.1 linker installation lacked `libLLVM.dylib`, so this build used `RUSTUP_TOOLCHAIN=stable` (1.99.1). PocketJS, QuickJS, and compiler pins remained unchanged.
