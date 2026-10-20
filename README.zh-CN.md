# Flash Memo

用于快速随手记录的 Excalidraw 浮窗画板。独立于 Blo Editor，画板保存为笔记库内的普通 Excalidraw 文件。

- **Ctrl + Alt + Y**：显示/隐藏画板，可在 Flash Memo 设置中修改；“全局快捷键”开关决定是否在 Obsidian 外也生效（全局模式仅 Windows x64）。
- **Esc**：隐藏窗口；正在输入文字或打开绘图菜单时，先结束输入或关闭菜单。
- **点击其他位置**：保存后直接隐藏，不播放退出动画，默认开启；可在 Flash Memo 设置中关闭“失焦时自动隐藏”，让画板保持显示。
- **图钉**：固定后保持显示并置顶，仍可通过 Esc 隐藏。
- **关闭（×）**：保存并隐藏窗口，固定时也可使用；再次呼出继续使用同一画板。
- 拖动标题栏移动窗口，正常调整大小；自动记忆位置和尺寸。
- 单击标题栏文件名展开画板列表，可选择配置目录及其子目录中的画板（包括归档画板），切换前先保存当前画板。双击文件名可重命名；Enter 保存，Esc 取消，自动保留画板扩展名。
- 左侧字标为 **Flash memo**，使用系统字体 **Segoe Script**，不可用时回退到其他手写字体；不随插件分发字体文件。
- **归档按钮**：二次确认后保存当前画板，按时间命名归档，并在同一窗口切换到新空白画板。

需要先安装并启用 [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin)。首次呼出自动创建 `Flash Memo/Quick sketch 1.excalidraw.md`，之后反复打开同一画板。新画板从编号 1 开始，重名时依次递增至可用编号，已有画板保留原名。绘图和自动保存由 Excalidraw 负责，隐藏前请求保存。可通过 `![[...]]` 嵌入任意笔记，也适用于 Blo Editor。停用 Flash Memo 不会删除画板。

仅适用于桌面端。窗口控制使用桌面浮窗内部的 `electronWindow` 接口，后续 Obsidian 更新可能需要适配。插件不包含绘图引擎，也不依赖 Floating Notes。

当前画板文件被删除后，浮窗会自动隐藏，不再尝试保存已删除的文件；再次呼出 Flash Memo 会自动创建带编号的新画板。

保存或其他画板操作失败时会显示错误弹窗。点击“确认并关闭”后直接关闭故障窗口，不再重复执行失败的保存；已保存的画板文件保留，未保存的修改可能丢失。再次呼出可重新打开已保存的画板。文件名输入错误仍以提示通知显示，方便直接修改。

画板显示期间会暂时保持主渲染进程唤醒，以便主窗口最小化时 Excalidraw 也能正常保存；隐藏画板或停用插件后恢复原来的后台节流设置。

设置中的“画板创建路径”相对于知识库根目录，例如 `画板/速记`。新画板和归档画板均保存在这个文件夹中；归档名称类似 `Sketch 2026-10-18 12-30-05.excalidraw.md`，重名时自动加序号。归档时通过 Obsidian 文件管理接口移动原文件，以维护现有笔记链接；保存或创建失败不会删除旧画板。

## 快捷键

默认使用 **Ctrl + Alt + Y**，在 Flash Memo 设置中点击“修改”更换这一组组合键。开启“全局快捷键”时，在其他应用或 Obsidian 最小化时也可使用（仅 Windows x64）；关闭后，同一组合仅在 Obsidian 内生效。修改期间暂时释放原绑定；按 Esc、点击外部或切换窗口取消后自动恢复。保留侧边栏按钮、命令面板和 URI 入口。

内置 C 编写的 `flash-memo-hotkey.exe`，直接使用 Windows `RegisterHotKey` 消息机制，无轮询、键盘钩子或脚本运行时。只有开启全局快捷键时才运行。关闭此功能、停用插件或 Obsidian 退出后，监听器会退出并释放按键；组合被其他程序或另一个笔记库占用时，会在设置中提示冲突。无需 AutoHotkey、PowerToys 或 Rust 环境。Obsidian 仍需保持运行，支持绘图的 Excalidraw 插件也需启用。

其他平台可通过 `obsidian://flash-memo?vault=你的笔记库名称的URL编码` 接入外部启动器。不提供 vault 参数时，由接收 URI 的笔记库响应。

## 关闭 Obsidian 后保留速记入口

推荐从 Obsidian 第三方插件市场安装并启用 [dragonwocky 的 Tray 插件](https://github.com/dragonwocky/obsidian-tray)。之后可在 Flash Memo 设置中开启“关闭到托盘”，同步修改 Tray 的后台运行设置，并开启托盘图标。Tray 未启用时此开关不可用，会按安装状态显示安装链接或启用按钮。修改开关会重载 Tray，使设置生效；保留 Tray 的其他配置。

关闭 Obsidian 主窗口后，笔记库仍可在后台运行，Flash Memo 的全局快捷键继续可用。需要彻底关闭当前笔记库时，请在托盘菜单中选择 **Close Vault**。从托盘恢复 Obsidian 时，已隐藏的速记画板保持隐藏；通过托盘收起可见画板时，Flash Memo 会请求保存。适配使用 Tray 的内部插件接口，已针对 Windows 上的 Tray 0.3.5 验证，未来版本可能需要调整。Tray 是独立插件，使用其自身的 MIT 协议，不随 Flash Memo 打包；停用 Flash Memo 不会关闭 Tray 的后台运行模式。

## 构建与安装

建议 Node.js 22，并安装 Visual Studio Build Tools 的“使用 C++ 的桌面开发”工作负载。Windows 下执行：

```sh
npm ci
npm run typecheck
npm test
npm run package
```

将完整 `dist/flash-memo/` 安装到笔记库的 `.obsidian/plugins/`，包括快捷键辅助 EXE。ZIP 输出到 `releases/`，内部顶层目录为 `flash-memo/`。更新时保留 `data.json`，替换辅助程序前先关闭全局快捷键。

MIT © OrlandoHsu29。Excalidraw 为独立第三方插件。浮窗方案调研参考了 [Floating Notes](https://github.com/haotiencheng/obsidian-floating-notes)，本项目自行实现失焦隐藏与固定窗口的控制逻辑。

[English](README.md)
