# Flutter 宿主与硬件

业务界面、路由、状态和设备操作策略放在 JS Guest。Flutter 负责挂载渲染面、转发输入与生命周期、解码资源，并提供明确注册的原生能力。先确定目标平台和所需能力，再决定是否需要 Flutter 宿主。

## 接入 Flutter 宿主

1. 确认手上有包含 Flutter SDK 与相应平台原生产物的授权发行包或集成环境。Web SDK 归档用于 Guest、Web 和 Studio 工具链。Flutter 依赖与原生库另行准备。
2. 从含完整 Flutter SDK 的工作区执行脚手架。这个例子只选择相机能力。应用已经有 Flutter 外壳时，在现有 `MaterialApp` 中嵌入 `PocketGuest(config: ...)`。
3. 在宿主 `pubspec.yaml` 声明 `pocket_sdk` 和对应插件依赖。默认 Guest 资产为 `assets/app.qjbc`、`assets/app.pak`、`assets/app.bytecode.json` 和 `assets/guest-manifest.json`。使用同一次构建的四个文件，保持宿主与字节码 ABI 匹配。
4. 独立外壳用 `PocketApp(config: PocketAppConfig(appId: ...))`。需要自行管理运行时会话时用 `PocketSession(config: ...)`，退出时等待 `close()` 完成插件关闭。

```sh
npm --prefix sdk run init -- /absolute/path/to/my-app --camera
npm run check -- /absolute/path/to/my-app
```

[Flutter SDK 接入](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/FLUTTER_SDK.md) · [Flutter API](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/FLUTTER_API.md)

## 原生能力有四道接入条件

| 层 | 配置 |
| --- | --- |
| Flutter 插件 | 在宿主加入依赖并将对应构造器放进 `PocketAppConfig.pluginFactories`。切换已验证 Guest 时由工厂按会话创建实例。 |
| 宿主策略 | 将必要权限加入 `PocketAppConfig.allowedPermissions`。可选能力按实际宿主配置降级。 |
| Guest 声明 | 在 `manifest.json` 声明 `capabilities.requires/optional` 及相应 `permissions`。尽量把可降级设备能力放入 `optional`。 |
| 操作系统 | 配置 Android Manifest、iOS usage descriptions / 编译宏及适用的 entitlements。在用户触发操作后请求系统授权。 |

引擎特征由 `pocket.json` 的 `engine.capabilities` 声明。HostBridge 请求的名称按原大小写放在 Guest manifest。两个声明的位置和语义各自独立。

| 需求 | Flutter 插件或脚手架选项 |
| --- | --- |
| 系统授权 | `pocket_permissions` / `PocketPermissionsPlugin`，处理查询、申请和打开系统设置 |
| 相机与照片 | `pocket_camera` / `PocketCameraPlugin`，`--camera`，管理预览纹理、拍摄、应用私有照片与系统相册导出 |
| 蓝牙、传感器、位置 | `pocket_bluetooth` / `--bluetooth`，`pocket_sensors` / `--sensors`，`pocket_location` / `--location` |
| 生物识别、天气 | `pocket_biometrics` / `--biometrics`，`pocket_weather` / `--weather`。单独的天气插件需要经纬度。 |
| 剪贴板、文件、HTTP | 每项各有可选宿主插件。Dio 还需授权 `network` 并配置 `allowedOrigins`。文件选择器返回可释放的句柄，按块读取。 |
| 系统栏、触觉、深链接、系统小组件 | 按需注册 `pocket_platform` 对应的插件。Widget、Live Activity 和手表交付还需要宿主侧平台配置和设备验收。 |

新项目按领域选包。现有 `--hardware` 和 `HardwarePlugin` 是兼容入口。Android 12 及以上的 BLE 和旧 Android 版本的扫描授权有差异。普通 Android 运动传感器与私有照片无需弹出系统权限对话框，iOS 相册导出使用仅添加权限。

[独立硬件包与权限](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/HARDWARE_MODULES.md) · [可选插件与平台能力](https://github.com/PocketFlutter/pocket-releases/blob/main/docs/OPTIONAL_PLUGINS.md)

## 实例：相机预览与权限回退

手工接入时，Dart 侧注册 `PocketPermissionsPlugin` 和 `PocketCameraPlugin`，相机工厂将 `onTextureRegistered` 与 `onTextureReleased` 接到控制器的 `authorizePlatformTexture` 与 `revokePlatformTexture`。Guest 在自己已有的 `manifest.json` 合并下列字段，再在按钮处理函数中调用现有 HostBridge。

```json
{
  "capabilities": {
    "requires": [],
    "optional": [
      "permissions.request",
      "hardware.camera.preview.start",
      "hardware.camera.preview.stop"
    ]
  },
  "permissions": { "optional": ["hardware.camera"] }
}
```

```ts
import { createPocketPermissionsClient } from "@pocket/devtools_ui/permissions";

const permissions = createPocketPermissionsClient(host);

async function startCamera() {
  const result = await permissions.request("hardware.camera");
  if (result.granted) {
    await host.request("hardware.camera.preview.start", { lens: "back" });
  }
  return result;
}
```

系统拒绝会返回授权结果（例如 `granted: false`），桥接准入错误则拒绝请求。处理两类结果，并在离开页面时结束预览。需要连续样本时保留 SDK 聚合的流生命周期，退场时取消订阅。

## 交付什么证据

- Flutter SDK 集成基线为 iOS 15.0、Android API 24，当前 Android 原生归档为 `arm64-v8a`。仓库记录了 iOS 模拟器及 Android 平台编译、权限接口和真实 QuickJS 指针驱动验收。
- 相机、BLE、系统授权弹窗以及 Widget、Live Activity 等系统交付都应实测目标设备。分别记录允许、拒绝、切后台或离开页面后的清理，并确认 Guest 画面跟随设备结果更新。
- Web、微信和 Studio 的能力由各自宿主决定。预览时显示 `unsupported` 等明确状态，发布说明注明实测平台和设备。原生插件改动需要重建宿主。

[游戏与媒体](Games-and-Media.md) · [部署与更新](Deployment-and-Updates.md)
