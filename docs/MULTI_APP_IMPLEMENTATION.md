# JS SystemUI Multi-App Platform

On 2026-11-03, the implementation added application cooperation to the JS-owned PocketJS architecture using actual QJBC/PAK, independent QuickJS realms, and the existing update, plugin, and demand scheduling paths. GPT-6 Luna / max workers handled the JS kernel, Flutter instance transport, and official System manifest validation. The coordinator handled consumer integration, ablation, and runtime acceptance. See [source review](MINI_APP_PLATFORM_PARITY.md).

## Sources and Boundaries

Pinned upstream revision `99924de47c62fa36f526a8791055d91cbbdb3836` defines `PocketSystemV1` in `contracts/spec/pocket-system.ts`, with `roles.systemUI`, `applications.catalog`, installed snapshots, and background execution policy. `framework/src/manifest/system.ts` admits System plans. `programs/web/system-engine.js` uses independent realms, a child map, and explicit surface reconciliation. SystemUI is a package role.

The legacy Flutter demo's `lib/core/pocketjs_bundle_runner.dart` lists, switches, and returns results from apps, with business state in Dart. Prewarming and freezing in `native/pocket_runtime_multi.c` simulate static state. The retained project had no complete official SystemUI integration. This work reuses interaction requirements and close/resume scenarios, with actual QuickJS from the current SDK. Runtime sources and resources come from the SDK.

Flutter lacks an official target profile and dynamic child `CompositorSurface` wiring. Its full-screen presentation adapter covers a portion of the official Web and desktop System compositor. Build tools validate the official System manifest and produce `ResolvedSystemPlan` only when the actual target registry meets its requirements. Arbitrary child surfaces, focus projection, and desktop window composition still require native adapters.

## Policy Ownership

The SDK kernel inside JS SystemUI owns the application registry, open-call chain, result tokens, lifecycle policy, prewarm/LRU, and mailbox. Ordinary mini-apps use `@pocket/ui/platform` for opening, returning, storage, and messaging. SystemUI installs the kernel with `@pocket/ui/system`. Both use the existing HostBridge.

Flutter `PocketSystemHost` holds the trusted consumer's appId-to-build-resource mapping and transport state for opaque instances, generations, and pending RPCs. It provides create/present/destroy/post/respond and storage I/O. JS owns return targets, stacks, tokens, and eviction decisions. Caller identity comes from the requesting instance. Only the fixed SystemUI instance may call `system.*`.

A Dart manager, stack, and mailbox were removed. The host retains persistent KV, serial I/O, quotas, and trusted grant ceilings for shared areas.

## Runtime Contract

- SystemUI is an existing control realm. `configure` returns its instanceId. The kernel must reuse it. At most one instance per appId is resident.
- The default resident cap is three, **including SystemUI** and prewarmed instances. Eviction requires an instance outside the foreground with no active call-chain references. Reject the request when none qualifies. The host enforces a separate higher hard cap for resource protection and leaves eviction to JS.
- JS explicitly submits the list of visible instances. Ordinary hidden instances stop tickers and deadlines and pause virtual time and foreground hardware. Resume excludes hidden duration. Hidden SystemUI can still handle control events and parks scheduling when idle. `backgroundExecution: "suspend"` is the supported default. `continue` is unimplemented.
- `open` RPC returns its token immediately. `platform.result` delivers the final outcome separately so cross-app interaction does not consume the request timeout. Return, cancellation, startup failure, and close settle once. Reject cycles, stale generations, background callers, and unauthorized targets.
- JS policy changes and runtime failures go through one serial queue. Nested steps call internal operations to avoid deadlock on reentry.
- Each JSON payload is independently snapshotted up to 64KiB, and each mailbox holds up to 32 messages. JS ACLs check sender/recipient, shared namespace, and open targets. Storage also follows trusted host I/O grants. A message to a hidden recipient does not bring its UI to the foreground.
- The native path keeps PFB1 drawing and SPSC pointer duplex. Low-frequency platform control uses bounded RPC JSON.

## Implementation and Acceptance Order

1. Review the old demo and upstream pin for reusable behavior and actual host wiring gaps. Keep one runtime.
2. Validate official System manifests and package identity. Specify catalog, installed, required, and SystemUI role relationships. Configure ACLs separately.
3. Test the JS kernel independently for A→B→C results, cancellation, failures, serialization, background rejection, snapshots, mailbox limits, prewarm, and LRU.
4. Verify that the thin host completes create only after an actual first frame, hidden instances stop advancing, generation close cancels requests, and only SystemUI can call management primitives.
5. Build Showcase, Profile, and Lobby as actual QJBC/PAK. Use real input for shared identity, nested opens, messages, and return. Compare create counts, open latency, and resident caps with and without prewarm. Observe hidden instance ticks directly.
6. Run JS, Flutter SDK/bridge/services tests, static checks, and Duo integration. Record skipped and failed runs and distinguish simulated primitive tests from platform execution.

FPS samples and history are uncapped at 60. Record actual values at 90/120/144Hz and scale charts to the data or refresh rate. An idle static page has no continuous FPS. Evaluate input latency and sustained animation FPS separately. Device Energy Log and high-refresh measurements require physical hardware.

## Runtime Verification and Ablation

On 2026-11-03, `demo/integration_test/multi_app_test.dart` ran real QJBC/PAK in the iPhone Duo Simulator. Three functional cases passed.

| Scenario | Verified behavior |
| --- | --- |
| Showcase → Profile → Lobby → back | Actual pointer input, exactly-once nested results, shared identity, and separate messages. Root counter state persists, and hidden Profile stops its ticker. |
| Cold start and prewarm | Prewarm gets an actual first frame. Reopen reuses the Session and instanceId. The cap includes SystemUI. Closing prevents generation revival. |
| Failure cleanup | Injected an error through the existing Session `onError` callback. The child frees its native slot and can be recreated. A SystemUI owner failure retires its children. This covers the host error callback boundary. |

The last debug simulator run measured cold and prewarmed opens at about 203ms and 105ms, with `residents=2, reused=true`. A separate run observed 331ms and 200ms. Waiting was observed at roughly 30ms granularity. The ablation establishes actual instance reuse after prewarm. Stable latency and power measurements require separate runs.

Actual runtime exposed a Promise stall missed by unit tests. `host.response` arrived before a zero-tick boundary after idle credit, leaving undrained QuickJS jobs outside the demand hint. The existing scheduler now reports pending jobs and stays awake until the next actual fixed tick runs `Guest::frame → collect`. It uses the same event loop and fixed tick accounting. After the fix, all three cases and one real system-keyboard lifecycle and scroll case passed.

Replace DEVICE_ID with a booted local simulator when reproducing the run.

```sh
cd demo
flutter drive --no-pub --no-dds \
  --driver=test_driver/integration_test.dart \
  --target=integration_test/multi_app_test.dart \
  -d DEVICE_ID
```

The JS fixtures, host shape/admission tests, and actual platform interactions cover separate boundaries. See [full verification commands and results](VALIDATION.md).
