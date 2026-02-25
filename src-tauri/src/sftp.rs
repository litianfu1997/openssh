use russh::client;
use russh_sftp::client::SftpSession;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicU8, Ordering};
use tokio::sync::{Mutex, RwLock};
use tokio::io::AsyncWriteExt;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use async_trait::async_trait;

struct SftpClientHandler;

#[async_trait]
impl client::Handler for SftpClientHandler {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// 传输状态常量（使用 AtomicU8 无锁通信，彻底避免死锁）
const TRANSFER_RUNNING: u8 = 0;
const TRANSFER_PAUSED: u8 = 1;
const TRANSFER_CANCELLED: u8 = 2;

pub struct SftpManager {
    /// sessionId -> SftpSession
    pub sessions: RwLock<HashMap<String, Arc<Mutex<SftpSession>>>>,
    /// sftp sessions also need ssh handles alive
    #[allow(private_interfaces)]
    pub handles: RwLock<HashMap<String, client::Handle<SftpClientHandler>>>,
    /// transferId -> AtomicU8 状态标记
    pub transfers: RwLock<HashMap<String, Arc<AtomicU8>>>,
}

impl SftpManager {
    pub fn new() -> Self {
        SftpManager {
            sessions: RwLock::new(HashMap::new()),
            handles: RwLock::new(HashMap::new()),
            transfers: RwLock::new(HashMap::new()),
        }
    }
}

#[derive(Serialize, Clone)]
struct TransferProgressEvent {
    #[serde(rename = "transferId")]
    transfer_id: String,
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "remotePath")]
    remote_path: String,
    #[serde(rename = "bytesTransferred")]
    bytes_transferred: u64,
    #[serde(rename = "totalBytes")]
    total_bytes: u64,
    speed: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub mode: u32,
    pub mtime: u64,
}

/// Connect or reuse an SFTP session for the given sessionId (matches the SSH session)
/// We keep a separate SSH handle for SFTP (because SFTP needs a separate channel)
async fn get_or_create_sftp(
    mgr: &SftpManager,
    session_id: &str,
    host_config: &crate::db::DecryptedHostConfig,
) -> Result<Arc<Mutex<SftpSession>>, String> {
    {
        let sessions = mgr.sessions.read().await;
        if let Some(s) = sessions.get(session_id) {
            return Ok(s.clone());
        }
    }

    // Create a new connection dedicated to SFTP
    let config = Arc::new(client::Config::default());
    let mut handle = client::connect(config, (host_config.host.as_str(), host_config.port), SftpClientHandler)
        .await
        .map_err(|e| format!("SFTP connect failed: {}", e))?;

    // Authenticate
    let auth_ok = if host_config.auth_type == "key" {
        if let Some(pk) = &host_config.private_key {
            if let Ok(key) = russh_keys::decode_secret_key(pk.as_str(), host_config.passphrase.as_deref()) {
                handle.authenticate_publickey(host_config.username.clone(), Arc::new(key)).await.unwrap_or(false)
            } else { false }
        } else { false }
    } else if let Some(pass) = &host_config.password {
        handle.authenticate_password(host_config.username.clone(), pass).await.unwrap_or(false)
    } else {
        false
    };

    if !auth_ok {
        return Err("SFTP authentication failed".to_string());
    }

    // Open SFTP channel
    let channel = handle.channel_open_session().await.map_err(|e| e.to_string())?;
    channel.request_subsystem(true, "sftp").await.map_err(|e| e.to_string())?;
    let sftp = SftpSession::new(channel.into_stream()).await.map_err(|e| e.to_string())?;

    let sftp_arc = Arc::new(Mutex::new(sftp));

    mgr.sessions.write().await.insert(session_id.to_string(), sftp_arc.clone());
    mgr.handles.write().await.insert(session_id.to_string(), handle);

    Ok(sftp_arc)
}

#[tauri::command]
pub async fn sftp_realpath(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<String, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;
    let sftp = sftp_arc.lock().await;
    sftp.canonicalize(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_list(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<Vec<FileEntry>, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;
    let sftp = sftp_arc.lock().await;

    let entries = sftp.read_dir(&path).await.map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for entry in entries {
        let metadata = entry.metadata();
        let is_dir = metadata.is_dir();
        result.push(FileEntry {
            name: entry.file_name(),
            size: metadata.size.unwrap_or(0),
            entry_type: if is_dir { "directory".to_string() } else { "file".to_string() },
            mode: metadata.permissions.unwrap_or(0),
            mtime: metadata.mtime.unwrap_or(0) as u64 * 1000,
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn sftp_upload(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    transfer_id: String,
    local_path: String,
    remote_path: String,
) -> Result<bool, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;

    // AtomicU8 无锁状态标记
    let state = Arc::new(AtomicU8::new(TRANSFER_RUNNING));
    mgr.transfers.write().await.insert(transfer_id.clone(), state.clone());

    let file_content = tokio::fs::read(&local_path).await.map_err(|e| e.to_string())?;
    let total = file_content.len() as u64;
    
    let filename = Path::new(&local_path).file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("upload");
    let dest = if remote_path.ends_with('/') {
        format!("{}{}", remote_path, filename)
    } else {
        remote_path.clone()
    };

    let mut remote_file = {
        let sftp = sftp_arc.lock().await;
        sftp.create(&dest).await.map_err(|e| e.to_string())?
    };
    
    let chunk_size: usize = 64 * 1024;
    let mut offset: usize = 0;
    let start = std::time::Instant::now();

    while offset < file_content.len() {
        let s = state.load(Ordering::Relaxed);
        if s == TRANSFER_CANCELLED {
            mgr.transfers.write().await.remove(&transfer_id);
            return Err("Cancelled".to_string());
        }
        if s == TRANSFER_PAUSED {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            continue;
        }

        let end = (offset + chunk_size).min(file_content.len());
        remote_file.write_all(&file_content[offset..end]).await.map_err(|e| e.to_string())?;
        offset = end;

        let elapsed = start.elapsed().as_secs().max(1);
        let speed = offset as u64 / elapsed;
        let _ = app.emit("sftp:upload-progress", TransferProgressEvent {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            remote_path: dest.clone(),
            bytes_transferred: offset as u64,
            total_bytes: total,
            speed,
        });
    }

    mgr.transfers.write().await.remove(&transfer_id);
    Ok(true)
}

#[tauri::command]
pub async fn sftp_download(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    transfer_id: String,
    remote_path: String,
    local_path: String,
) -> Result<bool, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;

    // AtomicU8 无锁状态标记
    let state = Arc::new(AtomicU8::new(TRANSFER_RUNNING));
    mgr.transfers.write().await.insert(transfer_id.clone(), state.clone());

    // 极短时间持有 sftp 锁：仅获取文件大小和打开文件句柄
    let (total, mut remote_file) = {
        let sftp = sftp_arc.lock().await;
        let total = match sftp.metadata(&remote_path).await {
            Ok(meta) => meta.size.unwrap_or(0),
            Err(_) => 0,
        };
        let remote_file = sftp.open(&remote_path).await.map_err(|e| e.to_string())?;
        (total, remote_file)
    };

    let mut file = tokio::fs::File::create(&local_path).await.map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 128 * 1024];
    let mut offset: u64 = 0;
    let start = std::time::Instant::now();

    use tokio::io::AsyncReadExt;

    loop {
        // 检查取消/暂停（无锁，Relaxed 足够）
        let s = state.load(Ordering::Relaxed);
        if s == TRANSFER_CANCELLED {
            drop(remote_file); // 先释放文件句柄
            let _ = tokio::fs::remove_file(&local_path).await;
            mgr.transfers.write().await.remove(&transfer_id);
            return Err("Cancelled".to_string());
        }
        if s == TRANSFER_PAUSED {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            continue;
        }

        // 流式分块读取
        let n = remote_file.read(&mut buf).await.map_err(|e| {
            let _ = std::fs::remove_file(&local_path); // 同步清理
            e.to_string()
        })?;

        if n == 0 {
            break;
        }

        file.write_all(&buf[..n]).await.map_err(|e| {
            let _ = std::fs::remove_file(&local_path);
            e.to_string()
        })?;

        offset += n as u64;
        let elapsed = start.elapsed().as_secs().max(1);
        let _ = app.emit("sftp:download-progress", TransferProgressEvent {
            transfer_id: transfer_id.clone(),
            session_id: session_id.clone(),
            remote_path: remote_path.clone(),
            bytes_transferred: offset,
            total_bytes: total,
            speed: offset / elapsed,
        });
    }

    file.flush().await.map_err(|e| e.to_string())?;
    mgr.transfers.write().await.remove(&transfer_id);
    Ok(true)
}

/// A helper to hold session->host_id mapping
pub struct SessionHostMap(pub RwLock<HashMap<String, String>>);

impl SessionHostMap {
    pub fn new() -> Self {
        SessionHostMap(RwLock::new(HashMap::new()))
    }
}

#[tauri::command]
pub async fn sftp_connect_session(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    host_id: String,
) -> Result<bool, String> {
    host_map.0.write().await.insert(session_id.clone(), host_id.clone());
    let host = crate::db::get_host(app.clone(), host_id).await?.ok_or("Host not found")?;
    get_or_create_sftp(&mgr, &session_id, &host).await?;
    Ok(true)
}

async fn sftp_get_host(
    app: &AppHandle,
    host_map: &SessionHostMap,
    mgr: &SftpManager,
    session_id: &str,
) -> Result<(Arc<Mutex<SftpSession>>, crate::db::DecryptedHostConfig), String> {
    let host_id = host_map.0.read().await.get(session_id).cloned().ok_or("Session not found")?;
    let host = crate::db::get_host(app.clone(), host_id).await?.ok_or("Host not found")?;
    let sftp = get_or_create_sftp(mgr, session_id, &host).await?;
    Ok((sftp, host))
}

#[tauri::command]
pub async fn sftp_delete(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<bool, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;
    let sftp = sftp_arc.lock().await;
    sftp.remove_file(&path).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn sftp_rename(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    old_path: String,
    new_path: String,
) -> Result<bool, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;
    let sftp = sftp_arc.lock().await;
    sftp.rename(&old_path, &new_path).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn sftp_mkdir(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<bool, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;
    let sftp = sftp_arc.lock().await;
    sftp.create_dir(&path).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[derive(Serialize)]
pub struct FilePreviewResult {
    #[serde(rename = "isText")]
    is_text: bool,
    #[serde(rename = "isImage")]
    is_image: bool,
    content: Option<String>,
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
}

fn detect_mime_type(data: &[u8], path: &str) -> (bool, bool, Option<String>) {
    // Check if it's an image by magic bytes
    let (is_image, mime) = if data.len() >= 4 {
        if data[0..2] == [0xFF, 0xD8] {
            (true, Some("image/jpeg".to_string()))
        } else if data.len() >= 8 && data[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
            (true, Some("image/png".to_string()))
        } else if data.len() >= 6 && data[0..6] == [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] {
            (true, Some("image/gif".to_string()))
        } else if data.len() >= 12 && data[0..4] == [0x52, 0x49, 0x46, 0x46] && data[8..12] == [0x57, 0x45, 0x42, 0x50] {
            (true, Some("image/webp".to_string()))
        } else {
            (false, None)
        }
    } else {
        (false, None)
    };

    // Check if it's text (no null bytes in first 8KB)
    let check_len = std::cmp::min(data.len(), 8192);
    let is_text = !is_image && data[..check_len].iter().all(|&b| b != 0);

    // Detect text mime type from extension
    let text_mime = if is_text {
        let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        Some(match ext.as_str() {
            "html" | "htm" => "text/html",
            "css" => "text/css",
            "js" => "application/javascript",
            "json" => "application/json",
            "xml" => "application/xml",
            "md" => "text/markdown",
            "yaml" | "yml" => "application/x-yaml",
            _ => "text/plain",
        }.to_string())
    } else {
        None
    };

    (is_text, is_image, mime.or(text_mime))
}

#[tauri::command]
pub async fn sftp_get_file(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<FilePreviewResult, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;
    let sftp = sftp_arc.lock().await;
    let data = sftp.read(&path).await.map_err(|e| e.to_string())?;

    // Limit file size to 2MB for preview
    if data.len() > 2 * 1024 * 1024 {
        return Err("File too large for preview (max 2MB)".to_string());
    }

    let (is_text, is_image, mime_type) = detect_mime_type(&data, &path);

    if is_image {
        use base64::{Engine as _, engine::general_purpose};
        Ok(FilePreviewResult {
            is_text: false,
            is_image: true,
            content: Some(general_purpose::STANDARD.encode(&data)),
            mime_type,
        })
    } else if is_text {
        Ok(FilePreviewResult {
            is_text: true,
            is_image: false,
            content: Some(String::from_utf8_lossy(&data).to_string()),
            mime_type,
        })
    } else {
        Ok(FilePreviewResult {
            is_text: false,
            is_image: false,
            content: None,
            mime_type: None,
        })
    }
}

#[tauri::command]
pub async fn sftp_put_file(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    path: String,
    content: String,
) -> Result<bool, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;
    let sftp = sftp_arc.lock().await;
    let mut file = sftp.create(&path).await.map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes()).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn sftp_move(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    old_path: String,
    new_path: String,
) -> Result<bool, String> {
    // SFTP API rename handles move as well
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;
    let sftp = sftp_arc.lock().await;
    sftp.rename(&old_path, &new_path).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn sftp_stat(
    app: AppHandle,
    host_map: tauri::State<'_, SessionHostMap>,
    mgr: tauri::State<'_, SftpManager>,
    session_id: String,
    path: String,
) -> Result<FileEntry, String> {
    let (sftp_arc, _) = sftp_get_host(&app, &host_map, &mgr, &session_id).await?;
    let sftp = sftp_arc.lock().await;
    
    let metadata = sftp.metadata(&path).await.map_err(|e| e.to_string())?;
    let is_dir = metadata.is_dir();
    
    // For stat, we just get name from the path 
    let name = Path::new(&path).file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    
    Ok(FileEntry {
        name,
        size: metadata.size.unwrap_or(0),
        entry_type: if is_dir { "directory".to_string() } else { "file".to_string() },
        mode: metadata.permissions.unwrap_or(0),
        mtime: metadata.mtime.unwrap_or(0) as u64 * 1000,
    })
}

#[tauri::command]
pub async fn sftp_pause(
    mgr: tauri::State<'_, SftpManager>,
    transfer_id: String,
) -> Result<(), String> {
    let transfers = mgr.transfers.read().await;
    if let Some(state) = transfers.get(&transfer_id) {
        state.store(TRANSFER_PAUSED, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub async fn sftp_resume(
    mgr: tauri::State<'_, SftpManager>,
    transfer_id: String,
) -> Result<(), String> {
    let transfers = mgr.transfers.read().await;
    if let Some(state) = transfers.get(&transfer_id) {
        state.store(TRANSFER_RUNNING, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub async fn sftp_cancel(
    mgr: tauri::State<'_, SftpManager>,
    transfer_id: String,
) -> Result<(), String> {
    let transfers = mgr.transfers.read().await;
    if let Some(state) = transfers.get(&transfer_id) {
        state.store(TRANSFER_CANCELLED, Ordering::Relaxed);
    }
    Ok(())
}
