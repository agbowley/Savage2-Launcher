#[cfg(windows)]
extern crate winapi;

#[cfg(windows)]
use std::ffi::CString;
#[cfg(windows)]
use std::ptr;
#[cfg(windows)]
use winapi::um::shellapi::ShellExecuteA;
#[cfg(windows)]
use winapi::um::winuser::SW_SHOWNORMAL;

#[cfg(not(windows))]
fn main() {
    eprintln!("helper_executable is only supported on Windows.");
    std::process::exit(1);
}

#[cfg(windows)]
fn main() {
    use std::env;

    // Get the path to the game executable from the command-line arguments
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: helper_executable <path_to_game_executable>");
        return;
    }

    let game_path: &String = &args[1];
    let game_path_cstr: CString = match CString::new(game_path.as_str()) {
        Ok(cstr) => cstr,
        Err(e) => {
            eprintln!("Failed to create CString from path: {}", e);
            return;
        }
    };

    let result = unsafe {
        ShellExecuteA(
            ptr::null_mut(),
            CString::new("runas").unwrap().as_ptr(),
            game_path_cstr.as_ptr(),
            ptr::null(),
            ptr::null(),
            SW_SHOWNORMAL
        )
    };

    if result as isize <= 32 {
        eprintln!("Failed to start the game with elevation. Error code: {}", result as isize);
    } else {
        println!("Successfully started the game.");
    }
}
