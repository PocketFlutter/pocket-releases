# 游戏、媒体与视觉小说

在 Guest 中维护游戏状态、场景、动画、音轨和播放意图。宿主提供设备输入、资源解码与可观察的播放状态。先打通一段从输入到新画面的路径，再加素材、扩展输入和平台特性。

## 游戏输入与二维渲染

1. 用现成的 Pocket 页面、导航和控件做菜单、设置、暂停与 IME。场景内用 Pocket 原生节点和资源管线加载图像、更新布局或绘制几何。走同一条 QJBC + PAK 管线。
2. 把触摸、按钮位图、摇杆轴归一为游戏动作。键盘和手柄采样属于宿主，游戏规则留在 JS。
3. 在目标宿主操作，再记录同一次操作前后的 Guest 状态和实际渲染变化。例如左右移动时角色像素位置变化，跨至少一个 GuestFrame 的按键能触发一次动作。
4. 对同一场景、分辨率和输入序列，比较启用与移除额外 ticker 或绘制层的实测结果，保留需要的调度和渲染路径。

| 输入 | 使用方式 |
| --- | --- |
| Flutter 触摸 | 默认可用，宿主转发逻辑坐标。用 Pocket 事件处理交互，避免建立一套并行焦点系统。 |
| Flutter 键盘 | `PocketAppConfig(keyboardInputEnabled: true, keyboardAutofocus: false, ...)`。默认先点击渲染面，支持方向键/WASD。可用 `keyboardButtonMap` 覆盖映射。IME 工作时键盘事件交给文本编辑。 |
| Flutter 手柄 | 消费者接入实际设备插件，在宿主策略允许后用 `PocketViewController.sendButtons` 传完整位图，可用 `sendAxes` 传轴。轴值 0–255，中心 128，双轴位图按官方协议打包。 |
| 浏览器键盘与手柄 | `PocketWebRuntime` 配置 `gameInput: true`。Canvas 获焦后采样标准映射手柄，摇杆默认死区 0.15。验证失焦、断连、页面隐藏和文本编辑时释放状态。 |

官方输入按帧采样。在一个 GuestFrame 之前完成的按下和松开可能只留下最终状态。Flutter 的键盘开关也不会自动授予模拟轴权限。Web 的真实 WASM/QJBC 回归已经观察到注入的键盘和手柄样本改变帧像素。USB/BLE 手柄兼容性仍应测实际设备。

普通精灵可先用受支持的图像节点和入包素材，通过 JS 更新位置和状态。需要纹理三角网格的 VN 场景可用 `@pocket/vn/mesh-view` 的 `NovelMeshView`，要求模型图像进入原生 PAK，目标宿主支持保留网格。网格能力缺失或几何超出预算时会报错。先测静态场景，再测动画和多对象场景，比较输入是否持续驱动可见画面。

[游戏输入协议、默认映射与证据](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/GAME_INPUT_IMPLEMENTATION.md)

## 视频和音频

| 能力 | 接入步骤 |
| --- | --- |
| 视频 | 用 `@pocket/ui/video` 的 `Video` 和 `@pocket/ui/media` 的 `createMediaController`，传入稳定 `id`、`asset` 与共享控制器。宿主注册并授权视频资源及视频 Surface。JS 根据活动路由、前后台和用户意图决定是否播放。 |
| 音频 | Flutter 通过 `pocket_audio` 的 `PocketAudioPlugin` 提供 allowlist 内的应用资产。用 `media.audio.play/stop/pause/resume/volume` 控制 BGM 和音效。语音需要 `PocketAudioPlugin.forPocketViewController` 将带 `playbackId` 的真实完成和错误事件送回 JS。 |
| 目标差异 | 在实际宿主验证解码、首帧、返回页面、后台恢复和退出释放。Web/微信要分别确认对应媒体提供者、浏览器播放策略及设备表现。 |

`Video` 默认 `active=true`、`playing=false`、`fit="cover"`。验收先用短资源，看播放位置或帧实际推进，再测试暂停、路由离开和切后台。对语音自动推进，验证上一条旧播放事件无法结束新行。

[视频生命周期](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/MEDIA_LIFECYCLE.md) · [实际视频状态与 seek](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/VIDEO_MEDIA_FACTS.md) · [Flutter 音频提供者](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/VISUAL_NOVEL_AUDIO.md)

## 视觉小说先跑通一条分支

1. 创建小故事，包含两句台词、一个选择和两个可区分的结局。用 `@pocket/vn` 的 `createNovelEngine(story)` 与 `@pocket/vn/view` 的 `NovelView` 组合场景。
2. 通过引擎推进、选择、保存、载入和回滚。保存后重启 Guest 并载入，检查台词、分支、选择和画面恢复。按需配置持久化保存和独立的全局进度。
3. 加入独立 BGM、一次性音效、语音或视频。将暂停、恢复和完成交给引擎与实际宿主的媒体事件，验证跳过或切换路线时资源释放。

[故事创作与校验](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/VISUAL_NOVEL_AUTHORING.md) · [VN 引擎、存档与边界](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/VISUAL_NOVEL_ENGINE.md)

## Live2D 与 Spine 要单独验收

- **Live2D** 需要自备授权的模型、对应纹理和 Cubism Core。浏览器使用本地 Cubism Web Core，构建时提供 `--live2d-core` 或 `POCKET_CUBISM_WEB_CORE`。原生 Flutter 要在目标环境安装匹配的原生 Core，并验证实际 QJBC Guest 中的动作、遮罩及释放。Studio Stage、浏览器 Guest 和 Flutter 原生分别验收。 [Web Live2D 输入、构建和验证](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/WEB_LIVE2D.md)
- **Spine** 用 `@pocket/spine` 适配器，VN 场景可从 `@pocket/vn/spine` 接入。使用和运行时版本匹配且有分发权限的 skeleton、atlas 和贴图。当前文档验证了普通 Region、Mesh、Weighted Mesh 及常规凸裁剪。加法、正片叠底、滤色和双色 tint 会报告不支持，deform、linked mesh、高级 sequence 及逆向/凹裁剪需单独验证。 [Spine 适配合同与限制](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/VISUAL_NOVEL_SPINE.md)

[Flutter 宿主与硬件](Host-and-Hardware.md) · [部署与更新](Deployment-and-Updates.md)
