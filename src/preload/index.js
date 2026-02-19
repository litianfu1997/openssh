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
        removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
    }
})
