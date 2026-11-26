# Pocket SDK 已发布优化

Agent 收到“把 SDK 优化应用到现有项目”时，先确认项目实际运行的 Guest 构建工具、宿主和渲染后端。用同版本组件复测已有路径，再从下表选一个与实测热点对应的改动。本文以公开发布 `sdk-v0.1.33` 对应源码为准，包含此前已进入发布线的改进。Web 工具包升级和 Flutter 宿主升级各自生效。 [0.1.33 发布与下载](https://github.com/PocketFlutter/pocket-releases/releases/tag/sdk-v0.1.33) · [现有项目优化指南](Optimize-Existing-Projects.md) · [建立基线与做消融](Performance-Loop.md)

## 现有接法可以自动受益

| 已交付改进 | 生效条件与现有项目收益 | 用实际操作验证 |
| --- | --- | --- |
| Flutter Mini App 推入链路 | 使用官方 System Host 和 compositor。全屏子 surface 仅发生平移时复用原有显示几何和绘制子树。宿主还缩小玻璃合成层覆盖范围，减少空资源同步，并允许连续控制请求在有界范围内及时处理。无需增加 JS 开关。 | 重复推入和弹回同一子页。分别量点击至首画面、点击至可交互和转场超预算帧，验证平移时子视口尺寸不反复变化，触点与画面一致，玻璃和子页遮挡正确。 [Mini App 呈现](../MINI_APP_PRESENTATION.md) |
| Flutter bundled 启动 | 通过官方资源路径加载时，启动阶段可并行发起 QJBC、元数据和适用的 PAK 读取，再按依赖顺序交给运行时。已有 bundled 接法无需加预加载层。 | 冷启动与热启动分开测，确认首画面与首个真实输入。构造缺失元数据且 PAK 尚在读取的测试场景，检查错误能及时显示。 [Flutter API](../FLUTTER_API.md) · [混合宿主 API](../HYBRID_HOST_API.md) |
| 框架路由动效 | `PocketAppShell` 从皮肤取动效时，默认皮肤使用 `IOS_SPRING_PARALLAX`、240 ms，尊重减少动态效果。可用 `transitionMode`、`transitionDurationMs` 显式覆盖动效。Shell 保留路由子树，独立的 Mini App 返回后驻留需要下方的双端选择。 | 检查推入、弹回、取消侧滑、减少动态效果，以及返回后的滚动位置、草稿与焦点。 [UI 与导航](UI-and-Navigation.md) · [动效](../MOBILE_MOTION.md) |
| RichText 的 Pretext 重排 | 已使用 `RichText`、兼容 `InlineText` 或由它驱动的框架段落时，内容与样式稳定的宽度重排可复用已准备的文本数据。没有布局回调、引用或交互覆盖层的段落可省去 JS 布局读回。 | 固定文本反复变宽变窄，对照替换文本的成本。检查中英混排、emoji、换行、截断和内联交互，验证实际帧和文字布局。 [JS API 签名](../JS_API_SIGNATURES.md) |
| Flutter 光学层变化时保留 IME | 已接入官方输入时，背景模糊使光学合成层出现或消失时，宿主保留编辑器子树、输入连接和焦点。 | 真机在输入框进行中文组词和选择文字，同时切换背景模糊，核查键盘、选区、组词与提交。旧手册已覆盖一般 IME 几何和键盘测试，可用这个场景补测。 [输入与滚动回归](Performance-Loop.md#页面窗口化列表glyph-与-ime) |

## 需要按场景启用或迁移

| 选择 | 默认与接法 | 用实际操作验证 |
| --- | --- | --- |
| Mini App 缓存与预热 | 官方 System UI 启动普通 Mini App 时采用 cache-first，优先展示已验证的本地版本，后续启动可以用准备好的更新。直接构造的 Flutter `PocketSystemHost.cacheFirst` 默认 `false`。已测出首次进入慢、预计用户很快会进入时，可单独对照 `platform.prewarm(appId)`，测包含预热工作的总成本。 | 覆盖冷缓存、热缓存、离线、签名更新及失败恢复。分别记录预热开销、点击后的等待、后台流量和内存。 [Mini App 缓存与更新](../MINI_APP_UPDATE_BEFORE_OPEN.md) · [混合宿主 API](../HYBRID_HOST_API.md) |
| Mini App 返回后复用上一帧 | 保留式重开需双方选择。可信 SystemUI 调用 `platform.launchApp(appId, args, { presentationStyle: "page", allowRetainOnReturn: true })`，子 Guest 成功返回时调用 `platform.returnResult(value, { retainOnReturn: true })`。两项省略时均不启用。匹配同一已验证包代且仍驻留时可以复用上一帧，完成动效与可见性握手后恢复输入。新启动请求仍有新参数和请求 ID。会话变化时可调用 `kernel.releaseRetainedRuntime()`。 | 对照冷开、同版本重开、更新后重开和逐出后重开。检验新参数、返回结果、输入交接和清理，分别量首画面与首可交互。 [Mini App 呈现](../MINI_APP_PRESENTATION.md) |
| Flutter 启动错误采集 | `PocketSystemHostApplication.onStartupError` 为可选回调，默认未设置。每次启动尝试最多在错误 UI 构建后的帧通知一次，可沿用项目的错误采集。Guest 执行错误从宿主 controller 的 session snapshot 读取。 | 制造资源或配置加载失败，观察原错误 UI 和单次回调，再用有效配置确认可成功启动。 [混合宿主 API](../HYBRID_HOST_API.md) |
| 用框架文本替换有热点的自制排版 | 从 `@pocket/ui/inline-text` 导入 `RichText`。内容可通过 `text` 或 `spans` 传入，`wrap` 默认 `true`，`shrinkWrap` 默认 `false`，`maxLines` 省略或为 `0` 表示不限行。保留稳定的 spans 引用，只在交互或业务确实消费布局时使用 `ref`、`onLayout`。 | 用同一文章、气泡或打字段落对照旧路径，改变宽度与字号并验证文本、链接目标和可访问内容。 [JS API 签名](../JS_API_SIGNATURES.md) |
| 原生 SVG 与 PVEC | 0.1.33 提供官方矢量路径。用 `@pocket/ui/vector` 的 `PocketVector` 加载已打包的 SVG，动态路径可用 `PocketVector` 或 `PocketPath`。Flutter 的 `PocketView.vectorRenderMode` 默认 `cachedPicture`，可单独对照 `directPath` 或 `autoRasterCache`。静态 SVG 超出 PVEC 编译范围时可走位图编译回退。Studio 浏览器预览有 Canvas2D 矢量路径，软件 raster 会拒绝 PVEC 绘制。 | 核验产物中实际资产类型及目标端后端。在相同尺寸、DPR、颜色和动效下量首次与重复绘制、缓存内存和下载字节，检查裁剪、描边与像素。旧手册已覆盖矢量消融。实现细节见发布 SDK 包内 `docs/SVG_VECTOR_IMPLEMENTATION.md`。 [游戏与媒体](Games-and-Media.md) · [性能测试](Performance-Loop.md) |

## 构建和验证也有可单独测量的优化

- **重复跑页面探针。** `verify-page` 按构建输入摘要缓存 QJBC 和 PAK，并在同一原生探针会话内运行行为检查。快速迭代时看 JSON 的 `buildCacheHit`，发生编译器或输入变更时核对 `buildFingerprint`。测冷构建时用 `--no-cache`，测复用时保持相同输入。探针耗时与 App 真机帧耗时分别记录。 [工具 API](../TOOLING_API.md) · [Agent 探针入口](Agent-Guide.md#agent-cli-与-mcp)
- **Flutter 原生库与 Worker HTTP。** 带来静态库瘦身的变更还将 Worker HTTP 的网络处理迁至 Flutter Dio 宿主。升级已有宿主时重新构建匹配的原生库。使用 Worker HTTP 的项目验收实际允许的来源、超时、取消及拒绝路径，并对比最终安装包大小和请求耗时。 [Dio Worker](../DIO_WORKER.md) · [宿主与硬件](Host-and-Hardware.md)

## 版本边界

0.1.33 发布说明主要记录分发迁移，以发布包及其对应源码核对上表的实际可用性。精确的 API 和参数以该版本包内文档为准。后续的字节码准入复用解析和进一步的保留帧转场改动在该标签之后。源码模块拆分属于维护变更，应用收益仍须用具体场景测量。 [公开发布说明](https://github.com/PocketFlutter/pocket-releases/releases/tag/sdk-v0.1.33)

从较早版本迁移时，Pretext 宽度重排已进入 0.1.30 源码标签。Flutter bundled 启动、Mini App 推入和默认页面动效已进入 0.1.31 源码标签。SVG 与 PVEC 随 0.1.33 提供。已经在使用包含某项改动的宿主和运行时的项目，应把它计入基线。
