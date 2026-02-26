use async_trait::async_trait;
use russh::client;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};
use tauri::{AppHandle, Emitter};
use crate::db::DecryptedHostConfig;

pub(crate) struct ClientHandler;

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
    pub handle: russh::client::Handle<ClientHandler>,
    pub is_connected: Arc<std::sync::atomic::AtomicBool>,
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

/// 创建带有 keep-alive 的 SSH 客户端配置
fn create_ssh_config() -> Arc<client::Config> {
    let config = client::Config {
        // 启用 keep-alive：每 30 秒发送一次心跳
        keepalive_interval: Some(Duration::from_secs(30)),
        // 3 次心跳无响应后断开连接
        keepalive_max: 3,
        // 10 分钟无活动后断开（作为兜底，给 keep-alive 足够时间工作）
        inactivity_timeout: Some(Duration::from_secs(600)),
        // 增大窗口大小以提高性能
        window_size: 2097152,
        maximum_packet_size: 32768,
        ..Default::default()
    };
    Arc::new(config)
}

#[tauri::command]
pub async fn ssh_test(host_config: DecryptedHostConfig) -> Result<serde_json::Value, String> {
    // Debug log
    eprintln!("[ssh_test] Received config: host={}, port={}, username={}, auth_type={}",
        host_config.host, host_config.port, host_config.username, host_config.auth_type);
    eprintln!("[ssh_test] password={:?}, private_key={:?}",
        host_config.password.as_ref().map(|p| if p.is_empty() { "EMPTY" } else { "SET" }),
        host_config.private_key.as_ref().map(|p| if p.is_empty() { "EMPTY" } else { "SET" }));

    // 使用带 keep-alive 的配置
    let config = create_ssh_config();

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

    // 2. Connect with keep-alive enabled
    let config = create_ssh_config();

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
    let is_connected = Arc::new(std::sync::atomic::AtomicBool::new(true));

    // Create the session
    let ssh_session = Arc::new(SshSession {
        channel: channel_arc.clone(),
        handle: session_handle,
        is_connected: is_connected.clone(),
    });

    manager.0.write().await.insert(session_id.clone(), ssh_session);

    // 5. Spawn a task to listen to channel data
    // 改进：不再在锁内等待，而是使用 try_wait 或非阻塞方式
    let session_id_clone = session_id.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        eprintln!("[ssh_connect] Starting data listener for session {}", session_id_clone);

        // 用于追踪连续的错误次数
        let mut consecutive_errors = 0u32;
        const MAX_ERRORS: u32 = 10;

        loop {
            // 先检查连接状态
            if !is_connected.load(std::sync::atomic::Ordering::Relaxed) {
                eprintln!("[ssh_connect] Connection marked as closed, exiting loop");
                break;
            }

            // 使用短暂锁定来检查 channel 状态
            let msg_result = {
                let mut ch = match channel_arc.try_lock() {
                    Ok(guard) => guard,
                    Err(_) => {
                        // 锁被占用，稍后重试
                        tokio::time::sleep(Duration::from_millis(10)).await;
                        continue;
                    }
                };

                if let Some(ref mut channel) = *ch {
                    // 使用 timeout 来避免无限等待
                    match tokio::time::timeout(Duration::from_millis(100), channel.wait()).await {
                        Ok(msg) => {
                            consecutive_errors = 0; // 重置错误计数
                            Some(msg)
                        }
                        Err(_) => {
                            // Timeout - 这是正常的，继续循环
                            None
                        }
                    }
                } else {
                    eprintln!("[ssh_connect] Channel is None, exiting loop");
                    let _ = app_clone.emit("ssh:closed", SshClosedEvent {
                        session_id: session_id_clone.clone()
                    });
                    break;
                }
            };

            // 在锁外处理消息
            if let Some(msg) = msg_result {
                match msg {
                    Some(russh::ChannelMsg::Data { data }) => {
                        let text = String::from_utf8_lossy(&data).to_string();
                        let _ = app_clone.emit("ssh:data", SshDataEvent {
                            session_id: session_id_clone.clone(),
                            data: text,
                        });
                    }
                    Some(russh::ChannelMsg::Eof) => {
                        eprintln!("[ssh_connect] Received EOF, waiting for close");
                        // EOF 不立即断开，等待 Close 消息
                    }
                    Some(russh::ChannelMsg::Close) => {
                        eprintln!("[ssh_connect] Channel closed by server");
                        is_connected.store(false, std::sync::atomic::Ordering::Relaxed);
                        let _ = app_clone.emit("ssh:closed", SshClosedEvent {
                            session_id: session_id_clone.clone()
                        });
                        break;
                    }
                    None => {
                        // None 可能是暂时性的错误，增加计数但不立即断开
                        consecutive_errors += 1;
                        if consecutive_errors >= MAX_ERRORS {
                            eprintln!("[ssh_connect] Too many consecutive errors ({}), closing", consecutive_errors);
                            is_connected.store(false, std::sync::atomic::Ordering::Relaxed);
                            let _ = app_clone.emit("ssh:closed", SshClosedEvent {
                                session_id: session_id_clone.clone()
                            });
                            break;
                        }
                        // 短暂等待后重试
                        tokio::time::sleep(Duration::from_millis(50)).await;
                    }
                    _ => {
                        // 其他消息类型，忽略
                    }
                }
            }
        }

        // 清理：标记连接已断开
        is_connected.store(false, std::sync::atomic::Ordering::Relaxed);
        eprintln!("[ssh_connect] Data listener exited for session {}", session_id_clone);
    });

    eprintln!("[ssh_connect] Connection established for session {} with keep-alive enabled", session_id);
    Ok(true)
}

#[tauri::command]
pub async fn ssh_input(manager: tauri::State<'_, SshManager>, session_id: String, data: String) -> Result<(), String> {
    let map = manager.0.read().await;
    if let Some(session) = map.get(&session_id) {
        // 先检查连接状态
        if !session.is_connected.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("Connection is closed".to_string());
        }

        // 使用带超时的 lock 来避免无限等待，同时确保能获取到锁
        match tokio::time::timeout(Duration::from_secs(5), session.channel.lock()).await {
            Ok(mut ch) => {
                if let Some(ref mut channel) = *ch {
                    channel.data(data.as_bytes()).await.map_err(|e| {
                        // 发送失败，标记连接断开
                        session.is_connected.store(false, std::sync::atomic::Ordering::Relaxed);
                        e.to_string()
                    })?;
                    Ok(())
                } else {
                    Err("Channel is closed".to_string())
                }
            }
            Err(_) => {
                Err("Failed to acquire lock within timeout".to_string())
            }
        }
    } else {
        Err(format!("Session not found: {}", session_id))
    }
}

#[tauri::command]
pub async fn ssh_resize(manager: tauri::State<'_, SshManager>, session_id: String, cols: u32, rows: u32) -> Result<(), String> {
    let map = manager.0.read().await;
    if let Some(session) = map.get(&session_id) {
        if !session.is_connected.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("Connection is closed".to_string());
        }

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
        // 标记连接已断开
        session.is_connected.store(false, std::sync::atomic::Ordering::Relaxed);

        let mut ch = session.channel.lock().await;
        if let Some(channel) = ch.take() {
            let _ = channel.close().await;
        }

        // 显式断开 SSH 会话
        let _ = session.handle.disconnect(russh::Disconnect::ByApplication, "User disconnected", "English").await;
    }
    Ok(())
}
