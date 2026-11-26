# Agent 工作指南

适用基线为 Pocket Web SDK **0.1.33**。接到任务时先选目标端和工作目录，再选择相关章节。兼容性以实际使用的 SDK 归档和设备验证为准。

## 按任务选入口

| 任务 | 首先查看 | 交付物或验收 |
| --- | --- | --- |
| 新建 App / Game / 多应用壳 | [安装与首个 App](Install-and-First-App.md) | 脚手架文件、类型检查、可交互的首屏 |
| 接手现有项目 | [项目与 Studio](Project-and-Studio.md) | 项目根、入口文件、同步后的 Agent 规则、可复现预览 |
| 升级或优化已上线的 App / Game | [旧项目升级与性能优化](Optimize-Existing-Projects.md) · [已发布的 SDK 优化](SDK-Optimizations.md) | SDK 升级与应用改动分开测量，验证旧数据、关键交互和可恢复版本 |
| 加页面、路由、表单或长列表 | [UI 与导航](UI-and-Navigation.md) | 导航返回、滚动保留、焦点和 IME 的实际验证 |
| 加硬件、网络或 Worker | [宿主与硬件](Host-and-Hardware.md) · [运行时与目标](Runtime-and-Targets.md) | 能力声明、提供方注册、成功与拒绝路径，以及取消或清理 |
| 改游戏输入、图形、视频或视觉小说 | [游戏与媒体](Games-and-Media.md) | 真正的输入和可观察帧变化、媒体生命周期、目标端记录 |
| 优化耗时、卡顿、常驻内存或包体 | [可持续性能优化](Performance-Loop.md) | 基线、单项改动、对比数据、正确性检查、继续或回退理由 |
| 构建、部署、发布或排查更新 | [部署与更新](Deployment-and-Updates.md) | 可追溯归档、环境、签名或校验、启动与回滚证据 |

## 执行顺序

1. **确认环境。** 记录 SDK 版本、项目根、目标平台、后端和构建模式。Flutter 壳的 Guest 项目通常在 `js/`，它有自己的 `pocket.json`。
2. **遵循项目规则。** 先读项目 `AGENTS.md` 与公开清单。新项目用 SDK 脚手架。已有项目按需同步规则，保留自定义内容。任务所需 API 从包的公开入口导入。
3. **先找已有原语。** 应用壳和保留路由用已导出的 Router 与 Shell，皮肤用现有 Provider，滚动、焦点、键盘和 IME 复用内置控件。Guest 负责业务与状态，宿主提供平台输入、渲染、生命周期及经注册的能力。
4. **先做最小可运行切片。** 指定一个实际输入，观察路由、文本、帧、存档或业务状态变更。需要硬件时，确认注册、授权和真实设备三者都具备。
5. **对照基线验证。** 先类型和约定检查，再编译 Guest 并在目标端验证实际行为。明示验证过的平台和剩余的证据缺口。

## 可复制的入口命令

在已安装的 Standalone SDK 根目录运行。下面的路径可换成其他实际项目位置。

```sh
npm run create -- ../my-app --template=app
npm run check -- ../my-app
npm run build:guest -- --project-root=../my-app --outdir=../my-app/dist
```

接手现有项目时，按需在 SDK 根目录执行 `npm run sync:agents -- ../my-app`。修改前先检查现有文件，保留项目自己的规则。若只需诊断环境，先运行 `npm run doctor`。

## Agent CLI 与 MCP

0.1.33 归档带有 `docs/AGENT_INDEX.json`、`docs/APP_DEVELOPMENT_CONTRACT.md` 和 `pocket.ts`。安装好预编译工具后，可从独立 SDK 根目录用托管工具链调用页面探针或生成 MCP 配置。将示例中的目录和路由换成项目实际值。

```sh
node scripts/toolchain.mjs run pocket.ts verify-page ../my-app --route=/ --json
node scripts/toolchain.mjs run pocket.ts mcp config --client=codex
```

探针验证 Guest 行为与布局。MCP 配置命令在标准输出生成连接配置。接入后可用 `pocket_read_agent_index` 找规则，用 `pocket_verify_page` 和 `pocket_interact` 检查场景。实体设备、系统键盘、真实媒体及性能结论仍在对应宿主验收。

## 交付记录

```text
目标与验收：
SDK 版本、项目目录、目标端和构建模式：
复用的公开入口与宿主依赖：
改动范围：
实际运行步骤及观察结果：
验证缺口或限制：
性能任务的基线、对照结果及保留/回退决定：
```

[能力索引](Capabilities.md) · [API 与排障](API-and-Troubleshooting.md)
