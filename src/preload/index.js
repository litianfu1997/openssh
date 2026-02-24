import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    // 窗口控制
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximized: (cb) => ipcRenderer.on('window:maximized', (_, v) => cb(v)),

    // 主机管理
    hosts: {
        getAll: () => ipcRenderer.invoke('hosts:get-all'),
        save: (host) => ipcRenderer.invoke('hosts:save', host),
        delete: (id) => ipcRenderer.invoke('hosts:delete', id),
        get: (id) => ipcRenderer.invoke('hosts:get', id)
    },

    // SSH 操作
    ssh: {
        connect: (sessionId, hostId) => ipcRenderer.invoke('ssh:connect', { sessionId, hostId }),
        input: (sessionId, data) => ipcRenderer.send('ssh:input', { sessionId, data }),
        resize: (sessionId, cols, rows) => ipcRenderer.send('ssh:resize', { sessionId, cols, rows }),
        disconnect: (sessionId) => ipcRenderer.invoke('ssh:disconnect', sessionId),
        onData: (cb) => ipcRenderer.on('ssh:data', (_, payload) => cb(payload)),
        onClosed: (cb) => ipcRenderer.on('ssh:closed', (_, payload) => cb(payload)),
        removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
        test: (hostConfig) => ipcRenderer.invoke('ssh:test', hostConfig)
    },

    // SFTP 操作
    sftp: {
        realpath: (sessionId, path) => ipcRenderer.invoke('sftp:realpath', { sessionId, path }),
        ls: (sessionId, path) => ipcRenderer.invoke('sftp:ls', { sessionId, path }),
        upload: (sessionId, transferId, localPath, remotePath) => ipcRenderer.invoke('sftp:upload', { sessionId, transferId, localPath, remotePath }),
        download: (sessionId, transferId, remotePath, localPath) => ipcRenderer.invoke('sftp:download', { sessionId, transferId, remotePath, localPath }),
        pause: (transferId) => ipcRenderer.invoke('sftp:pause', { transferId }),
        resume: (transferId) => ipcRenderer.invoke('sftp:resume', { transferId }),
        cancel: (transferId) => ipcRenderer.invoke('sftp:cancel', { transferId }),
        delete: (sessionId, path) => ipcRenderer.invoke('sftp:delete', { sessionId, path }),
        rename: (sessionId, oldPath, newPath) => ipcRenderer.invoke('sftp:rename', { sessionId, oldPath, newPath }),
        mkdir: (sessionId, path) => ipcRenderer.invoke('sftp:mkdir', { sessionId, path }),
        move: (sessionId, oldPath, newPath) => ipcRenderer.invoke('sftp:move', { sessionId, oldPath, newPath }),
        getFile: (sessionId, path) => ipcRenderer.invoke('sftp:getFile', { sessionId, path }),
        putFile: (sessionId, path, content) => ipcRenderer.invoke('sftp:putFile', { sessionId, path, content }),
        stat: (sessionId, path) => ipcRenderer.invoke('sftp:stat', { sessionId, path }),
        tree: (sessionId, rootPath, depth) => ipcRenderer.invoke('sftp:tree', { sessionId, path: rootPath, depth }),
        // 进度事件监听
        onUploadProgress: (callback) => ipcRenderer.on('sftp:upload-progress', (_, data) => callback(data)),
        onDownloadProgress: (callback) => ipcRenderer.on('sftp:download-progress', (_, data) => callback(data)),
        removeUploadProgressListener: () => ipcRenderer.removeAllListeners('sftp:upload-progress'),
        removeDownloadProgressListener: () => ipcRenderer.removeAllListeners('sftp:download-progress'),
        // VSCode edit
        editInVscode: (sessionId, remotePath) => ipcRenderer.invoke('sftp:editInVscode', { sessionId, remotePath }),
        stopVscodeWatch: (sessionId, remotePath) => ipcRenderer.invoke('sftp:stopVscodeWatch', { sessionId, remotePath }),
        onVscodeSaved: (cb) => ipcRenderer.on('sftp:vscode-saved', (_, data) => cb(data))
    },

    // 对话框
    dialog: {
        showOpenDialog: (options) => ipcRenderer.invoke('dialog:open', options),
        showSaveDialog: (options) => ipcRenderer.invoke('dialog:save', options)
    },

    // 自动更新
    updater: {
        checkManual: () => ipcRenderer.invoke('updater:check-manual'),
        install: () => ipcRenderer.send('updater:install'),
        getConfig: () => ipcRenderer.invoke('updater:config-get'),
        setConfig: (enabled) => ipcRenderer.invoke('updater:config-set', enabled),
        onStatus: (cb) => ipcRenderer.on('updater:status', (_, ...args) => cb(...args)),
        onProgress: (cb) => ipcRenderer.on('updater:progress', (_, ...args) => cb(...args)),
        getVersion: () => ipcRenderer.invoke('app:version')
    }
})
