# Flutter Input and IME Reuse Audit

This audit covers Flutter input in the two original projects outside `pocket_host`. It focuses on system `TextField`/`EditableText` and IME. PocketJS Osk is a separately drawn keyboard.

## Findings

Both projects have working system TextField integrations with different scopes.

- `PocketJSKit` provides a PocketJS-to-Flutter protocol. The guest sends `textInput.open/update/close`, Flutter overlays a TextField at the guest rect, and Flutter sends `textInput.edit/submit`. This is the current bridge's protocol and end-to-end reference.
- Legacy `pocketjs_flutter_demo` uses a Flutter TextField within the `View.Keyboard` VDOM component. It opens the real system keyboard and synchronizes text both ways. It lacks DrawList overlay, selection/composing, session ID, rect updates, and stale-event semantics.
- The current renderer inherited the first protocol and the second project's native editor principle. Stable keys, strict sessions, UTF-16 selection and composing, outside-click sequencing, and viewInsets protection address the original gaps.

## PocketJSKit Protocol and End-to-End Reference

| File and lines | Observation | Reuse |
| --- | --- | --- |
| `/Volumes/ORICO/Development/TryJoy.c/TryJoyMono/App/repos/pocket_flutter_poc/PocketJSKit/packages/pocket_flutter/lib/src/pocket_view.dart:935-1128` | `_textInputRectFromParams` parses the guest rect. `_openTextInput` creates controller and focus node and requests focus post-frame. The controller sends `textInput.edit` with text, selection, and composing. Submit sends `textInput.submit` and closes. Ingress dispatches open/update/close. | The current bridge uses this protocol and overlay. The original accepted missing event IDs at `:1012-1015`. Current sessions require exact IDs. |
| Same file `:1637-1679` | Appends `Positioned` and `TextField` after DrawList scene children and scales to the guest rect. The original `Positioned` has no stable key. | Reuse guest-rect positioning with a stable outer overlay key. Canvas block changes alter Stack siblings, and the key preserves keyboard focus. |
| `/Volumes/ORICO/Development/TryJoy.c/TryJoyMono/App/repos/pocket_flutter_poc/PocketJSKit/test/pocket_view_test.dart:1318-1408` | Widget tests cover open, rect, edits, selection/composing, submit, field removal, and editor taps without duplicate guest pointer events. | Reuse protocol cases. `testTextInput` covers the Flutter test channel and leaves hardware IME lifecycle to device tests. |
| Same file `:1410-1487` | `textInput.update` updates text, selection, and composing. `textInput.close` removes the field. | Reuse assertions and add stale-session and disposal coverage. |
| `/Volumes/ORICO/Development/TryJoy.c/TryJoyMono/App/repos/pocket_flutter_poc/PocketJSKit/integration_test/pocket_poc_test.dart:630-725` | Actual FFI and a Solid guest click DrawList `Flutter input`, wait for `pocket-text-input-flutter-ime-demo`, enter Chinese and emoji, set selection 2..10 and composing 0..2, wait for guest echo, and send done to verify submit. | Reuse this end-to-end sequence and echo fixture. It still uses Flutter test binding `testTextInput`. Real candidate UI and hardware keyboards need separate coverage. |
| `/Volumes/ORICO/Development/TryJoy.c/TryJoyMono/App/repos/pocket_flutter_poc/PocketJSKit/apps/solid-tests/app.tsx:523-588` | Guest filters `textInput.edit/submit/close` by ID. Open sends `{id,text,rect}`, edit reads selection/composing, and submit stores final text. | Reuse as a minimal fixture, particularly ID filtering and selection/composing echo. |
| `/Volumes/ORICO/Development/TryJoy.c/TryJoyMono/App/repos/pocket_flutter_poc/PocketJSKit/SUPPORT.md:18-20,26` | Recommends a separate system IME overlay using standard Flutter `TextField`/`EditableText` at the PocketJS layout rect. Upstream Osk is separately drawn. Hardware, Chinese candidates, and accessibility need independent testing. | Matches current architecture. Osk tests cover a different input path. |

### PocketJSKit Package Example

`packages/pocket_flutter/example/lib/main.dart:141-155` mounts `PocketView`, `device_control.js`, and PAK. `packages/pocket_flutter/example/test/widget_test.dart:5-17` only verifies mounted text. Input and IME references are the `apps/solid-tests` fixture, package tests, and `integration_test/pocket_poc_test.dart`.

## Legacy pocketjs_flutter_demo System Input

| File and lines | Observation | Reuse |
| --- | --- | --- |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/render/pocket_ui_components.dart:2523-2532` | `View.Keyboard` maps to `_PocketFlutterNativeKeyboardInput`. | This component uses Flutter native input. |
| Same file `:3507-3682` | Uses `TextEditingController` and `FocusNode`, listens to `node.propListenable`, and moves selection to the end when `currentInput` changes. `onChanged` updates `node.props['currentInput']` and dispatches `textInputChanged`. Buttons call `show/hide` through `SystemChannels.textInput`. Disposal removes the listener and releases controller and focus. | Reuse controller, focus, disposal, and explicit show/hide principles. The component lacks guest rect, `textInput.open/update/close`, selection/composing round trips, stale-session protection, outside tap and drag sequencing, and viewport/inset handling. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/syslib/pocket_syslib_flutter_ui.js:827-829` | `ui.keyboard({currentInput})` creates a `View.Keyboard` VDOM node. | This is the legacy VDOM API. The current DrawList has its own text-input contract. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/syslib/pocket_syslib_pages.js:724-768` | Showcase's Flutter TextField Soft Keyboard page (“Flutter TextField 软键盘”) puts `ui.keyboard({currentInput:'$typedText'})` in a card. Page text and `$typedText` demonstrate system input. | Useful for manual product demonstrations. Input is fixed in the VDOM layout, so dynamic guest-rect overlays need separate coverage. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/mini_apps/app_login/main.js:35-43`；`mini_apps/app_ui_showcase/main.js:29` | Both mini-apps use `ui.Keyboard` and depend on the component's own `buffer` and state. | Useful for legacy echo and business bindings. The bridge needs its own fixture. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/core/pocketjs_bundle_runner.dart:1001-1015,1749-1775` | The host updates `View.Keyboard.currentInput` in the retained VDOM. It updates `typedText`, node text, and tree after `textInputChanged` or `keyboardSetText`. | Reuse the guest/runner-owned state principle. Flutter edits and sends identified `textInput.edit` events. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/core/ffi_bridge.dart:550-577,625-649` | `View.Keyboard` only registers component tags and VDOM mappings. | No extra native IME ABI is available. |
| `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/test/pocket_38_components_screenshot_test.dart:82-177` | Covers screenshots, navigation, permissions, and plugin flow. It has no `TextEditingValue`, IME actions, selection/composing, or viewInsets lifecycle assertions. | Use as Showcase visual coverage only. |

## Current Renderer Reuse

### Retained Behavior

- Flutter `TextField`/`EditableText` is the system IME client.
- The guest rect positions the overlay, with controller, FocusNode, post-frame focus, `textInput.edit`, `textInput.submit`, `textInput.close`, and guest echo of text, selection, and composing.
- PocketJSKit event names and minimal payload shape for open/update/close and edit/submit.
- PocketJSKit cases for Chinese and emoji, selection/composing, removing the overlay after submit, and keeping editor touches out of the guest pointer stream.

### Strengthened Behavior

- Require exact session IDs for update and close. Looser matching could let old events affect new sessions.
- Key the outer `Positioned` so canvas block changes preserve `EditableText`. An inner TextField key cannot preserve the outer sibling.
- Keep the editor open through transient `viewInsets == 0`. Close on focus policy, explicit guest close, submit, outside tap, or runtime disposal.
- Dismiss on the next post-frame after complete outside down/up. Dragging leaves the editor open. This avoids closing the keyboard before pointer-up reaches its navigation target.
- Handle UTF-16 offsets, invalid composing ranges, keyboard type and action, multiline, and password metadata. The original projects did not cover the full contract.

### Reusable Cases

1. Use `PocketJSKit/apps/solid-tests/app.tsx:523-588` as the minimal guest fixture. Open sends `{id,text,rect}`, and edit/submit/close use the ID.
2. Reuse the widget test sequence and assertions in `PocketJSKit/test/pocket_view_test.dart:1318-1487`.
3. Reuse `PocketJSKit/integration_test/pocket_poc_test.dart:630-725` for actual runtime integration. Add actual viewInsets, focus stability, and navigation taps on device.
4. Reuse controller, focus, disposal, and show/hide from legacy `pocket_ui_components.dart:3526-3567,3584-3626` only for a standalone VDOM `View.Keyboard`. The current DrawList overlay has its own contract.

## Coverage Gaps

Neither original project has a physical-device IME test covering real hardware candidate UI, background and foreground transitions, focus through navigation, dynamic DrawList siblings, stale sessions, and selection/composing together. Existing simulator and widget tests verify the protocol through the Flutter test input channel. Physical-device acceptance is a separate host milestone.

## Viewport During Keyboard Animation

The user's recording `Screen Recording iPhone Duo 02-11-2026 at 12.17.35.mp4` showed the page briefly shrinking and centering as the keyboard appeared, then returning to full width. Frame inspection traced it to contain scaling between new host constraints and an old native frame. Continuous native resize probes showed the input visual rect moving monotonically upward.

Sources include Kit `lib/main.dart:32-51` and `packages/pocket_flutter/lib/src/pocket_view.dart:1390-1521`, plus legacy host layout in `lib/render/pocket_ui_components.dart:3851-3859` and `lib/ui/mini_app_host_page.dart:69-83`. Existing native viewport resize and JS scrolling stay in place. The owned runtime's automatic viewport shows the old frame at 1:1 with an explicitly sized OverflowBox clipped at top left until the new frame arrives. Explicit viewports, injected runtimes, and older runtimes lacking resize retain fixed preview fit.

Rendering uses the existing scroll animation, reveal, and layout state. Device regression checks canvas scale and anchors in each Flutter frame during opening and closing. Results are in VALIDATION.md.

## 14.44.40 Recording, Input Appearance and Navigation Shift

This work retained the Kit native editor protocol. The recording exposed two missing boundaries.

- The Flutter overlay inherited Kit's fixed dark appearance while JS used a white shell. JS `InputField` now declares shell styles and passes colors, font sizes, radii, borders, and padding to `textInput.open/update`. Flutter applies these to the system editor. Style-only updates preserve the controller, selection, and composing range.
- `resize_viewport` in `native/src/lib.rs` first sends `display.viewport` with only `width/height`. The old `parseDisplayGeometry` cleared omitted safe areas and reserved regions, moving the rail right → left → right as keyboard height changed. Omitted fields now preserve snapshots. Height-only changes keep reserved regions. Width changes discard previous region coordinates. Explicit zeros or empty arrays still clear values. Equal left/right insets choose the default right rail.

Ablation compared old `>=` and new `>` rail decisions for neutral geometry and added consecutive height-only resize for left/right divisions and explicit clear assertions. The fix uses geometry alone. Device acceptance added per-frame JS anchor x-coordinate and width checks because canvas scale and focus checks alone missed side changes.
