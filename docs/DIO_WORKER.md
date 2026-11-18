# Dedicated Dio IO Worker

## Usage and Execution

By default `PocketDioPlugin` runs Dio HTTP, response stream reading, JSON/text/bytes decoding, and size checks in a dedicated Dart IO Worker isolate. The first real request starts it on demand. Each plugin instance reuses one Worker. JS continues calling `createPocketDioClient(host).request()` and receives `{ statusCode, headers, data }`.

The main isolate retains capability and permission admission, RPC correlation, concurrency limits, and plugin lifecycle. JS owns requests, retry policy, authentication state, and page orchestration.

| Execution path | Use | Configuration and grants |
| --- | --- | --- |
| Official JS app Worker | Official `net.http` and background JS computation | `domains.worker` and Worker QJBC/descriptor. HTTP also needs `workerHttpOrigins`. |
| Dio IO Worker isolate | Flutter native host `dio.request` | Register `PocketDioPlugin` with `network` permission and plugin `allowedOrigins`. Worker use is automatic. |
| Web render Worker | Move UI, layout, and raster execution | `renderWorker` is off by default and does not change network access. |

Dio alone requires neither `domains.worker` nor `net.http`. The standalone Web SDK uses official app Worker HTTP and has no Dart Dio plugin.

## Integration and Customization

Existing registrations and the `--dio` generated factory use the IO Worker. The origin allowlist defaults to empty and comes from the trusted host.

```dart
PocketDioPlugin(allowedOrigins: {'https://api.example.com'});
```

Capability declarations and network authorization are separate. Origins must be explicit and redirects are not followed automatically. [Optional plugin JS usage and permissions](OPTIONAL_PLUGINS.md#dio-integration)

Create custom Dio clients inside the Worker using a top-level or static factory.

```dart
import 'package:dio/dio.dart';
import 'package:pocket_dio/pocket_dio.dart';

Dio createNetworkDio() => Dio();

final plugin = PocketDioPlugin(
  allowedOrigins: {'https://api.example.com'},
  dioFactory: createNetworkDio,
);
```

Replace `dio: existingDio` injection with `dioFactory`. The Worker owns Dio, adapters, and connections. The factory must not capture widgets, controllers, existing sockets, or other resources that cannot cross isolates. Startup failure returns a request error without main-isolate fallback.

## Bounded Execution and Lifecycle

The eight outstanding RPC slots include requests waiting for Worker startup and timed-out requests awaiting cancellation acknowledgment. Extra requests fail explicitly. Future timeout does not release a slot until the Worker replies. If cancellation remains unacknowledged for 250 ms, recycle the Worker so a later request can restart it. Deadlines cover startup and waiting. Guest timeout can only shorten the host cap. Raw response and JSON-encoded output limits, HTTP statuses, exact origin checks, and decode errors retain their existing semantics.

Deactivation and disposal cancel existing requests and complete their Futures. New requests can run when resumed and fail after disposal. Worker startup failure, unexpected exit, and request timeout fail pending requests without waiting for late replies. The sole Dio owner cleans resources, and disposal reclaims the isolate and message ports.

Moving response processing and decoding off the main isolate changes execution placement. Request latency and FPS require separate measurement.

## Sources and Ablation

The retained parent review excluded `pocket_host/`. `lib/core/real_hardware_bridge.dart:390` uses real HttpClient, timeout, and JSON decoding for weather but has no Dio Worker. `web_wasm_preview/index.html` contains a synchronous ring-buffer demo, `wasmWorkerStepEcho`, without a reusable Dart isolate.

The existing bounded implementation from `packages/pocket_dio/lib/src/dio_plugin.dart` moved to the Worker. PocketPlugin, HostBridge, and permission admission remain shared. The direct main-isolate Dio path was removed to keep a single network implementation.

## Validation

Run from the repository root.

```sh
cd sdk/packages/pocket_dio
dart test
dart analyze
```

Real loopback HTTP covers JSON, text, bytes, POST, non-2xx, redirect rejection, origin limits, oversized responses, total timeout, and lifecycle cancellation. A factory/interceptor created inside the Worker tags the isolate identity and an actual server echoes it back. iOS, Android, and macOS integration and sustained performance need separate platform acceptance.

### Recorded Results

Local `dart test` passed 19 tests and `dart analyze` reported no issues. JS bridge, Dio scaffold, and CLI/Studio template regressions passed 12 tests and 59 assertions. Before the backpressure fix, after eight dispatched requests timed out, a ninth still dispatched and later timed out. After the fix it immediately returned `request_limit` while cancellations were unconfirmed, and a subsequent request succeeded after recycling the Worker.
