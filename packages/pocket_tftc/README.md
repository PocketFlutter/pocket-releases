# @pocket/tftc

TFTC JavaScript package for device identification, frame encoding and decoding, secure handshakes, controls, heartbeat, and notification property parsing. The default entry has no dependency on Flutter, Electron, or Pocket UI. Native code handles Bluetooth IO.

## Installation

The SDK workspace manages the package in this repository. Standalone consumers can run `bun add file:/path/to/pocket/sdk/packages/pocket_tftc` in their project. The direct browser entry needs no Flutter. The `/pocket` adapter requires the public host and streams packages from `@pocket/ui`.

## Develop and Inspect the Product in Preview

Run `bun run editor` from the SDK root, open the project's Preview, and enable Bluetooth.

- **Local Bluetooth** on macOS and Windows scans on the machine running Editor. Select a device to connect. Both use dokidoki's `@abandonware/noble@1.9.2-26`, with its WinRT backend on Windows, replacing earlier PowerShell/WinRT code. Use Node.js, an operational BLE adapter, and enabled OS Bluetooth.
- Noble has no explicit `requestBlePermission` API. Local Bluetooth permission requests return `hardware_unsupported`; the OS handles authorization for real scans and GATT operations.
- The Web SDK and Editor project Canvas and input in the browser. The Editor process handles `hardware.bluetooth.*` via `@abandonware/noble`. Users needing Bluetooth install `npm install @abandonware/noble@1.9.2-26`.
- Use **Noble Bluetooth** for DK-META2 development. Scan results retain actual advertising manufacturer data. Identify devices from that data and retain secure validation for devices that require it.
- Keep the notify subscription open for real-time state without polling battery or work status. Release the subscription and connection on page exit. Local Bluetooth Preview always uses Bluetooth on the Editor server machine, including when opened remotely.

Windows Editor needs a native `pocket_probe.exe` matching the pinned runtime. Preview searches Cargo's Windows output or accepts `POCKET_NATIVE_PROBE`. The package does not bundle generated Windows binaries. Source builds require Bun, Rust/MSVC, executable `python3`, and GNU `patch`. After preparing pinned upstream, build from the SDK root with `cargo build --locked --manifest-path native/Cargo.toml --bin pocket_probe`, then run `bun run editor`. `build_native.sh` and the launchctl wrapper are not Windows entry points. This local review did not execute the Windows build steps.

`bun install` installs the optional Noble dependency. Source compilation needs the platform toolchain, and the SDK provides `node-gyp`. Set `POCKET_EDITOR_BLUETOOTH_NODE` to select Node. Native modules remain external to browser and Guest bundles.

Windows Local Bluetooth has npm transport and protocol regression coverage. **Physical Windows acceptance remains pending.** Real device testing ran on macOS, and browser automation uses explicit test IO.

## Integrate in a Product Page

```ts
import { TftcClient } from '@pocket/tftc';
import { createPocketBluetooth } from '@pocket/tftc/pocket';

// Reuse the page HostBridge. Product UI owns selectDevice.
const bluetooth = createPocketBluetooth(host, {
  selectDevice: devices => devices.find(d => d.name === 'DK-META2'),
});
const client = new TftcClient({ bluetooth, security });
const unsubscribe = client.on('change', ({ detail }) => {
  for (const change of detail.changes) {
    console.log(change.field, change.previous, '->', change.current);
  }
  // detail.state is the full observed state after this report.
});
await client.connect();
await client.setVibration(10);
// On page exit, stop, disconnect the client, and release owned streams.
await client.stop();
await client.disconnect();
unsubscribe();
bluetooth.dispose();
```

Register the host's existing `hardware.bluetooth.scan/connect/read/write` and `hardware.bluetooth.notifications`. The `/pocket` entry uses public `@pocket/ui/host` and `@pocket/ui/streams` without adding native TFTC business methods.

Pocket Guests without system timers must inject `timers: {setTimeout, clearTimeout, setInterval, clearInterval}` in milliseconds and `now`. Native Guests can inject a security provider and keep production keys outside the page. A full pinned buildGuest example is in `demo/js/acceptance/tftc.tsx`.

The Web SDK's Editor and local-service path loads `@abandonware/noble` in Node and maps actual scanning, connection, GATT, and notifications to the host capabilities consumed by `createPocketBluetooth(host)`. Install the unbundled Noble dependency in the app or Editor directory using `npm install @abandonware/noble@1.9.2-26`. Use `createBleSecurityProvider({ productSecretsByProductId })` for security. The built-in provider uses Web Crypto and ships without production secrets.

## Flutter Blue Plus Compatibility

The same `/pocket` adapter supports the `flutter_blue_plus` manufacturer data Map, with company ID as key and payload as value. JS restores the CID. Reads, response modes, notifications, and disconnection share the HostBridge contract. Flutter maps plugin IO and JS retains the device state machine. Data contract regressions passed. Actual replacement of the Flutter plugin and mobile acceptance remain pending. [Transport contract](../../docs/TFTC_TRANSPORT_CONTRACT.md)

## Real-Time Feedback Contract

State comes from the device. Sending a command does not optimistically change observed state.

| Event | Contents |
| --- | --- |
| `change` | Fields that changed after successful validation, decryption, reassembly, and decoding. Repeated values do not emit it. |
| `message` | Every valid application notification, carrying `command`, `msgId`, `payload`, `changes`, and `state`. Repeated reports can have empty `changes`. |
| `state` | Complete observed snapshot following a property report, matching `status()`. |
| `notify` | Raw valid notification frame retained for compatibility. |
| `connection-state` / `disconnected` | Connection lifecycle. |
| `command` | Record of a sent command. Device execution requires separate confirmation. |
| `diagnostic` | Frame validation, connection, security, and transport diagnostics. |

`client.on(name, callback)` returns an unsubscribe function. `change.detail` includes `source: 'notify'`, `command`, `msgId`, `timestampMs`, `raw`, `state`, and `changes`. Each change has this shape.

```js
{ key: 8, dataKey: 'VIBRATION_LEVEL', field: 'vibrationLevel',
  kind: 'raw', previous: 0, current: 10 }
```

Compact bytes also produce `kind: 'derived'` changes such as `battery`, `batteryStatus`, `isWorking`, `workModeState`, `commandFlag`, `linerStatus`, and `linerId`. Hide raw compact entries (keys 32/33/34) to avoid displaying changes twice. The first observation has previous value `null`. Battery retains the App's raw **0–50** scale and should be labeled accordingly.

## Controls and Scope

- Lifecycle: `connect`, `disconnect`, `pause`, `resume`, `stop`.
- Controls: `setLinear`, `setRotary`, `setVibration`, `setSuction`, `setHeat`, validated against the device profile.
- YXL ONE uses levels 0–9 for direct linear and rotary control. Standard TFTC uses 0–100 intensity. Rotation supports a negative direction.
- Raw standard properties: `writeSingle` supports App channel aliases and `writePairs` explicitly batches writes. `queryKeys` is a low-level matching response API. Preview uses notifications for state refresh. DK-META2 battery and work requests timed out in this test, so that firmware's query support remains unverified. Redundant `queryBattery` and `queryWorkState` methods and buttons were removed.
- `status()` reports observed properties. Unreported values are `null`. Unknown products, unmigrated operations, and unsupported channels fail explicitly.

See `DEVICE_PROFILES` for built-in models. TF aliases normalize to DK. PT3MAX/NAV reuse App rules through `resolveProductCommands` and `resolveProductOperation`. `executeCommands` supports explicitly migrated products. The source lacks verified advertisement names and PIDs for those models. Supply a verified profile via `profileForDevice` and `productKey: PRODUCT_IDS.DKPT3MAX` or `PRODUCT_IDS.DKASTP`.

The Pocket adapter cancels its notification stream and ends the local session. The host scope lifecycle releases physical GATT because Pocket has no per-device physical disconnect capability. Direct browser transport invokes GATT disconnect.

Product selection, account and game authorization, liner activation, OTA orchestration, Buttplug, and phone device simulation are outside this package. Use `@pocket/tftc/protocol` for the pure protocol entry. [Migration sources, ablation, and acceptance](../../docs/tftc-migration.md)

## Physical Device Acceptance and Regression

DK-META2 passed the real pinned Guest → Preview → FFB8 path. The earlier CoreBluetooth and npm Noble paths both captured:

- Vibration, linear, and rotary changes from `0 → 10 → 0`, with automatic stop after the pulse.
- `isWorking: false → true → false` and unsolicited battery updates of `33 → 32` on the old path and `32 → 31` on Noble.
- Live field names and previous and current values, without battery or work-state polling.

On macOS `@abandonware/noble@1.9.2-26` rediscovered DK-META2 and verified all three controls and notifications. The temporary acceptance screenshot is `/tmp/tftc-noble-notify-acceptance.png`. Physical Windows acceptance remains open.

The observed device advertised plaintext mode. Secure handshake passed protocol and Web Crypto regression. Physical secure-mode testing remains open.

Run from `sdk/`.

```sh
bun test packages/pocket_tftc/test editor/test/local_bluetooth.test.ts editor/test/noble_bluetooth.test.ts scripts/tests/native_probe_path.test.ts scripts/tests/export_web_sdk.test.ts
python3 scripts/check_architecture.py
bun scripts/build_guest.ts --project-root=../demo/js --entry=acceptance/tftc.tsx --outdir=/tmp/pocket-tftc-live-build
bun scripts/tftc_preview.ts
```

The last command starts the development hardware acceptance page at `http://127.0.0.1:8797/`. Use the existing Editor Preview for ordinary product development. For secure devices, configure server-side `TFTC_SECRETS_FILE` and keep production secrets out of source. The acceptance script security bridge is for the development page only.
