# Component Contracts and Acceptance Scope

Of the legacy demo's 38 named components, 20 map to upstream APIs and 18 are application components. The new project uses upstream contracts in place of the old C enum, `PocketUiNode`, and Dart component switch.

## Reskinning Preserves Default Behavior

Games and apps can define their own visual style by composing or reskinning existing controls. Buttons, inputs, lists, dialogs, and navigation inherit focus, press/cancel, disabled behavior, keyboard and gamepad access, scroll gesture arbitration, IME, safe areas, semantics, route deactivation, and lifecycle cancellation. Prefer theme, appearance, class, style, and existing primitives. Raw pointer handlers need to preserve these contracts.

Override behavior when the interaction model actually changes. Add regression coverage for drag-out cancellation, rapid input, nested scrolling, focus, accessibility, resizing, and physical touch. Review inherited behavior and visual changes independently. Matching screenshots only verifies appearance.

## Pinned Upstream Contract

- `.cache/pocketjs/contracts/spec/spec.ts` defines NODE_TYPE and DrawList v1.
- `.cache/pocketjs/framework/src/primitives.ts` defines primitives.
- `.cache/pocketjs/framework/src/components.ts` covers JS composition, focus, and Portal.
- `.cache/pocketjs/framework/src/native-tree.ts` accepts only `view/text/image/surface` host tags.

The four native nodes are `view`, `text`, `image`, and `surface`.

DrawList v1 has ten operations: `RECT`, `GRAD_RECT`, `GLYPH_RUN`, `TEX_QUAD`, `SCISSOR`, `SCISSOR_POP`, `TRI`, `TEX_TRI`, `TEXT_RUN`, and `SURFACE_QUAD`.

Flutter draws the operations and resources projected by native. JS components can share those drawing operations. Interpret upstream colors as ABGR and convert at the boundary. The old demo used ARGB assumptions.

## 20 Upstream Components

| Legacy name | API or location in this project | Verification scope |
| --- | --- | --- |
| View | `View` → view | Compilation, real native runtime, Flutter display, and interaction passed |
| Text | `Text` → TEXT_RUN | Same coverage for TEXT_RUN only |
| Image | `Image` → image | About uses SVG PAK. Compiles, with dedicated visual acceptance pending. |
| Sprite | `Sprite` → image and sprite metadata | Available upstream. Example does not mount it. |
| Surface | Official `CompositorSurface` → native `SURFACE_QUAD` | The retained host surface bridge supports `glass` and `platformTexture`. Video uses the latter's Texture provider. Arbitrary compositors are outside this bridge. |
| Screen | JS View composition | Used by the example and verified end to end |
| Focusable | JS focus and press wrapper | Guest buttons use an equivalent view and focusable contract. Actual clicks passed. |
| FocusScope | JS focus scope | Counter and navigation round trip passed. Keep navigation in the active scope. |
| FocusGrid | JS direction-key traversal | Composed through Grid. Dedicated direction-key acceptance was pending. |
| ActionHandler | JS input marker | Available upstream. Dedicated example coverage was pending. |
| Portal | JS overlay | Referenced through Modal. Broader overlay verification was pending. |
| Modal | JS Portal and focus scope | Example source exists. Clicking open and close was outside this regression gate. |
| ActionBar | JS Portal bottom bar | Removed from the example because it obstructed and duplicated global navigation |
| AuxiliarySurface | JS auxiliary output | Renderer path exists. Dedicated acceptance was pending. |
| AuxiliaryPortal | JS auxiliary overlay | Dedicated acceptance was pending |
| Named | JS DevTools name | Used by the example without adding a native node |
| Grid | JS View and FocusGrid composition | Example compiles and navigates |
| Lazy | JS mount lifecycle | Static probe verifies JS state triggers mounting |
| Gallery | JS page composition | Upstream provides a component. The example's identically named route does not establish component usage. |
| DeepZoom | JS Image/UV/TILESET composition | Available upstream. Example does not mount it. |

## 18 Application Components

These are application compositions outside the pinned upstream exports. Base compositions are in `guest/ui/index.tsx`. Mobile compositions are in `guest/ui/mobile.tsx`. `guest/components.tsx` retains the compatibility re-export.

| Legacy name | Treatment |
| --- | --- |
| View.Header | JS `Header` |
| View.PageIntro | JS `PageIntro` |
| View.SectionHeading | JS `SectionHeading` |
| View.ActionButton | JS `ActionButton`, with real press tests passing |
| View.Badge | JS `Badge` |
| View.EmptyState | JS `EmptyState` |
| View.MetricCard | JS `MetricCard` displays actual guest state. The synthetic “8 mounted” metric was removed. |
| View.StatusBar | JS `StatusBar` |
| View.NavigationBar | JS `NavigationBar`, with navigation round trip and state retention passing |
| View.ScrollButton | Use ActionButton when needed. The alias had no distinct behavior. |
| View.ScrollRail | The former button row was removed. Actual scroll semantics remain open. |
| View.Keyboard | JS `InputField` uses PocketView to mount Flutter `TextField`/`EditableText` with the system IME bridge. JS owns text and routes. The JS Keyboard and custom OSK wrapper were removed. This path covers system editor events independently of upstream `GuestFrame.text`. |
| View.Sparkline | The example is now named `MiniBarChart` to reflect bar-chart behavior |
| View.Text | JS `ViewText` combines title and description |
| View.Card | JS `Card` |
| View.Row | JS `Row` |
| View.WrapLines | The one-layer Text wrapper was removed. Use upstream wrapText for actual wrapping. |
| View.WrapTextPage | Pagination remains unimplemented. The placeholder was removed. |

## JS Mobile Components, Design Option C, and Transitions

The mobile and desktop components are JS/TSX compositions. `packages/pocket_ui/src/mobile.tsx` and `packages/pocket_ui/src/responsive.ts` implement Design Option C, combining Material 3 and Shadcn light/dark semantic tokens, three responsive breakpoints, two densities, and TDesign-inspired mobile and desktop feedback and form controls.

- **Semantic theme tokens.** `MOBILE_THEME_LIGHT` and `MOBILE_THEME_DARK` provide `canvas`, `surface`, `surfaceElevated`, `surfaceMuted`, `ink`, `muted`, `border`, `accent`, `accentSoft`, `accentInk`, `success`, `successSoft`, `warning`, `warningSoft`, `danger`, and `dangerSoft`. `MobileThemeProvider` switches themes immediately at runtime.
- **Breakpoints and density.** `deriveWindowSizeClass(geometry)` returns `compact` below 600px, `medium` at 600..959px, and `expanded` at 960px and above. `deriveDesignDensity(geometry, override)` and `DesignDensityProvider` choose `touch` with 44px rows or `desktop` with 36px rows.
- **Built-in components.** `mobile.tsx` exports `SafeAreaScaffold`, `MobileThemeProvider`, `DesignDensityProvider`, `MobileScaffold`, `MobileAppBar`, `MobileCard`, `MobileButton` with `filled`, `tonal`, `outlined`, `text`, and `danger` and corresponding `MobileFilledButton`, `MobileTonalButton`, `MobileOutlinedButton`, `MobileTextButton`, and `MobileDangerButton` aliases. It also exports `MobileBadge`, `MobileTag` (`Tag`, optionally selected), `MobileAvatar` (`Avatar`, with online indicator), `MobileListTile`, `MobileSegmentedControl`, `MobileSwitch`, `MobileStepper`, `MobileProgress` (`ProgressBar`), `MobileCheckbox` (`Checkbox`), `MobileRadioGroup` (`RadioGroup`), `MobileAccordion` (`Accordion`), `MobileSkeleton` (`Skeleton`), and the following feedback and overlay components.
  - `MobileAlert` (`Alert`) displays a status banner with `info`, `success`, `warning`, and `danger` colors and a dismiss action.
  - `MobileToast` (`Toast`) displays lightweight overlay feedback with the same four colors and an action button.
  - `MobilePopup` / `MobileActionSheet` (`Popup` / `ActionSheet`) use a rounded bottom drawer at `compact` and a centered overlay at `medium` or `expanded`.
  - `MobileDialog` (`Dialog`) supports ordinary notices, two-button confirmation, and destructive `danger` confirmation.
- **State transitions.** `useStateTransition` and `useAnimatedNumber` use onFrame damped spring interpolation or compiler `transition-colors`. Switch thumbs translate and scale. Progress and Stepper interpolate `scaleX`. Checkbox and RadioGroup indicators spring-scale. Accordion uses position and opacity. Skeleton pulses. Toast, Alert, Popup, and Dialog animate entry and exit with `opacity` and `translateY`. Rust `style.rs:declares_transform()` gates normal TEXT_RUN under non-translation transforms (`scale != 1.0` or `rotate != 0.0`). Containers with `<Text>` use `opacity`, `translateX`, `translateY`, and `transition-colors`. `scale` and `scaleX` apply to graphic indicator View nodes without text children.
- **Showcase.** The Mobile UI page in `demo/js/mobile-pages.tsx` shows interactive components across Overview, Feedback, Controls, and Data with live theme and density controls. Gallery in `demo/js/app.tsx` also lists Option C components. `sdk/packages/pocket_ui/test/design_system_native.test.ts` verifies rendering, interaction, and intermediate animation frames through actual QuickJS and Rust.

`computeTransitionDescriptor` in `guest/legacy.ts` provides four pure JS descriptors: `IOS_SPRING_PARALLAX`, `SHARED_AXIS_Z`, `LIQUID_GLASS_MORPH`, and `PORTAL_EXPAND`. `buildLiquidGlassRecipe` produces shape, blur/refraction, and sampling data. Device rendering and visual acceptance are separate.

## Surface Provider Scope

| Layer | Implementation | Verification scope |
| --- | --- | --- |
| JS registration | `GlassSurface` and `PlatformTextureSurface` call `pocket.registerSurface(packageId, kind, payload)` with `glass` or `platformTexture`. Cleanup calls `releaseSurface`. | `tests/mobile_ui.test.ts` checks registration, release, recipes, and routing. Arbitrary native views and compositors are outside JS registration. |
| Native | The bridge in `native/src/lib.rs` checks package, kind, JSON, and capacity, then projects `SURFACE_QUAD` with node, clip, and order. | Rust retained-surface smoke covers updates, clipping, destruction, and release. Video verifies a specific authorized media provider. |
| Flutter | `pocket_view.dart` inserts `PocketHostSurfaceOp` in a partitioned stack. `glass` uses `_PocketGlassFilter`. `platformTexture` draws a Flutter Texture after host `authorizePlatformTexture`. | `pocket_surface_test.dart` covers descriptors, paint order, clips, and revoked texture authorization. Actual camera frames and separate device visual acceptance remained pending. |
| Glass shader | `pocket_surface.dart` uses refractive `liquid_glass.frag` when `ImageFilter.isShaderFilterSupported` and shader loading succeeds. Non-Impeller, unsupported, and failed loads use a frosted BackdropFilter and tint. | The fallback produces frosted blur. Impeller and non-Impeller device appearance require separate acceptance. |

## Lower-Level Coverage at the Time of This Audit

- Text used TEXT_RUN, and native GLYPH_RUN opcode 3 was a gap at this baseline.
- The restricted native/Dart/JS SURFACE_QUAD provider accepts `glass` and `platformTexture`. Video combines `platformTexture` with an authorized Flutter Texture. Arbitrary compositor, Flutter view, and 3D renderer support were outside the provider.
- Guest `InputField` sends `textInput.open/update/close`. Flutter `TextField`/`EditableText` and the system IME client send edits back to JS. Upstream `GuestFrame.text` hardware keyboard and IME coverage remained open at this baseline.
- `demo/integration_test/system_keyboard_test.dart` passed on iPhone Duo simulator using an actual guest, Chinese and emoji, selection/composing, delete, done, and draft retention across navigation. Platform editing uses TestTextInput. Actual system keyboard lifecycle and per-frame canvas geometry are covered in `system_keyboard_lifecycle_test.dart`. See VALIDATION. `demo/integration_test/hardware_native_test.dart` exercises production MethodChannel hardware. Actual iOS and Android hardware requires the corresponding devices.
- Video, auxiliary surfaces, multilingual fonts, physical hardware, and performance require their own verification beyond the counter and navigation tests.

## Host Hardware Provider

`HardwarePlugin` in `packages/pocket_hardware/lib/src/hardware_plugin.dart` is the `flutter.hardware` provider compiled into the host and registered through Flutter's plugin registry. Downloaded packages use registered capabilities. `HardwareCapabilities` covers permission queries and requests, camera preview and Texture lifecycle, lenses, flash and capture, photo list and deletion, BLE, sensors, biometrics, location, and weather. `MethodChannelHardwarePlatform` maps non-object replies, `MissingPluginException`, platform errors, and timeouts to structured failures. `demo/test/hardware_plugin_test.dart` covers descriptor, Android-shaped contract, unsupported, timeout, late result, Texture cleanup, and weather coordinates. The coordinator uses `hardware_native_test.dart` for on-device permission, camera, and sensor integration on iOS and Android.

See [commands and results](VALIDATION.md).
