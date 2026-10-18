// Flash Memo: a blocking Win32 hotkey listener. No window, hooks, or polling.
// The stdin pipe is its lifetime: closing it also stops the message loop.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <stdint.h>

static DWORD message_thread;

static BOOL send_text(const char *text, DWORD length) {
    DWORD written = 0;
    return WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), text, length, &written, NULL)
        && written == length;
}

static void send_error(DWORD code) {
    char text[32] = "ERROR ";
    char digits[10];
    DWORD count = 0, length = 6;
    do { digits[count++] = (char)('0' + code % 10); code /= 10; } while (code);
    while (count) text[length++] = digits[--count];
    text[length++] = '\n';
    send_text(text, length);
}

static BOOL parse_number(const wchar_t *text, uint64_t *value) {
    uint64_t number = 0;
    if (!*text) return FALSE;
    for (; *text; ++text) {
        if (*text < L'0' || *text > L'9') return FALSE;
        if (number > (UINT64_MAX - (uint64_t)(*text - L'0')) / 10) return FALSE;
        number = number * 10 + (uint64_t)(*text - L'0');
    }
    *value = number;
    return TRUE;
}

static DWORD WINAPI stop_on_pipe_close(LPVOID unused) {
    char byte;
    DWORD read = 0;
    (void)unused;
    // Any stop byte or EOF is sufficient. A crashed parent closes this pipe.
    ReadFile(GetStdHandle(STD_INPUT_HANDLE), &byte, 1, &read, NULL);
    PostThreadMessageW(message_thread, WM_QUIT, 0, 0);
    return 0;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR command, int show) {
    int count = 0;
    LPWSTR *args = CommandLineToArgvW(GetCommandLineW(), &count);
    uint64_t modifiers = 0, key = 0, owner = 0;
    MSG message = {0};
    DWORD owner_pid = 0;
    HANDLE stop_thread;
    int result = 0;
    (void)instance; (void)previous; (void)command; (void)show;
    if (!args || count != 4 || !parse_number(args[1], &modifiers)
        || !parse_number(args[2], &key) || !parse_number(args[3], &owner)
        || modifiers == 0 || modifiers > 15 || key == 0 || key > 255 || key == VK_F12) {
        if (args) LocalFree(args);
        send_error(ERROR_INVALID_PARAMETER);
        return 2;
    }
    LocalFree(args);
    // Ensure the queue exists before the pipe watcher can post WM_QUIT.
    PeekMessageW(&message, NULL, 0, 0, PM_NOREMOVE);
    message_thread = GetCurrentThreadId();
    if (!RegisterHotKey(NULL, 1, (UINT)modifiers | MOD_NOREPEAT, (UINT)key)) {
        send_error(GetLastError());
        return 3;
    }
    GetWindowThreadProcessId((HWND)(uintptr_t)owner, &owner_pid);
    stop_thread = CreateThread(NULL, 0, stop_on_pipe_close, NULL, 0, NULL);
    if (!stop_thread) {
        send_error(GetLastError());
        UnregisterHotKey(NULL, 1);
        return 4;
    }
    CloseHandle(stop_thread);
    if (!send_text("READY\n", 6)) {
        UnregisterHotKey(NULL, 1);
        return 5;
    }
    for (;;) {
        BOOL status = GetMessageW(&message, NULL, 0, 0);
        if (status <= 0) { if (status == -1) result = 6; break; }
        if (message.message == WM_HOTKEY && message.wParam == 1) {
            // Let Obsidian focus its popout when another app is foreground.
            if (owner_pid) AllowSetForegroundWindow(owner_pid);
            if (!send_text("HOTKEY\n", 7)) break;
        }
    }
    UnregisterHotKey(NULL, 1);
    return result;
}
