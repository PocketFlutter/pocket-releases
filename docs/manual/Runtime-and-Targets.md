# 运行时与目标平台

Pocket 用固定版本的编译器把 JS/TSX Guest 编译为 QuickJS 字节码。Guest 管业务 UI、状态和路由。宿主接入渲染表面、输入、生命周期、资源和获准的能力。Browser 与 Flutter 各自承载这套运行时。

## 生成 Guest 与目标产物

以下命令在独立 Web SDK 安装目录执行。项目目录须包含 `pocket.json`、`manifest.json` 和项目入口。

```sh
npm run build:guest -- --project-root=/path/to/app --outdir=/path/to/output/guest
npm run build:web -- --project-root=/path/to/app --outdir=/path/to/output/web
```

`build:guest` 生成 `app.qjbc`、`app.bytecode.json`、`app.pak` 和编译出的 `app.js`。QJBC 受运行时 ABI 校验，PAK 提供打包资源。部署时使用同次构建的对应产物。Flutter 专用构建另从项目的 `manifest.json` 准备宿主侧 `guest-manifest.json`。Web 构建生成 JS 宿主和 `engine/pocketjs.wasm`。确认宿主加载 QJBC 和 PAK 后，通过一次真实输入验证下一帧。

| 目标 | 运行与验收边界 |
| --- | --- |
| Studio / 独立开发工具 | 0.1.33 的预编译安装包覆盖 macOS Apple Silicon 与 Windows x64。使用 Studio Preview 验证 Guest 和输入。 |
| 浏览器 | Wasm 运行时与 Canvas 宿主。用目标浏览器检查指针、尺寸变化、IME、可见性及注册的 provider。开发工具安装平台与浏览器运行环境各自核对。 |
| Flutter | 由完整 Flutter SDK 与原生宿主承载。按目标平台验证 FFI、IME、实际插件与权限。Studio 下载包的验收覆盖独立工具链。 |
| 微信小程序 | 专用 WXWebAssembly/Canvas2D 适配器可构建单 Guest 或声明 `pocket.system.json` 的 System 应用。构建器会拒绝带 `domains.worker` 的 Guest。开发者工具与真机验证见[部署与更新](Deployment-and-Updates.md)。 |

## Worker 与宿主能力

- **应用 Worker**用于网络和可证实需要隔离的计算。配置 `worker.ts`、`pocket.json` 的 `domains.worker` 和固定方向、大小、容量的通道，并声明 `runtime.worker` 及实际能力。构建会产生 Worker QJBC、元数据和准入描述。UI 通过 `worker.channel()` 收发记录，Worker 使用 `io.channel()` 和对应 IO 节点。
- **Worker HTTP**还要求 `net.http`、`http` IO 节点以及宿主授权的确切来源。Web 构建可传 `--worker-http-origin=https://api.example.com`，Flutter 用 `PocketAppConfig.workerHttpOrigins`。验收成功响应、拒绝、取消、隐藏与恢复。Dio 插件保留其自身的 `dio.request` 与授权规则。
- **Web 渲染 Worker**是独立的渲染选项。默认主线程，`--render-worker` 可打包渲染 Worker，目标浏览器还要支持 `OffscreenCanvas` 及相应 CSP。基于目标设备的实测决定是否开启。

参阅[宿主与硬件](Host-and-Hardware.md)确认能力授权与设备边界。
