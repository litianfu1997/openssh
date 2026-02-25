import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { platform } from '@tauri-apps/plugin-os'
import { getVersion } from '@tauri-apps/api/app'
import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs'
import { open as openShell } from '@tauri-apps/plugin-shell'
import { downloadDir } from '@tauri-apps/api/path'

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
  }
}

// === 主机管理 ===
export const hostsAPI = {
  getAll: () => invoke('get_hosts'),
  save: (host) => invoke('save_host', { host }),
  delete: (id) => invoke('delete_host', { id }),
  get: (id) => invoke('get_host', { id })
}

// === SSH 操作 ===
export const sshAPI = {
  connect: (sessionId, hostId) => invoke('ssh_connect', { sessionId, hostId }),
  input: (sessionId, data) => invoke('ssh_input', { sessionId, data }),
  resize: (sessionId, cols, rows) => invoke('ssh_resize', { sessionId, cols, rows }),
  disconnect: (sessionId) => invoke('ssh_disconnect', { sessionId }),
  test: (hostConfig) => invoke('ssh_test', { hostConfig }),
  // 返回 unlisten 函数，调用者需要在 onUnmounted 中调用
  onData: (cb) => {
    return listen('ssh:data', (event) => {
      cb(event.payload)
    })
  },
  onClosed: (cb) => {
    return listen('ssh:closed', (event) => {
      cb(event.payload)
    })
  }
}

// === SFTP 操作 ===
export const sftpAPI = {
  connect: (sessionId, hostId) => invoke('sftp_connect_session', { sessionId, hostId }),
  realpath: (sessionId, path) => invoke('sftp_realpath', { sessionId, path }),
  list: (sessionId, path) => invoke('sftp_list', { sessionId, path }),
  // ls 是 list 的别名，保持与 Electron API 兼容
  ls: (sessionId, path) => invoke('sftp_list', { sessionId, path }),
  upload: (sessionId, transferId, localPath, remotePath) => invoke('sftp_upload', { sessionId, transferId, localPath, remotePath }),
  download: (sessionId, transferId, remotePath, localPath) => invoke('sftp_download', { sessionId, transferId, remotePath, localPath }),
  delete: (sessionId, path) => invoke('sftp_delete', { sessionId, path }),
  rename: (sessionId, oldPath, newPath) => invoke('sftp_rename', { sessionId, oldPath, newPath }),
  mkdir: (sessionId, path) => invoke('sftp_mkdir', { sessionId, path }),
  getFile: (sessionId, remotePath) => invoke('sftp_get_file', { sessionId, remotePath }),
  putFile: (sessionId, remotePath, content) => invoke('sftp_put_file', { sessionId, remotePath, content }),
  pause: (taskId) => invoke('sftp_pause', { taskId }),
  resume: (taskId) => invoke('sftp_resume', { taskId }),
  cancel: (taskId) => invoke('sftp_cancel', { taskId }),
  move: (sessionId, srcPath, dstPath) => invoke('sftp_move', { sessionId, srcPath, dstPath }),
  stat: (sessionId, path) => invoke('sftp_stat', { sessionId, path }),
  readTextFile: (sessionId, path) => invoke('sftp_read_text_file', { sessionId, path }),

  onTransferStatus: (cb) => {
    return listen('sftp-transfer-status', (event) => {
      cb(event.payload)
    })
  },
  onTransferProgress: (cb) => {
    return listen('sftp-transfer-progress', (event) => {
      cb(event.payload)
    })
  },
  // 兼容 Electron API 的事件监听器
  onUploadProgress: (cb) => {
    return listen('sftp:upload-progress', (event) => {
      cb(event.payload)
    })
  },
  onDownloadProgress: (cb) => {
    return listen('sftp:download-progress', (event) => {
      cb(event.payload)
    })
  }
}

// === 对话框 ===
export const dialogAPI = {
  open: (options) => open(options),
  save: (options) => save(options)
}

// 内部版本比较
function compareVersions(v1, v2) {
  const p1 = v1.split('.').map(Number)
  const p2 = v2.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (p1[i] > p2[i]) return 1
    if (p1[i] < p2[i]) return -1
  }
  return 0
}

// === 应用相关 ===
export const appAPI = {
  getVersion: () => getVersion(),
  getTerminalHistoryConfig: async () => {
    return localStorage.getItem('terminalHistoryEnabled') !== 'false'
  },
  setTerminalHistoryConfig: async (enabled) => {
    localStorage.setItem('terminalHistoryEnabled', String(enabled))
  },
  getHostHistory: (hostId) => {
    try {
      const data = localStorage.getItem(`history_${hostId}`)
      return data ? JSON.parse(data) : []
    } catch (e) {
      return []
    }
  },
  saveHostHistory: (hostId, history) => {
    try {
      // 只保存最新的 500 条以节省空间
      localStorage.setItem(`history_${hostId}`, JSON.stringify(history.slice(0, 500)))
    } catch (e) {
      console.error('Failed to save history to local storage', e)
    }
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
      // 使用 GitHub API 获取最新 Release
      const res = await fetch('https://api.github.com/repos/litianfu1997/lynxshell/releases/latest')
      if (!res.ok) throw new Error('Failed to fetch release info')
      const data = await res.json()
      const latestVersion = data.tag_name.replace(/^v/, '')
      const currentVersion = await getVersion()

      if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
        // 根据平台寻找资产
        const p = await platform()
        let asset = null
        if (p === 'windows') {
          asset = data.assets.find(a => a.name.endsWith('.msi') || (a.name.endsWith('.exe') && a.name.toLowerCase().includes('setup')))
        } else if (p === 'macos') {
          asset = data.assets.find(a => a.name.endsWith('.dmg'))
        } else if (p === 'linux') {
          asset = data.assets.find(a => a.name.endsWith('.AppImage') || a.name.endsWith('.deb'))
        }

        appAPI._currentUpdate = {
          version: latestVersion,
          url: data.html_url,
          assetUrl: asset ? asset.browser_download_url : null,
          assetName: asset ? asset.name : null
        }
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
    if (!appAPI._currentUpdate) return

    if (appAPI._currentUpdate.assetUrl) {
      try {
        appAPI._triggerStatus('downloading', null)
        const res = await fetch(appAPI._currentUpdate.assetUrl)
        if (!res.ok) throw new Error('Download failed: ' + res.statusText)

        const reader = res.body.getReader()
        const contentLength = +(res.headers.get('Content-Length') || 0)

        let receivedLength = 0
        let chunks = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          receivedLength += value.length
          if (contentLength) {
            const percent = Math.round((receivedLength / contentLength) * 100)
            appAPI._triggerProgress(percent)
          }
        }

        const blob = new Uint8Array(receivedLength)
        let position = 0
        for (let chunk of chunks) {
          blob.set(chunk, position)
          position += chunk.length
        }

        const fileName = appAPI._currentUpdate.assetName || 'LynxShell-Setup.exe'
        const dDir = await downloadDir()
        const separator = (await platform()) === 'windows' ? '\\' : '/'

        await writeFile(fileName, blob, { baseDir: BaseDirectory.Download })

        appAPI._triggerStatus('downloaded', null)

        // 尝试打开安装包
        try {
          const fullPath = dDir + separator + fileName
          await openShell(fullPath)
        } catch (e) {
          // 如果无法打开，则降级
          window.open(appAPI._currentUpdate.url, '_blank')
        }

      } catch (e) {
        console.error('Download error:', e)
        appAPI._triggerStatus('error', '下载失败：' + e.message)
        // 降级方案
        setTimeout(() => {
          window.open(appAPI._currentUpdate.url, '_blank')
        }, 2000)
      }
    } else {
      window.open(appAPI._currentUpdate.url, '_blank')
    }
  }
}

// === 平台判断 ===
export const isMobile = () => {
  const p = platform()
  return p === 'android' || p === 'ios'
}
