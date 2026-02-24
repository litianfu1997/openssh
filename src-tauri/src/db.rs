use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri_plugin_store::StoreExt;
use crate::crypto::{encrypt, decrypt, EncryptedData};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HostConfig {
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub auth_type: Option<String>,
    pub password: Option<serde_json::Value>,
    pub private_key: Option<serde_json::Value>,
    pub passphrase: Option<serde_json::Value>,
    pub group_name: Option<String>,
    pub tags: Option<Vec<String>>,
    pub created_at: Option<String>,
    pub last_connected: Option<String>,
    pub identity_file: Option<String>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct DecryptedHostConfig {
    #[serde(default = "new_id")]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub auth_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
    #[serde(default)]
    pub group_name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "now_timestamp")]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_connected: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn default_port() -> u16 {
    22
}

fn now_timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn maybe_encrypt(app: &tauri::AppHandle, plaintext: &Option<String>) -> Option<serde_json::Value> {
    if let Some(pt) = plaintext {
        if let Some(enc) = encrypt(app, pt) {
            return Some(serde_json::to_value(enc).unwrap());
        }
    }
    None
}

fn maybe_decrypt(app: &tauri::AppHandle, encrypted: &Option<serde_json::Value>) -> Option<String> {
    if let Some(val) = encrypted {
        if let Ok(enc_data) = serde_json::from_value::<EncryptedData>(val.clone()) {
            return decrypt(app, &enc_data);
        } else if let Some(s) = val.as_str() {
            // Unencrypted legacy string, just return it
            return Some(s.to_string());
        }
    }
    None
}

#[tauri::command]
pub async fn get_hosts(app: tauri::AppHandle) -> Result<Vec<DecryptedHostConfig>, String> {
    let store_path = PathBuf::from("hosts.json");
    let store = match app.store(store_path.clone()) {
        Ok(s) => s,
        Err(_) => return Ok(vec![]),
    };

    let hosts: Vec<HostConfig> = store
        .get("hosts")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let mut decrypted: Vec<DecryptedHostConfig> = Vec::new();
    for host in hosts {
        let password = maybe_decrypt(&app, &host.password);
        let private_key = maybe_decrypt(&app, &host.private_key);
        let passphrase = maybe_decrypt(&app, &host.passphrase);

        decrypted.push(DecryptedHostConfig {
            id: host.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            name: host.name,
            host: host.host,
            port: host.port.unwrap_or(22),
            username: host.username,
            auth_type: host.auth_type.unwrap_or_else(|| "password".to_string()),
            password,
            private_key,
            passphrase,
            group_name: host.group_name.unwrap_or_else(|| "默认分组".to_string()),
            tags: host.tags.unwrap_or_default(),
            created_at: host.created_at.unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            last_connected: host.last_connected,
            identity_file: host.identity_file,
            description: host.description,
        });
    }

    Ok(decrypted)
}

#[tauri::command]
pub async fn save_host(app: tauri::AppHandle, host: DecryptedHostConfig) -> Result<String, String> {
    let store_path = PathBuf::from("hosts.json");
    let store = app.store(store_path.clone()).map_err(|e| e.to_string())?;
    
    let mut hosts: Vec<HostConfig> = store
        .get("hosts")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let password = maybe_encrypt(&app, &host.password);
    let private_key = maybe_encrypt(&app, &host.private_key);
    let passphrase = maybe_encrypt(&app, &host.passphrase);

    let encrypted_host = HostConfig {
        id: Some(host.id.clone()),
        name: host.name,
        host: host.host,
        port: Some(host.port),
        username: host.username,
        auth_type: Some(host.auth_type),
        password,
        private_key,
        passphrase,
        group_name: Some(host.group_name),
        tags: Some(host.tags),
        created_at: Some(host.created_at),
        last_connected: host.last_connected,
        identity_file: host.identity_file,
        description: host.description,
    };

    if let Some(pos) = hosts.iter().position(|h| h.id == encrypted_host.id) {
        hosts[pos] = encrypted_host;
    } else {
        hosts.push(encrypted_host);
    }

    store.set("hosts", serde_json::to_value(&hosts).map_err(|e| e.to_string())?);
    let _ = store.save();

    Ok(host.id)
}

#[tauri::command]
pub async fn delete_host(app: tauri::AppHandle, id: String) -> Result<bool, String> {
    let store_path = PathBuf::from("hosts.json");
    let store = app.store(store_path).map_err(|e| e.to_string())?;
    
    let mut hosts: Vec<HostConfig> = store
        .get("hosts")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let initial_len = hosts.len();
    hosts.retain(|h| h.id.as_deref() != Some(id.as_str()));

    if hosts.len() < initial_len {
        store.set("hosts", serde_json::to_value(&hosts).map_err(|e| e.to_string())?);
        let _ = store.save();
    }

    Ok(true)
}

#[tauri::command]
pub async fn get_host(app: tauri::AppHandle, id: String) -> Result<Option<DecryptedHostConfig>, String> {
    let all = get_hosts(app).await?;
    let found = all.into_iter().find(|h| h.id == id);
    Ok(found)
}
