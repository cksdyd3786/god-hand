use serde::Serialize;
use std::mem::size_of;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP, MOUSEINPUT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

#[derive(Serialize)]
struct ScreenSize {
    width: i32,
    height: i32,
}

#[tauri::command]
fn runtime_status() -> &'static str {
    "ready"
}

#[tauri::command]
fn screen_size() -> ScreenSize {
    unsafe {
        ScreenSize {
            width: GetSystemMetrics(SM_CXSCREEN),
            height: GetSystemMetrics(SM_CYSCREEN),
        }
    }
}

#[tauri::command]
fn move_mouse(x: i32, y: i32) -> Result<(), String> {
    let screen = screen_size();
    if screen.width <= 1 || screen.height <= 1 {
        return Err("screen size is unavailable".to_string());
    }

    let normalized_x = (x.clamp(0, screen.width - 1) * 65_535) / (screen.width - 1);
    let normalized_y = (y.clamp(0, screen.height - 1) * 65_535) / (screen.height - 1);
    send_mouse_input(normalized_x, normalized_y, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, 0)
}

#[tauri::command]
fn click_mouse(button: String) -> Result<(), String> {
    match button.as_str() {
        "right" => {
            send_mouse_input(0, 0, MOUSEEVENTF_RIGHTDOWN, 0)?;
            send_mouse_input(0, 0, MOUSEEVENTF_RIGHTUP, 0)
        }
        _ => {
            send_mouse_input(0, 0, MOUSEEVENTF_LEFTDOWN, 0)?;
            send_mouse_input(0, 0, MOUSEEVENTF_LEFTUP, 0)
        }
    }
}

#[tauri::command]
fn set_drag(active: bool) -> Result<(), String> {
    let flag = if active {
        MOUSEEVENTF_LEFTDOWN
    } else {
        MOUSEEVENTF_LEFTUP
    };
    send_mouse_input(0, 0, flag, 0)
}

fn send_mouse_input(dx: i32, dy: i32, flags: u32, mouse_data: u32) -> Result<(), String> {
    let mut input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx,
                dy,
                mouseData: mouse_data,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };

    let sent = unsafe { SendInput(1, &mut input, size_of::<INPUT>() as i32) };
    if sent == 1 {
        Ok(())
    } else {
        Err("SendInput failed".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            screen_size,
            move_mouse,
            click_mouse,
            set_drag
        ])
        .run(tauri::generate_context!())
        .expect("failed to run God Hand desktop app");
}
