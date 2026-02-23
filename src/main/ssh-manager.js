import { Client } from 'ssh2'
import { updateLastConnected } from './db'

// sessionId -> { client, stream, sftp }
const sshConnections = new Map()

export function getSshConnections() {
    return sshConnections
}

/**
 * 构建 SSH 连接配置
 * @param {object} hostConfig 主机配置
 * @param {object} options 额外选项
 * @returns {object} SSH 连接配置
 */
function buildConnectConfig(hostConfig, options = {}) {
    const config = {
        host: hostConfig.host,
        port: hostConfig.port || 22,
        username: hostConfig.username,
        readyTimeout: options.readyTimeout || 20000,
        ...options
    }

    if (hostConfig.auth_type === 'password') {
        config.password = hostConfig.password
    } else if (hostConfig.auth_type === 'key') {
        config.privateKey = hostConfig.private_key
        if (hostConfig.passphrase) {
            config.passphrase = hostConfig.passphrase
        }
    }

    return config
}

/**
 * 获取或初始化 SFTP 会话
 * @param {string} sessionId 
 * @returns {Promise<Object>} sftp 对象
 */
export function getSFTP(sessionId) {
    return new Promise((resolve, reject) => {
        const conn = sshConnections.get(sessionId)
        if (!conn) return reject(new Error('SSH 连接不存在'))
        
        if (conn.sftp) return resolve(conn.sftp)

        conn.client.sftp((err, sftp) => {
            if (err) return reject(err)
            conn.sftp = sftp
            resolve(sftp)
        })
    })
}

/**
 * 列出远程目录
 * @param {string} sessionId
 * @param {string} remotePath
 */
export async function listRemoteDirectory(sessionId, remotePath) {
    const sftp = await getSFTP(sessionId)
    return new Promise((resolve, reject) => {
        sftp.readdir(remotePath, (err, list) => {
            if (err) return reject(err)
            resolve(list.map(item => ({
                name: item.filename,
                size: item.attrs.size,
                type: item.attrs.isDirectory ? 'directory' : 'file',
                mode: item.attrs.mode,
                mtime: item.attrs.mtime * 1000,
                atime: item.attrs.atime * 1000
            })))
        })
    })
}

export async function createSSHConnection(mainWindow, sessionId, host) {
    return new Promise((resolve, reject) => {
        const client = new Client()

        client.on('ready', () => {
            client.shell({ term: 'xterm-256color', rows: 24, cols: 80 }, (err, stream) => {
                if (err) {
                    client.end()
                    return reject(err.message)
                }

                sshConnections.set(sessionId, { client, stream })
                updateLastConnected(host.id)

                stream.on('data', (data) => {
                    mainWindow.webContents.send('ssh:data', { sessionId, data: data.toString() })
                })

                stream.stderr.on('data', (data) => {
                    mainWindow.webContents.send('ssh:data', { sessionId, data: data.toString() })
                })

                stream.on('close', () => {
                    sshConnections.delete(sessionId)
                    mainWindow.webContents.send('ssh:closed', { sessionId })
                    client.end()
                })

                resolve({ success: true })
            })
        })

        client.on('error', (err) => {
            sshConnections.delete(sessionId)
            reject(err.message)
        })

        client.on('close', () => {
            sshConnections.delete(sessionId)
            mainWindow.webContents.send('ssh:closed', { sessionId })
        })

        client.connect(buildConnectConfig(host, { keepaliveInterval: 30000 }))
    })
}

export function closeSSHConnection(sessionId) {
    const conn = sshConnections.get(sessionId)
    if (conn) {
        conn.stream?.close()
        conn.client?.end()
        sshConnections.delete(sessionId)
    }
}

export function resizeSSHTerminal(sessionId, cols, rows) {
    const conn = sshConnections.get(sessionId)
    if (conn && conn.stream) {
        conn.stream.setWindow(rows, cols, 0, 0)
    }
}

/**
 * 测试 SSH 连接（不打开 shell，连接成功立即断开）
 * @param {object} hostConfig 主机配置对象
 * @returns {Promise<{success: boolean, message: string}>}
 */
export function testSSHConnection(hostConfig) {
    return new Promise((resolve) => {
        const client = new Client()
        let settled = false

        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true
                client.end()
                resolve({ success: false, message: 'Connection timed out' })
            }
        }, 15000)

        client.on('ready', () => {
            if (!settled) {
                settled = true
                clearTimeout(timeout)
                client.end()
                resolve({ success: true, message: 'ok' })
            }
        })

        client.on('error', (err) => {
            if (!settled) {
                settled = true
                clearTimeout(timeout)
                resolve({ success: false, message: err.message })
            }
        })

        try {
            client.connect(buildConnectConfig(hostConfig, { readyTimeout: 15000 }))
        } catch (e) {
            if (!settled) {
                settled = true
                clearTimeout(timeout)
                resolve({ success: false, message: e.message })
            }
        }
    })
}
