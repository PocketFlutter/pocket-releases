# Noble Bluetooth in Preview

The Preview **Noble Bluetooth** provider scans from the computer running the
editor service. It is the only Web SDK/Editor Bluetooth provider: the browser
Canvas projection never calls `navigator.bluetooth` or owns a GATT object. The
provider returns a bounded snapshot of nearby BLE peripherals, then uses the
same device's GATT services, characteristics, reads, writes, and notification
stream.

macOS and Windows use the npm backend
`@abandonware/noble@1.9.2-26`. The SDK's
[`noble-bluetooth.mjs`](../editor/native/noble-bluetooth.mjs) is only a thin
JSONL adapter around Noble. Noble owns the platform bindings (CoreBluetooth on
macOS and its WinRT binding on supported Windows versions); the adapter does
not contain device protocol parsing, product selection, a native protocol implementation,
or a second BLE state machine.

## Using Preview

1. Install the SDK workspace dependencies with `bun install`, install Noble in
   the consuming host (`npm install @abandonware/noble@1.9.2-26`), and run the
   editor (`bun run editor` from `sdk/`).
2. Enable **Noble Bluetooth** in Preview and use the product's scan/connect
   action. The device must be advertising and the adapter must be powered on.
3. Select a device returned by that scope's scan. A connect request for an ID
   that was not returned by the same scope is rejected.
4. Open the notification stream before issuing device controls. Application JS
   derives observed device state from those real device notifications; a
   successful write is not an execution acknowledgement.
5. Close the product or stop the Preview to release its streams and native
   connections.

Noble has no explicit permission-request API. The local provider therefore
   returns `hardware_unsupported` for
   `hardware.permissions.request` / `requestBlePermission`; the operating
   system handles Bluetooth access when a real scan or GATT operation runs.
   This response is intentional and must not be replaced with a fabricated
   `granted` result. If the OS denies access, fix its Bluetooth permission or
   adapter state and retry the operation.

The local provider runs on macOS and Windows. It needs Node.js, a usable BLE
adapter, and the current pinned native `pocket_probe` for the rest of Preview.
The SDK does not ship a generated Windows executable. Building one requires
the pinned Rust/MSVC environment, Bun, executable `python3`, and GNU
`patch`; the current repository's macOS launchctl wrapper is not a Windows
launcher. Windows transport routing has regression coverage, but this change
has not been physically validated on a Windows computer.

Browser Web Bluetooth is intentionally unavailable. A browser-only deployment
without a local Noble host receives an explicit unsupported/unconfigured
hardware result; it never falls back to a browser chooser or a fabricated
device list.

## Scope and lifecycle

Preview scopes are generation-fenced. Each scope owns its discovered device
IDs, GATT streams, and pending requests. Disabling the provider, closing the
Preview, changing runtimes, or stopping the server retires the scope and
cancels its scan, streams, and connections. Late native replies cannot revive
a retired scope. Stream cancellation removes only that stream's listener;
other streams remain active.

The helper reports a physical disconnect as a stream error, so JS can clear the
old GATT session and clear pending work. Preview currently has no separate
per-device disconnect capability; `client.disconnect()` ends the JS session
and the provider's scope disposal releases the native connection.

## Source and validation boundary

The retained `pocketjs_flutter_demo` was inspected outside `pocket_host/` for
the existing host transport boundary. `@abandonware/noble@1.9.2-26` supplies
the BLE npm dependency and its platform binding configuration. No Swift helper
or PowerShell BLE implementation is maintained in the editor; the native BLE
implementation remains in the npm backend.

`editor/test/local_bluetooth.test.ts` checks the Preview routing, structured
errors, stream lifecycle, and scope isolation with explicit test processes.
`editor/test/noble_bluetooth.test.ts` executes the production Noble adapter
against explicit test IO and checks scan advertisements, GATT inventory,
read/write response mode, first-notification delivery, ownership, cancellation,
and disconnect handling. These tests do not prove radio traffic.

Physical acceptance on macOS validated real BLE peripheral scan, connection,
GATT write, and three-channel plus battery notification delivery through the
CoreBluetooth and `@abandonware/noble@1.9.2-26` Preview paths. Physical Windows
BLE hardware and Flutter Blue Plus hardware remain unverified; see
[Hardware modules](HARDWARE_MODULES.md) and
[Web Bluetooth preview](WEB_BLUETOOTH_PREVIEW.md).
