# Legacy mini-app platform and WeChat host review

Reviewed 2026-11-03 against the retained `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`, and the current `pocket/sdk` worktree. Source, manifest fields, and screenshots alone cannot establish Guest execution.

The platform kernel below is the pre-implementation baseline. The user later asked to close the gaps. See [MULTI_APP_IMPLEMENTATION.md](MULTI_APP_IMPLEMENTATION.md) for the new JS SystemUI kernel, thin instance transport, visibility, JS client, and acceptance. The WeChat findings still apply to the reviewed integration.

## Platform baseline

**The SDK had part of the infrastructure for one app. Multi-app orchestration was incomplete.** A consumer could create independent Sessions and QuickJS realms. A unified registry, stack, cross-app result protocol, and resource policy were absent.

| Capability | Source evidence | Status |
| --- | --- | --- |
| Per-app entry and independent JS state | PocketGuestSession in `lib/src/pocket_app.dart`, `lib/src/pocket_session.dart`, and create_host/HostState in `native/src/lib.rs` | Each Session has its own runtime, nodes, resources, and transport generation. Same-process realms provide runtime isolation, with OS sandboxing outside this scope. |
| Signed packages, versions, and updates | `packages/pocket_services/lib/src/pocket_package.dart`, `pocket_update.dart`, and Session load/promotion/recovery | Real QJBC/PAK. Signed OTA manifests validate expected appId. Keep the current bytecode package format. |
| Method-level capability and permission | PocketHostRegistry, PocketPluginManager, and consumer pluginFactories | Registration, permissions, streams, and cleanup belong to one Session. Cross-app brokering remains separate. |
| Installed app directory and registry | Explicit consumer PocketAppConfig values | No unified install, lookup, open, or close API. Demo pages establish page navigation only. |
| Cross-app navigation and results | Demo `js/state.ts` routeStack and `js/app.tsx` transitions, plus SDK UI and transition math | No SDK contract for A opening B and awaiting a result. Keep app page policy in JS. |
| Per-app foreground and background lifecycle | `PocketView.didChangeAppLifecycleState` pauses and resumes the whole Flutter app | No multi-session active/hidden/suspended policy. App stack changes require separate handling. |
| Shared storage and cross-app messages | Duplex binds runtime generation. Stream bridge binds Session. | Missing. Performance history is separate from guest storage. The SPSC ring is per transport. |
| Resource management | Per-realm QuickJS heap and execution budgets, Session close and resource disposal | Partial. No unified prewarm pool, freeze/thaw, total memory budget, or eviction. No Worker realm for background computation at this baseline. |

### Identity and directory layout

The store uses `ApplicationSupport/pocket-packages/<appId>/<namespace>/apps/<safeAppId>/...`. Session selects an app root and Coordinator also calls store.scoped(appId). This preserves generic scoping but duplicates appId. Remove the duplication only after defining root ownership and migrating old paths so installed OTA data remains available.

Signed OTA validates appId. Embedded guest manifests lack appId, so trusted PocketAppConfig supplies identity and allows one bundled starter template to run under several IDs. Preventing an installed package from adopting another app identity would require an explicit build-manifest field and admission binding without breaking starter configuration. External identity tests only verify that plugin context receives the configured ID.

### Frame rate, power, and responsiveness

Reuse Session, package state machine, capabilities, and demand scheduling. Advance only visible mini apps that have work. Define explicit policy for hidden timers, subscriptions, and background grants. Bound and cancel prewarming so startup benefits do not require every Guest to keep ticking. Cross-app messages need source and target IDs, ACLs, quotas, backpressure, and cancellation. Reuse existing control messages with transport ownership by app.

## Reusable parts of the legacy platform

This source-call review did not run the old Flutter project or C architecture tests. Those tests compile a C state simulator. Actual QuickJS execution requires separate evidence.

| Legacy source | Behavior and limits | Reuse |
| --- | --- | --- |
| `lib/core/pocketjs_bundle_runner.dart:401–447,641–726` | rootTabs, appId→ctx, and tab instances exist with Dart-owned business/node state. The C slots simulate sandboxes. | Retain registration, instance key, switch, and close semantics on actual PocketSession. Keep app pages in JS. |
| Same file `:806–990` and `mini_apps/pocketjs_runtime_bundle.js:43–77` | Page stack, Completer, and pop result share one ctx and app. pushPageForResult inherits activeSandbox.appId. | Retain same-app navigation and lifecycle in JS. Define cross-app request tokens, results, and cancellation separately. |
| `native/pocket_runtime_multi.c:135–148,519–555` | SharedStore is static process-local KV, cleared on init. notify only increments a count. No watcher delivery or durable storage. `tests/verify_architecture.py:226–238` checks set/get only. | Keep key/value subscription requirements and add real storage, unsubscribe, app ACLs, and restart recovery. |
| `native/pocket_runtime_multi.c:161–204,276–304,357–365,876–927`, Dart runner `:670–726` | Prewarm uses an integer queue and static VDOM. Freeze/thaw flips flags. Eviction decrements VRAM counters. `lib/render/pocket_ui_components.dart:585–620` cleans actual subtree cache. There is no QuickJS realm to pause or free. | Retain bounded caches and lazy loading. Verify actual Session counter/timer pause and resume, generation destruction, and disposal. |
| `mini_apps/syslib/pocket_syslib_ota.js:132–199`, C `:1215–1343` | Legacy OTA uses in-memory maps and version strings. Runner buttons update UI. | Keep the current signed bytecode Store and Coordinator. |
| `lib/core/ffi_bridge.dart:1994–2035` | Fallback explicitly simulates Wasm/JS workers. | Use upstream Worker build/execution contracts and the capability coverage audit. Echo lacks parallel execution. |

The old runner hydrated embedded JSON (`pocketjs_bundle_runner.dart:2301–2308,2465–2497`). Old CMake built only `pocket_runtime_multi.c`. Today's SDK supplies actual QuickJS bytecode. The missing piece at this baseline was multi-app composition around that infrastructure.

### Minimum platform integration sequence

1. Use official PocketSystemV1 for installed descriptors, registry, and policy in JS SystemUI. Flutter transports opaque PocketSession instances. Define package/appId, instanceId, and generation and keep stacks and launcher UI in JS.
2. Provide visible, hidden, and closed states with actual scheduling. Verify different A and B bytecode, isolated state, visible-only progress, and stale messages rejected after close.
3. Reuse the pure JS page stack and appear/disappear, push, result, and cancel. The cross-app broker forwards requests and results. Verify return, cancel, timeout, and caller closure.
4. Add app-scoped storage and explicitly shared spaces and messaging as consumers require. Define quotas, cancellation, and backpressure before persistence, restart, and rejection tests.
5. Add bounded prewarm and eviction last. A/B against no prewarm for open latency, background CPU and wakeups, peak memory, and long frames. Drop candidates without net benefit.

## WeChat host findings

**The current SDK did not incorporate this sample. The legacy WeChat host displayed a local node tree in JS/WXML.** Executing PocketJS inside WeChat and running WeChat mini-app packages in Flutter are separate integration goals. The sample implemented neither.

| Legacy implementation | Observed behavior | Reuse scope |
| --- | --- | --- |
| `wechat_host/pages/index/index.js` | `onLoad()` builds Screen/View/Text/FocusGrid/Modal manually. Clicks change count and modal and call setData. No manifest, QJBC, PAK, or WASM loader. | Use nodes, clicks, and modal interactions as acceptance cases. The showcase page was not migrated. |
| `wechat_host/core/wx_pocket_host.js:50–112,143–155` | A node map sends the whole root tree to setData after mutations. insertBefore appends. Layout and actual Guest execution are absent. | Keep PocketJS Core layout and DrawList. Avoid another WXML layout engine and per-frame full-tree updates. |
| Same file `:115–130` | Canvas implements fillRect and arc. Unknown commands are ignored and the input count still returns. | A production DrawOps renderer needs text, images, clip, glyphs, and resource lifecycle. |
| Same file `:7–27` SharedStore | Memory values, synchronous watchers, and optional setStorageSync. get does not restore stored values and watches cannot cancel. | Retain requirements and fixtures. Cross-Guest scope, quotas, and lifecycle remain open. |
| Same file `:29–48` BLE | Connection state and manually dispatched packets. No public subscribe, scan, notification, write, or session cleanup. | Keep native hardware providers for actual capabilities and reuse capability semantics in future WeChat adapters. |
| Same file `:133–140` VFS | Rejects some paths, then concatenates USER_DATA_PATH. No file I/O, appId check, package admission, or quota. | Reuse path-isolation test requirements. Actual isolated files need implementation. |

A `WXWebAssembly` comment has no corresponding instantiation. QJBC is QuickJS serialized bytecode and cannot run directly in the WeChat JS engine. A WeChat target should first verify QuickJS/WASM execution. The SDK provides capability/RPC and Flutter/native implementations, with no standalone WeChat HostPort adapter at this baseline.

## Actual execution evidence

The review mocked `Page` and `wx` in Node and executed the legacy page and host JS. This verified local behavior. WeChat DevTools, physical devices, and PocketJS Guest execution remain open. The temporary script was `/tmp/pocket-wechat-host-audit.cjs`. The lead reran `node /tmp/pocket-wechat-host-audit.cjs`:

- Page count became 1 and modal opened. Guest loader was undefined.
- Four Canvas commands produced only fillRect and arc.
- SharedStore memory get was 2, with one watcher call and one persistence call. Recovery remained unverified.
- BLE packet length was 0 disconnected and 2 connected. subscribe was absent.
- VFS resolved `wxfile://usr/mini_apps/app-1/level1.bin` and rejected traversal in the tested case.

## Minimum WeChat adaptation sequence

1. Run the pinned runtime and actual built artifact in WeChat and show a pointer changing the next frame. Add HostPort abstractions after establishing execution.
2. Reuse package signature/hash, ABI/version, PAK, and isolated app-file contracts. Keep the current bytecode format distinct from legacy `.pjc` sources.
3. Adapt actual DrawList, resources, and input. Use Core layout, implement glyph/clip/texture, pointer phases, and OS input, and retain demand scheduling.
4. Use current capability semantics for WeChat storage, BLE, and files, with permission, cancel, timeout, backpressure, and disposal behavior.
5. Verify visuals, input, background/resume, disposal, and sustained load in both WeChat DevTools and physical devices. Measure long frames, input-to-frame delay, idle wakeups, and memory. Local Node tests establish only local behavior.

Two read-only GPT-5.6 Luna Max workers reviewed WeChat host and platform kernel separately. The lead reran the evidence and integrated the report. The workers did not delegate.
