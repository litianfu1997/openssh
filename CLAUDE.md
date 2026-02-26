# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LynxShell is a modern SSH/SFTP client built with **Tauri v2 + Vue 3 + Rust**. It provides multi-tab terminal sessions, SFTP file management, and supports both password and private key authentication.

## Development Commands

```bash
# Development (starts Vite dev server + Tauri)
npm run dev

# Production build
npm run build

# Vite-only dev server (frontend only)
npm run vite:dev

# Vite-only build (frontend only)
npm run vite:build
```

**Prerequisites:** Node.js v20+, Rust v1.77+

## Architecture

### Frontend-Backend Communication

The frontend (`src/renderer/`) communicates with the Rust backend (`src-tauri/src/`) through Tauri's `invoke` API. The bridge layer is at `src/renderer/src/api/tauri-bridge.js`, which exports:

- `hostsAPI` — Host CRUD operations
- `sshAPI` — SSH connect, input, resize, disconnect, event listeners
- `sftpAPI` — SFTP operations (list, upload, download, delete, rename, mkdir, etc.)
- `windowAPI` — Window controls (minimize, maximize, close)
- `dialogAPI` — File open/save dialogs
- `appAPI` — App version, update checking, terminal history config

### Backend Modules (Rust)

| File | Purpose |
|------|---------|
| `lib.rs` | Tauri app entry point, registers all Tauri commands and state managers |
| `ssh.rs` | SSH session management via `russh` crate, PTY handling, data event emission |
| `sftp.rs` | SFTP operations via `russh-sftp`, transfer queue with pause/resume/cancel |
| `db.rs` | Host configuration persistence using `tauri-plugin-store` |
| `crypto.rs` | AES-GCM encryption for sensitive data (passwords, private keys) |

### State Management

- **SSH:** `SshManager` holds `HashMap<sessionId, SshSession>` with `RwLock` for concurrent access
- **SFTP:** `SftpManager` holds sessions and transfer states; uses `AtomicU8` for lock-free transfer control
- **Host Mapping:** `SessionHostMap` tracks which host each SFTP session belongs to

### Frontend Structure

```
src/renderer/src/
├── App.vue              # Main app layout, session/tab management
├── api/tauri-bridge.js  # Tauri API wrapper
├── components/
│   ├── TerminalPane.vue # xterm.js terminal wrapper
│   ├── SftpPane.vue     # SFTP panel (tree + file list)
│   ├── TabBar.vue       # Tab management
│   ├── Sidebar.vue      # Host list sidebar
│   └── ...
└── locales/             # i18n (en.js, zh.js)
```

### Session Flow

1. User clicks connect → Frontend generates `sessionId` (UUID)
2. `sshAPI.connect(sessionId, hostId)` → Rust looks up host config, establishes SSH connection
3. Rust spawns tokio task to listen for channel data, emits `ssh:data` events
4. Frontend `TerminalPane` listens via `sshAPI.onData()` and writes to xterm.js
5. User input → `sshAPI.input(sessionId, data)` → Rust sends to channel

### SFTP Transfer Control

Transfers use `AtomicU8` states for pause/resume/cancel without deadlocks:
- `TRANSFER_RUNNING (0)` — Normal operation
- `TRANSFER_PAUSED (1)` — Pause loop
- `TRANSFER_CANCELLED (2)` — Abort and cleanup

## Key Dependencies

- **russh / russh-keys / russh-sftp** — SSH protocol and SFTP
- **xterm.js** — Terminal emulator in browser
- **tauri-plugin-store** — JSON-based persistent storage
- **vue-i18n** — Internationalization

## Data Storage

- Host configs stored in `hosts.json` via tauri-plugin-store
- Sensitive fields (password, private_key, passphrase) encrypted with AES-GCM
- Terminal history cached in localStorage per host
