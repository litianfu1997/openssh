import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { platform } from '@tauri-apps/plugin-os'
import { getVersion } from '@tauri-apps/api/app'

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
        try {
            const files = await open({ multiple: true })
            if (!files) return { canceled: true, filePaths: [] }
            return { canceled: false, filePaths: Array.isArray(files) ? files : [files] }
        } catch (e) {
            // 用户取消对话框时 Tauri 可能抛出异常，安全处理
            return { canceled: true, filePaths: [] }
        }
    },
    showSaveDialog: async (options) => {
        try {
            const path = await save(options)
            if (!path) return { canceled: true, filePath: '' }
            return { canceled: false, filePath: path }
        } catch (e) {
            // 用户取消保存对话框时 Tauri 可能抛出异常，安全处理
            return { canceled: true, filePath: '' }
        }
    },
}

// === 辅助方法：版本比较 ===
function compareVersions(v1, v2) {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const n1 = p1[i] || 0;
        const n2 = p2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

export const appAPI = {
    version: async () => await getVersion(),
    getVersion: async () => await getVersion(),
    getConfig: async () => {
        return localStorage.getItem('autoUpdateEnabled') !== 'false'
    },
    setConfig: async (enabled) => {
        localStorage.setItem('autoUpdateEnabled', String(enabled))
    },
    _statusListeners: [],
    _progressListeners: [],
    _currentUpdate: null,
    onStatus: (cb) => {
        appAPI._statusListeners.push(cb)
    },
    onProgress: (cb) => {
        appAPI._progressListeners.push(cb)
    },
    _triggerStatus: (status, info) => {
        appAPI._statusListeners.forEach(cb => cb(status, info))
    },
    _triggerProgress: (progress) => {
        appAPI._progressListeners.forEach(cb => cb(progress))
    },
    checkManual: async () => {
        appAPI._triggerStatus('checking', null)
        try {
            const res = await fetch('https://raw.githubusercontent.com/litianfu1997/openssh/master/package.json?t=' + Date.now())
            if (!res.ok) throw new Error('Failed to fetch release info')
            const data = await res.json()
            const latestVersion = (data.version || '').replace(/^v/, '')
            const currentVersion = await getVersion()

            if (latestVersion && latestVersion !== currentVersion && compareVersions(latestVersion, currentVersion) > 0) {
                appAPI._currentUpdate = { version: latestVersion, url: 'https://github.com/litianfu1997/openssh/releases/latest' }
                appAPI._triggerStatus('available', { version: latestVersion })
                return { version: latestVersion }
            } else {
                appAPI._triggerStatus('not-available', null)
                return null
            }
        } catch (e) {
            appAPI._triggerStatus('error', e.message)
            throw e
        }
    },
    install: async () => {
        if (appAPI._currentUpdate) {
            window.open(appAPI._currentUpdate.url, '_blank')
        }
    }
}

// === 平台判断 ===
export const isMobile = () => {
    const p = platform()
    return p === 'android' || p === 'ios'
}
