# Flash Memo

A small floating Excalidraw canvas for quick sketches in Obsidian. Independent of Blo Editor; drawings remain ordinary Excalidraw files in your vault.

- **Ctrl/Cmd + Shift + Y**: show/hide the canvas. Change this in Obsidian → Hotkeys → Flash Memo.
- **Ctrl + Alt + Y (Windows)**: system-wide shortcut, configurable in Flash Memo settings.
- **Esc**: hide the window. Close drawing menus or finish text editing first.
- **Click elsewhere**: save and hide immediately, without an exit animation. Enabled by default; turn off **Hide on focus loss** in Flash Memo settings to keep the canvas visible.
- **Pin**: keep the canvas visible and above other windows. Esc still hides it.
- **Close (×)**: save and hide the window, including when pinned. Reopen it to continue on the same canvas.
- Drag the title bar to move the window. Resize normally; position and size are remembered.
- Click the title bar's file name to choose a canvas from the configured folder and its subfolders, including archived drawings. Switching saves the current canvas first. Double-click the name to rename; Enter saves, Esc cancels, and the drawing extension is preserved.
- The left wordmark reads **Flash memo** in the system font **Segoe Script**, with cursive fallbacks when unavailable. No font files are bundled.
- **Archive button**: after confirmation, save and timestamp the current canvas, then switch the same window to a new blank canvas.

Install and enable [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) first. Flash Memo creates `Flash Memo/Quick sketch 1.excalidraw.md` on first use and reopens that same canvas. New canvases start at number 1 and use the next available number on collisions; existing canvases keep their names. Excalidraw handles editing and autosave; Flash Memo requests a save before hiding. Drawings can be embedded into any note with `![[...]]`, including Blo Editor notes. Disabling Flash Memo leaves drawings intact.

Desktop only. Window control uses the desktop popout's internal `electronWindow` interface, so future Obsidian updates may require adaptation. No drawing engine is bundled, and Floating Notes is not a dependency.

If the current canvas file is deleted, its popout hides automatically without trying to save the deleted file. Opening Flash Memo again creates a new numbered canvas automatically.

While the canvas is visible, the main renderer is kept awake so Excalidraw can save even when the main window is minimized. Its previous throttling setting is restored after hiding or disabling Flash Memo.

The Canvas creation folder setting is relative to the vault root, for example `Drawings/Quick notes`. New and archived canvases are stored there. Archive names resemble `Sketch 2026-10-18 12-30-05.excalidraw.md`, with a number added on collisions. Archiving moves the original through Obsidian's file manager to maintain existing note links; save or creation failures never delete the old drawing.

## System-wide shortcut (Windows)

Windows x64 enables **Ctrl + Alt + Y** by default to show or hide the canvas, including when another app has focus or Obsidian is minimized. Toggle it in Flash Memo settings, or click Change, press a new combination and save. Changing the shortcut temporarily releases the existing binding; cancel with Esc, an outside click or a window switch to restore it. The global binding is independent of the in-app binding; assigning the same combination executes only one toggle per press.

The bundled C helper `flash-memo-hotkey.exe` uses Windows `RegisterHotKey` messages without polling, keyboard hooks, or a script runtime. It runs only while global shortcuts are enabled. Disabling the feature or plugin, or exiting Obsidian, stops the helper and releases its binding. A binding already owned by another app or vault is reported in settings. AutoHotkey, PowerToys and Rust are not needed. Obsidian must remain running, with Excalidraw enabled for drawing.

Other platforms can use an external launcher with `obsidian://flash-memo?vault=YOUR_PERCENT_ENCODED_VAULT_NAME`. Without a vault parameter, whichever vault receives the URI handles it.

## Build

Node.js 22 recommended, plus the Visual Studio Build Tools “Desktop development with C++” workload. On Windows:

```sh
npm ci
npm run typecheck
npm test
npm run package
```

Install the complete `dist/flash-memo/` folder, including the hotkey helper EXE, under the vault's `.obsidian/plugins/`. The ZIP is generated in `releases/` with a top-level `flash-memo/` folder. Preserve `data.json` when updating, and disable the global shortcut before replacing the helper.

MIT © OrlandoHsu29. Excalidraw is a separate third-party plugin. The floating-window workflow was evaluated against [Floating Notes](https://github.com/haotiencheng/obsidian-floating-notes); this project implements its own controller for blur-to-hide and pinning.

[中文说明](README.zh-CN.md)
