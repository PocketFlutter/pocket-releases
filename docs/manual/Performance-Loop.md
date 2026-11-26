# Pocket SDK 0.1.33 性能优化闭环

适用于 Pocket App、游戏和视觉小说。收到“继续优化”时，先找一条能复现的慢路径，再决定本轮只改变什么。效果以目标运行端上的实测和独立的行为验证为准。Flutter 负责绘制、输入/IME、生命周期与资源及原生能力边界，页面状态、交互和业务调度继续留在 JS。沿用当前 SDK 锁定的 Guest 编译与执行管线。 [能力与平台边界](Capabilities.md)

先用[已发布的 SDK 优化](SDK-Optimizations.md)确认候选版本及生效条件。接手既有 App 或 Game 时，按[旧项目升级与性能优化](Optimize-Existing-Projects.md)分别测量 SDK 替换和应用改造的收益。

## 先建立一份别人能复测的基线

1. **锁定产物和环境。** 记录应用提交、SDK/toolchain 版本、QJBC、PAK 和相关 Worker／独立资源的摘要、设备及系统、宿主和实际后端、构建模式、刷新率、视口与 DPR。约定网络、缓存、预热、温度和电源条件。比较时保持这些条件一致，只允许预先声明的实验变量变化。模拟器 debug、Flutter 真机 profile/release、Studio 预览和正式 Web 各自出结果。
2. **固定操作和采样窗口。** 列出入口、资源集、初始状态、触发动作、采样起止点和预热。首次进入与重复进入分开。至少覆盖与问题相关的持续操作、静止、退后台和恢复。游戏固定场景、输入序列、随机种子和运行长度。做重复样本，交替运行基线 A 与候选 B，报告样本数及波动。
3. **挑出能回答问题的主指标。** 卡顿用相同窗口内的帧耗时分布与超预算帧数，按实际刷新率用 `1000 / Hz` 计算显示周期。必要时分开 Flutter build、raster、总 span，以及 Pocket 帧调用（含 FFI、传输拷贝和 Dart 解码）。`PocketView.showDebugFps` 看 Flutter 帧节奏，`PocketPerformanceSample.fps` 记录活跃窗口的 Guest ticks/s。整视图 build/raster 需要补证据才能归因到某个组件。按源帧起始时间关联动作与延迟送达的 FrameTiming。 [Flutter FPS](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/FLUTTER_FPS.md) · [性能测量记录](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/PERFORMANCE.md)
4. **单独测静止和启动。** 静止观察执行唤醒、桥调用、绘制、CPU 及需要时的设备能耗。按需调度停帧后 HUD 可以保留最后一次有效读数。启动或换场记录到首个有效画面、首次可交互、解码或上传峰值与资源总量。驻留内存、JS 堆和可获取的纹理／GPU 内存分列，并记录多次进出同一场景后的趋势。
5. **基于实测订验收线。** 从基线波动、目标设备档位和用户可感知的需求确定主指标改善幅度、质量和正确性条件，以及冷启动、内存或包体等副指标允许的变化。保留基线原始数据。样本缺失、后端降级、采集窗口无效或没有同条件对照，都需要在结论里写明。

### 每轮只改一个可消融因素

先写假设，例如“列表滚动慢来自视口外条目仍在参与布局”。保存 A，在 B 中改一处，再关闭该优化或恢复旧路径复跑（A′）。适合的对照包括固定数据量切换普通列表与窗口列表、固定内容对比矢量绘制模式、固定模型与轨迹比较媒体是否参与当前场景。若 A′ 回不到基线波动范围，先查环境漂移、缓存或输入差异。

性能之外单独验证交互和输出。用实际编译的 QJBC + PAK 启动，触发真实输入，观察后续帧、像素或裁剪、焦点、会话状态、媒体事件和资源回收。以复现条件为准选用探针、正常宿主运行及真机测试。对于已接入 Flutter 录制的项目，可用 `PocketRecordingLibrary` 导出事务档案并离线回放以核查执行和帧输出。完整捕获从当前 generation 重挂载开始，录制与 tracing 的额外工作另起测量轮次。回放覆盖档案可见的执行边界，系统键盘、平台媒体、GPU 与功耗各用运行端证据。 [录制与回放](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/RECORDING_REPLAY.md)

## 先动有证据的层

| 现象 | 首轮优先排查 | 独立验收 |
| --- | --- | --- |
| 进入慢、首屏抖动 | 必需资源何时可用，首帧有多少初始化、解码、上传和布局 | 冷启动及首点响应，首屏图文与必要资源可见 |
| 列表拖动或键盘卡顿 | 可见区节点量，更新触及的订阅、滚动裁剪、输入几何及真实 Flutter build/raster | 触摸、滚轮、返回后的偏移，中文组词、选区、键盘开合 |
| 游戏掉帧或输入迟滞 | 模拟、绘制和资源上传分别取样，对齐输入与首个可见响应 | 固定输入后的状态与画面、按住/松开、切后台后清状态 |
| 音画卡顿、换场内存上涨 | 解码、混音、视频首帧、模型更新频率及资源保有者 | 音画同步、遮挡、暂停恢复、重复进出后的驻留趋势 |
| 静止时仍有负载 | 常驻帧回调、轮询、未结束动画或媒体、后台 Worker 往返 | 安静时停止不必要工作，输入、定时器和宿主响应能及时唤醒 |
| 下载或更新偏大 | 拆分 QJBC、PAK、Worker 和独立资源，看实际下载与缓存复用 | 干净安装、从上一版升级、离线资源命中、加载与图像质量 |

### 页面、窗口化列表、Glyph 与 IME

- 普通页面保留 `ScrollablePage` 和框架路由。固定行高长列表考虑 `@pocket/fast/fast` 的 `PocketVirtualList`，从实测调整 `overscan`，同时看可见节点、滚动尖峰、快速拖动露白和行复用。优先让列表拥有该页面的主滚动区域。确实需要同轴嵌套时，补跑边缘、父子滚动、滚轮及触控板，确认偏移传递。 [JS API](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/JS_API.md) · [滚动实现](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/SCROLL_REUSE.md)
- 把高频计数、进度、滚动等订阅收窄到实际消费它们的子树。保留稳定条目身份与资源键，优先删除重复派生状态、重复测量和重复注册。针对动态文本及 Glyph 分别量首批字体页和稳定滚动，观察字体页上传及替换；核查中文、组合字符、emoji、裁剪、主题及密度变化。按目标端及实际字体路径核验支持范围。 [Glyph 与按需调度](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/GLYPH_AND_SCHEDULER_IMPLEMENTATION.md) · [Glyph Run 边界](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/GLYPH_RUN_STUDY.md)
- 保留 `InputField`／`SkinInput` 与系统 IME。键盘导致视口缩小时，验证滚动后的视觉位置、裁剪和可见性，测试首次与重复开合、滚动期间输入、中文组词、选区和返回路由。保护编辑会话身份，优先把几何变动限定为局部更新。保留框架对含文字祖先的变换约束。 [滚动和输入几何](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/SCROLL_REUSE.md) · [交互性能测量](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/PERFORMANCE.md)

### 游戏调度、输入、矢量与纹理

- 活跃战斗或动画保留所需的模拟及帧回调。暂停菜单、静止界面和事件等待期间，移除空转回调，使用框架事件和一次性期限，例如 `after()`。帧率或 simulation tick 频率属于需要单独消融的变量，改 `--tick-hz` 要重验物理、定时、输入响应和确定性。检查恢复后的首帧、长时间等待、异步响应和旧宿主的兼容行为。 [调度实现](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/GLYPH_AND_SCHEDULER_IMPLEMENTATION.md) · [构建参数](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/TOOLING_API.md)
- 从官方输入路径观察真实变化。独立 Web 的宿主选项 `gameInput: true` 启用 Canvas 聚焦及标准映射手柄采样。检查焦点、重复键、死区、失焦、断开、恢复和文本编辑时的隔离。注入输入可验证协议，实体 USB／蓝牙手柄兼容性需要实机。 [游戏输入实现](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/GAME_INPUT_IMPLEMENTATION.md)
- Canvas 或自绘场景优先复用静态几何和资源句柄。若分配、编码或上传实测偏高，保留可复用缓冲，按内容变化更新资源，计入持有者卸载时的释放成本。纹理消融要同时看上传次数、峰值内存、裁剪和显示尺寸。仅在有分配证据时引入有界复用。
- 静态 SVG 可用 `PocketVector` 的 PAK 路径，动态矢量用 `PocketVector`／`PocketPath`。Flutter 的 `PocketView.vectorRenderMode` 默认 `cachedPicture`，也可对照 `directPath` 或 `autoRasterCache`。对同一资源测冷／热、固定与连续变化的尺寸和颜色，同时观察缓存代价。软件 raster 路径会明确拒绝 PVEC 矢量操作，按实际后端记录支持状态并验证视觉结果。矢量模式见 0.1.33 SDK 压缩包中的 `docs/SVG_VECTOR_IMPLEMENTATION.md`。 [动态图片资源](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/DYNAMIC_IMAGE_RESOURCES.md)

### 图片、PAK 和持续媒体

- **图片及包体。** 保留原图，按显示用途生成运行版。当前文档所述的 PAK 普通图片编译路径限制尺寸为 2 的幂、每边最多 512 像素。大图缩放与细节浏览检查已有 DeepZoom／TILESET 路径及目标端支持。对未用资源、过大纹理、重复变体、可共享资源逐项消融。分别列 PAK、独立媒体、Worker、QJBC 和下次升级真正下载的字节。资源缩小后同时验清晰度、透明边缘、比例、首次解码和重访。更新差异可查 JS API 的 `diffUpdateManifests`。 [大图实现](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/LARGE_IMAGE_IMPLEMENTATION.md) · [更新 API](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/JS_API.md)
- **音频与视频。** 调整预取或并行播放上限前，先量播放准备、首帧／首声，区分进入和稳定播放。使用目标端已接入的媒体 provider，验证换场停止、暂停恢复、seek、结束事件和失败行为。视频另外检查真实画面、层级裁剪、音画同步。分辨率、编码和预加载各跑单独对照。 [音频](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/VISUAL_NOVEL_AUDIO.md) · [视频](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/VISUAL_NOVEL_VIDEO.md)
- **Live2D。** 锁定模型、动作序列、视口、密度与纹理，区分模型更新、纹理上传和绘制耗时。Web 主线程构建的兼容路径可使用 WebGL2 mesh，运行结果要注明实际后端及何时退回软件 presenter。Web 构建使用有授权的 Cubism Core。以真实动作验表情、遮罩、透明边缘与清理，对不存在或仅部分支持的目标端如实标明。 [Web Live2D](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/WEB_LIVE2D.md) · [Web 构建](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/TOOLING_API.md)

### 桥接、Worker、内存与空闲行为

- 先从现有能力边界统计消息频率、大小、在途请求及端到端延迟，再合并可批处理的低优先级消息，去掉重复的轮询和相同资源传输。高频输入、取消顺序和背压需专项验证。若使用 `createHostBridge` 或文档中的 stream adapter，请沿用有界队列和现有生命周期，测峰值积压、超时、失联及释放。
- App Worker、Dio I/O 与 Web Render Worker 各自配置。只有剖析显示工作能移出关键路径时才实验 Worker。保留同场景主线程对照，并计入消息、传输、队列、启动和关闭成本。独立 Web 默认主线程渲染，可用 `--render-worker`／`--no-render-worker` 对照，核验实际 Worker 已启动且浏览器的 OffscreenCanvas、CSP 和所用媒体路径兼容。 [JS 桥接 API](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/JS_API.md) · [Web Render Worker](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/WEB_RENDER_WORKER.md) · [构建参数](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/TOOLING_API.md)
- 对内存压力重复进入／退出场景，记录峰值、稳定值和回落时间。逐个撤掉预取、缓存、后台动画或保活策略，核查卸载后的资源句柄、订阅和未决任务。若空闲 CPU 或唤醒仍高，再查持续帧回调、媒体和异步轮询。根据指标来源区分堆、进程 RSS、宿主/GPU 资源及设备能耗。 [调度验收](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/GLYPH_AND_SCHEDULER_IMPLEMENTATION.md) · [性能测量边界](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/PERFORMANCE.md)

## 可以复用的公开命令

在带对应脚本的 SDK 根目录执行，替换路径并为每个候选指定独立输出目录。真实宿主构建与设备采样使用项目既有 CI／设备流程。 `verify-page` 运行编译后的行为与布局探针，适合作为补充回归证据。 [工具 API](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/TOOLING_API.md)

```sh
npm run check -- /path/to/project
npm run build:guest -- --project-root=/path/to/project --outdir=/path/to/guest-output
npm run build:web -- --project-root=/path/to/project --outdir=/path/to/web-output
```

使用含 `sdk/pocket.ts` 且已配置 native probe 的源 SDK 时，可从仓库根目录运行以下命令，替换实际路由与目标视口大小。参数见 0.1.33 SDK 压缩包中的 `docs/TOOLING_API.md`。

```sh
bun sdk/pocket.ts verify-page /path/to/project --route=/ --width=360 --height=640 --mode=release --json
```

## 何时保留、回滚或结束

重复样本支持净收益，独立行为验收通过，且副指标在本轮约定范围内时保留候选。把改动、资源版本及恢复方式留在一处。收益落在噪声范围或回归超预算时还原，保留双方实测供下一轮选择。达到当前预算、剩余热点的影响很小、缺少目标端证据或需要产品权衡时收束，写清下一轮成立的条件。若仍有明确超预算的热点，继续测下一项可消融因素。

## 给 Agent 的任务示例

- **App 列表滚动时卡顿。** 在同一台设备打开同一批数据，记录快速滚动及打开键盘的基线。先检查视口外条目是否参与布局，再单独比较窗口化列表。复测帧耗时、快速滑动露白、返回后的位置和中文输入。仅在改善超出基线波动且行为通过时保留。
- **Game 暂停时仍有高 CPU。** 固定关卡、输入和暂停时长，先区分游戏 ticker、媒体与 Worker 的工作。只让已证实为空转的 ticker 在暂停时停下，对比空闲唤醒和恢复首帧。复测按键释放、暂停前后状态、固定输入后的画面，以及恢复后的节奏。

```text
场景/用户影响：
版本与条件：SDK、提交/产物摘要、设备/系统、后端/构建、视口/DPR/Hz、网络/温度/缓存
复现输入与采样：步骤或轨迹、冷/热/idle、预热、窗口、每组样本数
主指标与基线：单位、统计量、波动、目标或验收线
单项改动及假设：
A / B / A′：主指标、副指标、波动、原始数据位置
独立正确性：输入 → 实际状态/帧/像素；生命周期、失败、资源释放；通过/失败
证据边界：实际设备/后端；未验证、部分支持或不支持的项
决定：保留/回滚/补测；恢复位置与下一轮触发条件
```
