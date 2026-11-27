# Pocket Releases

Read [Agent 工作指南](docs/manual/Agent-Guide.md) before developing or modifying a Pocket app. Start from the [SDK capability index](docs/manual/Capabilities.md) to select the host and verify the deployment target. For performance work, use the [app and game optimization loop](docs/manual/Performance-Loop.md).

- Install the SDK from [GitHub Releases](https://github.com/PocketFlutter/pocket-releases/releases). Match the actual release, operating system and architecture to the project.
- Read the consumer project's own `AGENTS.md`. Use the SDK scaffold or sync command and preserve local rules. Import through package exports and use existing framework primitives for navigation, scrolling and IME.
- Verify the actual guest, input, host and platform behavior. Compare performance under repeatable conditions and record regressions or unsupported scenarios.
- When upgrading an existing app or game, use the [existing-project guide](docs/manual/Optimize-Existing-Projects.md) to isolate the SDK upgrade from app changes. Check the [released SDK optimizations](docs/manual/SDK-Optimizations.md) for version and activation requirements.
- Keep public documentation in `docs/manual/` and preserve existing page IDs. Sync the Wiki when those pages change. Keep credentials, private source and device-specific diagnostics outside public docs.
- Run all compilation, builds, tests, lint, analyzers and benchmarks for Pocket and pocket-platform through GitHub Actions in this repository, pinned to the exact source revision. Keep local work to editing, inspection and documentation or metadata updates.
