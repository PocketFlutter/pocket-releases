# TFTC Bluetooth Transport Contract

`@pocket/tftc` implements the protocol in JS. Preview and the Web SDK use Noble for Bluetooth. A future Flutter transport using `flutter_blue_plus` can share `TftcClient`. Product logic remains in the JS protocol and UI.

## Transport Responsibilities

| Environment | BLE backend | JS entry |
| --- | --- | --- |
| macOS / Windows Editor Preview | `@abandonware/noble@1.9.2-26`, matching the dokidoki pin | `createPocketBluetooth(host)` |
| Web SDK / Editor Canvas page | Editor process `@abandonware/noble` via Preview SSE. The page has no direct Bluetooth access. | Same Pocket adapter |
| Flutter | `flutter_blue_plus`, with the thin host mapping the I/O described below | Same Pocket adapter |

Noble handles system Bluetooth. The Editor maps scan, GATT, and streams. A future Flutter host calls the plugin and handles permissions, lifecycle, and actual disconnects. TFTC frame processing, PID/FMSK, the security flow, device controls, heartbeat, and property parsing remain in JS. The native SDK transport has yet to switch to `flutter_blue_plus`. The tests below verify data compatibility. Real-device Flutter plugin migration is tracked separately.

Noble exposes no explicit permission request API. Its adapter returns structured `hardware_unsupported` for `hardware.permissions.request` or `requestBlePermission`. The OS handles Bluetooth authorization when scanning or performing GATT operations. The host must report actual permission status. Browser Canvas only projects rendering and input and holds no Bluetooth objects. Flutter follows its own platform permission flow.

## HostBridge Requests

Use `hardware.bluetooth.*` for native capabilities. TFTC product capabilities stay in JS.

| Request | Params | Required success result |
| --- | --- | --- |
| `hardware.bluetooth.scan` | `timeoutMs`, optional `services` | `devices: [{id,name,rssi,manufacturerData}]` |
| `hardware.bluetooth.connect` | `deviceId` | `services: [{uuid,characteristics:[{uuid,canRead,canWrite,canWriteWithoutResponse,canNotify,canIndicate}]}]` |
| `hardware.bluetooth.read` | `deviceId,serviceUuid,characteristicUuid` | `value: number[]` |
| `hardware.bluetooth.write` | Same as read, plus `value: number[], withResponse: boolean` | `bytesWritten`, returned only after native completion |

Responses preserve the request's `requestId` and `capability`. Failures return structured `ok:false,error:{code,message}`. A write callback, empty list, or ordinary status is insufficient for TFTC authentication. Device IDs are opaque backend identifiers. UUIDs accept short and full forms.

`services` contains accessible services reported by Noble. Advertisements can omit services. The JS page filters and selects products.

## Manufacturer Data

Noble/CoreBluetooth arrays include a two-byte little-endian company ID.

```js
manufacturerData: [0xc5, 0x5f, /* raw manufacturer payload */]
```

`flutter_blue_plus` exposes `AdvertisementData.manufacturerData` as `Map<int,List<int>>`, with the company ID in the key and only the payload in the value. The host can pass the JSON object through to JS.

```js
manufacturerData: { '24517': [/* raw plugin payload */] }
```

The Pocket JS adapter restores the company ID before calling the same protocol parser. Preserve byte order for PID/MAC and all security flags. Insert the CID once and use the protocol-defined FMSK. An empty map indicates absent advertisement data. Preserve multiple records as received. The parser rejects ambiguities and conflicts. To access actual advertisement and manufacturer data from the browser page, load Noble in the Editor host.

## Notifications and Disconnects

The Flutter host enables notifications on the characteristic, listens for `onValueReceived`, and publishes every actual byte update to the existing `hardware.bluetooth.notifications` stream.

```js
{ type:'event', name:'stream.data', payload:{
  streamId,
  data:{deviceId,serviceUuid,characteristicUuid,value:[/* raw bytes for this update */]}
} }
```

The host forwards each notification separately, preserving raw attributes and relying on actual device state. Noble uses `data` for both reads and notifications. Only `isNotification === true` is forwarded as a notification to avoid duplicates. JS validates, decrypts, and reassembles protocol fragments before raising `message`, `state`, and `change`.

Canceling a stream removes its listener. Keep CCCD enabled while other subscriptions remain. A physical disconnect sends `stream.error`, such as `hardware_bluetooth_disconnected`, so JS can close the old session. Scope release cancels in-flight scans and releases its connections and streams. Discard late results for destroyed sessions.

Pocket currently has no per-device physical disconnect capability. `client.disconnect()` ends the JS session and cancels subscriptions, and scope release performs the physical disconnect. Preserve that distinction when integrating `flutter_blue_plus` so the reported state reflects actual plugin calls.

`withResponse:true` maps to `characteristic.write(value, withoutResponse:false)`. The other direction uses `withoutResponse:true` when the characteristic supports it. Honor actual transport MTU and write limits and preserve frame boundaries across GATT writes. Ordinary controls use small frames. OTA orchestration and arbitrary large frames are outside the declared support.

## Verification Scope

- `packages/pocket_tftc/test/pocket-bluetooth.test.ts` executes `TftcClient → HostBridge` with test I/O for Flutter manufacturer maps, GATT inventory, and notification bytes. It checks state, field changes, write mode, and absence of optimistic state.
- `editor/test/noble_bluetooth.test.ts` exercises the production adapter with explicit Noble test I/O. It checks advertisements, GATT, first notification, read versus notify, ownership, cancelation, and disconnect.
- macOS DK-META2 validation on the final `@abandonware/noble@1.9.2-26` Preview path covered three-channel pulses and field reports. Windows and Flutter Blue Plus still require their own physical device environments. See [migration and acceptance records](tftc-migration.md).
