# 项目与 Studio

`app` 是页面与表单的起点，`game` 提供游戏场景、输入和帧循环，`multi-app` 生成 SystemUI 容器和可发现的示例子应用。三者共享固定版本的编译工具。新建项目后先读项目的 `AGENTS.md`，再沿生成的入口扩展功能。

## 项目文件与日常命令

| 文件 | 改动入口 |
| --- | --- |
| `app.tsx`、`assets/` | Guest 页面组合与资源 |
| `pocket.json` | Guest 项目构建配置、执行域 |
| `manifest.json` | Guest 发布身份与能力声明 |
| `editor.json` | Studio 项目配置及模板记录 |
| `package.json`、`tsconfig.json` | 项目脚本、类型配置 |
| `AGENTS.md`、`CLAUDE.md` | 项目约定与 Agent 入口 |

项目目录运行 `npm run check` 做类型和框架约定检查，`npm run lint` 查具体规则，`npm run build` 生成 Guest 字节码与资源包，`npm run build:web` 生成浏览器产物。项目脚本引用 SDK 的绝对路径。移动 SDK 后需更新该引用。

从 SDK 目录同步旧项目的托管约定。托管块之外的项目规则会保留。

```sh
npm run sync:agents -- /absolute/path/to/existing-project
npm run check -- /absolute/path/to/existing-project
```

## 在 Studio 打开和调试

1. 从工具栏选择 **打开项目**，输入包含 `pocket.json` 的绝对目录。也可选择业务代码位于 `js/` 的 Flutter 项目根目录。外部路径创建与打开通过本机 loopback Studio 执行。
2. 打开后直接在原目录编辑、保存和构建。构建完成后在 Preview 操作实际页面，记录一次事件及可见结果。一张首帧截图只能说明首次渲染。
3. 从 SDK 目录运行 `npm run status` 检查服务，或访问 `http://127.0.0.1:8791/health`。生成项目可使用 `npm run editor:status`。端口由 Studio 服务管理器占用。若提示其他进程已使用端口，先确认进程归属。

完整 Flutter SDK 可通过 `npm --prefix sdk run init -- /absolute/path/to/my-app --template=app` 生成 Flutter 伴随宿主。独立 Web SDK 路径请按[安装与首个 App](Install-and-First-App.md)创建 JS/Preview 项目。Flutter 宿主接入见[宿主与硬件](Host-and-Hardware.md)。
