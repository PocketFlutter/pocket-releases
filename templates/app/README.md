# Pocket app template

Use this template for pages, forms, and product interfaces. JS owns UI, routing, and application state. Implement state and effects first, add tests, then wire up the UI.

## Application Workers for networking and games

- When first adding the official `net.http` API, the coding assistant adds `worker.ts`, `domains.worker` in `pocket.json`, the HTTP node and channels, and the `runtime.worker` and `net.http` declarations. Send requests, receive streams, and parse results through the official Worker IO path. Report progress and results to the UI through a channel.
- The host loads the application Worker from its built descriptor. Official Worker HTTP also requires exact `workerHttpOrigins` in trusted host configuration. Avoid wildcard grants, requests at startup, and requests inside the UI frame loop.
- Move pathfinding, AI decisions, map generation, and expensive batch computations into the application Worker as needed. Keep UI, input, animations, scoring, and lifecycle on the existing JS state and `onFrame` path. Simple games can avoid an idle Worker and copying the entire world state each frame.
- `renderWorker` independently controls Web rendering and defaults to `false`. Enable it only when measurements from the target game support the change.
- The initial template omits `worker.ts`. The coding assistant adds and verifies it when implementing a feature that needs it. The builder leaves existing `fetch` and `dio.request` calls alone. The native Dio plugin selected by `--dio` automatically uses a dedicated IO Worker isolate and keeps the `dio.request` interface. A Dio-only feature uses the `network` permission and the plugin's `allowedOrigins` without adding a JS Worker or enabling `domains.worker` or `renderWorker`.
- Reuse the pinned QJBC and descriptor pipeline. Verify real requests or calculations, channel responses, errors, cancellation, and hide/resume behavior. A dedicated Worker execution domain may share an OS thread on some hosts, and actual FPS gains require measurement.

See `docs/PROJECT_TEMPLATES.md`, `docs/WEB_WORKER_IMPLEMENTATION.md`, and `docs/WORKER_IO_IMPLEMENTATION.md` for full integration and source details. These paths are relative to the SDK root.
