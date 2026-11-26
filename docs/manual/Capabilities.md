# SDK 能力与平台索引

基线为 Pocket Web SDK **0.1.33** 与配套 SDK 的公开接口。以下索引区分 SDK 提供的入口、宿主提供的实现和已取得的运行证据。

## 按领域查能力

| 能力 | SDK 入口或机制 | 前提与验证 |
| --- | --- | --- |
| UI、焦点与 IME | `@pocket/ui` 的布局、文本、输入、滚动和响应式原语 | 宿主提供触摸/指针、键盘、IME、安全区和显示尺寸。验证中文输入组合态、焦点与返回 |
| 路由、应用壳与生命周期 | `@pocket/router`、保留式 `RouteView`、`usePocketBackHandler` | 在切换和返回后验证滚动、表单和路由状态保留 |
| 主题、动效与长列表 | `@pocket/skins`、`@pocket/arc`、`@pocket/looseleaf`、`@pocket/liquid_glass`、`@pocket/fast` | 玻璃效果依赖对应渲染路径。虚拟列表需要用实际数据量和滚动方式复测 |
| Guest、资源与图形 | 固定版本编译链、QuickJS 字节码 `app.qjbc`、`app.bytecode.json`、`app.pak`、SVG/PVEC | 浏览器运行 WASM + Canvas2D。核对目标端渲染、字体和 SVG 子集 |
| 多应用与系统表面 | `@pocket/surfaces` 与 SystemUI 宿主接口 | 宿主接管应用装载、表面呈现和内存策略。检查权限隔离、挂起/恢复和返回结果 |
| Worker 与异步 I/O | 独立 JS Worker、可选 Dart Dio I/O、浏览器渲染 Worker | 各自有不同入口和平台条件。声明 Worker 和网络来源后验证取消、错误和回收 |
| 游戏与视听内容 | 游戏输入、矢量/纹理绘制、音视频生命周期和动画 | 检验真实指针、键盘或控制器输入，以及可观察帧变化。媒体解码与手柄支持逐端验证 |
| 视觉小说 | `@pocket/vn` 的剧情、变量、选项、存档、本地化、舞台及编辑器 | Spine 为部分运行子集。Web Live2D 另需已获授权的 Cubism Core 和对应 provider |
| Native 宿主与设备能力 | `pocket_sdk`、`pocket_flutter`、`pocket_bridge` 与可选插件 | Flutter 注册实现，Guest 声明能力，再处理系统授权。蓝牙、定位、摄像头等需要真实设备 |
| Web 与微信目标 | `@pocket/target_web`、`@pocket/target_wechat` | Web 与微信的运行能力不同。微信有本地 WASM 验证记录，开发者工具和真机另验 |
| Studio 与诊断 | Studio 预览、开发重载、版本管理、诊断与可用环境下的录制/回放 | 浏览器预览验证各端共有行为。硬件、原生输入和性能结论需要对应宿主证据 |
| 部署、签名与更新 | 静态 Web、平台导出、应用签名包、分发源、配置的 COS 或 Cloudflare 流程 | 托管更新与 Studio 自更新是不同链路。验证签名、哈希、ABI、安装和回滚 |

[UI 与导航](UI-and-Navigation.md) · [运行时与目标](Runtime-and-Targets.md) · [宿主与硬件](Host-and-Hardware.md) · [游戏与媒体](Games-and-Media.md) · [部署与更新](Deployment-and-Updates.md)

## 选择验证环境

| 环境 | 可以用来确认什么 | 需要额外确认 |
| --- | --- | --- |
| macOS arm64 / Windows x64 的 Standalone SDK | 安装、预编译工具、真实 App/Game 字节码与 PAK、可交互的 Studio | 真实蓝牙外设、目标设备权限、跨机器性能 |
| 目标浏览器 | Web 运行时、资源加载、浏览器事件与预览 | 实际浏览器版本和设备、IME、手柄、编解码器、可选 provider |
| Flutter 目标宿主 | 原生渲染输入、插件注册和平台能力 | 设备权限、系统策略、具体平台和外设的结果 |
| 微信小程序 / 小游戏 | 导出入口和本地运行时证据 | 微信开发者工具、平台审核范围和物理终端 |

[可持续性能优化](Performance-Loop.md) · [API 与排障](API-and-Troubleshooting.md)

## JS/TS 包入口

下表是完整 SDK 工作区的公开入口分组。使用前核对实际归档或注册表中的包声明、版本和 `exports`。

| 领域 | 包与用途 |
| --- | --- |
| 核心 UI | `@pocket/ui` 提供 Guest 组件与宿主桥，`@pocket/router` 管理路由和应用生命周期，`@pocket/fast` 提供窗口化列表与性能工具 |
| 皮肤 | `@pocket/skins` 提供可替换皮肤接口，`@pocket/arc`、`@pocket/looseleaf`、`@pocket/liquid_glass` 提供相应的主题、控件与动效 |
| 多表面与开发工具 | `@pocket/surfaces` 描述多应用与系统表面，`@pocket/devtools_ui` 提供编辑器组件、录制和宿主能力客户端，`@pocket/studio_server` 提供 Studio 本地服务入口 |
| 内容与动画 | `@pocket/vn` 提供视觉小说引擎与视图，`@pocket/live2d` 提供 Cubism 集成，`@pocket/spine` 提供 Spine 子集适配 |
| 诊断与同步 | `@pocket/diagnostics` 提供诊断采集和存储适配，`@pocket/sync` 提供 CRDT 同步逻辑并依赖已配置的网络传输 |
| 产物与发布 | `@pocket/target_web`、`@pocket/target_wechat` 导出对应目标，`@pocket/cos`、`@pocket/cloudflare` 提供发布工具 |

`@pocket/spine`、`@pocket/diagnostics` 与 `@pocket/sync` 的工作区清单标记为 `private`。独立安装能力以实际分发包与所用注册表为准。

## Flutter 库与可选提供方

| 领域 | Dart 包 |
| --- | --- |
| 宿主和能力桥 | `pocket_sdk`、`pocket_flutter`、`pocket_bridge`，兼容入口 `pocket_services` |
| 多应用与更新 | `pocket_system`、`pocket_updates`、`pocket_archive` |
| 系统服务 | `pocket_permissions`、`pocket_platform`、`pocket_package_info`、`pocket_clipboard`、`pocket_file_picker` |
| 设备 | `pocket_hardware_core`、`pocket_hardware`、`pocket_camera`、`pocket_bluetooth`、`pocket_sensors`、`pocket_location`、`pocket_biometrics`、`pocket_weather` |
| 网络与后台 I/O | `pocket_dio`、`pocket_sync` |
| 媒体、诊断和 Studio | `pocket_audio`、`pocket_live2d`、`pocket_diagnostics`、`pocket_studio` |

Flutter 包需要具备对应 SDK 源包、平台库及插件声明的集成环境。插件的存在表示有对应接入点，设备行为以相应平台、系统权限和硬件实测为准。 [宿主与硬件](Host-and-Hardware.md)
