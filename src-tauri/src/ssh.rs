use async_trait::async_trait;
use russh::client;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tauri::{AppHandle, Emitter};
use crate::db::DecryptedHostConfig;

struct ClientHandler;

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true) // TODO: implement proper host key checking
    }
}

pub struct SshSession {
    pub channel: Arc<Mutex<Option<russh::Channel<client::Msg>>>>,
    #[allow(dead_code, private_interfaces)]
    pub handle: russh::client::Handle<ClientHandler>,
}

pub struct SshManager(pub RwLock<HashMap<String, Arc<SshSession>>>);

impl SshManager {
    pub fn new() -> Self {
        SshManager(RwLock::new(HashMap::new()))
    }
}

#[derive(serde::Serialize, Clone)]
struct SshDataEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    data: String,
}

#[derive(serde::Serialize, Clone)]
struct SshClosedEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
}

#[tauri::command]
pub async fn ssh_test(host_config: DecryptedHostConfig) -> Result<serde_json::Value, String> {
    // Debug log
    eprintln!("[ssh_test] Received config: host={}, port={}, username={}, auth_type={}",
        host_config.host, host_config.port, host_config.username, host_config.auth_type);
    eprintln!("[ssh_test] password={:?}, private_key={:?}",
        host_config.password.as_ref().map(|p| if p.is_empty() { "EMPTY" } else { "SET" }),
        host_config.private_key.as_ref().map(|p| if p.is_empty() { "EMPTY" } else { "SET" }));

    // Just a testing wrapper, connects and disconnects immediately
    let config = client::Config::default();
    let config = Arc::new(config);

    let mut session = match client::connect(config, (host_config.host.as_str(), host_config.port), ClientHandler).await {
        Ok(h) => h,
        Err(e) => {
            eprintln!("[ssh_test] Connection failed: {}", e);
            return Err(format!("Connection failed: {}", e));
        }
    };
    eprintln!("[ssh_test] TCP connected");

    let auth_res = if host_config.auth_type == "key" {
        if let Some(pk_str) = &host_config.private_key {
            if pk_str.is_empty() {
                return Err("Private key is required for key authentication".to_string());
            }
            if let Ok(key) = russh_keys::decode_secret_key(pk_str.as_str(), host_config.passphrase.as_deref()) {
                eprintln!("[ssh_test] Trying publickey auth");
                session.authenticate_publickey(host_config.username.clone(), Arc::new(key)).await.unwrap_or(false)
            } else {
                return Err("Failed to decode private key".to_string());
            }
        } else {
            return Err("Private key is required for key authentication".to_string());
        }
    } else {
        // Password authentication
        if let Some(pass) = &host_config.password {
            if pass.is_empty() {
                return Err("Password is required for password authentication".to_string());
            }
            eprintln!("[ssh_test] Trying password auth");
            session.authenticate_password(host_config.username.clone(), pass).await.unwrap_or(false)
        } else {
            return Err("Password is required for password authentication".to_string());
        }
    };

    eprintln!("[ssh_test] Auth result: {}", auth_res);
    if !auth_res {
        return Err("Authentication failed".to_string());
    }

    eprintln!("[ssh_test] Success!");
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    manager: tauri::State<'_, SshManager>,
    session_id: String,
    host_id: String,
) -> Result<bool, String> {
    // 1. Get host config
    let host_config = crate::db::get_host(app.clone(), host_id).await?.ok_or("Host not found")?;

    // 2. Connect
    let config = client::Config::default();
    let config = Arc::new(config);

    let mut session_handle = client::connect(config, (host_config.host.as_str(), host_config.port), ClientHandler)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    // 3. Authenticate
    let auth_res = if host_config.auth_type == "key" {
        if let Some(pk_str) = &host_config.private_key {
            if pk_str.is_empty() {
                return Err("Private key is required for key authentication".to_string());
            }
            if let Ok(key) = russh_keys::decode_secret_key(pk_str.as_str(), host_config.passphrase.as_deref()) {
                session_handle.authenticate_publickey(host_config.username.clone(), Arc::new(key)).await.unwrap_or(false)
            } else {
                return Err("Failed to decode private key".to_string());
            }
        } else {
            return Err("Private key is required for key authentication".to_string());
        }
    } else {
        // Password authentication
        if let Some(pass) = &host_config.password {
            if pass.is_empty() {
                return Err("Password is required for password authentication".to_string());
            }
            session_handle.authenticate_password(host_config.username.clone(), pass).await.unwrap_or(false)
        } else {
            return Err("Password is required for password authentication".to_string());
        }
    };

    if !auth_res {
        return Err("Authentication failed".to_string());
    }

    // 4. Request PTY and shell
    let channel = session_handle.channel_open_session().await.map_err(|e| e.to_string())?;
    channel.request_pty(false, "xterm", 80, 24, 0, 0, &[]).await.map_err(|e| e.to_string())?;
    channel.request_shell(true).await.map_err(|e| e.to_string())?;

    let channel_arc = Arc::new(Mutex::new(Some(channel)));
    
    // Create the session
    let ssh_session = Arc::new(SshSession {
        channel: channel_arc.clone(),
        handle: session_handle,
    });

    manager.0.write().await.insert(session_id.clone(), ssh_session);

    // 5. Spawn a task to listen to channel data
    // Use timeout to periodically release the lock so ssh_input can acquire it
    let session_id_clone = session_id.clone();
    tokio::spawn(async move {
        eprintln!("[ssh_connect] Starting data listener for session {}", session_id_clone);
        loop {
            // Use timeout to ensure lock is released periodically
            let msg = {
                let mut ch = channel_arc.lock().await;
                if let Some(ref mut channel) = *ch {
                    // Wait with timeout to allow other tasks to acquire the lock
                    match tokio::time::timeout(std::time::Duration::from_millis(50), channel.wait()).await {
                        Ok(msg) => msg,
                        Err(_) => {
                            // Timeout - release lock and continue
                            continue;
                        }
                    }
                } else {
                    eprintln!("[ssh_connect] Channel is None, exiting loop");
                    break;
                }
            };

            match msg {
                Some(russh::ChannelMsg::Data { data }) => {
                    let text = String::from_utf8_lossy(&data).to_string();
                    eprintln!("[ssh_connect] Received {} bytes", text.len());
                    let _ = app.emit("ssh:data", SshDataEvent {
                        session_id: session_id_clone.clone(),
                        data: text,
                    });
                }
                Some(russh::ChannelMsg::Eof) | Some(russh::ChannelMsg::Close) | None => {
                    eprintln!("[ssh_connect] Channel closed");
                    let _ = app.emit("ssh:closed", SshClosedEvent {
                        session_id: session_id_clone.clone()
                    });
                    break;
                }
                _ => {}
            }
        }
        eprintln!("[ssh_connect] Data listener exited for session {}", session_id_clone);
    });

    eprintln!("[ssh_connect] Connection established for session {}", session_id);
    Ok(true)
}

#[tauri::command]
pub async fn ssh_input(manager: tauri::State<'_, SshManager>, session_id: String, data: String) -> Result<(), String> {
    eprintln!("[ssh_input] session_id={}, data={:?}", session_id, data);
    let map = manager.0.read().await;
    if let Some(session) = map.get(&session_id) {
        eprintln!("[ssh_input] Found session, trying to acquire lock...");
        let mut ch = session.channel.lock().await;
        eprintln!("[ssh_input] Lock acquired");
        if let Some(ref mut channel) = *ch {
            channel.data(data.as_bytes()).await.map_err(|e| e.to_string())?;
            eprintln!("[ssh_input] Data sent successfully");
        } else {
            eprintln!("[ssh_input] Channel is None!");
        }
    } else {
        eprintln!("[ssh_input] Session not found! Available sessions: {:?}", map.keys().collect::<Vec<_>>());
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_resize(manager: tauri::State<'_, SshManager>, session_id: String, cols: u32, rows: u32) -> Result<(), String> {
    let map = manager.0.read().await;
    if let Some(session) = map.get(&session_id) {
        let mut ch = session.channel.lock().await;
        if let Some(ref mut channel) = *ch {
            channel.window_change(cols, rows, 0, 0).await.map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn ssh_disconnect(manager: tauri::State<'_, SshManager>, session_id: String) -> Result<(), String> {
    let mut map = manager.0.write().await;
    if let Some(session) = map.remove(&session_id) {
        let mut ch = session.channel.lock().await;
        if let Some(channel) = ch.take() {
            let _ = channel.close().await;
        }
        // handle disconnects automatically when dropped, or explicit:
        // let _ = session.handle.disconnect(russh::Disconnect::ByApplication, "", "English").await;
    }
    Ok(())
}
