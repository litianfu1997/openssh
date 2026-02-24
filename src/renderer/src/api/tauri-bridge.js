import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { platform } from '@tauri-apps/plugin-os'

// === 窗口控制 ===
export const windowAPI = {
    minimize: () => {
        const appWindow = getCurrentWindow()
        appWindow.minimize()
    },
    maximize: () => {
        const appWindow = getCurrentWindow()
        appWindow.toggleMaximize()
    },
    close: () => {
        const appWindow = getCurrentWindow()
        appWindow.close()
    },
    isMaximized: async () => {
        const appWindow = getCurrentWindow()
        return await appWindow.isMaximized()
    },
    onMaximized: (cb) => {
        const appWindow = getCurrentWindow()
        appWindow.onResized(async () => {
            cb(await appWindow.isMaximized())
        })
    },
}

// === 主机管理 ===
export const hostsAPI = {
    getAll: () => invoke('get_hosts'),
    save: (host) => invoke('save_host', { host }),
    delete: (id) => invoke('delete_host', { id }),
    get: (id) => invoke('get_host', { id }),
}

// === SSH 操作 ===
export const sshAPI = {
    connect: (sessionId, hostId) => invoke('ssh_connect', { sessionId, hostId }),
    input: (sessionId, data) => invoke('ssh_input', { sessionId, data }),
    resize: (sessionId, cols, rows) => invoke('ssh_resize', { sessionId, cols, rows }),
    disconnect: (sessionId) => invoke('ssh_disconnect', { sessionId }),
    test: (hostConfig) => invoke('ssh_test', { hostConfig }),
    // 返回 unlisten 函数，调用者需要在 onUnmounted 中调用
    onData: (cb) => listen('ssh:data', (e) => cb(e.payload)),
    onClosed: (cb) => listen('ssh:closed', (e) => cb(e.payload)),
}

// === SFTP 操作 ===
export const sftpAPI = {
    connect: (sessionId, hostId) => invoke('sftp_connect_session', { sessionId, hostId }),
    realpath: (sessionId, path) => invoke('sftp_realpath', { sessionId, path }),
    ls: (sessionId, path) => invoke('sftp_list', { sessionId, path }),
    upload: (sessionId, transferId, localPath, remotePath) =>
        invoke('sftp_upload', { sessionId, transferId, localPath, remotePath }),
    download: (sessionId, transferId, remotePath, localPath) =>
        invoke('sftp_download', { sessionId, transferId, remotePath, localPath }),
    pause: (transferId) => invoke('sftp_pause', { transferId }),
    resume: (transferId) => invoke('sftp_resume', { transferId }),
    cancel: (transferId) => invoke('sftp_cancel', { transferId }),
    delete: (sessionId, path) => invoke('sftp_delete', { sessionId, path }),
    rename: (sessionId, oldPath, newPath) => invoke('sftp_rename', { sessionId, oldPath, newPath }),
    mkdir: (sessionId, path) => invoke('sftp_mkdir', { sessionId, path }),
    getFile: (sessionId, path) => invoke('sftp_get_file', { sessionId, path }),
    putFile: (sessionId, path, content) => invoke('sftp_put_file', { sessionId, path, content }),
    onUploadProgress: (cb) => listen('sftp:upload-progress', (e) => cb(e.payload)),
    onDownloadProgress: (cb) => listen('sftp:download-progress', (e) => cb(e.payload)),
    // removeXxxListener: Tauri's listen() returns unlisten fn, manage in component
}

// === 对话框 ===
export const dialogAPI = {
    showOpenDialog: async () => {
        const files = await open({ multiple: true })
        if (!files) return null
        return [files]
    },
    showSaveDialog: async (options) => {
        const path = await save(options)
        return path
    },
}

export const appAPI = {
    version: async () => '0.2.4',
}

// === 平台判断 ===
export const isMobile = () => {
    const p = platform()
    return p === 'android' || p === 'ios'
}
