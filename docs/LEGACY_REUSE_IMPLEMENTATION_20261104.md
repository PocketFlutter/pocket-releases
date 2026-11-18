# Legacy capability integration record

See the [2026-11-03 source review](LEGACY_REUSE_REVIEW_20261103.md).

This round implemented A1 optional deep links at the user's request, A2 plugin type
generation, A3 system bars, A4 haptics, and B1/B2 hardware streams and BLE GATT.
Pure math and data tools await consumer requirements. Full 3D, VFS, independent syslib
OTA, multiple WeChat guests, and aggregate app resource budgets were outside scope.

## Integration boundaries

- Deep links default to off. The standard SDK and scaffold omit the optional platform
  package and URL scheme. Consumers opt in explicitly and list link capabilities only
  as optional in the manifest. With links off, URL capture, background listening, and
  polling are disabled.
- JS owns pages, routing, subscriptions, and presentation. The platform package
  supplies observed URLs and system bar and haptics I/O. Hardware uses the registered
  providers and actual permission model.
- Existing HostBridge, PocketStreamBridge, and binary transport carry messages.
  Existing Dart lifecycle and page state are reused.
- The migration excluded simulated runtimes, simulated hardware success, source
  labeled as AOT, and estimated tree-shaking.

## Ownership

| Work | Ownership | Execution |
| --- | --- | --- |
| Platform experience provider, iOS, Android | `packages/pocket_platform/` | Luna Max / ui_foundations |
| JS stream adapter and platform experience API | `packages/pocket_ui/src/host.ts` and new streams and platform-experience subpaths | Luna Max / ui_secondary_pages |
| Type schema and generation | Services descriptor schema and new `scripts/plugin_types.ts` | Luna Max / ui_fps_badge |
| Actual hardware streams and GATT | Separate hardware Dart/iOS and Android ownership | Luna Max / hardware_stream_ios, hardware_stream_android, android_stream_cleanup |
| Integration, scaffolding, consumer example, acceptance | Lead agent | Preserve existing UI and memory work and parallel changes |

Subtasks were prohibited from spawning additional agents.

## Initial validation

Review found conflicting bidirectional listeners, unhandled remote cancellation
errors, provider failures reported as normal end, and revocation notifying the
remote side without releasing the local producer. The fix uses the existing wire.

- Services `flutter test test/pocket_host_stream_test.dart` passed six cases for
  bidirectional delivery, cancellation cleanup, asynchronous errors, synchronous
  throws, selective revocation and disposal, and non-JSON output.
- Running the same six cases against the prior HEAD's `pocket_host.dart` in `/tmp`
  failed all six. All passed with the repaired transport. Removed redundant event
  forwarding and JSON-content deduplication so consecutive identical sensor samples
  each arrive once. This ablation measures protocol correctness only.

## Consumer entry points

| Capability | SDK entry | Consumer use |
| --- | --- | --- |
| Optional deep links | `pocket_platform`, `pocket.ts init --deep-link-scheme=SCHEME` | Native and Dart opt-in. JS explicitly reads initial or latest and subscribes. No default route or listener. |
| System bars and haptics | `pocket_platform`, `@pocket/ui/platform-experience` | Showcase sets bars on JS route and theme changes. The Hardware page explicitly tests haptics. |
| Plugin types | `PocketPluginSchema`, `pocket.ts types` | Data schema and actual registry generate clients for the existing HostBridge and stream adapter. |
| JS streams | `@pocket/ui/streams` | Existing wire, unique stream IDs, bounded buffers, reads and concurrency, virtual deadlines, and cancellation cleanup. |
| Sensors and GATT | `pocket_hardware` | iOS Core Motion and CoreBluetooth. Android SensorEventListener and BluetoothGatt. The JS Hardware page starts and stops explicitly and selects a characteristic for read, write, and notification. |

The default Showcase has neither a deep-link manifest capability nor native URL
declarations. `--platform-experience` enables system bars and haptics only.

## Integration validation

- The services suite `flutter test --reporter expanded` passed all 39 cases.
- New scaffold, generator, JS streams, and platform experience Bun suites passed
  21 cases. The full JS UI and panel transport suites passed another 23.
- `demo/test/plugin_contract_export_test.dart` exported 21 capabilities from actual
  HardwarePlugin, PocketPlatformPlugin, and PocketHost/PocketPluginManager instances,
  then ran the CLI and strict tsc. The export covered array schemas for BLE and
  sensors and absence of disabled links. It caught and fixed readonly arrays
  failing the public JsonValue constraint. The test uses the public HostBridge
  type.
- `sdk/scripts/tests/streams_runtime.test.ts` builds actual qjbc and PAK with
  buildGuest. pocket_probe executes the SDK HostBridge, stream, and platform
  clients. It verifies repeated samples, errors and cancellation, responses after
  idle, rejection of disabled optional links, and subsequent real drawing.
- Standard Showcase iOS simulator build, Android
  `:pocket_platform:compileDebugKotlin :pocket_hardware:compileDebugKotlin`, and
  Demo analysis passed. Full Xcode typechecking exposed and fixed a String?/NSNull
  issue beyond Swift parse checks.
- SDK `flutter test --reporter expanded` passed 67 cases with four skipped for
  missing runtime and Worker fixtures. SDK analysis passed. Run `flutter pub get`
  within each optional package for analysis, keeping it outside core SDK dependencies.
- Eight platform package tests passed for zero default native calls, short-window
  deduplication and repeated opens, a single links owner, late activation cleanup,
  actual system-bar baseline restoration, monotonic haptics rate limiting, and schemas.
- Standalone opt-in consumer `/tmp/pocket-optin-20261104` passed actual
  `init --deep-link-scheme=pockettest`, buildGuest, iOS simulator build, and
  `flutter test integration_test/deeplink_test.dart -d 90B4AA40-E9B8-46B5-B70F-144ADEF9CB32`.
  Host `xcrun simctl openurl` delivered `pockettest://open/one`, repeated the same
  URL outside the deduplication window, and opened `pockettest://open/two`. Actual
  JS SDK subscriptions produced DrawOps text `events=1/2/3` and the latest URI.
  After initial OS confirmation to open the app, a repeat passed. This covers warm
  and repeated URLs via native delivery. Cold-start URLs and Android device
  delivery remained untested.
- Demo guest state, QuickJS ablation, and native probe scripts passed using existing
  buildGuest assets. Launch bar requests were answered with actual requestId and
  style was checked. Off-screen sections were scrolled into view before drawing checks.
- Full Demo `flutter test` passed 45, with eight each for platform and hardware
  packages. A combined JS SDK, scaffolding, generator, and actual bytecode stream
  run passed 33. CocoaPods output declarations run under real Ruby and Scene
  patch tests also passed.

## Native hardening

- GATT read, write, and CCCD share one serialized queue. Disconnect and timeout
  revoke the queue and producer before completing requests. Late callbacks are
  scoped by operation, peripheral, and characteristic identity. iOS returns busy
  if the characteristic already has active notifications, because CoreBluetooth
  shares that callback with reads.
- Owner and generation cleanup applies to pending-start cancellation, CCCD
  enable or disable failure, session disposal, and scan and one-shot sensor
  timeouts. Native prefixes guest stream IDs with trusted session and provider identity.
- The iOS manager and EventChannel currently support one FlutterEngine per process.
  Multiple JS apps and sessions share that engine. Rebinding the native sink when
  changing engines in the same process is outside current support.
- The first iOS build of a standalone project exposed CocoaPods 1.16.2 registering
  static XCFramework output as `PocketFlutter.framework` while copying a `.a`.
  `patchIosMinimum` applies an idempotent output correction to supported
  `post_install` hooks. The existing copy phase and link dependencies remain in use.
  Consumer Ruby logic is preserved. Unsupported custom hooks fail before writes.
  See the clean-build result below.

## Final checks

- Optional URL ingress moved to `PocketDeepLinkPlugin` (`flutter.links`, three
  link capabilities, background-safe). `PocketPlatformPlugin` owns foreground
  system bars and haptics. Both use the existing implementation and
  stream/controller queues. JS routing, recording, and page state remain the
  existing owners. Links now survive foreground UI revocation.
- The final opt-in simulator test passed four steps. It delivered the first warm
  URL, the same URL outside the dedupe window, a different URL, and a URL after
  returning to the system home screen. Actual JS DrawOps counted 1/2/3/4.
  The existing subscription survived background return. Cold-start and Android
  link delivery remained outside this validation.
- `demo/integration_test/legacy_capabilities_test.dart` passed. Actual JS taps
  checked links disabled by default, haptics, and system bars. Sensor streams
  produced a real sample or structured rejection after scrolling the result
  into view. Returning to Home showed the expected count and no guest exception.
- The final hardware suite passed all 11 cases. A new actual Host and PluginManager
  regression verifies 300 ordered samples and one native stop. It removed the
  old provider's short 256-sample cap while retaining the host event budget of
  10000 by default and the per-event byte limit. Consumer subscription and quota
  handling stay on the existing paths. Native writes check iOS
  maximumWriteValueLength and canSendWriteWithoutResponse. A busy result leaves
  retry decisions to JS.
- After `flutter clean`, the standalone project's first
  `flutter build ios --simulator --debug` passed in 59.1s, verifying corrected
  `.a` dependencies. The final ordinary Showcase iOS build passed in 39.4s.
  Android plugin and app Kotlin compiled. The unit-test task reported NO-SOURCE.
- The default, experience-only, and links scaffolds, Scene patch, and real Ruby
  output correction all passed. The source-only init check has a dedicated
  30-second file I/O budget so concurrent native compilation does not hit
  Bun's five-second default.
- Final SDK and platform analysis, architecture boundaries, and diff whitespace
  checks passed. The temporary consumer and installation package were cleaned up,
  and the standard Showcase was restored in iPhone 18 Pro simulator. Small source
  artifacts and logs remain in ignored `.pocket-build/legacy-integration/`.

Physical BLE, sensors, haptics, high refresh rates, and power measurements require
device validation. This run recorded no FPS or power improvement.
