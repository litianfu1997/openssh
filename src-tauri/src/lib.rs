mod crypto;
mod db;
mod ssh;
mod sftp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(ssh::SshManager::new())
    .manage(sftp::SftpManager::new())
    .manage(sftp::SessionHostMap::new())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
        db::get_hosts,
        db::save_host,
        db::delete_host,
        db::get_host,
        ssh::ssh_connect,
        ssh::ssh_input,
        ssh::ssh_resize,
        ssh::ssh_disconnect,
        ssh::ssh_test,
        sftp::sftp_connect_session,
        sftp::sftp_realpath,
        sftp::sftp_list,
        sftp::sftp_upload,
        sftp::sftp_download,
        sftp::sftp_delete,
        sftp::sftp_rename,
        sftp::sftp_mkdir,
        sftp::sftp_get_file,
        sftp::sftp_put_file,
        sftp::sftp_pause,
        sftp::sftp_resume,
        sftp::sftp_cancel,
        sftp::sftp_move,
        sftp::sftp_stat,
        sftp::sftp_read_text_file,
        sftp::sftp_disconnect
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
