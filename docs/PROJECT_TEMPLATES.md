# Pocket project templates

The Pocket SDK provides two starters. Both use the same Solid/QuickJS project layout, pinned `buildGuest` compiler, and thin Flutter host. The template selects the initial JS `app.tsx` and project instructions.

## Run or reopen a project

CLI and Studio projects share support files and npm command generation. Run `npm start`, `npm run build`, or `npm run build:web` from the generated project. To edit an existing project in place, choose **Open project** in Studio and enter its path. See [scaffolding, directory layout, and acceptance](PROJECT_SCAFFOLD_AND_OPEN_20261114.md).

## Choose a template

The CLI defaults to `app`.

```sh
cd /Volumes/ORICO/Development/Github/pocket/sdk
bun pocket.ts init /absolute/path/to/my-app \
  --template=app \
  --app-id=com.example.myapp \
  --name=my-app \
  --version=1.0.0 \
  --sdk-root "$PWD"
```

Use `game` to create a game project.

```sh
bun pocket.ts init /absolute/path/to/my-game \
  --template=game \
  --app-id=com.example.mygame \
  --name=my-game \
  --version=1.0.0 \
  --sdk-root "$PWD"
```

`--template` accepts `app` or `game` and defaults to `app`. The generator records the selected template in `editor.json.template`. Later builds compile the project's current source. The target directory must be empty. An invalid template fails before directory creation.

Use the project selector at the upper left of Pocket Studio to switch projects. Click **New project** alongside it and choose a template in the dialog.

- **App** provides screens, forms, and product UI.
- **Game** provides a rendered game scene, frame loop, input, and game state.

Studio sends `template` in `POST /api/projects` and saves it in `editor.json`. Opening an existing project preserves its template. The CLI additionally generates `vendor/pocket-ui/` and `flutter/`. Studio workspace projects use the public SDK UI package and Preview directly.

## App and Game development order

Implement the complete app or game in the TCA style (State, Action, Reducer, Effect), then add tests and wire UI. This is an organizational pattern for the project's JS/TS, with no additional TCA package required.

1. **Functionality first.** Implement the complete app or game state machine before UI. Apps cover screens, submit, error, and return. Games cover start, active, pause, resume, restart, end, and timing.
2. **Tests next.** Cover main paths, edge cases, errors, and asynchronous behavior in State/Action/Reducer/Effect. Test game pause/resume, restart, and countdown completion. Verify actual transitions and effects.
3. **UI last.** Bind verified state and actions to `@pocket/ui`, `View`, and `Focusable`. UI displays state and dispatches actions, while application state and timing stay in the existing implementation.

Follow this order for new projects and later extensions. When changing interaction, fix and test state logic before adjusting visuals.

## Application Workers for networking and games

- When first adding the official `net.http` API, the coding assistant adds `worker.ts`, `domains.worker` in `pocket.json`, the HTTP node and channels, and the `runtime.worker` and `net.http` declarations. Send requests, receive streams, and parse results through the official Worker IO path. Report progress and results to the UI through a channel.
- The host loads the application Worker from its built descriptor. Official Worker HTTP also requires exact `workerHttpOrigins` in trusted host configuration. Avoid wildcard grants, requests at startup, and requests inside the UI frame loop.
- Move pathfinding, AI decisions, map generation, and expensive batch computations into the application Worker as needed. Keep UI, input, animations, scoring, and lifecycle on the existing JS state and `onFrame` path. Simple games can avoid an idle Worker and copying the entire world state each frame.
- `renderWorker` independently controls Web rendering and defaults to `false`. Enable it only when measurements from the target game support the change.
- The initial template omits `worker.ts`. The coding assistant adds and verifies it when implementing a feature that needs it. The builder leaves existing `fetch` and `dio.request` calls alone. The native Dio plugin selected by `--dio` automatically uses a dedicated IO Worker isolate and keeps the `dio.request` interface. A Dio-only feature uses the `network` permission and the plugin's `allowedOrigins` without adding a JS Worker or enabling `domains.worker` or `renderWorker`.
- Reuse the pinned QJBC and descriptor pipeline. Verify real requests or calculations, channel responses, errors, cancellation, and hide/resume behavior. A dedicated Worker execution domain may share an OS thread on some hosts, and actual FPS gains require measurement.

### Configuration and automatic startup

Reuse the pinned upstream `apps/worker-http/{pocket.json,worker.ts,main.tsx}` contract. `domains.worker.entry` points to the Worker source. `nodes` declares `{ "name": "http", "kind": "http" }`, and `channels` declares direction, recordBytes, and capacity explicitly. UI uses `worker.channel()` from `@pocketjs/framework/worker/channels`. Worker uses `io.channel()` and `io.http()` from `@pocketjs/framework/io` and awaits completion with `settle()` from `@pocketjs/framework/worker`. Use this transport directly.

Update the `pocket.json` engine capability, Guest manifest, and Worker source together. `buildGuest` compiles Worker QJBC and emits the admission descriptor. An existing host automatically loads and attaches a correctly declared and packaged Worker, with no additional activation control.

Worker HTTP does not depend on Dio. Trusted Flutter hosts authorize it through `PocketAppConfig.workerHttpOrigins`. Standalone Web builds can pass `--worker-http-origin=https://api.example.com` for runtime configuration. Newly scaffolded Studio projects and CLI Flutter hosts do not grant application service origins automatically. Set the host policy directly. The project creation form has no origin control. See [Web Worker](WEB_WORKER_IMPLEMENTATION.md) and [Worker IO](WORKER_IO_IMPLEMENTATION.md) for APIs, lifecycle, and platform limits.

Studio copies the selected App or Game instructions into the project `README.md`. CLI uses the same README rules. Project creation does not rewrite existing projects. Declare and integrate hardware as needed.

## App template

The source is [`templates/app/app.tsx`](../templates/app/app.tsx). It preserves the runnable mobile starter with `MobileThemeProvider`, `MobileScaffold`, `MobileAppBar`, safe areas, foldable display panes, and light/dark theme switching. JS/TSX owns pages and state. Flutter supplies the thin host.

Start app edits in these generated files.

```text
my-app/
├── app.tsx                 # App template JS UI entry
├── manifest.json           # Guest capability and permission declaration
├── pocket.json             # Pocket app runtime configuration
├── editor.json             # Studio/CLI identity and template=app
├── vendor/pocket-ui/       # Public UI package copied from the SDK
└── flutter/                # Generated thin Flutter host
```

App skips camera, Bluetooth, networking, and other native capabilities by default. Opt in with flags such as `--hardware`, `--bluetooth`, and `--dio` as needed. Keep state, routing, and composition in JS.

## Game template

The source is [`templates/game/app.tsx`](../templates/game/app.tsx), a runnable graphical mini-game called Stardust Catcher. It has a dark starfield, drifting star core, top HUD, 30-second countdown, and hit-based scoring. The core is ordinarily 80 px and scales down to the field height in a short viewport. It drifts slightly within reach while waiting. A hit relocates the core and shows particles and `+1`. Start, pause/resume, restart, and play again all happen inside the JS game scene.

The root `SafeAreaScaffold` draws stars and planets through its `background` slot over the full viewport. HUD, buttons, the interactive field, and footer text stay within safe content. The HUD uses `appBar` and `MobileAppBar`, reserving right-side space for the host close control through `reservedActions="mini-app"`. Background coverage no longer depends on the safe pane's `marginT`. Scene hit targets stay out of the decorative layer.

JS owns `phase`, `score`, `remaining`, `target`, animation progress, and hit feedback. The countdown derives directly from `remaining` without a separate `seconds` state. The pinned PocketJS `onFrame`, `simulationHz()`, and virtual frames drive time without browser intervals, Dart state, or background polling. Official `Focusable` handles input. HUD pause and in-scene start, resume, and restart share the same phase. Movement, countdown, and feedback run in `playing` only. Pause preserves remaining time.

The starter uses verified SDK Solid/UI frames. `View` composes stars, planets, orbits, core, and particles. `Focusable` handles its 80 px target and scene controls. `onFrame` drives drift, countdown, and animation. 3D Scene, Rapier physics, BLE controllers, Canvas DrawList, shared Float32Array, VRAM, and resource streaming require verified public transports and APIs before adding them.

### Full-viewport game visuals and safe controls

Game extensions draw visuals across the full viewport and apply safe insets once to interactive content. `NovelView` provides this layout. Custom games can draw full canvas with the same `SafeAreaScaffold.background` slot and use `children` and `appBar` for buttons and scene hit targets. The slot's `hitPass` applies to the root only. Descendants participate in ordinary hit walking. Keep interactive elements out of the slot and set `style={{ hitPass: 1 }}` on decoration that overlaps controls. Nested `MobileScaffold` forwards the slot to its canvas. `edges="none"` avoids consuming insets twice. See the [game viewport and safe-area guide](AI_APP_DEVELOPMENT.md#game-viewport-and-safe-area) and [detailed evidence](VISUAL_NOVEL_MOBILE_SAFE_AREA.md). Stardust Catcher currently demonstrates `View` graphics and `Focusable` input. Video, ambient media, and transitions require additional integrations.

## Build and preview

Both templates use the same real build pipeline.

```sh
cd /absolute/path/to/my-app
bun /Volumes/ORICO/Development/Github/pocket/sdk/pocket.ts build . \
  --sdk-root /Volumes/ORICO/Development/Github/pocket/sdk
bun /Volumes/ORICO/Development/Github/pocket/sdk/pocket.ts editor . \
  --port=8791
```

Open Studio, select the project, click **Build**, and open Preview. For App, tap the theme button and observe color changes. For Game, tap the drifting core and see particles and `+1`. Use HUD pause and in-scene resume, restart, and play again to verify changes in score, core position, and countdown. Preview runs the generated QuickJS bytecode and PAK.

Alternatively, run `bun editor/server.ts` and create a project from the Studio dialog. Both entry points use the same template. Rebuild after changing `app.tsx` to load the new bytecode into Preview.

## Source-first adaptation and ablation

The source review inspected the retained parent `/Volumes/ORICO/Development/Github/pocketjs_flutter_demo`, excluding `pocket_host/`.

- `mini_apps/app_game_detail/main.js` illustrated legacy VSync game updates. Its `Scene`, 3D, Rapier, shared Float32Array, and BLE controller APIs are outside the current public contract.
- `mini_apps/app_canvas_lab/main.js` showed legacy DrawList particles. Its random particles and performance text establish only the original example behavior.
- `pocketjs_super_app_demo.html` showed `stepMasterTicker()`, input, countdown, and particles. This historical page supplied interaction requirements.
- [Deterministic frames](DETERMINISTIC_FRAMES.md) documents virtual time and frame hooks as the source of game time.

The adaptation preserved fixed-frame updates and input-driven state changes in a playable starfield game using official `onFrame({ continuous })`. Ablation removed the separate starter directory, old Demo/host state, 3×3 button grid, `ActionButton` control layer, duplicate `seconds`, simulated 3D and physics, second loop, placeholder art, and Dart orchestration. Both templates share configuration, compilation, and Preview.

## Acceptance record

Run the template, resolver, CLI, and Studio selection regressions.

```sh
cd /Volumes/ORICO/Development/Github/pocket/sdk
bun test scripts/tests/project_templates.test.ts
bun test editor/test/project_templates.test.ts
bun test scripts/tests/export_web_sdk.test.ts
python3 scripts/check_architecture.py
bun editor/test/project_templates_live_probe.ts
```

On 2026-11-06, seven template tests passed for selection, defaults, invalid values, nonempty directory protection, retained configuration, external project listing, and Editor builds. Architecture checks passed. Native Preview passed App `themeToggle` and Game `graphicMotion`, blank taps with no score, hit particles and `+1`, pointer scoring, unchanged timer during 1.2 s pause, resume, restart, 30-second end, and play again. Playwright Chromium inspected actual Preview ready, playing, and hit frames and screenshots confirmed the starfield, drifting core, hit feedback, and HUD changed.

`project_templates_live_probe.ts` creates temporary projects, builds them in sequence, and cleans up Preview and temporary files. It runs JS and native Preview. Platform packaging and physical phones require separate verification.

In Studio, the browser created both templates from **New project**, reopened the project list, and switched back to App, closing the list. Desktop and 390 px widths passed with no horizontal overflow or script errors. The browser and temporary service were closed.

### Click reliability correction (2026-11-06)

Browser input reached JS for start, pause, and mouse presses. The old star core teleported every 1.2 seconds, so an aimed press could land outside. Removing `moveElapsed` makes relocation hit-triggered while preserving small drift and an 80 px target. The regression checks actual 120 and 300 ms presses and verifies that the target remains within its initial hit area after 1.4 seconds. The old implementation failed target stability. The corrected Native Preview passed scoring, particles, blank taps, regular presses, pause/resume, restart, and the 30-second end. Studio's `my-pocket-game2` was also rebuilt. After waiting in system Chrome, 300 ms and 180 ms mouse presses took the score from 0 to 2.

### Game background and safe content in short landscape (2026-11-13)

The retained parent was rechecked outside `pocket_host/`. `mini_apps/app_game_detail/main.js` preserved VSync, input, and scoring, with no reusable full-viewport background and safe content separation. Legacy `Scene`, Rapier, and BLE remain outside the current public contract. The existing `SafeAreaScaffold` gained one `background` slot forwarded by `MobileScaffold`. The adaptation keeps layout in JS without a second full-screen wrapper.

The scaffold paints the original canvas class background, its `background` slot, and then `appBar` and `children`. The slot covers the current canvas without insets. For a root game the canvas is the viewport, while nested `edges="none"` uses the nested canvas. `hitPass:1` applies only to the slot container. Descendants still participate in hit walking. Use `style={{ hitPass: 1 }}` for decoration and leave controls in safe content. Calls omitting the slot preserve structure and colors.

Stars and planets moved to the background layer. The HUD uses `MobileAppBar` in `SafeAreaScaffold.appBar` with `reservedActions="mini-app"`. Existing `Focusable`, JS state, and `onFrame` own targets and start/pause. Field height comes from safe pane minus HUD and footer, without the previous `Math.max(240, ...)` minimum. Core normally stays 80 px but can shrink in a short viewport, as can the menu icon and controls. Restart has a distinct fill used to measure its actual hit bounds.

On 2026-11-13, `editor/test/project_templates_live_probe.ts` verified App and Game using pinned `buildGuest` and native Preview input. At 390×844 with top 44 and bottom 80, Game verified full canvas base, stars in unsafe top/bottom bands in the expected sequence, and subsequent opaque coverage. The ready title, description, primary button, and app-bar text stayed in safe bounds. Clicking Start entered the game. The same guest resized to 844×320 with left/right 44, top 12 and bottom 26. The pause panel and restart button stayed in the safe field and Pause sat left of the 60 px host close reserve. Tapping the core after rotation moved score from 2 to 3. One pixel outside restart's bottom hit edge caused no restart, and one pixel inside restarted. Blank area, pause, resume, end, and play again also passed. The native probe records DrawOps and pointer bounds and produces no PNG.

The same day, `packages/pocket_ui/test/safe_area_background_native.test.ts` passed 1/1. A nested `MobileScaffold` with `edges="none"` kept the background in the outer safe canvas `(y=24,h=598)`. A Focusable button after one inset received a real click through decorations. The existing scaffold and host input suite in `packages/pocket_ui/test/miniapp_presets_presentation.test.ts` also passed.
