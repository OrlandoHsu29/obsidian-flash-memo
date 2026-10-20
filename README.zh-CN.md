# Flash Memo

用于快速随手记录的 Excalidraw 浮窗画板。独立于 Blo Editor，画板保存为笔记库内的普通 Excalidraw 文件。

- **Ctrl/Cmd + Shift + Y**：显示/隐藏画板，可在 Obsidian → 快捷键 → Flash Memo 中修改。
- **Ctrl + Alt + Y（Windows）**：系统全局呼出，可在 Flash Memo 设置中开关或更换组合。
- **Esc**：隐藏窗口；正在输入文字或打开绘图菜单时，先结束输入或关闭菜单。
- **点击其他位置**：保存后直接隐藏，不播放退出动画，默认开启；可在 Flash Memo 设置中关闭“失焦时自动隐藏”，让画板保持显示。
- **图钉**：固定后保持显示并置顶，仍可通过 Esc 隐藏。
- **关闭（×）**：保存并隐藏窗口，固定时也可使用；再次呼出继续使用同一画板。
- 拖动标题栏移动窗口，正常调整大小；自动记忆位置和尺寸。
- 标题栏显示画板文件名，点击即可修改；Enter 保存，Esc 取消，自动保留画板扩展名。
- 左侧字标为 **Flash memo**，使用系统字体 **Segoe Script**，不可用时回退到其他手写字体；不随插件分发字体文件。
- **归档按钮**：二次确认后保存当前画板，按时间命名归档，并在同一窗口切换到新空白画板。

需要先安装并启用 [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin)。首次呼出自动创建 `Flash Memo/Quick sketch 1.excalidraw.md`，之后反复打开同一画板。新画板从编号 1 开始，重名时依次递增至可用编号，已有画板保留原名。绘图和自动保存由 Excalidraw 负责，隐藏前请求保存。可通过 `![[...]]` 嵌入任意笔记，也适用于 Blo Editor。停用 Flash Memo 不会删除画板。

仅适用于桌面端。窗口控制使用桌面浮窗内部的 `electronWindow` 接口，后续 Obsidian 更新可能需要适配。插件不包含绘图引擎，也不依赖 Floating Notes。

画板显示期间会暂时保持主渲染进程唤醒，以便主窗口最小化时 Excalidraw 也能正常保存；隐藏画板或停用插件后恢复原来的后台节流设置。

设置中的“画板创建路径”相对于知识库根目录，例如 `画板/速记`。新画板和归档画板均保存在这个文件夹中；归档名称类似 `Sketch 2026-10-18 12-30-05.excalidraw.md`，重名时自动加序号。归档时通过 Obsidian 文件管理接口移动原文件，以维护现有笔记链接；保存或创建失败不会删除旧画板。

## Windows 系统全局快捷键

Windows x64 默认启用 **Ctrl + Alt + Y** 显示或隐藏画板，在其他软件获得焦点或 Obsidian 最小化时也可使用。在 Flash Memo 设置中开关全局快捷键，或点击“修改”，直接按下新组合后保存。修改期间暂时释放原快捷键；按 Esc、点击外部或切换窗口取消后自动恢复。与 Obsidian 内的快捷键独立；若设为相同组合，一次按键只执行一次切换。

内置 C 编写的 `flash-memo-hotkey.exe`，直接使用 Windows `RegisterHotKey` 消息机制，无轮询、键盘钩子或脚本运行时。只有开启全局快捷键时才运行。关闭此功能、停用插件或 Obsidian 退出后，监听器会退出并释放按键；组合被其他程序或另一个笔记库占用时，会在设置中提示冲突。无需 AutoHotkey、PowerToys 或 Rust 环境。Obsidian 仍需保持运行，支持绘图的 Excalidraw 插件也需启用。

其他平台可通过 `obsidian://flash-memo?vault=你的笔记库名称的URL编码` 接入外部启动器。不提供 vault 参数时，由接收 URI 的笔记库响应。

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
