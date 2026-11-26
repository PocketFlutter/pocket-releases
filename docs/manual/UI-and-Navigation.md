# UI 与导航

在 Guest 的 JS/TSX 中组织页面、路由、业务状态和主题。先使用 Pocket 组件完成交互，再按需要调整皮肤、主题 token 或局部布局。

## 路由、应用壳和返回

从 `@pocket/router` 导入 `createPocketRouter` 和 `PocketAppShell`。在 router 声明路由 ID 和路径，在 shell 的 `routes` 声明同一批 ID 及页面 `render`。页面内部调用 `router.push` 或 `router.navigate`。维护既有项目时，可沿用 `RouteView`、`PocketRouteScope` 和 `createPocketBackNavigation` 的保留式接法。

```tsx
import { createPocketRouter, PocketAppShell } from "@pocket/router";
import { mount } from "@pocketjs/framework/solid";

const router = createPocketRouter({
  routes: [{ id: "home", path: "/" }, { id: "detail", path: "/detail" }],
});

// Home 和 Detail 是项目里的页面组件。
function App() {
  return (
    <PocketAppShell
      router={router}
      routes={[
        { id: "home", title: "首页", render: () => <Home /> },
        { id: "detail", title: "详情", render: () => <Detail /> },
      ]}
    />
  );
}

mount(() => <App />);
```

将上述组合接入脚手架原有入口，每个入口沿用一次 `mount`。Shell 保留已访问的 tab 和栈页，并区分逻辑活动页与转场中可见页。滚动位置和输入会话由原页面持有。需要自定义返回时在路由内使用 `usePocketBackHandler`，仅在确实消费请求时返回 `true`。内置 Dialog/Sheet 已接入返回拦截。

## 布局、滚动和输入

- 页面壳用 `SkinScaffold` 或 `SafeAreaScaffold`，顶栏和底栏优先用 `SkinAppBar`、`SkinBackButton`、`SkinNavigationBar`。常规滚动使用 `ScrollablePage`，固定行高长列表可使用 `@pocket/fast/fast` 的 `PocketVirtualList`。
- 表单用 `SkinInput` 或 `InputField`。Guest 持有输入值，宿主负责 IME。Shell 已转发 `textInput.*`，沿用已有事件接线。
- 使用 `@pocket/skins` 的 `UiSkinProvider` 和 `Skin*` 槽位替换外观，保留按压、焦点、键盘、滚动和安全区行为。需要局部调整时可用 `@pocket/ui` 的 `View`、`Text` 与 `Focusable`。
- 保留式路由可避免 `<Show>` 切页销毁状态。Guest 使用 Pocket JSX，组件内避免 DOM 标签与浏览器全局。带 `Text` 的 `View` 祖先只使用平移变换。

在项目目录运行 `npm run check`，重新构建并在 Preview 实测。输入中文并提交，切 tab 再切回，检查滚动位置与草稿，打开弹层后分别验证第一次返回关闭弹层和第二次返回页面。验收目标含 Flutter 或微信时，在目标宿主复测系统键盘和返回事件。

继续查看[运行时与目标平台](Runtime-and-Targets.md)或[API 与排障](API-and-Troubleshooting.md)。
