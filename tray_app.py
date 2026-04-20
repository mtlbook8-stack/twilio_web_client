"""
Twilio Web Client — System Tray Monitor
Shows a system tray icon (green = all running, yellow = partial, red = stopped).
Right-click the icon for a menu to start/stop servers or open the app.
"""

import os
import sys
import time
import socket
import threading
import subprocess
import webbrowser

import ctypes
import ctypes.wintypes

import pystray
from PIL import Image, ImageDraw

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
VENV_PY    = os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe")
SERVER_PY  = os.path.join(BASE_DIR, "server.py")

# ── Icon drawing ─────────────────────────────────────────────────────────────
def make_icon(color: str) -> Image.Image:
    """Draw a 64x64 circle icon in the given colour with a white phone symbol."""
    size = 64
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dc   = ImageDraw.Draw(img)
    # Outer circle
    dc.ellipse([2, 2, size - 2, size - 2], fill=color, outline="white", width=2)
    # Simple phone handset (two arcs / circles)
    dc.ellipse([16, 14, 30, 28], fill="white")
    dc.ellipse([34, 36, 48, 50], fill="white")
    dc.line([22, 22, 42, 42], fill=color, width=5)
    return img

ICON_GREEN  = make_icon("#27ae60")   # all running
ICON_YELLOW = make_icon("#f39c12")   # partial
ICON_RED    = make_icon("#c0392b")   # all stopped

# ── Process detection ─────────────────────────────────────────────────────────
def _port_listening(port: int) -> bool:
    """Try to connect to the port — reliable on all Windows versions."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            s.connect(("127.0.0.1", port))
            return True
        except (ConnectionRefusedError, OSError):
            return False

def get_status():
    """Returns (flask_ok, ngrok_ok)."""
    flask = _port_listening(5000)   # Flask serves both API and UI
    ngrok = _port_listening(4040)   # ngrok dashboard
    return flask, ngrok

# ── Debug log ───────────────────────────────────────────────────────────
LOG_FILE   = os.path.join(BASE_DIR, "tray_debug.log")
PID_FILE   = os.path.join(BASE_DIR, ".server_pids")
WAKE_FILE  = os.path.join(BASE_DIR, ".wake_restart")

def _log(msg):
    try:
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"{ts}  {msg}\n")
    except Exception:
        pass

def _save_pids(pids):
    try:
        with open(PID_FILE, "w", encoding="utf-8") as f:
            for pid in pids:
                f.write(f"{pid}\n")
    except Exception as e:
        _log(f"save_pids error: {e}")

def _load_pids():
    try:
        with open(PID_FILE, encoding="utf-8") as f:
            return [int(x.strip()) for x in f if x.strip().isdigit()]
    except Exception:
        return []

# ── Actions ───────────────────────────────────────────────────────────────────
NO_WINDOW = subprocess.CREATE_NO_WINDOW
TASKKILL  = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"),
                         "System32", "taskkill.exe")

# When set, the monitor will NOT auto-restart crashed servers.
# Set by stop_servers / restart_servers; cleared by start_servers.
_autostart_inhibited = threading.Event()

# When set, a manual restart is in progress — monitor ignores state changes.
_restart_in_progress = threading.Event()

def _kill_servers():
    """Kill Flask and ngrok.
    1. Kill by saved PID (processes we launched — same user, no UAC).
    2. Taskkill remaining by name.
    3. If Access Denied, run a single elevated PowerShell kill (one UAC prompt).
    """
    # Step 1: kill our own tracked PIDs
    pids = _load_pids()
    if pids:
        for pid in pids:
            r = subprocess.run(
                [TASKKILL, "/F", "/PID", str(pid)],
                creationflags=NO_WINDOW, capture_output=True, text=True,
            )
            _log(f"kill PID {pid}: rc={r.returncode} {r.stdout.strip()} {r.stderr.strip()}")
        try:
            os.remove(PID_FILE)
        except Exception:
            pass

    # Step 2: kill any remaining by name
    needs_elevation = False
    for exe in ("python.exe", "ngrok.exe"):
        r = subprocess.run(
            [TASKKILL, "/F", "/IM", exe],
            creationflags=NO_WINDOW, capture_output=True, text=True,
        )
        _log(f"taskkill {exe}: rc={r.returncode} {r.stdout.strip()} {r.stderr.strip()}")
        if "Access is denied" in r.stderr:
            needs_elevation = True

    # Step 3: elevated kill if needed (one UAC prompt for both)
    if needs_elevation:
        _log("Processes are elevated — requesting UAC elevation to kill them…")
        ctypes.windll.shell32.ShellExecuteW(
            None, "runas", "powershell.exe",
            "-NonInteractive -Command \""
            "Stop-Process -Name python,ngrok -Force -ErrorAction SilentlyContinue\"",
            None, 0,  # SW_HIDE: window hidden, UAC dialog still appears
        )
        time.sleep(3)
        _log("Elevated kill submitted.")

def _launch_servers():
    """Spawn Flask server and ngrok directly; save PIDs so we can kill them later."""
    import shutil
    pids = []

    try:
        proc = subprocess.Popen(
            [VENV_PY, SERVER_PY],
            creationflags=NO_WINDOW,
            cwd=BASE_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        pids.append(proc.pid)
        _log(f"Flask launched pid={proc.pid}")
    except Exception as e:
        _log(f"Flask launch EXCEPTION: {e}")

    time.sleep(2)

    ngrok_exe = shutil.which("ngrok") or "ngrok"
    _log(f"ngrok path: {ngrok_exe}")
    try:
        proc = subprocess.Popen(
            [ngrok_exe, "http", "https://localhost:5000", "--verify-upstream-tls=false"],
            creationflags=NO_WINDOW,
            cwd=BASE_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        pids.append(proc.pid)
        _log(f"ngrok launched pid={proc.pid}")
    except Exception as e:
        _log(f"ngrok launch EXCEPTION: {e}")

    _save_pids(pids)

def start_servers(_icon=None, _item=None):
    _log("start_servers called")
    def _do():
        try:
            _autostart_inhibited.clear()
            _launch_servers()
            if _icon:
                try:
                    _icon.notify("Servers started ✓", "Twilio Client ✓")
                except Exception:
                    pass
        except Exception as e:
            _log(f"start_servers _do EXCEPTION: {e}")
    threading.Thread(target=_do, daemon=True).start()

def stop_servers(_icon=None, _item=None):
    _log("stop_servers called")
    def _do():
        try:
            _autostart_inhibited.set()
            _kill_servers()
            if _icon:
                try:
                    _icon.notify("Servers stopped", "Twilio Client ✗")
                except Exception:
                    pass
        except Exception as e:
            _log(f"stop_servers _do EXCEPTION: {e}")
    threading.Thread(target=_do, daemon=True).start()

def open_app(_icon=None, _item=None):
    _log("open_app called")
    webbrowser.open("https://localhost:5000")

def open_dashboard(_icon=None, _item=None):
    webbrowser.open("http://localhost:4040")   # ngrok dashboard

def restart_servers(_icon=None, _item=None):
    """Stop all servers, wait briefly, then start them again."""
    _log("restart_servers called")
    def _do_restart():
        try:
            _restart_in_progress.set()
            _autostart_inhibited.set()
            if _icon:
                try:
                    _icon.notify("Restarting servers…", "Twilio Client 🔄")
                except Exception:
                    pass
            _kill_servers()
            time.sleep(3)
            _autostart_inhibited.clear()
            _launch_servers()
            # Wait for servers to come up before letting monitor resume
            time.sleep(8)
            if _icon:
                try:
                    _icon.notify("Servers restarted ✓", "Twilio Client ✓")
                except Exception:
                    pass
        except Exception as e:
            _log(f"restart_servers _do EXCEPTION: {e}")
        finally:
            _restart_in_progress.clear()
    threading.Thread(target=_do_restart, daemon=True).start()

def _get_autostart_enabled() -> bool:
    """Check if the scheduled tasks are enabled."""
    try:
        r = subprocess.run(
            ["schtasks", "/Query", "/TN", "TwilioWebClient-Startup", "/FO", "CSV", "/NH"],
            creationflags=NO_WINDOW, capture_output=True, text=True,
        )
        return "Disabled" not in r.stdout
    except Exception:
        return True   # assume enabled if we can't check

def _set_autostart(enable: bool):
    """Enable or disable the three scheduled tasks."""
    state = "/Enable" if enable else "/Disable"
    for task in ("TwilioWebClient-Startup", "TwilioWebClient-Wake", "TwilioWebClient-Tray"):
        subprocess.run(
            ["schtasks", "/Change", "/TN", task, state],
            creationflags=NO_WINDOW, capture_output=True,
        )
    _log(f"Auto-start {'enabled' if enable else 'disabled'}")

def disable_autostart(icon, _item=None):
    """Disable auto-start, stop servers, and quit tray."""
    _log("disable_autostart called — full shutdown")
    def _do():
        _autostart_inhibited.set()
        _set_autostart(False)
        _kill_servers()
        try:
            icon.notify("System disabled — nothing will auto-start", "Twilio Client")
        except Exception:
            pass
        time.sleep(2)
        icon.stop()
    threading.Thread(target=_do, daemon=True).start()

def enable_autostart(icon, _item=None):
    _log("enable_autostart called")
    _set_autostart(True)
    try:
        icon.notify("Auto-start enabled ✓", "Twilio Client")
    except Exception:
        pass

def quit_tray(icon, _item=None):
    icon.stop()

# ── Status polling loop ───────────────────────────────────────────────────────
def _monitor(icon: pystray.Icon):
    prev_state   = (None, None)   # track changes to trigger notifications
    restart_lock = threading.Lock()     # prevent overlapping restart attempts

    def _auto_restart():
        """Re-launch servers silently; called in its own thread."""
        with restart_lock:
            _kill_servers()
            time.sleep(2)
            _launch_servers()

    while True:
        flask, ngrok = get_status()
        state         = (flask, ngrok)
        running_count = sum(state)

        # ── Skip state-change detection during manual restart ──────────────
        if _restart_in_progress.is_set():
            prev_state = state
            time.sleep(5)
            continue

        # ── Detect transitions and notify ──────────────────────────────────
        if state != prev_state and prev_state != (None, None):
            names  = ["Flask:5000", "ngrok:4040"]
            crashed   = [n for n, was, now in zip(names, prev_state, state) if was and not now]
            recovered = [n for n, was, now in zip(names, prev_state, state) if not was and now]

            if crashed:
                if _autostart_inhibited.is_set():
                    # User manually stopped — do not auto-restart
                    pass
                else:
                    msg = "CRASHED: " + ", ".join(crashed) + " — auto-restarting…"
                    try:
                        icon.notify(msg, "Twilio Client ⚠")
                    except Exception:
                        pass
                    # Auto-restart in background so monitor thread isn't blocked
                    threading.Thread(target=_auto_restart, daemon=True).start()

            if recovered:
                try:
                    icon.notify("Back online: " + ", ".join(recovered), "Twilio Client ✓")
                except Exception:
                    pass

        prev_state = state

        # ── Update icon colour & tooltip ────────────────────────────────────
        if running_count == 2:
            icon.icon  = ICON_GREEN
            icon.title = "Twilio Client ✓  Flask (UI+API) · ngrok  — all running"
        elif running_count == 0:
            icon.icon  = ICON_RED
            icon.title = "Twilio Client ✗  All servers stopped"
        else:
            parts = []
            if flask: parts.append("Flask ✓")
            else:     parts.append("Flask ✗")
            if ngrok: parts.append("ngrok ✓")
            else:     parts.append("ngrok ✗")
            icon.icon  = ICON_YELLOW
            icon.title = "Twilio Client ⚠  " + "  ".join(parts)

        time.sleep(5)   # poll every 5 seconds

# ── Build the menu ─────────────────────────────────────────────────────────────
def build_menu() -> pystray.Menu:
    return pystray.Menu(
        pystray.MenuItem("Open App (localhost:5000)",   open_app, default=True),
        pystray.MenuItem("ngrok Dashboard (port 4040)", open_dashboard),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Start Servers",   start_servers),
        pystray.MenuItem("Stop Servers",    stop_servers),
        pystray.MenuItem("Restart Servers", restart_servers),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Auto-Start",
                         lambda icon, item: _set_autostart(not _get_autostart_enabled()),
                         checked=lambda item: _get_autostart_enabled()),
        pystray.MenuItem("Disable && Shut Down Everything", disable_autostart),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit Tray Icon", quit_tray),
    )

# ── Single-instance lock (Windows mutex) ─────────────────────────────────────
def _acquire_single_instance_lock():
    """Create a named mutex. If it already exists another instance is running."""
    mutex = ctypes.windll.kernel32.CreateMutexW(None, False, "TwilioWebClientTrayApp")
    if ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        sys.exit(0)   # silently exit — another instance is already running
    return mutex   # keep reference alive for process lifetime

# ── Sleep/Wake notification (Windows Power Events) ───────────────────────────
WM_POWERBROADCAST        = 0x0218
PBT_APMRESUMEAUTOMATIC   = 0x0012
PBT_APMRESUMESUSPEND     = 0x0007
PBT_APMSUSPEND           = 0x0004
PBT_POWERSETTINGCHANGE   = 0x8013   # Modern Standby display-state changes

# GUID_CONSOLE_DISPLAY_STATE — reliable on Modern Standby (S0ix) laptops
# Values: 0 = off, 1 = on, 2 = dimmed
class GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_ulong),
        ("Data2", ctypes.c_ushort),
        ("Data3", ctypes.c_ushort),
        ("Data4", ctypes.c_ubyte * 8),
    ]

GUID_CONSOLE_DISPLAY_STATE = GUID(
    0x6FE69556, 0x704A, 0x47A0,
    (ctypes.c_ubyte * 8)(0x8F, 0x24, 0xC2, 0x8D, 0x93, 0x6F, 0xDA, 0x47),
)

class POWERBROADCAST_SETTING(ctypes.Structure):
    _fields_ = [
        ("PowerSetting", GUID),
        ("DataLength",   ctypes.c_ulong),
        ("Data",         ctypes.c_ubyte * 1),   # variable-length; we read [0]
    ]

def _power_event_listener(icon: pystray.Icon):
    """Hidden window that listens for power broadcast messages.
    Unconditionally restarts servers on every wake."""
    try:
        _power_event_listener_impl(icon)
    except Exception as e:
        _log(f"Power-event listener CRASHED: {e}")

def _power_event_listener_impl(icon: pystray.Icon):
    from ctypes import wintypes

    LRESULT = ctypes.c_ssize_t

    WNDPROC = ctypes.WINFUNCTYPE(
        LRESULT, wintypes.HWND, ctypes.c_uint,
        wintypes.WPARAM, wintypes.LPARAM,
    )

    user32   = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    # 64-bit safe type declarations
    kernel32.GetModuleHandleW.restype  = wintypes.HMODULE
    kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]

    user32.RegisterClassW.restype  = wintypes.ATOM
    user32.RegisterClassW.argtypes = [ctypes.c_void_p]

    user32.CreateWindowExW.restype  = wintypes.HWND
    user32.CreateWindowExW.argtypes = [
        wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
        wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID,
    ]

    user32.DefWindowProcW.restype  = LRESULT
    user32.DefWindowProcW.argtypes = [
        wintypes.HWND, ctypes.c_uint, wintypes.WPARAM, wintypes.LPARAM,
    ]

    user32.GetMessageW.restype  = wintypes.BOOL
    user32.GetMessageW.argtypes = [
        ctypes.POINTER(wintypes.MSG), wintypes.HWND,
        ctypes.c_uint, ctypes.c_uint,
    ]

    user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
    user32.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]

    user32.RegisterPowerSettingNotification.restype  = wintypes.HANDLE
    user32.RegisterPowerSettingNotification.argtypes = [
        wintypes.HANDLE, ctypes.POINTER(GUID), wintypes.DWORD,
    ]

    # Debounce: track last wake time so we don't double-restart
    _last_wake = [0.0]
    _start_time = time.time()   # skip the initial display-state event on startup

    def _trigger_wake(reason):
        """Unconditionally restart servers on wake (debounced)."""
        now = time.time()
        # Ignore events within 15s of listener start (initial display state)
        if now - _start_time < 15:
            _log(f"Wake ignored (startup grace period): {reason}")
            return
        if now - _last_wake[0] < 30:
            _log(f"Wake debounced ({reason}) — restart already in progress")
            return
        _last_wake[0] = now

        _log(f"WAKE triggered via: {reason}")
        _restart_in_progress.set()
        try:
            icon.notify("Waking up — restarting servers…", "Twilio Client 💤")
        except Exception:
            pass

        def _wake_restart():
            try:
                time.sleep(10)       # wait for network stack
                _kill_servers()
                time.sleep(3)
                _launch_servers()
                time.sleep(10)       # wait for ports to bind
                try:
                    os.remove(WAKE_FILE)
                except Exception:
                    pass
                flask, ngrok = get_status()
                if flask and ngrok:
                    try:
                        icon.notify("Servers restarted after sleep ✓",
                                    "Twilio Client ✓")
                    except Exception:
                        pass
                    _log("Post-wake: servers restarted and confirmed online")
                else:
                    try:
                        icon.notify("Wake restart done — waiting for servers… ⚠",
                                    "Twilio Client ⚠")
                    except Exception:
                        pass
                    _log("Post-wake: restart done but servers not yet responding")
            except Exception as e:
                _log(f"_wake_restart EXCEPTION: {e}")
            finally:
                _restart_in_progress.clear()
        threading.Thread(target=_wake_restart, daemon=True).start()

    def wnd_proc(hwnd, msg, wparam, lparam):
        try:
            if msg == WM_POWERBROADCAST:
                if wparam == PBT_APMSUSPEND:
                    _log("System going to SLEEP (traditional)")
                elif wparam in (PBT_APMRESUMEAUTOMATIC, PBT_APMRESUMESUSPEND):
                    _trigger_wake(f"traditional PBT resume wparam={wparam:#x}")
                elif wparam == PBT_POWERSETTINGCHANGE and lparam:
                    # Modern Standby: display state changed
                    pbs = ctypes.cast(
                        lparam,
                        ctypes.POINTER(POWERBROADCAST_SETTING),
                    ).contents
                    display_state = pbs.Data[0]
                    _log(f"Display state change: {display_state} "
                         f"(0=off 1=on 2=dimmed)")
                    if display_state == 0:
                        _log("Display OFF — entering Modern Standby")
                    elif display_state == 1:
                        _trigger_wake("Modern Standby display ON")
        except Exception as e:
            _log(f"wnd_proc EXCEPTION: {e}")
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    wnd_proc_cb = WNDPROC(wnd_proc)

    class WNDCLASS(ctypes.Structure):
        _fields_ = [
            ("style",         ctypes.c_uint),
            ("lpfnWndProc",   WNDPROC),
            ("cbClsExtra",    ctypes.c_int),
            ("cbWndExtra",    ctypes.c_int),
            ("hInstance",     wintypes.HINSTANCE),
            ("hIcon",         wintypes.HICON),
            ("hCursor",       wintypes.HANDLE),
            ("hbrBackground", wintypes.HBRUSH),
            ("lpszMenuName",  wintypes.LPCWSTR),
            ("lpszClassName", wintypes.LPCWSTR),
        ]

    wc = WNDCLASS()
    wc.lpfnWndProc = wnd_proc_cb
    wc.hInstance = kernel32.GetModuleHandleW(None)
    wc.lpszClassName = "TwilioPowerWatcher"

    atom = user32.RegisterClassW(ctypes.byref(wc))
    if not atom:
        _log(f"RegisterClassW failed: err={ctypes.GetLastError()}")
        return
    _log(f"RegisterClassW ok  atom={atom}")

    hwnd = user32.CreateWindowExW(
        0, wc.lpszClassName, "Twilio Power Watcher",
        0, 0, 0, 0, 0, None, None, wc.hInstance, None,
    )
    if not hwnd:
        _log(f"CreateWindowExW failed: err={ctypes.GetLastError()}")
        return
    _log(f"Power-event listener window created  hwnd={hwnd}")

    # Register for Modern Standby display-state notifications
    h_reg = user32.RegisterPowerSettingNotification(
        hwnd, ctypes.byref(GUID_CONSOLE_DISPLAY_STATE), 0,
    )
    if h_reg:
        _log("RegisterPowerSettingNotification OK (GUID_CONSOLE_DISPLAY_STATE)")
    else:
        _log(f"RegisterPowerSettingNotification FAILED: err={ctypes.GetLastError()}")

    msg = wintypes.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))

    _log("Power-event message loop exited")

# ── Entry point ───────────────────────────────────────────────────────────
def main():
    _mutex = _acquire_single_instance_lock()  # exits immediately if already running

    icon = pystray.Icon(
        name  = "TwilioWebClient",
        icon  = ICON_RED,
        title = "Twilio Client  (checking…)",
        menu  = build_menu(),
    )

    # Start the monitor thread
    t = threading.Thread(target=_monitor, args=(icon,), daemon=True)
    t.start()

    # Start the sleep/wake notification listener
    pw = threading.Thread(target=_power_event_listener, args=(icon,), daemon=True)
    pw.start()

    icon.run()   # blocks until quit_tray() calls icon.stop()

if __name__ == "__main__":
    main()
