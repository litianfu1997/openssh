import { app, BrowserWindow, ipcMain, shell, nativeTheme, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { tmpdir } from 'os'
import { existsSync, watch as fsWatch, mkdirSync } from 'fs'
import { exec } from 'child_process'
import {
    createSSHConnection,
    closeSSHConnection,
    resizeSSHTerminal,
    getSshConnections,
    testSSHConnection,
    listRemoteDirectory,
    uploadFile,
    downloadFile,
    deletePath,
    renamePath,
    mkdir,
    movePath,
    readFile,
    writeFile,
    getStats,
    getDirectoryTree,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    getRealPath
} from './ssh-manager'
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

    // SFTP IPC
    ipcMain.handle('sftp:realpath', async (_, { sessionId, path }) => {
        return getRealPath(sessionId, path)
    })

    ipcMain.handle('sftp:ls', async (_, { sessionId, path }) => {
        return listRemoteDirectory(sessionId, path)
    })

    // SFTP upload with progress
    ipcMain.handle('sftp:upload', async (event, { sessionId, transferId, localPath, remotePath }) => {
        const targetWindow = BrowserWindow.fromWebContents(event.sender)
        return uploadFile(sessionId, transferId, localPath, remotePath, (bytesTransferred, totalBytes, speed) => {
            if (targetWindow) {
                targetWindow.webContents.send('sftp:upload-progress', {
                    sessionId,
                    remotePath,
                    bytesTransferred,
                    totalBytes,
                    speed
                })
            }
        })
    })

    // SFTP download with progress
    ipcMain.handle('sftp:download', async (event, { sessionId, transferId, remotePath, localPath }) => {
        const targetWindow = BrowserWindow.fromWebContents(event.sender)
        return downloadFile(sessionId, transferId, remotePath, localPath, (bytesTransferred, totalBytes, speed) => {
            if (targetWindow) {
                targetWindow.webContents.send('sftp:download-progress', {
                    sessionId,
                    remotePath,
                    bytesTransferred,
                    totalBytes,
                    speed
                })
            }
        })
    })

    // SFTP Transfer Controls
    ipcMain.handle('sftp:pause', (_, { transferId }) => pauseTransfer(transferId))
    ipcMain.handle('sftp:resume', (_, { transferId }) => resumeTransfer(transferId))
    ipcMain.handle('sftp:cancel', (_, { transferId }) => cancelTransfer(transferId))

    // SFTP delete
    ipcMain.handle('sftp:delete', async (_, { sessionId, path }) => {
        return deletePath(sessionId, path)
    })

    // SFTP rename
    ipcMain.handle('sftp:rename', async (_, { sessionId, oldPath, newPath }) => {
        return renamePath(sessionId, oldPath, newPath)
    })

    // SFTP mkdir
    ipcMain.handle('sftp:mkdir', async (_, { sessionId, path }) => {
        return mkdir(sessionId, path)
    })

    // SFTP move
    ipcMain.handle('sftp:move', async (_, { sessionId, oldPath, newPath }) => {
        return movePath(sessionId, oldPath, newPath)
    })

    // SFTP read file
    ipcMain.handle('sftp:getFile', async (_, { sessionId, path }) => {
        return readFile(sessionId, path)
    })

    // SFTP write file
    ipcMain.handle('sftp:putFile', async (_, { sessionId, path, content }) => {
        return writeFile(sessionId, path, content)
    })

    // SFTP stat
    ipcMain.handle('sftp:stat', async (_, { sessionId, path }) => {
        return getStats(sessionId, path)
    })

    // SFTP directory tree
    ipcMain.handle('sftp:tree', async (_, { sessionId, path, depth }) => {
        return getDirectoryTree(sessionId, path, depth)
    })

    // SFTP Edit in VSCode
    // watcher map to allow cleanup: sessionId+remotePath -> FSWatcher
    const vscodeWatchers = new Map()

    ipcMain.handle('sftp:editInVscode', async (event, { sessionId, remotePath }) => {
        const targetWindow = BrowserWindow.fromWebContents(event.sender)

        // Build a stable local temp path that mirrors the remote path
        const safeRemote = remotePath.replace(/[/\\:*?"<>|]/g, '_')
        const tmpDir = join(tmpdir(), 'openssh-edit')
        if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
        const localPath = join(tmpDir, `${sessionId}_${safeRemote}`)

        // Download the file
        await downloadFile(sessionId, remotePath, localPath)

        // Try to find VSCode executable
        const vscodeCandidates = [
            'code',   // in PATH (most systems)
            '/usr/local/bin/code',
            '/usr/bin/code',
            'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd',
            'C:\\Program Files (x86)\\Microsoft VS Code\\bin\\code.cmd'
        ]

        const openInCode = (candidate) => new Promise((resolve) => {
            exec(`"${candidate}" --wait "${localPath}"`, (err) => {
                resolve(!err)
            })
        })

        // Try 'code' first (it's on PATH for most installations)
        exec(`code --version`, async (err) => {
            const codeCmd = err ? vscodeCandidates.find(c => existsSync(c)) || 'code' : 'code'
            // Open with --wait so we know when user closes the tab
            exec(`"${codeCmd}" "${localPath}"`)
        })

        // Watch for file changes and auto-upload
        const watchKey = `${sessionId}::${remotePath}`
        if (vscodeWatchers.has(watchKey)) {
            vscodeWatchers.get(watchKey).close()
        }

        let uploadTimer = null
        const watcher = fsWatch(localPath, () => {
            // Debounce 300ms to avoid multiple rapid saves
            clearTimeout(uploadTimer)
            uploadTimer = setTimeout(async () => {
                try {
                    await uploadFile(sessionId, localPath, remotePath)
                    if (targetWindow) {
                        targetWindow.webContents.send('sftp:vscode-saved', { remotePath, success: true })
                    }
                } catch (e) {
                    if (targetWindow) {
                        targetWindow.webContents.send('sftp:vscode-saved', { remotePath, success: false, error: e.message })
                    }
                }
            }, 300)
        })

        vscodeWatchers.set(watchKey, watcher)
        return { localPath, success: true }
    })

    ipcMain.handle('sftp:stopVscodeWatch', (_, { sessionId, remotePath }) => {
        const watchKey = `${sessionId}::${remotePath}`
        if (vscodeWatchers.has(watchKey)) {
            vscodeWatchers.get(watchKey).close()
            vscodeWatchers.delete(watchKey)
        }
        return true
    })

    // 对话框
    ipcMain.handle('dialog:open', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections']
        })
        return result
    })

    ipcMain.handle('dialog:save', async (_, options) => {
        const result = await dialog.showSaveDialog(mainWindow, options)
        return result
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
