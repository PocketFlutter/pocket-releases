# Pocket Game template

Stardust Catcher is a playable, lightweight starting point for a small game. It uses the official `onFrame` and `Focusable` APIs. Keep its input behavior and game state when reskinning or extending the gameplay.

Keep scene visuals full-screen and apply safe-area insets to interaction once. `NovelView` provides this behavior. Custom games must implement it themselves. See “Game viewport and safe areas” in `docs/AI_APP_DEVELOPMENT.md` and the acceptance criteria in `docs/VISUAL_NOVEL_MOBILE_SAFE_AREA.md` at the SDK root. Stardust Catcher currently contains only a scene rendered with `View` graphics. It has no video, ambient media, or transitions.

The template root uses `SafeAreaScaffold`. Put full-screen decorations in the `background` slot. Put HUD elements, buttons, and hit targets in the safe content area. `background` adds no safe-area insets. Its container passes hits through, while its descendants use ordinary hit testing. Set `style={{ hitPass: 1 }}` on decorative views and keep buttons and gesture controls out of the slot. The HUD reserves room for the host's close control through `appBar` / `MobileAppBar` and `reservedActions="mini-app"`. Short landscape layouts have no enforced 240 px scene height. Buttons and star cores adapt to the size available inside the safe area.

## Application Workers for networking and game logic

- When an AI first adds official `net.http` networking, it creates `worker.ts`, sets `domains.worker` in `pocket.json`, and declares the HTTP node, channels, `runtime.worker`, and `net.http`. Requests, streaming, and parsing use the official Worker IO integration. The UI receives progress and results over channels.
- The host loads the application Worker after reading the built Worker descriptor. Official Worker HTTP also requires an exact `workerHttpOrigins` allowlist in trusted host configuration. Avoid wildcard grants, automatic requests at startup, and requests inside the UI frame loop.
- Move game pathfinding, AI decisions, map generation, and expensive batch calculations into the application Worker as needed. UI, input, animation, scoring, and lifecycle continue to reuse existing JS state and `onFrame`. Simple games need no idle Worker or full-world state copy per frame.
- `renderWorker` is a separate Web rendering setting that defaults to `false`. Leave the setting alone when adding network or game features. Base any change on measurements from the target game.
- The initial template has no `worker.ts`. Automatic setup means the AI adds and verifies the integration when implementing the feature. The build tool never scans or rewrites existing `fetch` or `dio.request` calls. The native Dio plugin selected with `--dio` automatically uses an independent IO Worker isolate and keeps the `dio.request` API. It is independent of `domains.worker` and the render Worker switch. Dio continues to use the `network` permission and the plugin's `allowedOrigins`. Dio-only features need no additional JS Worker.
- Use the pinned QJBC and descriptor pipeline with the existing JS runtime. Verify real requests or computations, channel results, errors, cancellation, and hide/resume behavior. File presence alone cannot establish functionality. An independent Worker execution domain does not guarantee a separate OS thread on every host or higher FPS.

See `docs/PROJECT_TEMPLATES.md`, `docs/AI_APP_DEVELOPMENT.md`, `docs/WEB_WORKER_IMPLEMENTATION.md`, and `docs/WORKER_IO_IMPLEMENTATION.md` for integration and source details. These paths are relative to the SDK root.
