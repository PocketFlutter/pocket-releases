# iPhone Duo native host review

Reviewed 2026-11-02. The current Flutter host lives under `../demo/ios`. This review covers window and safe-area transport and iPhone Duo's official resizing requirements. Historical `host/` paths refer to today's Demo. The SDK owns native geometry, window synchronization, and JS responsiveness. See the evidence below and VALIDATION for device limits.

## Findings

The review found no native host setting that locks iPhone Duo to an old aspect ratio or letterboxing.

- `host/ios/Runner/Info.plist:31-43` declares portrait and landscape left and right. Native code has no `supportedInterfaceOrientations` lock.
- `Info.plist:73-93` uses `UIApplicationSceneManifest`, `UIWindowScene`, `FlutterSceneDelegate`, and the `Main` storyboard. `AppDelegate.swift` registers Flutter and plugins and does not instantiate a legacy window sized from `UIScreen.main.bounds`.
- `UIRequiresFullScreen` is absent. Preserve iPad multitasking semantics and use responsive layout to address letterboxing.
- Debug, Profile, and Release have an iOS 15.0 deployment minimum. Current Xcode can still compile against its current SDK.
- Local read-only output showed `Xcode 27.2 (27B52)`, iPhoneOS SDK `27.2`, and an `iPhone Duo` simulator on iOS 27.1, UDID `4D366210-290E-46DB-8BC6-3C5233700409`. The project uses `SDKROOT = iphoneos` without an old SDK path or version pin such as `SDKROOT = iphoneos15`.

Native platform code moved from Runner into auto-registered `pocket_flutter` and `pocket_hardware`. Duo adapts through sizing, with no new full-screen-only declaration.

## Official requirements and reference article

Apple's preparation guide specifies three requirements. [Prepare for iPhone Duo](https://developer.apple.com/iphone-duo/prepare/)

1. The iOS 27 SDK allows dynamic app resizing on open and close. The iOS 27.1 SDK or later targets edge-to-edge optimization. Toolbars and tab bars may stack vertically below the status bar.
2. Use view/window bounds and trait/size classes and re-layout when dimensions change. Avoid `UIScreen.main.bounds`, a single startup size, `UIDevice.current.orientation`, `statusBarOrientation`, fixed device dimensions, and phone/pad idiom for layout.
3. Use the Xcode 27.1+ iPhone Duo simulator and Device Hub to exercise open, closed, rotated, and partially folded postures.

The Apple Tech Talk explains that inner-screen layout uses size classes, trait collection, and scene bounds. Supported orientations do not determine that layout. Safe area and margins may be asymmetric. iOS 27.1 `ReservedRegion` and `UIViewReservedRegion` let custom bars and edge-to-edge UI avoid camera and folding regions. `UIRequiresFullScreen` remains honored, while opening and closing still trigger resize. [Prepare your app for iPhone Duo](https://developer.apple.com/videos/play/tech-talks/111461/)

The user-provided Zhihu article was read in Safari after an automated fetch returned 403. It is a third-party explanation. Its guidance agrees with Apple on retaining one UI state across screens, laying out to available space instead of maintaining orientation-specific pages, allowing side toolbars or tabs, and respecting camera and fold reserved regions and asymmetric safe areas. Moving local elements while retaining the information structure avoids scaling the whole page as a fixed-ratio image during the transition. [Detailed iPhone Duo adaptation](https://zhuanlan.zhihu.com/p/2081732020691117995)

## Host and geometry evidence

| File and lines | Current behavior | Duo implication |
| --- | --- | --- |
| `host/ios/Runner/Info.plist:31-43` | iPhone supports portrait and landscape left/right. iPad lists all four orientations. | No single-orientation lock. Drive inner-screen JS layout from size and size class. |
| `host/ios/Runner/Info.plist:73-93` | Dynamic scene manifest, `FlutterSceneDelegate`, one app scene, and the `Main` storyboard. | The scene owns the window. |
| `host/ios/Runner/AppDelegate.swift` | `FlutterAppDelegate` calls only `GeneratedPluginRegistrant`. Plugins auto-register geometry and hardware. | No fixed window frame, orientation lock, or native business pages. |
| `host/ios/Runner/Base.lproj/Main.storyboard:14-21` | Flutter view has `widthSizable`/`heightSizable` and no fixed constraints. | The initial 600×600 rect is a design canvas. |
| `host/ios/Runner.xcodeproj/project.pbxproj:462,592,643` | Debug, Profile, and Release minimum is iOS 15.0, with `SDKROOT=iphoneos`. | Xcode 27.2 builds against SDK 27.2. The ReservedRegion bridge requires SDK 27.1+ UIKit symbols, independent of deployment minimum. |
| `host/ios/Runner.xcodeproj/project.pbxproj:465-466,646,649` | `SUPPORTED_PLATFORMS=iphoneos` and `TARGETED_DEVICE_FAMILY=1,2`. | Builds for iPhone and iPad. Duo does not use a dedicated iPad page. |
| `packages/pocket_sdk/lib/src/pocket_app.dart` | `PocketApp` mounts `PocketGuest` / `PocketView` without clipping the canvas with an outer `SafeArea`. | Backgrounds extend edge to edge. JS receives OS geometry and places controls. |
| `packages/pocket_flutter/lib/src/pocket_view.dart:827-947` | Computes safe area from actual host RenderBox, `View` DPR, and per-side `viewPadding`, and sends `display.viewport` to native and Guest. | Supports nested SafeArea and asymmetric insets with actual host dimensions. |

With SDK 27.1+ and UIKit ReservedRegion available at runtime, `packages/pocket_flutter/ios/pocket_flutter/Sources/pocket_flutter/PocketDisplayGeometry.swift` reads division and occlusion updates on layout, scene, and hinge changes. It sends `display.viewport.reservedRegions` to JS. Dart clips window coordinates and converts to local PocketView guest coordinates. Older runtime versions safely return `supported=false` or an empty list. The new symbols still require SDK 27.1+ at build time and the deployment minimum remains 15.0. `@pocket/ui` responds to actual viewport and reservedRegions with the existing JS layout and pages.

## Existing and pending verification

- `docs/VALIDATION.md` records real Guest execution on the iPhone Duo iOS 27.1 simulator, keyboard lifecycle, a per-frame 1:1 top-left-anchored canvas, scrolling, and updates. `host/integration_test/page_scroll_test.dart` and `system_keyboard_lifecycle_test.dart` cover resize and input lifecycle. Other postures require separate checks.
- `../demo/integration_test/hardware_native_test.dart` and `docs/HARDWARE_REUSE.md` record the production MethodChannel hardware contract on the Duo target. Fold layout, ReservedRegion, and physical-device permissions remain separate.
- The native config review leaves folding verification to explicit tests. New viewport unit tests cover asymmetric safeArea, nested host hits, and keyboard overlap.

Still verify these postures in Duo simulator Device Hub:

- Closed outer portrait and landscape, fully opened inner portrait and landscape, partly folded tent and tabletop, intermediate open/close/rotate frames, and left/right Split View when available.
- In each posture, record PocketView RenderBox size, `display.viewport` width and height, four safeArea values, and first and last DrawList frames. Confirm the app does not apply legacy whole-page contain scaling, horizontal centering, or switch business routes.
- Check JS toolbar, tabs, inputs, and Hardware page with asymmetric left/right insets. Keep critical text and controls clear of the central fold. Showcase pages remain JS. Native provides shell, renderer, IME, and explicit capability transport.

## Reproducible simulator steps

Xcode 27.2 `xcrun simctl help` has no `pose` subcommand. Find and boot Duo:

```sh
xcrun --sdk iphoneos --show-sdk-version
xcrun simctl list runtimes
xcrun simctl list devices available | rg 'iPhone Duo'
DUO_UDID=4D366210-290E-46DB-8BC6-3C5233700409
xcrun simctl boot "$DUO_UDID"       # Skip if already booted
```

Use the Xcode 27.1+ Device Hub Duo controls for `open`, `close`, `rotate`, and `fold`. Wait for the app to resize at each posture before capture. Use `simctl` for device state and capture:

```sh
xcrun simctl io "$DUO_UDID" screenshot artifacts/duo-open.png
xcrun simctl io "$DUO_UDID" recordVideo --codec=h264 artifacts/duo-fold.mov
# Press Ctrl-C after opening, closing, and folding
```

Device Hub is Apple's recommended native testing entry. If a pose CLI is added, take the exact parameters from `xcrun simctl help`. These steps were documented without launching or folding the app during the source review.

## Open and close verification with the public SDK

`duo_geometry_native_test.dart` exercised open → partially open → closed → open in Device Hub. Real UIKit data flowed to JS through the auto-registered `PocketFlutterPlugin`. The observed open size was 951×669 and closed size 466×678, with division activity changing by posture. The values are evidence from that run.

A real regression caught a 569 pt right inset when a stale 951 pt native frame coincided with a new 466 pt FlutterView. Events now wait for native geometry, FlutterView, and the automatic viewport's PocketJS frame dimensions to agree. The final regression saw no anomalous inset and added device assertions. A fixed preview viewport retains its existing scale and coordinate mapping. UIKit IDs use Hashable identity, avoiding duplicate `ID()` strings from `String(describing:)`.

`@pocket/ui` provides `createDisplayGeometry()`, `deriveResponsiveLayout()`, and `availableDisplayPanes()`. The shared library observes geometry and interprets safe area, occlusion, and division, and apps compose navigation and screens from those results. Full rotation, multiple windows, and physical Duo posture coverage remain open.

## 2026-11-04 screenshot feedback on the top-right status area and mini-app close button

Source captures are issue evidence and were left outside the repository:

- `/Volumes/ORICO/mac-caches/tmp/codex-clipboard-mN9Aow.png` shows the folded posture.
- `/Volumes/ORICO/mac-caches/tmp/codex-clipboard-v9wWpT.png` shows the open posture.
- New feedback captures `/Volumes/ORICO/mac-caches/tmp/codex-clipboard-YC0oQV.png` and `/Volumes/ORICO/mac-caches/tmp/codex-clipboard-F4pMw1.png` confirm spacing below the folded contour and the late viewport on first mount when open.

The JS SDK now applies local avoidance. Device Hub screenshot follow-up remains pending.

- Open and folded mini-app close buttons stay in the 60 px `reservedActions="mini-app"` slot on the right side of `MobileAppBar`, right of the Guest A/B badge and left of the right status safe area. The folded button no longer moves below the right-side status area.
- In the open posture the top-right allowance was too small and status icons overlaid the banner. The banner gets local contour clearance. The rest of the page receives no extra global right or top inset.

### JS implementation

- `topRightOcclusionFrame()` in `sdk/packages/pocket_ui/src/responsive.ts` uses active `occlusion.frame + margins`. It returns only a local contour touching top and right and excludes full-height obstructions. It uses no screen width, model name, or fixed icon size. The open app bar and StatusBar use `DISPLAY_UI_SAFETY_GAP=12` logical px of UI spacing independent of OS margins.
- `system-surfaces.tsx` takes raw `reservedInsets` as authoritative OS safe area. It applies them once to the top `44×44` close target, then calls `avoidDisplayOcclusions(..., { prefer: "horizontal" })`. The button stays to the right of Guest A folded (`x=330..374, y=8..52`) and open (`x=815..859, y=8..52`). The 30 px concentric-circle artwork and 44 px touch target stay the same.
- `SafeAreaScaffold` uses `pageInsets` to remove a conservative global right projection when `safeArea.right` exactly equals the local top-right occlusion width and a vertical division exists, active or inactive. A folded posture without division retains global right. `StatusBar` adds local right clearance, shrinks or wraps long details, and keeps an explicit label/detail gap. This component-level reserve avoids narrowing the whole page.
- `sdk/packages/pocket_ui/src/display.ts` caches the latest canonical geometry per host bridge on the existing display event lane and replays it to late-mounted mini-app surfaces. Same-width partial keyboard or resize events retain prior safeArea and reservedRegions, preventing the first frame from moving into the camera or status area when raw fields are absent.

This policy uses native `reservedRegions`. If the OS supplies only safeArea or lacks a contour, keep conservative insets until the host can supply geometry.

1. JS and native fixtures verify folded contour, active and inactive open division, long detail, 44 px hitbox, and geometry updates. Run `bun test packages/pocket_ui/test/responsive_occlusion.test.ts`, `bun test packages/pocket_ui/test/safe_area_native.test.ts`, and `bun test js/tests/mobile_ui.test.ts`. `duo_close_native.test.ts` also covers the first stable close hit for a late subscriber after full and partial viewport updates.
2. Duo Flutter integration on the actual simulator (UDID `4D366210-290E-46DB-8BC6-3C5233700409`) verified two folded top close hits with viewport `466×678`, contour `Rect(382,0,466,174)`, and pointer center `(352,30)`. Both reported `closedByRealPointer=true`, verifying Flutter-to-PocketView-to-JS input and the folded app-bar hitbox.
3. Device Hub captures of folded, open, and intermediate resize frames still need to confirm that real status-icon bounds match `frame + margins`. Add actual open-posture clicks after posture changes.
4. No service restart or Flutter/native geometry bridge change occurred in this round.

Additional automation, `bun test sdk/packages/pocket_ui/test/duo_close_native.test.ts` from the repository root, builds real bytecode and instantiates `SystemAppSurfaces`. It switches folded, open, and folded geometry in one native runtime. The test clicks the folded top-right status area, below the folded right rail, the folded top slot right of Guest A (`x=352, y=30`), the open status area, the open top slot (`x=837, y=30`), and the status area, right rail, and top slot after folding again. Per-hit assertions are `0 / 0 / 1 / 0 / 1 / 0 / 0 / 1`, avoiding a false positive from aggregate hit counts. The late-subscriber plus partial viewport fixture verifies the first stable hit in the top slot. The first admitted frame during transparent entrance animation is outside the measurement because pocket_probe DrawOps do not expose that node's computed style. Actual PocketJS hits are verified. UIKit icon pixels still need Device Hub captures.

## 2026-11-04 bottom TabBar and Duo posture changes

### Root causes

1. Showcase navigation is drawn into the Flutter canvas by the JS guest component `sdk/packages/pocket_ui/src/ui.tsx:NavigationBar`, exported as `TabBar` and `BottomNavigationBar`.
2. The old code selected a vertical right rail (`width: 104, marginR: 84`) at `width >= 720` or with a vertical division, leaving an 84 pt gap. The product requires a horizontal, evenly divided bottom bar.
3. After folding from open, the bar shrank to a roughly 104 pt square at bottom left. Mounted `NavigationBar` changed from `{ width: 104, marginR: 84, ... }` to `{ paddingL, paddingR, paddingB }`. PocketJS `setStyleObject` (`sdk/.cache/pocketjs/framework/src/native-tree.ts:704-722`) overlays supplied keys and retains omitted overrides. The old width and margin stayed in `node.overrides` and overrode `w-full`. Duo also projected the top-right status area (13:12 and ring) as global `safeArea.right = 84`. The bottom bar used `paddingR: 84`, leaving 20 pt inside the residual 104 pt width for Home, Gallery, and Host.

### Reused source and changes

- Reused the `BottomNavigationBar` contract from `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo/lib/render/pocket_ui_components.dart:2239-2345`: fixed bottom height, bottom safe-area padding, and evenly distributed horizontal `Expanded` children.
- `sdk/packages/pocket_ui/src/responsive.ts` exports `bottomBarInsets(geometry)`. The bar consumes bottom safe area (34 pt). It retains horizontal margins only when an active occlusion intersects the bottom bar height band (`top + height > geometry.height - (64 + base.bottom)`). The local top-right area's projected 84 pt inset no longer narrows the bar.
- `NavigationBar` in `sdk/packages/pocket_ui/src/ui.tsx`, also exported as `TabBar` and `BottomNavigationBar`, renders one full-width horizontal tab bar in all postures using `flex-row items-center w-full shrink-0` and `flex-1` children. Inline style uses `{ paddingL, paddingR, paddingB }` only.
- `demo/js/app.tsx` removes left and right rail branches. The shell uses one `flex-1 flex-col h-full overflow-hidden` column with `flex-1 w-full h-full overflow-hidden` route viewport over `<NavigationBar>`.

### Verification

- `bun sdk/packages/pocket_ui/test/navigation_bar_native.test.ts` checks native 390×844, 720×844, narrow/wide transitions, and 951×669 open → 466×678 folded → 951×669 open on Duo. Three tabs are equal width and aligned, with bottom safe area.
- `bun test tests/mobile_ui.test.ts tests/guest_state.test.ts` and `bun tests/guest_ablation.ts --required` passed from `demo/js`.
- `pocket_probe` loaded rebuilt `demo/assets/app.qjbc` and `demo/assets/app.pak` with recorded `duo_geometry.json`. Open (951×669) tab x centers were 159/475.5/792.5 at y=616. Folded (466×678) centers were 78/232.5/388.5 at y=625. Round trips left no stale width and vertical drag scrolling worked.

## 2026-11-04 progressive contour avoidance in scrolling UI

### Root causes

Camera, time, and signal ring overlapped content at the top right:

- Demo root `<SafeAreaScaffold edges={["top"]} ...>` did not consume right. Old `SafeAreaScaffold.topRightContentReserve()` returned zero for `pageInsets(current).right > 0`, including folded Duo right=84, allowing Header, Tabs, PageIntro, and Card to overlap the 84×174 status area.
- Nested `MobileScaffold` with default `edges="none"` replaced the parent's `SafeAreaScaffoldContext`, causing pages to lose `displayGeometry` and the contour.
- Children such as Card, MobileCard, Row, List, and TileGrid kept full width as scrolling moved them upward into the obstruction.

### Reused source and changes

- Reused `topRightOcclusionFrame()` in `sdk/packages/pocket_ui/src/responsive.ts` and `ScrollablePage` with `committedLayout` (`pocket.getLayout`) in `sdk/packages/pocket_ui/src/ui.tsx`. `_reservedRegionsForHost` in `sdk/packages/pocket_flutter/lib/src/pocket_view.dart` combines Flutter `MediaQuery` and `FlutterView.displayFeatures`, mapping `DisplayFeatureType.cutout` to occlusion and hinge/fold to division. Android single and pill cutouts and notches, and iOS 27.1+ ReservedRegion, provide exact obstruction bounds in portrait and landscape to the existing JS layout.
- `sdk/packages/pocket_ui/src/responsive.ts` adds `hasLocalLeftOcclusionInset(geometry)`, `hasLocalRightOcclusionInset(geometry)`, and `hasLocalTopRightOcclusionInset(geometry)`. They detect when safeArea.left or safeArea.right comes solely from a local side or corner occlusion, such as Duo's status cluster, a landscape notch, a Dynamic Island, or a camera cutout. Releasing that page-wide inset restores full width above and below.
- The same module adds `DISPLAY_CONTOUR_CLEARANCE_PX = 5`, `DISPLAY_CONTOUR_BOTTOM_TRIM_PX = 14`, `DISPLAY_CONTOUR_RAMP_PX = 5`, `leftOcclusionFrames`, `rightOcclusionFrames`, `sideContourReservesForBand(geometry, visualTop, visualBottom, options)`, and `topRightContourReserveForBand`. These support overlapping contours on both sides, a 5 px clearance, and a 14 px bottom trim for tall top-corner status capsules. Items moving up from below narrow smoothly across `[cutoutBottom, cutoutBottom + 5px]` using C1-continuous Hermite smoothstep (`3t² - 2t³`). At a centered landscape notch or cutout with `cutoutTop > 0`, the same curve restores full width across `[cutoutTop - 5px, cutoutTop]`. Top-anchored occlusions at `cutoutTop = 0` suppress the rebound above the screen to avoid offscreen reflow jumps.
- In `sdk/packages/pocket_ui/src/ui.tsx` and `sdk/packages/pocket_ui/src/mobile.tsx`, `MobileAppBar` remains transparent with no bottom border. The parent `mini_apps/syslib/pocket_syslib_flutter_ui.js:272-300` passed optional `backgroundColor` to `View.Header`, implemented in `lib/render/pocket_ui_components.dart:1907-1926`. Current root `demo/js/app.tsx:930-934` and `MobileScaffold` in `mobile.tsx:672-676` keep light `#FAFAFA` and dark `#09090B` canvases at the parent shell.
- `ScrollablePageContext`, `ContourConsumedContext`, `useScrollContourReserve`, and `ScrollContourItem` support `leftReserve` and `reserve`. They measure actual unindented item edges during drag, momentum frames, relayout, and `display.viewport` changes, without accumulating `p-4` or `mx-5` twice. Edges stop 5 px from the actual contour. Indented content clips, and restoring full width preserves declared `overflow-hidden`.
- Shared coverage includes `Header`, `MobileAppBar`, `PageIntro`, `SectionHeading`, `Tabs`, `StatusBar`, `EmptyState`, `Card`, `MobileCard`, `GlassSurface`, `Row`, `List`, `TileGrid`, `MobileListTile`, and `MobileSegmentedControl`.
- `demo/js/app.tsx` connects `HomePage` banner, `HomeExplore`, titles, two-column panels, and bottom status, plus `GalleryPage`, `RuntimePage`, `PerformancePage`, and `StressPage` to `ScrollContourItem` and `useScrollContourReserve`. `GalleryTile` calculates both card widths from the whole row's bounds. The check rebuilt `demo/js` and `profile` and `lobby` mini-app bytecode.

### Verification

- `flutter test test/pocket_view_viewport_test.dart` in `sdk/packages/pocket_flutter` verifies landscape notches and single cutouts from `DisplayFeatureType.cutout` become guest-coordinate occlusion in `display.viewport.reservedRegions`.
- `bun test sdk/packages/pocket_ui/test/responsive_occlusion.test.ts` verifies `hasLocalLeftOcclusionInset`, `hasLocalRightOcclusionInset`, `sideContourReservesForBand`, and `topRightContourReserveForBand` for top-corner status, landscape left notch with 5 px entry and exit smoothstep, landscape right 28 px single cutout, overlapping regions, and full-height occlusion.
- `bun test sdk/packages/pocket_ui/test/safe_area_native.test.ts` runs compiled bytecode in `pocket_probe`. It verifies transparent `MobileAppBar`, 5 px clearance for the right grid column, cards narrowing from full width to 5 px contour clearance at the top corner and landscape left cutout, restoring width above the landscape cutout, and automatic layout updates while idle.
- The 2026-11-08 transparent AppBar follow-up used pinned Bun 1.4.4 and SDK native tools in an isolated `safe_area_native.test.ts` run. 390 px and 320 px portrait, landscape, and contour scrolling all passed (one test, exit 0).
- `cd demo/js && bun run test && cd ../.. && python3 sdk/scripts/check_architecture.py` passed.
