# 安装与首个 App

Pocket Web SDK 0.1.33 的安装平台是 macOS Apple Silicon（`darwin-arm64`）和 Windows x64（`win32-x64`）。需要 Node.js 22.22.2+ 和 PATH 上的 npm，推荐 Node.js 24 LTS。首次安装访问 GitHub Releases 和 npm registry。Web SDK 自带匹配的预编译工具，安装后由 SDK 管理 Bun。[0.1.33 下载与说明](https://github.com/PocketFlutter/pocket-releases/releases/tag/sdk-v0.1.33)

## 安装 Studio

macOS 终端执行以下命令。Windows x64 在 PowerShell 7 中将 `curl` 换成 `curl.exe`。

```sh
curl -fsSL https://raw.githubusercontent.com/PocketFlutter/pocket-releases/main/scripts/install_studio.mjs | node --input-type=module - --version=0.1.33
```

默认安装到用户目录的 `.pocket/studio`，并在 `http://127.0.0.1:8791` 启动服务。安装器校验发行包 SHA-256、版本和来源，并运行 `setup` 与 `doctor`。加 `--no-start` 可仅安装，在 SDK 目录运行 `npm start` 可随后启动。若目录已有其他 SDK 版本，通过 Studio 的升级流程处理，或加 `--dir=<新目录>` 安装并行版本。

## 创建与验收

在 SDK 安装目录执行，目标目录须为空。Studio 的 **新建项目** 也能创建相同的模板。

```sh
npm run doctor
npm run create -- ./my-app --template=app --app-id=com.example.myapp --name="My App"
cd my-app
npm run check
npm run build
npm start
```

- `doctor` 通过表明当前平台的预编译工具和依赖就绪。项目检查通过表明类型与约定检查完成。
- 项目构建应产生 `build/pocket/app.qjbc` 和 `build/pocket/app.pak`。在 Studio 打开项目，进入 Preview，点击 **新建记录**，输入一段文字后点击 **保存并返回**，确认返回后列表出现同一段文字。记录输入和可见结果。
- 浏览器交付可在项目目录运行 `npm run build:web`，使用 HTTP 静态服务打开 `build/web/`，重复相同交互。Flutter 或微信目标另行验收。

接下来可查看[项目与 Studio](Project-and-Studio.md)及[运行时与目标平台](Runtime-and-Targets.md)。
