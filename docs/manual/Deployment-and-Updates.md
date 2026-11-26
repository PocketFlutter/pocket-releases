# 部署、签名与更新

先确定本次要交付的是 Web 静态站、微信小程序、已安装宿主内的 Guest，还是开发者的 Studio / SDK。每条路径都有独立的产物、信任来源和验收。

## 浏览器与微信使用两个不同的目标

在已安装的 0.1.33 Web SDK 根目录，从带 `pocket.json` 和 `manifest.json` 的 Guest 项目构建。使用独立的空输出目录，保留 WASM、QJBC、PAK、运行时、配置和构建元数据的目录关系。

```sh
npm run check -- /absolute/path/to/my-app
npm run build:web -- --project-root=/absolute/path/to/my-app --outdir=/absolute/path/to/web-out
```

微信构建需要准备匹配的 pinned PocketJS 源码、Bun、Python 3、Rust/Cargo 的 `wasm32-unknown-unknown` 目标和兼容的 `llvm-ar` / `emar`。在具备相应工具链的构建环境执行：

```sh
npm run build:wechat -- --project-root=/absolute/path/to/my-app --outdir=/absolute/path/to/wechat-out
```

| 目标 | 实际交付与验收 |
| --- | --- |
| 浏览器 | 将 Web 输出部署到同站 HTTPS 静态服务。检查 WASM、PAK、QJBC 正常返回，实际触点能改变 Guest 画面，验证 IME、尺寸变化、可见性和资源加载。默认是主线程。可选 `--render-worker` 需要 Worker 产物、浏览器 `OffscreenCanvas` 与允许的 CSP。 |
| 微信小程序 | 把生成目录导入微信开发者工具，使用已注册的小程序 AppID 验证。生成目标使用压缩 `.wasm.br`、原生 input 和 Canvas2D。可构建单 Guest 或通过 `pocket.system.json` 声明整个 System 应用。当前目标拒绝声明 `domains.worker` 的 Guest，包括 System 目录中的子应用。 |
| 微信设备验收 | 分别在实体 iOS、Android 验证 WASM 实例化、点触/滑动、原生 IME、hide/show、存储、包大小约束。文档中的 Node WASM 回归证明真实 Guest 的输入和帧变化。真机与提审需要单独完成。 |

[Web 产物与运行时](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/WEB_SDK_EXPORT.md) · [微信目标工具链与设备验收](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/WECHAT_HOST_IMPLEMENTATION.md) · [System 浏览器集成证据](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/WECHAT_BROWSER_VERIFICATION.md)

## Flutter Guest OTA 需要宿主信任和实测回滚

1. 用固定工具链构建 Guest，核对 app ID、包版本/构建号、目标宿主版本、字节码 ABI 和能力声明。准备 Ed25519 私钥、对应公钥与 HTTPS 发布目标。私钥仅留在签名环境，宿主配置公钥。
2. 用 Studio 的版本发布功能或 SDK 签名工具生成发布目录。先上传不可变内容，再更新可变的发布索引。核对目标能读取索引和包，索引指向与签名一致的内容。
3. 宿主配置 `PocketUpdateConfig`。应用 JS 有更新界面时，使用集成环境中 `@pocket/devtools_ui/updates` 导出的 `createPocketUpdateClient(host)` 做 `check()`、`apply()` 和 `rollback()`，接入真实更新能力。范围敏感时用 `checkCodeOnly()`、`checkResource(resource)`。只有精确的单资源或纯代码变化才能通过相应检查。
4. 在安装了旧版本的实际宿主上验收下载、验签、启动和新画面。另测缺失资源、签名或 ABI 不符、断网和回滚，记录最终启动的构建号。原生插件或宿主权限变化走宿主重新构建分发。

[更新模式](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/PACKAGE_UPDATE_MODES.md) · [发布信任策略](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/RELEASE_TRUST_POLICY.md) · [Studio 签名预览](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/STUDIO_SIGNED_PREVIEW.md)

## Studio 更新、Web SDK 升级与项目依赖

| 交付对象 | 入口和验证 |
| --- | --- |
| Native Studio | 打包与签名流程使用独立的 `studio-v*` 发布路径。0.1.33 基线的公开下载是 Web SDK 与自带 Editor。Native 安装包以发布页实际可见的 `studio-v*` 资产为准，安装后验证启动、预览与版本。 |
| Web SDK 和自带 Editor | 使用 `sdk-v*` 发行及平台归档。0.1.33 是切换发行源的过渡版。更新后访问公开发行仓库。选择 macOS arm64 或 Windows x64 归档，核对校验和，保存 Studio 草稿，待发布/构建完成后更新。核对 Studio `/health` 版本并重新构建现有 Guest。 |
| 单个项目包 | 依据项目的 manifest 与 lockfile 更新依赖，跑项目检查、Guest 重新构建和目标宿主回归。带 Flutter 原生插件的依赖变更还需要针对宿主平台验收。 |

Web SDK 0.1.33 需要 Node.js 22.22.2 或更高。托管安装在更新时按 SDK 管理的文件清单替换，保留项目与数据。更新完成应再打开原项目并验证预览与交互。源码检出的升级遵循自身的 Git 版本工作流。

[0.1.33 发行与平台归档](https://github.com/PocketFlutter/pocket-releases/releases/tag/sdk-v0.1.33) · [Studio 安装](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/INSTALL_STUDIO.md) · [Studio 升级与恢复](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/STUDIO_UPGRADE.md) · [Native 发布流程](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/NATIVE_STUDIO_RELEASE.md)

## 按需包与云端分发

- **包注册表**。签名注册表提供目录和依赖闭包，项目用 `pocket-lock.json` 锁定结果。示例中的目录是已有 Guest 项目，需先配置可用签名注册表，或随命令提供 `--registry=<目录或 HTTPS 注册表>`。Web SDK 可装配 Guest 包。涉及 Flutter 插件时还需相应宿主项目、Dart 依赖和平台验证。
- **云端发布**。先确认部署对象是 Web 输出、已签名 Guest 更新目录，还是已独立构建的宿主安装包。Cloudflare 可走 R2 发布更新，Web 走 Pages/Workers Static Assets/R2。腾讯云 COS 的发布命令支持读取已签名发布目录和 `--dry-run`。用 HTTPS 可读地址测试最终消费方，签名私钥、账户 token 和云端密钥留在发布环境。
- **Web SDK 导出**。发行版已带对应工具归档。SDK 发布者另有 `export:web-sdk` 生成独立 SDK，选 `--registry-packages` 可按工作区声明打包指定版本。应用开发者使用 `build:web` 生成站点目录。

以下命令从解包并完成 setup 的独立 Web SDK 根目录执行。

```sh
npm run search -- liquid-glass
npm run add -- /absolute/path/to/my-app liquid-glass
npm run packages -- /absolute/path/to/my-app
npm run cos -- inspect
npm run cf -- inspect
```

[独立 Web SDK 导出说明](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/WEB_SDK_EXPORT.md) · [COS 发布流程](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/COS_PUBLISH.md)

[Flutter 宿主与硬件](Host-and-Hardware.md) · [游戏与媒体](Games-and-Media.md)
