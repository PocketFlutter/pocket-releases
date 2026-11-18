# Legacy Native Capability Audit

This audit excludes `pocket_host`. It covers `pocket_runtime_multi.{h,c}` in `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/native/`, the old Dart FFI bindings, and their direct call chains. A reusable entry indicates that its design or contract can inform the SDK. The legacy library is a single-file C state simulator. Its `CMakeLists.txt` compiles only `pocket_runtime_multi.c` and links no QuickJS, PocketJS core, Rapier, or platform plugins.

## Capability Matrix

| Legacy capability and evidence | Legacy behavior | SDK status at audit | Conclusion |
| --- | --- | --- | --- |
| Host/sandbox/prewarm, `h:107-130`, `c:143-224` | 16 static `PocketSandbox` slots and eight integer prewarm IDs. Create and destroy only call `memset`. No QuickJS context is prewarmed. `suspended` blocks a subset of C steps. | One `HostState` holds a real `RquickjsGuest`. `PocketView` manages Flutter lifecycle. | Reuse load, pause, and destroy scenarios as tests. Keep the existing runtime. |
| Memory tiers/off-heap, `h:118-130`, `c:226-304` | Tiers only set budget fields. External buffers use `calloc/free` and manual byte accounting, without allocation registration, bound overflow protection, or integration with QuickJS GC or texture tables. | Native admission covers the QuickJS heap and PAK, and core textures have a managed resource lifecycle. Process isolation is outside this contract. | Base any future budgets on real guest and core resource measurements. |
| Watchdog/frame/dirty, `h:132-150`, `c:306-365` | The watchdog returns `elapsed_seconds > 5`. A frame step clears the C draw buffer. `delta_seconds` never reaches guest execution, and the dirty mask uses manually set bits. | Native uses fixed ticks, real guest frames, and the DrawList cache and delta ABI. | Reuse dirty and idle observations. Preserve the current frame cache and treat the watchdog as an elapsed-time check. |
| 3D transform buffer, `h:163-176`, `c:368-434` | Writes entity/transform data to a 256×12 `float` array and clears dirty flags. No 3D renderer, matrix validation, or JS execution. | The SDK projects the real DrawList into 2D/Surface output. Rapier and 3D rendering are open. | Track 3D as a gap. A shared `Float32` buffer provides storage only. |
| 2D Canvas command buffer, `h:178-185`, `c:437-471` | Copies C structures for rectangles, arcs, and lines into a 64KB buffer with a few legacy opcodes. | The SDK consumes upstream DrawList v1, with ten operation types, clipping, and texture and font resources, through a Flutter painter. | Reuse batch and capacity stress scenarios with the upstream ABI. |
| Collision/BLE queue, `h:187-194`, `c:473-517` | Collision queues integer pairs from external callers without Rapier. BLE copies the last 64 bytes in and out without connecting to Bluetooth. | BLE, sensors, and cameras use real Flutter plugin providers in `packages/pocket_hardware`. | Reuse length, backpressure, and error cases. Verify actual BLE on physical hardware. |
| SharedStore/VFS, `h:196-200`, `c:519-576` | Global 64-entry JSON table with fixed 64/512-byte fields. Notification counts have no watcher callbacks. The VFS concatenates path strings, fails to check `out_cap` truncation, and lacks a complete canonical sandbox for `app_id` and host paths. | The renderer has no built-in cross-guest bus. PAK and host admission manage package resources. | A future cross-guest store or VFS needs separately designed permissions, canonical paths, capacity, and asynchronous notifications. |
| Legacy UI/38 tags/liquid glass, `h:196-240`, `c:582-766` | 512 C nodes and property setters. Default glass parameters and focus, modal, and style fields store state without layout, hit testing, drawing, or shader logic. | PocketJS core and JS UI own layout and tree state. Flutter `PocketView` draws DrawOps. Glass uses an explicit surface/shader provider. | Reuse names and acceptance scenarios. Keep the upstream UI tree and renderer. |
| Video, `h:243-245`, `c:768-805` | Advances `decoded_frame_index` from `dt` and computes DPR dimensions without a decoder or texture. | `PocketView` uses `video_player` and an authorized Flutter Texture provider. | Keep the real video path. |
| Duplex ring, `h:83-96,232-235`, `c:802-864`, legacy Dart `ffi_bridge.dart:1200-1218,1897-2006` | Fixed 8,216B layout. Dart maps C embedded arrays with `asTypedList` and calls `duplexStepEcho` each frame. C performs a fixed transform. The JS bundle never accesses the ring, and plain `uint32_t` cursors have no atomic, fence, or owner guard. | Implemented in `native/src/duplex.rs`, `native/src/lib.rs`, and `packages/pocket_flutter/lib/src/pocket_duplex.dart`: Dart ingress → owner-thread QuickJS `__pocketDuplexEvent` → JS `pocket.duplex.emit` → egress. ABI v2 has two atomic SPSC queues. | The only legacy native transport migrated at minimal scope. The Dart/native transport is zero-copy. JS receives scalar callbacks, and the lock-free guarantee covers the queue data path. JS execution and lifecycle allocation have separate guarantees. |
| YooAsset/version gate, `h:232-235`, `c:866-870` | Compares host/request version ranges and returns `-426`. It never reads a manifest, PAK, or blob. | Package admission checks the qjbc envelope, SHA, binding generation, tick, and runtime ABI. Services handle signed updates and rollback. | Reuse error semantics while preserving the package verifier. |
| Router/page lifecycle, `h:236-255`, `c:876-1008` | Static page entries up to 16 levels. Push/pop changes state flags and root IDs. Transition progress is fixed at `dt*3.6`. No JS route processing, node freezing, or rendered animation. Async results use a 256-byte JSON slot. | JS/TSX owns pages, state, and transitions. Pure mathematical descriptors for the four legacy transitions live in `packages/pocket_ui`. | Reuse descriptors and lifecycle cases. Asynchronous push-result remains open. |
| Permission/hardware, `h:256-279`, `c:1010-1024` | `simulate_grant` writes state directly without triggering a system prompt. | `packages/pocket_hardware` uses Flutter MethodChannel for real iOS and Android capabilities. JS requests them through the capability and permission contract. | Keep legacy permission enumeration and denial scenarios as test inputs. |
| Plugin registry/dependencies/deep links, `h:281-330`, `c:1026-1213` | Fixed plugin names, versions, and preset sizeKB. The tree-shaking estimate counts enabled plugins. `plugin_invoke` ignores `args_json` and returns hard-coded BLE/link JSON. Deep links copy URIs into a 256-byte field. | `pocket_services` handles descriptors, permission intersections, budgets, revocation, and version and manifest admission. The host compiles in hardware plugins. General URL ingress still needs platform work. | Reuse schema, permission, and disabled scenarios. Track general deep-link ingress separately as P1. |
| Syslib AOT/update/rollback, `h:292-324`, `c:1215-1365` | A 16-entry metadata table. The “SHA” check only requires a string at least six characters long. Hot update replaces version and text fields. Rollback restores old fields without payload verification, execution, or an atomic pointer. | Uses pinned QuickJS qjbc and PAK. The native envelope verifies digest and ABI, and services verify signed versions and rollback. | Keep qjbc/PAK as the sole release pipeline. |

Line numbers refer to the audited legacy files. `h:` identifies `pocket_runtime_multi.h` and `c:` identifies `pocket_runtime_multi.c`. Verify claims such as “lock-free,” “Rapier,” “120FPS,” and “AOT” through their call chains and actual platform providers.

## Implemented Duplex Integration

- Native ring and layout in `sdk/native/src/duplex.rs`.
- Native owner-thread bridge in `sdk/native/src/lib.rs`, including channel/endpoint acquire, reserve/commit, peek/consume, `pocket_duplex_step`, `pocket.duplex.emit`, and `__pocketDuplexEvent`.
- Flutter public API in `sdk/packages/pocket_flutter/lib/src/pocket_duplex.dart`, exported by `pocket_flutter.dart`. `FfiPocketRuntime` implements `PocketBinaryDuplexRuntime` through optional symbols.

ABI v2 maps only payloads authorized by native reserve/peek. An independent Arc endpoint keeps storage alive. Reload closes the previous generation and creates a new channel, preserving active cursors. Both SPSC queues publish with acquire/release. Reserved batches can finish after close, and new reservations fail. The native callback runs JS before committing the ingress cursor. A missing or throwing callback leaves the record available. See [DUPLEX_TRANSPORT.md](DUPLEX_TRANSPORT.md) for the complete concurrency constraints.

Verification commands:

```text
cargo test --locked --lib smoke_tests::binary_duplex_reaches_quickjs_and_returns_without_json
cargo test --locked --test duplex_layout
flutter test test/pocket_duplex_test.dart  # sdk/packages/pocket_flutter
```

`cargo test --lib` also includes three existing package fixture tests that require external `POCKET_TEST_SOURCE`/`POCKET_TEST_ASSETS` inputs. Without these variables, those tests fail independently of the duplex tests.

## Integration Order

1. Preserve ABI v2 exclusive SPSC roles, atomic publication, and owner-thread JS execution. Each endpoint has one producer. Cross-isolate transfers require an explicit ownership protocol and cannot pass an external Uint8List.
2. Add general platform deep-link ingress for iOS cold and warm launches, Android intents, and unsubscribe. Feed the events to the JS route reducer and keep URI state there.
3. Use the old plugin schema and manifest as build-time validation inputs. Continue providing capabilities through the real Flutter plugin registry. Fixed JSON from the old `plugin_invoke` cannot represent on-device capability.
4. Treat 3D, physics, cross-guest store, VFS, and asynchronous routing as new capabilities. Each requires real implementation and independent acceptance beyond the old fields or demo counters.
