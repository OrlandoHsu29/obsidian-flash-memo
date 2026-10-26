<p align="center">
  <img src="docs/images/LOGO.png" width="144" alt="Glimmer Memo 标志">
</p>

<h1 align="center">Glimmer Memo</h1>

<p align="center">Obsidian 的文本笔记与 Excalidraw 画板速记浮窗。随手记下灵感，继续手头的工作。</p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

按一下快捷键打开速记，输入文本或绘图，点击其他位置即可保存并隐藏。下次唤起，继续使用当前文件。文本笔记使用 Obsidian 原生 Markdown 编辑器，画板使用 Excalidraw，两者都是笔记库里的普通文件。

![Glimmer Memo 浮窗中的 Markdown 速记笔记](docs/images/overview.png)

## 功能亮点

- **一个快捷键，继续同一张画板。** 随时显示或隐藏速记浮窗；Windows x64 可启用系统全局快捷键。
- **需要时出现，用完即收起。** 失焦后保存并以短暂淡出动画隐藏，不额外添加失焦等待；也可以固定在其他窗口上方。
- **在标题栏管理速记。** 单击文件名切换笔记和画板，通过小图标区分类型，双击直接重命名。
- **保存后继续记录。** 新建时可选文本笔记或画板，先保存当前文件，旧文件保留原文件名和位置。
- **文件留在自己的笔记库。** 自定义保存目录，通过 `![[...]]` 嵌入笔记，停用插件也保留画板。
- **可选的后台入口。** 配合 Tray，关闭 Obsidian 主窗口后仍可使用速记快捷键。

## 环境要求与安装

需要 **Obsidian 桌面版 1.10.0 或更高版本**，并先安装、启用 [Excalidraw 第三方插件](https://github.com/zsviczian/obsidian-excalidraw-plugin)。Glimmer Memo 独立于 Blo Editor，不支持移动端；系统全局快捷键目前仅支持 **Windows x64**。

### 手动安装

1. 在 **设置 → 第三方插件** 中安装并启用 Excalidraw。
2. 从 [GitHub Releases](https://github.com/OrlandoHsu29/obsidian-glimmer-memo/releases) 下载 `glimmer-memo-<version>.zip`，或[从源码构建](#从源码构建)。
3. 将 ZIP 顶层的 `glimmer-memo/` 文件夹解压到 `<笔记库>/.obsidian/plugins/`。保留完整目录，包括 `manifest.json`、`main.js`、`styles.css`、`LICENSE` 和 Windows 快捷键辅助程序。
4. 重新加载 Obsidian，在第三方插件中启用 **Glimmer Memo**。
5. 按 **Ctrl + Alt + Y**、点击侧边栏按钮，或在命令面板执行 **Glimmer Memo：显示/隐藏速记窗口**。

首次使用会创建 `Glimmer Memo/Quick sketch 1.excalidraw.md`，之后继续打开当前笔记或画板。新文件重名时使用下一个可用编号，已有文件保留原名。画板需要 Excalidraw，已有文本笔记可在未启用 Excalidraw 时继续使用。

从旧安装迁移时，启用 Glimmer Memo 前，将原插件目录的 `data.json` 和 `data.json.bak` 复制到新目录。已保存的创建路径和当前文件路径继续使用；不会重命名或移动笔记库中的现有文件。自定义命令快捷键和 URI 启动器需改用新插件 ID。

更新前先关闭全局快捷键，再停用插件，随后替换运行文件。保留自己的 `data.json` 及其备份 `data.json.bak`，完成后重新启用插件。

## 使用方式

### 显示、隐藏与固定

| 操作 | 效果 |
| --- | --- |
| 默认 **Ctrl + Alt + Y** | 显示或隐藏画板 |
| 点击其他位置 | 未固定时保存并隐藏，默认开启 |
| 图钉按钮 | 保持显示并置于其他窗口上方 |
| **Esc** 或关闭按钮 | 保存并隐藏，固定时也可使用 |
| 拖动标题栏 / 调整窗口大小 | 移动或缩放窗口，自动记忆位置与尺寸 |

希望画板保持显示时，可以关闭「失焦时自动隐藏」。绘图菜单和文字编辑优先处理 Esc；先结束输入或关闭菜单，再用 Esc 隐藏窗口。

Glimmer Memo 自己的浮窗不写入保存的工作区布局，因此启动 Obsidian 时不会重建弹出，固定状态也一样。正常退出时还会请求最后保存画板；下次需要时再通过快捷键唤起。

绘图与自动保存由 Excalidraw 负责，Markdown 编辑由 Obsidian 负责。Glimmer Memo 在隐藏、切换、重命名或新建文件前请求对应编辑器保存。速记显示及保存期间会保持主渲染进程唤醒，主窗口最小化时也能正常保存；结束后恢复原来的后台节流设置。

保存与短暂淡出同时开始，画板无需等磁盘保存完成才有视觉反馈。两者都完成后才正式隐藏窗口；保存失败则恢复显示并提示错误。

### 切换笔记、画板与重命名

单击标题栏文件名，查看配置目录及其子目录下的笔记和画板。通过小号的绘图图标和文档图标区分画板与文本笔记。长标题用省略号收起，让列表保持紧凑，悬停可查看完整名称。每项右侧显示文件的最后修改时间。点击某一项后，先保存当前文件，再切换到选中的文件。

![标题栏文件列表用不同图标区分笔记和画板](docs/images/canvas-picker.png)

双击文件名即可原地重命名。按 **Enter** 保存，按 **Esc** 取消；自动保留原扩展名。

### 新建笔记或画板

点击新建文件按钮，在简洁的选择窗口中点击「新建笔记」或「新建画板」，保存当前文件，再在同一个窗口中打开新的空白速记。所有旧文件都保留原文件名和位置。

![新建速记时分别选择笔记或画板](docs/images/new-canvas.png)

文本笔记命名为 `Quick note 1.md`，画板命名为 `Quick sketch 1.excalidraw.md`（兼容模式下为 `.excalidraw`）。两者都在配置的创建目录中使用第一个可用编号。不会重命名或移动已有文件。保存失败时不创建新文件，创建失败时旧文件保持完整。

### 设置

设置按「窗口行为」「快捷键」「速记文件」分组，相关选项放在同一块卡片中。

- **窗口行为：** 通过 Tray 关闭到托盘，以及失焦时自动隐藏。
- **快捷键：** 开关全局模式，修改「唤起窗口快捷键」。
- **速记文件：** 设置相对于笔记库根目录的创建路径，查看当前文件路径。新笔记和画板保存在此目录中，已有文件保留原文件名和位置。

插件跟随 Obsidian 语言，提供中文和英文界面。默认快捷键为 **Ctrl + Alt + Y**。

## 快捷键

在「唤起窗口快捷键」旁点击「修改」，设置同一组组合键：

| 全局快捷键开关 | 组合键的生效范围 |
| --- | --- |
| 开启，仅 Windows x64 | 其他应用中，以及 Obsidian 最小化或后台运行时 |
| 关闭 | 仅 Obsidian 内 |

修改期间暂时释放原绑定；按 Esc、点击外部或切换窗口取消后，恢复原组合。与其他应用或笔记库冲突时会提示，不抢占它们的绑定。侧边栏按钮和命令面板入口始终保留。

内置 C 编写的 `glimmer-memo-hotkey.exe`，使用 Windows `RegisterHotKey` 与阻塞消息循环，无轮询、键盘钩子或脚本运行时。仅启用全局快捷键时运行；关闭此功能、停用插件或退出 Obsidian 后，辅助程序退出并释放绑定。无需 AutoHotkey、PowerToys 或 Rust。

也可以通过 URI 接入外部启动器：

```text
obsidian://glimmer-memo?vault=你的笔记库名称的URL编码
```

不提供 vault 参数时，由接收 URI 的笔记库响应。**Obsidian 和所需插件必须保持运行**；Glimmer Memo 不是独立桌面应用。

## 关闭到托盘，保留速记入口

1. 在 Obsidian 第三方插件中安装并启用 [dragonwocky 的 Tray 插件](https://github.com/dragonwocky/obsidian-tray)。
2. 在 Glimmer Memo 设置中开启「关闭到托盘」。
3. 关闭 Obsidian 主窗口后，笔记库可继续在后台运行，速记全局快捷键保持可用。

尚未安装或启用 Tray 时，设置中会提供相应入口。此开关同步修改 Tray 的后台运行设置、开启托盘图标，并重载 Tray 使设置生效，保留其其他配置。彻底关闭笔记库时，请在托盘菜单选择 **Close Vault**。

从托盘恢复 Obsidian 时，已隐藏的速记画板保持隐藏；通过托盘收起可见画板时会请求保存。停用 Glimmer Memo 不会关闭 Tray 的后台模式。Tray 是可选的独立插件，不随 Glimmer Memo 打包。

## 异常处理与兼容性

- 设置先写入临时文件，完成后再替换原文件，并保留有效的旧配置 `data.json.bak`。设置损坏时从有效备份恢复，避免静默重置画板路径和快捷键。
- 当前画板文件被删除后，窗口自动隐藏，不再尝试保存已删除文件；重新唤起时创建新的编号画板。
- 保存或其他画板操作失败时，会弹出错误对话框。点击「确认并关闭」后直接关闭故障窗口，不重复执行失败的保存。已保存文件保留，未保存修改可能丢失；重新唤起可回到已保存的画板。文件名校验错误仍使用通知，方便直接修改。
- 桌面工作流已在 Windows x64、Obsidian **1.14.4** 和 Excalidraw **2.29.0** 下验证；托盘适配已针对 **Tray 0.3.5** 验证。其他桌面平台尚未验证。
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

安装目录输出到 `dist/glimmer-memo/`，ZIP 输出到 `releases/glimmer-memo-<version>.zip`，包内顶层为 `glimmer-memo/`。按前述步骤安装完整目录即可。

## 协议与致谢

[MIT](LICENSE) © OrlandoHsu29。

- [Excalidraw for Obsidian](https://github.com/zsviczian/obsidian-excalidraw-plugin) 提供绘图与文件保存，按其自身协议独立分发；Glimmer Memo 不打包绘图引擎。
- [Tray](https://github.com/dragonwocky/obsidian-tray) 提供可选的后台运行能力，使用其自身的 MIT 协议。
- 浮窗工作流调研参考了 [Floating Notes](https://github.com/haotiencheng/obsidian-floating-notes)。它不是依赖，Glimmer Memo 自行实现窗口控制逻辑。
- 标题栏字标使用系统字体 **Segoe Script**，不可用时回退到其他手写字体，不分发字体文件。
