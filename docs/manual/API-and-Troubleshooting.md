# API 与排障

适用基线为 Pocket Web SDK **0.1.33**。先用项目实际安装的版本找入口，再按症状定位到工具链、Guest、宿主或发布链路。

## API 从哪里查

| 需要查什么 | 查找方法 |
| --- | --- |
| SDK 能力与平台 | [能力索引](Capabilities.md) 和对应章节 |
| JS/TS 的包名、子路径和签名 | 检查具体包 `package.json` 的 `exports`。在已解包 SDK 中查看 `docs/API.md`、`docs/JS_API.md` 或归档内存在的签名目录 |
| Flutter 接入 | [宿主与硬件](Host-and-Hardware.md)。在完整 SDK 中查 `docs/FLUTTER_API.md`、`docs/HYBRID_HOST_API.md` 和对应 Dart 公共库 |
| 编辑器、CLI 和构建 | [项目与 Studio](Project-and-Studio.md) 与 SDK 文档 `docs/TOOLING_API.md` |
| 版本、构建产物与兼容范围 | [0.1.33 发布说明与资产](https://github.com/PocketFlutter/pocket-releases/releases/tag/sdk-v0.1.33)；归档中的 `provenance.json` 记录构建来源 |

JS/TS 优先通过包的公开入口导入，Dart 从包公开的 `lib/*.dart` 库导入。平台支持需要有对应运行证据。工作区清单和公开归档之间可能存在分发范围差异。

## 从症状排查

| 症状 | 先检查 | 验收 |
| --- | --- | --- |
| 安装器或工具报错 | `node --version`、系统架构、正确的平台包和校验文件。已安装时从 SDK 根执行 `npm run doctor` | doctor 找到已校验的本机工具，项目能重新编译 |
| Studio 启动不了 | 从 SDK 根执行 `npm run status`，检查已有进程、端口和工作目录 | `http://127.0.0.1:8791` 能打开，项目可选中 |
| 类型检查通过但预览空白 | 检查项目根、入口、使用的资源包和构建错误；确认实际 Guest 和设备输入 | 在目标端重现真实 Guest 帧，并观察输入造成帧或状态变化 |
| 路由切换后输入或滚动丢失 | 检查是否使用保留路由、官方 IME 组件和稳定标识 | 切换再返回后，焦点策略、文本和滚动位置符合项目约定 |
| 硬件调用报告未配置或权限拒绝 | 分别核对 Guest 声明、宿主注册、系统权限、目标端设备与提供方 | 成功、拒绝、取消路径均能结束并清理资源 |
| 更新后旧行为仍在 | 区分 Studio、应用包和浏览器静态部署。检查当前版本、签名、资源哈希与缓存命中 | 可解释的版本切换、重启或重载，以及验证过的回滚 |
| 卡顿或内存攀升 | 记录目标场景、设备、构建模式和可复现输入 | 同条件基线与对照数据，外加正确性证据 |

## 问题记录

在报告里包含 SDK 版本、平台和设备、复现命令、Guest 入口、预期/实际结果、最小可复现输入，以及已遮盖凭据和用户信息的错误片段。标明结论来自实机、模拟器、Studio 预览或自动化探针。

[Agent 工作指南](Agent-Guide.md) · [可持续性能优化](Performance-Loop.md)
