# Flutter game input integration

The Flutter host implements the official PocketJS input protocol. Touch, keyboards,
and physical gamepads each retain their device semantics.

For the high-level SDK, opt in through host configuration.

```dart
const config = PocketAppConfig(
  appId: 'my.game',
  keyboardInputEnabled: true,
  keyboardAutofocus: false,
);
```

`PocketGuestSession` forwards these settings to the same `PocketView`. The session grants
`input.buttons` only when explicitly enabled. Default touch and dynamic viewport
already have real channels, and their admission list now matches. The keyboard flag
does not grant analog axes. Native policy merges and config copies preserve both
options. Remote packages cannot enable host input policy themselves.

The Showcase host composition enables keyboard input for bundled official
`dev.pocket-nexus.*` demos. Click the Canvas to use the keys. This is Demo policy.
The public SDK defaults to keyboard input disabled.

## Validated host entry points

`PocketViewController` exposes two entry points.

```dart
controller.sendButtons(
  buttons: 0x4000, // PocketJS BTN.CROSS
  analog: (128 << 8) | 128,
  rightAnalog: (128 << 8) | 128,
);

controller.sendAxes(<int, double>{
  0: 128, // LEFT_X
  1: 128, // LEFT_Y
  2: 128, // RIGHT_X
  3: 128, // RIGHT_Y
});
```

`sendButtons` sends the official `input.buttons` mask. `analog` and `rightAnalog` each
pack two 8-bit axes according to the pinned upstream format (0..0xffff). The center
value is 128. `sendAxes` uses official `input.axes` values in 0..255. It clamps out-of-range
values and rejects invalid axis IDs and non-finite values. The native runtime samples
and retains held buttons at the next frame. Axis samples are boundary values, with
game state handled in JS.

`sendButtons` supplies the provider's complete current mask. With keyboard enabled,
PocketView ORs it with its currently held keyboard bits and publishes one sample.
Clearing the external mask preserves bits still held on a keyboard, and releasing
keyboard keys preserves external bits. View disposal or runtime detach clears both
sources so the next guest generation starts fresh. External providers supply all
analog axes through `sendButtons` and `sendAxes`.

## Opt-in keyboard mapping

`PocketView` leaves host focus alone by default. A desktop Showcase or game can opt in.

```dart
PocketView(
  keyboardInputEnabled: true,
  keyboardAutofocus: false, // Click the Canvas to focus. Set true for keyboard focus at startup.
  controller: controller,
  // Override individual defaults with official BTN bits.
  keyboardButtonMap: <LogicalKeyboardKey, int>{
    LogicalKeyboardKey.keyF: 0x4000,
  },
)
```

Defaults include arrows and WASD, Space and Z for CROSS, X and Escape for CIRCLE,
J for SQUARE, K for TRIANGLE, Q and E for L and R triggers, Enter for START, and
Tab for SELECT. Clicking the game Canvas gives it focus. `keyboardAutofocus` defaults
to false. KeyDown and KeyUp publish only when the mask changes, and KeyRepeat does
not duplicate pressed edges. Focus loss, `inputEnabled=false`, lifecycle pause, and
disposal emit one zero sample to clear held buttons. An active PocketJS system IME
field receives key events for editing, with game buttons suppressed.

Aliases aggregate the set of currently held physical logical keys. If ArrowRight
and D are held together, RIGHT stays active until both are released. Changing
`keyboardButtonMap` during execution recomputes from the current set and drops old
bits. Hidden or inactive views ignore new key events. Keys must be pressed anew after
reactivation.

The keyboard path supplies actual Flutter key facts. For gamepads, obtain button
and axis values from a platform plugin and call the controller APIs above. Gamepad
providers are optional. Target profiles do not grant `input.buttons` or
`input.analog.*` by default. I2C, UART, gyroscope, and relative axes still require
their own hardware providers.

`input.buttons` samples per official GuestFrame. A quick KeyDown and KeyUp before
one vblank can be reduced to the final snapshot. For reliable edges, hold across
at least one GuestFrame. The host publishes snapshots without an edge queue.

## Provenance and ablation

The pinned contract comes from `BTN` and `ABSOLUTE_AXES` in
`sdk/.cache/pocketjs/contracts/spec/input.ts` and `contracts/spec/spec.ts`. Native
reuses `queue_buttons`, `queue_axes`, and GuestFrame encoding. Flutter adds only
focus and keyboard events on `input.buttons` and shares the existing ticker and
layout. JS owns game state.

The retained parent, excluding `pocket_host/`, was reviewed for input boundaries.
Its `native/pocket_runtime_multi.c` parses the same button and axis JSON names but
provides no reusable physical Flutter gamepad provider. Its `View.Keyboard` is
an IME text component and remains outside game input.

## Validation

```sh
cd sdk
flutter test --no-pub packages/pocket_flutter/test/pocket_view_input_test.dart
flutter analyze --no-pub packages/pocket_flutter
```

Regressions cover arrow press and release as `0x0020 → 0`, keyboard and external
mask merge and release, controller axis validation and clamping, detach cleanup,
and existing pointer, IME, focus, and disposal. They cover the Flutter-to-runtime
protocol. Physical and Bluetooth gamepads, browser Gamepad API, and device FPS need
their own tests.

Additional checks cover combined Arrow and WASD aliases, changed mappings, repeat
events, Canvas focus on click, clearing while inactive, and IME isolation. Native
QuickJS tests observe `0 → 0x4000 → 0` and axis changes in a real GuestFrame. That
native test uses a source fixture. Separate tests cover compiled QJBC.

## Standalone Web game input

Pass `gameInput: true` to `PocketWebRuntime` or set the same host config option to make
the Canvas focusable and sample standard-mapped devices from `navigator.getGamepads()`.
The keyboard defaults match Flutter. Standard face, d-pad, shoulder buttons, and
both sticks map to official button bits and packed axes. The default stick dead
zone is 0.15. Only standard device mappings are used.

Web reads devices per frame while the Canvas has focus, the page is active, and a
standard gamepad is present. Only changes wake the guest through existing
`inputFrame`. The existing ticker is reused. Hide, blur, disconnect, and dispose
clear held state and sampling callbacks. Desktop text focus suppresses game keys.

The implementation uses the pinned `contracts/spec/spec.ts` BTN and packed-analog
contract and existing `WechatHost.advance` and `web_advance` ABI. The retained
parent's `web_wasm_preview/index.html` had no reusable standard Gamepad provider.
`targets/web/game_input.js` adds the missing browser device boundary only.

`scripts/tests/web_game_input.test.ts` covers aliases, repeat edges, focus, composing
and system shortcuts, dual sticks and dead zone, disconnect, and release.
`scripts/tests/web_game_input_guest.test.ts` compiles UI QJBC and PAK, loads pinned
WASM, and sends keyboard and standard gamepad samples into an official frame.
It observes text `0:32896 → 1:32896 → 2:65280 → 2:32896` and actual software-rendered
pixel hash changes. Injected device samples exercise the protocol. Physical USB
and Bluetooth controller compatibility need separate verification.

## Visual novel keyboard adaptation

Lantern reuses the upstream `@pocketjs/framework` focus tree.
`sdk/.cache/pocketjs/framework/src/input.ts` maps arrows to focus traversal and
`BTN.CIRCLE` to activation of the current `Focusable`. `FocusScope` provides
autofocus, subtree input isolation, and focus restoration. The retained
`mini_apps/app_ui_showcase/main.js` and `mini_apps/app_nav/main.js` use `FocusScope`,
`FocusGrid`, and `Focusable` for keyboard and gamepad navigation, with Flutter
focus-scope adaptation described in `docs/03_DUAL_HOST_UI_COMPONENTS_SPEC.md`.
The old `View.Keyboard` serves IME text input. The VN uses the existing focus tree
for story controls.

The title and journal modal use the existing full-screen `FocusScope`. Dialogue and
choices use `Focusable`. On registration, official `focusNode` focuses the dialogue or
first choice. A shared scope leaves the stage's top and bottom pointer hit areas intact.
Closing the journal restores focus to the current dialogue or first choice. Escape
has no title handler and cannot bypass the title or change dialogue or choices.
Space and Enter activate the focused title action, reveal or continue dialogue,
select the highlighted choice, or trigger a menu item. The host's per-app
`keyboardButtonMap` remaps only Lantern Space, Enter, and numpad Enter to
`BTN.CIRCLE` and Escape to `BTN.CROSS`. Arrows and other apps retain default bindings.

- The retained parent's `mini_apps/app_ui_showcase/main.js` uses FocusGrid and
  Focusable actions in FocusScope. Pocket retains its focus navigation and confirmation model.
- `mini_apps/app_nav/main.js` uses an action grid scoped to a child app, which
  informed the retained subtree navigation boundary.
- `docs/03_DUAL_HOST_UI_COMPONENTS_SPEC.md` documents the FocusScope relationship to
  Flutter `FocusTraversalGroup`. Pocket uses `PocketView` `input.buttons` and the
  PocketJS focus tree.
- Pinned upstream `sdk/.cache/pocketjs/framework/src/input.ts`, `components.ts`, and
  `input-api.ts` define direction, Circle confirmation, `Focusable`, and `FocusScope`.

`PocketAppConfig.keyboardButtonMap` forwards per-app overrides to the existing
`PocketView.keyboardButtonMap`. Custom bindings override only matching defaults.
Lantern Host policy maps Space, Enter, and numpad Enter to `0x2000` (`BTN.CIRCLE`),
and Escape to `0x4000` (`BTN.CROSS`).
`demo/js/tests/novel_keyboard_native.test.ts` loads Lantern QJBC and PAK with the real
native `pocket_probe`. `input.buttons` GuestFrame samples check title and dialogue
confirmation, Escape journal access, choice focus and branching, and title and
choice protection against Escape. Physical keyboard compatibility in Flutter
requires separate testing.

Focus adaptation exposed a structure update failure. If `FocusTarget` rereads
`props.onNode` in `onCleanup`, the dynamic choice JSX getter accesses an unmounted
`Show` value accessor. The engine's listener boundary caught the exception.
The story snapshot advanced to new dialogue while retained UI and autosave stayed
on the old choice. `FocusTarget` now captures `onNode` and `autoFocus` at registration
and cleanup uses the captured callback. It still uses `Focusable`.

Native regressions used final Lantern QJBC and PAK and the pinned
`sdk/.pocket-build/current-native-tools/bin/pocket_probe`. They ran in this order.

- `bun test tests/novel_keyboard_native.test.ts` passed. GuestFrame keys went from title
  to dialogue, revealed and advanced text, opened and closed the journal with Escape,
  and moved with arrows and confirmed the second choice with Circle.
- `bun test tests/novel_native.test.ts` passed. Real pointer actions covered save and load,
  rollback, branches, multiple endings, and timed paths.
- `bun test tests/novel_viewport_native.test.ts` passed 24 assertions for phone and
  desktop viewports and pointer targets.
- `bun test tests/spine_native.test.ts` passed four assertions for Spine animation and menu pause.
- Flutter 3.47.9 passed `flutter test --no-pub test/pocket_config_test.dart` and
  `flutter test --no-pub packages/pocket_flutter/test/pocket_view_input_test.dart`.
  Coverage includes host key policy forwarding, mapping overrides, real edges, aliases,
  external input merge, focus, and IME isolation.
