import { app, BrowserWindow, ipcMain, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { createSSHConnection, closeSSHConnection, resizeSSHTerminal, getSshConnections, testSSHConnection } from './ssh-manager'
import { getHosts, saveHost, deleteHost, getHost } from './db'

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 780,
        minWidth: 800,
        minHeight: 600,
        show: false,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0f1117',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: join(__dirname, '../../resources/icon.png')
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    // 初始化自动更新
    checkForUpdates(mainWindow)

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return mainWindow
}



import { getAutoCheckUpdate, setAutoCheckUpdate } from './config'

let updaterHandlersRegistered = false

// 自动更新逻辑
function checkForUpdates(mainWindow) {
    if (updaterHandlersRegistered) return
    updaterHandlersRegistered = true

    // 自动触发时，需检查用户是否开启
    if (!is.dev && getAutoCheckUpdate()) {
        autoUpdater.checkForUpdatesAndNotify()
    }

    autoUpdater.on('checking-for-update', () => {
        mainWindow.webContents.send('updater:status', 'checking')
    })

    // ... 其他 listener 保持不变 ...
    autoUpdater.on('update-available', (info) => {
        mainWindow.webContents.send('updater:status', 'available', info)
    })

    autoUpdater.on('update-not-available', () => {
        mainWindow.webContents.send('updater:status', 'not-available')
    })

    autoUpdater.on('error', (err) => {
        mainWindow.webContents.send('updater:status', 'error', err.message)
    })

    autoUpdater.on('download-progress', (progressObj) => {
        mainWindow.webContents.send('updater:progress', progressObj)
    })

    autoUpdater.on('update-downloaded', (info) => {
        mainWindow.webContents.send('updater:status', 'downloaded', info)
    })

    ipcMain.on('updater:install', () => {
        autoUpdater.quitAndInstall()
    })

    // 手动检查更新（忽略配置开关）
    ipcMain.handle('updater:check-manual', () => {
        return autoUpdater.checkForUpdatesAndNotify()
    })

    // 获取自动更新开关状态
    ipcMain.handle('updater:config-get', () => {
        return getAutoCheckUpdate()
    })

    // 设置自动更新开关
    ipcMain.handle('updater:config-set', (_, enabled) => {
        setAutoCheckUpdate(enabled)
        return true
    })

    // 获取版本号
    ipcMain.handle('app:version', () => app.getVersion())
}

app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.openssh.client')

    const mainWindow = createWindow()

    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // 窗口控制
    ipcMain.on('window:minimize', () => mainWindow.minimize())
    ipcMain.on('window:maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize()
        } else {
            mainWindow.maximize()
        }
    })
    ipcMain.on('window:close', () => mainWindow.close())
    ipcMain.handle('window:is-maximized', () => mainWindow.isMaximized())

    mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true))
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))

    // 主机管理 IPC
    ipcMain.handle('hosts:get-all', () => getHosts())
    ipcMain.handle('hosts:save', (_, host) => saveHost(host))
    ipcMain.handle('hosts:delete', (_, id) => deleteHost(id))
    ipcMain.handle('hosts:get', (_, id) => getHost(id))

    // SSH 连接 IPC
    ipcMain.handle('ssh:connect', async (event, { sessionId, hostId }) => {
        const host = getHost(hostId)
        if (!host) throw new Error('主机不存在')
        return createSSHConnection(mainWindow, sessionId, host)
    })

    ipcMain.on('ssh:input', (_, { sessionId, data }) => {
        const conn = getSshConnections().get(sessionId)
        if (conn && conn.stream) {
            conn.stream.write(data)
        }
    })

    ipcMain.on('ssh:resize', (_, { sessionId, cols, rows }) => {
        resizeSSHTerminal(sessionId, cols, rows)
    })

    ipcMain.handle('ssh:disconnect', (_, sessionId) => {
        closeSSHConnection(sessionId)
    })

    // SSH 测试连接 IPC
    ipcMain.handle('ssh:test', async (_, hostConfig) => {
        return testSSHConnection(hostConfig)
    })

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
