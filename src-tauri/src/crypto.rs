use aes_gcm::{aead::{Aead, KeyInit, Payload}, Aes256Gcm, Key, Nonce};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri_plugin_store::StoreExt;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EncryptedData {
    pub encrypted: String,
    pub iv: String,
    #[serde(rename = "authTag")]
    pub auth_tag: String,
}

pub fn get_encryption_key(app: &tauri::AppHandle) -> [u8; 32] {
    let store_path = PathBuf::from("encryption.json");
    let store_result = app.store(store_path.clone());
    
    // In Tauri 2.0 with plugin-store, we get result
    let store = match store_result {
        Ok(s) => s,
        Err(_) => {
            // fallback, should not happen if plugin initialized
            return [0u8; 32];
        }
    };

    if let Some(key_val) = store.get("encryptionKey") {
        if let Some(key_hex) = key_val.as_str() {
            if let Ok(key_bytes) = hex::decode(key_hex) {
                if key_bytes.len() == 32 {
                    let mut arr = [0u8; 32];
                    arr.copy_from_slice(&key_bytes);
                    return arr;
                }
            }
        }
    }

    // Generate a new 32-byte key
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    let key_hex = hex::encode(key);
    
    store.set("encryptionKey", serde_json::json!(key_hex));
    let _ = store.save(); // ignore error
    
    key
}

pub fn encrypt(app: &tauri::AppHandle, plaintext: &str) -> Option<EncryptedData> {
    if plaintext.is_empty() {
        return None;
    }
    
    let key_bytes = get_encryption_key(app);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    
    // WebCrypto and standard AES-GCM expects 12-byte (96-bit) nonce
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    let nonce = Nonce::from_slice(&iv);
    
    // Encrypt
    let payload = Payload {
        msg: plaintext.as_bytes(),
        aad: &[],
    };
    
    match cipher.encrypt(nonce, payload) {
        Ok(ciphertext_with_tag) => {
            // aes_gcm appends the 16-byte tag to the ciphertext.
            let len = ciphertext_with_tag.len();
            if len < 16 {
                return None;
            }
            let tag = &ciphertext_with_tag[len - 16..];
            let ciphertext = &ciphertext_with_tag[0..len - 16];
            
            Some(EncryptedData {
                encrypted: hex::encode(ciphertext),
                iv: hex::encode(iv),
                auth_tag: hex::encode(tag)
            })
        },
        Err(_) => None
    }
}

pub fn decrypt(app: &tauri::AppHandle, data: &EncryptedData) -> Option<String> {
    let key_bytes = get_encryption_key(app);
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    
    let iv_bytes = hex::decode(&data.iv).ok()?;
    let tag_bytes = hex::decode(&data.auth_tag).ok()?;
    let encrypted_bytes = hex::decode(&data.encrypted).ok()?;
    
    // Recombine ciphertext and tag for aes_gcm crate
    let mut combined = encrypted_bytes;
    combined.extend_from_slice(&tag_bytes);
    
    // We handle custom IV sizes (if old data had 16-bytes, aes_gcm standard is 12).
    // If it's a 16-byte nonce, we need `AesGcm<Aes256, U16>` which rust crypto supports,
    // but without complicating let's assume it failed if nonce is not 12 bytes. 
    // Usually we ignore old keys because we can't derive the exact same Node key anyway.
    if iv_bytes.len() != 12 {
        return None; // Cannot decrypt 16-byte nonces without custom types
    }
    
    let nonce = Nonce::from_slice(&iv_bytes);
    
    let payload = Payload {
        msg: &combined,
        aad: &[],
    };
    
    match cipher.decrypt(nonce, payload) {
        Ok(plaintext) => String::from_utf8(plaintext).ok(),
        Err(_) => None
    }
}
