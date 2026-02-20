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
