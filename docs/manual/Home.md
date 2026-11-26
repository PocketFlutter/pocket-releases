# Pocket SDK 手册

从安装 Studio 到发布应用，本手册覆盖 Pocket SDK 的公开能力、接入条件和验收步骤。当前基线是 **Pocket Web SDK 0.1.33**。Flutter 宿主、可选插件和独立发布包在各章单独标明。

[下载 SDK 与查看发布说明](https://github.com/PocketFlutter/pocket-releases/releases/tag/sdk-v0.1.33) · [最新发布](https://github.com/PocketFlutter/pocket-releases/releases) · [Wiki](https://github.com/PocketFlutter/pocket-releases/wiki)

| 我想做什么 | 从这里开始 |
| --- | --- |
| 给 Agent 一个任务，让它正确接入或改造项目 | [Agent 工作指南](Agent-Guide.md) |
| 判断 SDK 有没有某项能力、可以在哪个平台用 | [能力与平台索引](Capabilities.md) |
| 安装 Studio 并创建第一个项目 | [安装与首个 App](Install-and-First-App.md) |
| 管理项目、编辑、预览并组织资源 | [项目与 Studio](Project-and-Studio.md) |
| 搭建应用壳、导航、列表、输入和主题 | [UI 与导航](UI-and-Navigation.md) |
| 了解 Guest、资源包、Worker 与运行目标 | [运行时与目标平台](Runtime-and-Targets.md) |
| 接入 Flutter、硬件、权限和系统能力 | [宿主与硬件](Host-and-Hardware.md) |
| 做游戏、视听互动或视觉小说 | [游戏与媒体](Games-and-Media.md) |
| 优化 App 或 Game 并验证改动收益 | [可持续性能优化](Performance-Loop.md) |
| 查询已发布的 SDK 性能改动及生效条件 | [已发布的 SDK 优化](SDK-Optimizations.md) |
| 给旧 App 或 Game 升级 SDK 并逐项优化 | [旧项目升级与性能优化](Optimize-Existing-Projects.md) |
| 部署 Web 或微信产物、发布签名更新 | [部署与更新](Deployment-and-Updates.md) |
| 查 API、定位问题、核对版本差异 | [API 与排障](API-and-Troubleshooting.md) |

### 版本与证据

- **Web SDK 已验收**的安装平台是 macOS Apple Silicon 和 Windows x64。项目可生成浏览器产物。其他目标以各章的宿主、运行时和设备证据为准。
- **需要宿主**表示 Guest API 还需要注册对应的 Flutter 插件、Web provider 或平台适配器。实际设备权限仍由终端用户授予。
- **待验证**表示尚缺指定平台、设备或场景的运行结果。需要在该环境复现后更新结论。

手册正文维护于发布仓的 `docs/manual/`。Wiki 页面与仓库 Markdown 使用相同的章节名。
