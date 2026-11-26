# 旧项目升级与性能优化

先让原项目在目标 SDK 上完整跑一遍，再针对仍存在的瓶颈迁移代码。以 0.1.33 为例，更新 Studio 可以更换 Web SDK 和 Editor 的工具链及发行源。Flutter 宿主、项目依赖和已经部署的 Guest 各有自己的版本及发布入口。 [0.1.33 发行](https://github.com/PocketFlutter/pocket-releases/releases/tag/sdk-v0.1.33) · [部署、签名与更新](Deployment-and-Updates.md)

## 保留可复现的旧版本

- **确认项目根目录和真实运行版本。** 找到包含 `pocket.json`、`manifest.json` 的 Guest 根。Flutter 宿主通常有独立的 `pubspec.yaml`、`ios/`、`android/`，Guest 常位于 `js/`。记录运行中的 Studio 版本、Guest 编译器和 ABI、Flutter 宿主与插件锁定版本，以及 Web 实际加载的运行时和产物。生成脚本可能引用 SDK 的绝对路径，切换 SDK 后检查实际解析路径。 [项目与 Studio](Project-and-Studio.md)
- **保存代码、构建输入和真实用户数据的恢复点。** 保存 Studio 草稿，记录提交及未提交改动，保留 `pocket.json`、`manifest.json`、`editor.json`、自定义脚本／配置／资源及现有 `pocket-lock.json`、包管理器锁文件和宿主 `pubspec.lock`。通过现有备份或导出入口保留草稿、存档、进度和持久化数据，用副本测试旧数据能否读取。保留上一组可部署产物及来源，密钥留在原有发布环境。 [Studio 升级与恢复](../STUDIO_UPGRADE.md)
- **给 SDK 对比留出独立目录。** 将旧 SDK 与候选 SDK 分开放置，从同一项目提交分别建出独立产物。源检出保留自己的变更和分支；托管安装完成升级后核对 Studio `/health` 版本。按需在项目副本同步 `AGENTS.md` 托管块，检查差异后再提交。 [安装与首个 App](Install-and-First-App.md)

## 先量 SDK，再量项目改动

| 对照 | 固定项与验收 |
| --- | --- |
| A → B，SDK 升级 | A 用现有版本，B 用候选版本。同一应用提交、业务配置、输入轨迹与资源，固定设备、构建模式和实际后端。B 依据目标运行端重新生成匹配产物；确需修改依赖锁或接法才能运行时，单独记录这项兼容改动及其影响。两组都启动编译后的 Guest 并用真实输入触发状态和画面变化。 |
| B → C → B′，项目接入与消融 | 在候选 SDK 上先运行原路径 B，再逐项测试 C。每次只替换已观察到瓶颈的一处。撤销该项得到 B′，重复同一场景。保留能重复获得收益且通过独立交互验证的改动，移除被替代的状态、订阅或缓存。 |

从带对应脚本的 SDK 根目录执行，替换为本机绝对路径并为不同组使用各自的输出目录。项目检查通过后，在目标运行端执行交互回归。 [工具 API](../TOOLING_API.md)

```sh
npm run check -- /absolute/path/to/guest
npm run lint -- /absolute/path/to/guest --json
npm run build:guest -- --project-root=/absolute/path/to/guest --outdir=/absolute/path/to/guest-out
```

先测试自动生效的收益，再按瓶颈选择框架迁移，例如用 `createPocketRouter` 和 `PocketAppShell` 保留页面状态，或对长列表试用 `PocketVirtualList`。JS 继续持有页面、游戏与业务状态。原生能力沿现有宿主边界接入。 [已发布的 SDK 优化](SDK-Optimizations.md) · [建立基线与做消融](Performance-Loop.md)

对照两个 SDK 的 lint 结果时，先用 `npm run lint -- --list-rules --json` 核对各自的规则目录。把 `file`、`line`、`code` 和 `fixHint` 记入优化清单，再用同场景测量确认优先级。只重查一项时使用 `--rule=CODE`。

## 按实际交付目标复测

| 目标 | 发布前应试运行的路径 |
| --- | --- |
| Web | 用对应 SDK 的 `npm run build:web` 重新导出完整目录，提供同一候选的运行时、WASM、QJBC 与 PAK。部署到测试站，确认资源请求、实际渲染后端、真实点击／键盘、尺寸改变，以及旧缓存下的升级。开启渲染 Worker 时再检查目标浏览器、CSP 和媒体。 |
| Flutter 内置 Guest | 在 CI 使用匹配的 SDK、字节码 ABI、Flutter 宿主与插件构建。真机重测原生输入与 IME、退后台恢复、有用的硬件能力及失败反馈，观察启动和输入后的画面。对于宿主或插件变化，从已安装旧版演练宿主升级。 |
| 已安装宿主的 Guest OTA | 在旧宿主分别验证签名、应用身份、ABI、能力和包／资源版本。测试实际下载、校验、应用、重启和回滚，补测断网及验签或资源失败。核对最终运行的构建号。涉及原生插件、宿主权限或 ABI 不兼容时，走宿主发布路径。 |

[运行时和目标](Runtime-and-Targets.md) · [部署、签名与更新](Deployment-and-Updates.md) · [Flutter 宿主与硬件](Host-and-Hardware.md)

## App 与 Game 的可执行例子

- **App 长列表滚动卡顿。** 在同一设备、同一数据和滑动轨迹上记录 A 与 B，量超预算帧和重复进入的驻留内存。确认视口外行仍参与布局后，C 只将固定行高列表改用 `PocketVirtualList`。检查快速滑动露白、点击条目后返回时的偏移，以及编辑框中文组词、选区和草稿；关闭窗口化复测 B′。 [UI 与导航](UI-and-Navigation.md) · [性能优化闭环](Performance-Loop.md)
- **Game 暂停后仍耗电。** 固定关卡、随机种子、输入序列及暂停时长。用 A 与 B 区分升级效果，分别观测帧回调、媒体和 Worker；若确认游戏回调持续空转，C 只在暂停态停止该回调，由现有事件恢复。对比暂停唤醒、CPU 与恢复首个交互帧；核验暂停前后的存档、输入释放、背景恢复及固定输入产生的画面。 [游戏与媒体](Games-and-Media.md) · [性能优化闭环](Performance-Loop.md)

## 保留收益或恢复上一组产物

需要通过远端签名更新恢复旧行为时，用已验证的旧代码和资源重新打包、签名并以更高的构建号发布。已安装宿主的本地回退使用其支持的上一健康版本入口。分别演练这两条路径，并验证旧版还能读取升级期间写入的数据。

在提交前记录 A/B/C/B′、样本波动、交互结果和未测目标。收益落在噪声内或行为回归时撤销该项项目改动。SDK 升级回退时使用上一套工具链、依赖锁和对应产物，核对 Studio 版本及原项目交互。Web 一起恢复上一版发布目录与入口，复测缓存刷新；Flutter 回到 CI 构建的已知可用宿主；OTA 使用宿主支持的回滚入口恢复到已验证包。任何会写入新数据格式的变更都先演练旧版能否读回，并保留用户数据恢复点。 [部署、签名与更新](Deployment-and-Updates.md)
