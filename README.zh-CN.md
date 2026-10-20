<p align="center">
  <img src="docs/images/LOGO.png" width="144" alt="Flash Memo 标志">
</p>

<h1 align="center">Flash Memo</h1>

<p align="center">Obsidian 的 Excalidraw 速记浮窗。随手记下灵感，继续手头的工作。</p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

![Flash Memo 以小浮窗叠放在项目 GitHub 页面上](docs/images/browser-preview.png)

*作者提供的实拍截图，背景压暗以突出悬浮在项目页面上方的 Flash Memo 小画板。*

按一下快捷键打开画板，画图或写字，点击其他位置即可保存并隐藏。下次唤起，继续使用同一张画板。所有画板都是笔记库里的普通 Excalidraw 文件，可以直接打开，也可以嵌入笔记。

## 功能亮点

- **一个快捷键，继续同一张画板。** 随时显示或隐藏速记浮窗；Windows x64 可启用系统全局快捷键。
- **需要时出现，用完即收起。** 失焦后保存并以短暂淡出动画隐藏，不额外添加失焦等待；也可以固定在其他窗口上方。
- **在标题栏管理画板。** 单击文件名切换画板，双击直接重命名。
- **归档后继续画。** 二次确认后保存并归档当前画板，切换到新的空白画板。
- **文件留在自己的笔记库。** 自定义保存目录，通过 `![[...]]` 嵌入笔记，停用插件也保留画板。
- **可选的后台入口。** 配合 Tray，关闭 Obsidian 主窗口后仍可使用速记快捷键。

## 环境要求与安装

需要 **Obsidian 桌面版 1.10.0 或更高版本**，并先安装、启用 [Excalidraw 第三方插件](https://github.com/zsviczian/obsidian-excalidraw-plugin)。Flash Memo 独立于 Blo Editor，不支持移动端；系统全局快捷键目前仅支持 **Windows x64**。

### 手动安装

1. 在 **设置 → 第三方插件** 中安装并启用 Excalidraw。
2. 从 [GitHub Releases](https://github.com/OrlandoHsu29/obsidian-flash-memo/releases) 下载 `flash-memo-<version>.zip`，或[从源码构建](#从源码构建)。
3. 将 ZIP 顶层的 `flash-memo/` 文件夹解压到 `<笔记库>/.obsidian/plugins/`。保留完整目录，包括 `manifest.json`、`main.js`、`styles.css`、`LICENSE` 和 Windows 快捷键辅助程序。
4. 重新加载 Obsidian，在第三方插件中启用 **Flash Memo**。
5. 按 **Ctrl + Alt + Y**、点击侧边栏按钮，或在命令面板执行 **Flash Memo：显示/隐藏速记画板**。

首次使用会创建 `Flash Memo/Quick sketch 1.excalidraw.md`，之后继续打开当前画板。新画板重名时使用下一个可用编号，已有画板保留原名。

更新前先关闭全局快捷键，再停用插件，随后替换运行文件。保留自己的 `data.json`，完成后重新启用插件。

## 使用方式

### 显示、隐藏与固定

![速记浮窗与操作按钮的近景](docs/images/overview.png)

| 操作 | 效果 |
| --- | --- |
| 默认 **Ctrl + Alt + Y** | 显示或隐藏画板 |
| 点击其他位置 | 未固定时保存并隐藏，默认开启 |
| 图钉按钮 | 保持显示并置于其他窗口上方 |
| **Esc** 或关闭按钮 | 保存并隐藏，固定时也可使用 |
| 拖动标题栏 / 调整窗口大小 | 移动或缩放窗口，自动记忆位置与尺寸 |

希望画板保持显示时，可以关闭「失焦时自动隐藏」。绘图菜单和文字编辑优先处理 Esc；先结束输入或关闭菜单，再用 Esc 隐藏窗口。

绘图与自动保存由 Excalidraw 负责，Flash Memo 也会在隐藏或切换画板前请求保存。画板显示及保存期间会保持主渲染进程唤醒，主窗口最小化时也能正常保存；结束后恢复原来的后台节流设置。

### 切换画板与重命名

单击标题栏文件名，查看配置目录及其子目录下的画板，包括已归档画板。点击某一项后，先保存当前画板，再切换到选中的文件。

![标题栏下拉列表展示可切换的画板](docs/images/canvas-picker.png)

双击文件名即可原地重命名。按 **Enter** 保存，按 **Esc** 取消；自动保留 `.excalidraw.md` 扩展名。

![在标题栏直接修改画板文件名](docs/images/rename.png)

### 归档并新建

点击归档按钮并确认后，保存当前画板，将其移动为带时间戳的文件名，再在同一个窗口中打开新的空白画板。

![归档当前画板前的二次确认](docs/images/archive.png)

归档名称类似 `Sketch 2026-10-18 12-30-05.excalidraw.md`，重名时追加编号。通过 Obsidian 文件管理接口移动文件，以维护笔记链接；保存或创建失败不会删除旧画板。

### 设置

设置按「窗口行为」「快捷键」「画板文件」分组，相关选项放在同一块卡片中。

![按栏目分组的窗口行为与快捷键设置](docs/images/settings.png)

- **窗口行为：** 通过 Tray 关闭到托盘，以及失焦时自动隐藏。
- **快捷键：** 开关全局模式，修改「唤起窗口快捷键」。
- **画板文件：** 设置相对于笔记库根目录的创建路径，查看当前画板路径。新画板和归档画板均保存在此目录中。

截图使用简体中文界面和临时演示画板。图中的 **Ctrl + Shift + Y** 是自定义示例，默认快捷键仍为 **Ctrl + Alt + Y**。插件跟随 Obsidian 语言，提供中文和英文界面。

## 快捷键

在「唤起窗口快捷键」旁点击「修改」，设置同一组组合键：

| 全局快捷键开关 | 组合键的生效范围 |
| --- | --- |
| 开启，仅 Windows x64 | 其他应用中，以及 Obsidian 最小化或后台运行时 |
| 关闭 | 仅 Obsidian 内 |

修改期间暂时释放原绑定；按 Esc、点击外部或切换窗口取消后，恢复原组合。与其他应用或笔记库冲突时会提示，不抢占它们的绑定。侧边栏按钮和命令面板入口始终保留。

内置 C 编写的 `flash-memo-hotkey.exe`，使用 Windows `RegisterHotKey` 与阻塞消息循环，无轮询、键盘钩子或脚本运行时。仅启用全局快捷键时运行；关闭此功能、停用插件或退出 Obsidian 后，辅助程序退出并释放绑定。无需 AutoHotkey、PowerToys 或 Rust。

也可以通过 URI 接入外部启动器：

```text
obsidian://flash-memo?vault=你的笔记库名称的URL编码
```

不提供 vault 参数时，由接收 URI 的笔记库响应。**Obsidian 和所需插件必须保持运行**；Flash Memo 不是独立桌面应用。

## 关闭到托盘，保留速记入口

1. 在 Obsidian 第三方插件中安装并启用 [dragonwocky 的 Tray 插件](https://github.com/dragonwocky/obsidian-tray)。
2. 在 Flash Memo 设置中开启「关闭到托盘」。
3. 关闭 Obsidian 主窗口后，笔记库可继续在后台运行，速记全局快捷键保持可用。

尚未安装或启用 Tray 时，设置中会提供相应入口。此开关同步修改 Tray 的后台运行设置、开启托盘图标，并重载 Tray 使设置生效，保留其其他配置。彻底关闭笔记库时，请在托盘菜单选择 **Close Vault**。

从托盘恢复 Obsidian 时，已隐藏的速记画板保持隐藏；通过托盘收起可见画板时会请求保存。停用 Flash Memo 不会关闭 Tray 的后台模式。Tray 是可选的独立插件，不随 Flash Memo 打包。

## 异常处理与兼容性

- 当前画板文件被删除后，窗口自动隐藏，不再尝试保存已删除文件；重新唤起时创建新的编号画板。
- 保存或其他画板操作失败时，会弹出错误对话框。点击「确认并关闭」后直接关闭故障窗口，不重复执行失败的保存。已保存文件保留，未保存修改可能丢失；重新唤起可回到已保存的画板。文件名校验错误仍使用通知，方便直接修改。
- 预览截图拍摄于 Windows x64，使用 Obsidian **1.14.4** 和 Excalidraw **2.29.0**；托盘适配已针对 **Tray 0.3.5** 验证。其他桌面平台尚未验证。
- 窗口控制使用 Obsidian 浮窗内部的 `electronWindow` 接口；Excalidraw 和 Tray 适配也依赖插件接口。未来更新可能需要调整，不承诺兼容所有版本和平台。

## 从源码构建

建议使用 Node.js **22**。构建 Windows 辅助程序还需要 Visual Studio Build Tools 的「**使用 C++ 的桌面开发**」工作负载。

在 Windows PowerShell 中执行：

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run package
```

安装目录输出到 `dist/flash-memo/`，ZIP 输出到 `releases/flash-memo-<version>.zip`，包内顶层为 `flash-memo/`。按前述步骤安装完整目录即可。

## 协议与致谢

[MIT](LICENSE) © OrlandoHsu29。

- [Excalidraw for Obsidian](https://github.com/zsviczian/obsidian-excalidraw-plugin) 提供绘图与文件保存，按其自身协议独立分发；Flash Memo 不打包绘图引擎。
- [Tray](https://github.com/dragonwocky/obsidian-tray) 提供可选的后台运行能力，使用其自身的 MIT 协议。
- 浮窗工作流调研参考了 [Floating Notes](https://github.com/haotiencheng/obsidian-floating-notes)。它不是依赖，Flash Memo 自行实现窗口控制逻辑。
- 标题栏字标使用系统字体 **Segoe Script**，不可用时回退到其他手写字体，不分发字体文件。
