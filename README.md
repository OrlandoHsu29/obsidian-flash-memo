# Flash Memo

A small floating Excalidraw canvas for quick sketches in Obsidian. Independent of Blo Editor; drawings remain ordinary Excalidraw files in your vault.

- **Ctrl + Alt + Y**: show/hide the canvas, configurable in Flash Memo settings. The Global shortcut switch controls whether it also works outside Obsidian (Windows x64).
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

If saving or another canvas operation fails, Flash Memo shows an error dialog. **Confirm and close** closes the faulty window without retrying the failed save. Saved drawing files remain; unsaved changes may be lost. Opening Flash Memo again reopens the saved drawing. File-name validation errors stay as notices so you can correct the name.

While the canvas is visible, the main renderer is kept awake so Excalidraw can save even when the main window is minimized. Its previous throttling setting is restored after hiding or disabling Flash Memo.

The Canvas creation folder setting is relative to the vault root, for example `Drawings/Quick notes`. New and archived canvases are stored there. Archive names resemble `Sketch 2026-10-18 12-30-05.excalidraw.md`, with a number added on collisions. Archiving moves the original through Obsidian's file manager to maintain existing note links; save or creation failures never delete the old drawing.

## Keyboard shortcut

The default shortcut is **Ctrl + Alt + Y**. Edit this one combination in Flash Memo settings with Change. With **Global shortcut** on (Windows x64), it also works from other apps or while Obsidian is minimized. With the switch off, the same combination works inside Obsidian only. Changing the shortcut temporarily releases the existing binding; cancel with Esc, an outside click or a window switch to restore it. The ribbon button, command palette and URI remain available.

The bundled C helper `flash-memo-hotkey.exe` uses Windows `RegisterHotKey` messages without polling, keyboard hooks, or a script runtime. It runs only while global shortcuts are enabled. Disabling the feature or plugin, or exiting Obsidian, stops the helper and releases its binding. A binding already owned by another app or vault is reported in settings. AutoHotkey, PowerToys and Rust are not needed. Obsidian must remain running, with Excalidraw enabled for drawing.

Other platforms can use an external launcher with `obsidian://flash-memo?vault=YOUR_PERCENT_ENCODED_VAULT_NAME`. Without a vault parameter, whichever vault receives the URI handles it.

## Keep Obsidian in the system tray

Install and enable the optional [Tray plugin by dragonwocky](https://github.com/dragonwocky/obsidian-tray) from Obsidian's community plugins. Flash Memo settings then provide **Close to system tray**, which updates Tray's own background setting and enables its tray icon. The setting is unavailable until Tray is enabled; an installation link or enable button is shown as appropriate. Changing it reloads Tray to apply the behavior. Other Tray preferences are preserved.

Closing Obsidian's main window can then keep the vault running so Flash Memo's global shortcut remains available. To close the vault completely, use **Close Vault** from Tray's menu. Restoring Obsidian through Tray keeps hidden Flash Memo canvases hidden; hiding a visible canvas through Tray requests a save. This integration uses Tray's internal plugin interfaces and is tested with Tray 0.3.5 on Windows; future versions may require adaptation. Tray is independent, distributed under its own MIT license, and is not bundled with Flash Memo. Disabling Flash Memo does not turn off Tray's background mode.

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
