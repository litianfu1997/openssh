import { Client } from 'ssh2'
import { updateLastConnected } from './db'

// sessionId -> { client, stream }
const sshConnections = new Map()

export function getSshConnections() {
    return sshConnections
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

        // 构建连接配置
        const connectConfig = {
            host: host.host,
            port: host.port || 22,
            username: host.username,
            readyTimeout: 20000,
            keepaliveInterval: 30000
        }

        if (host.auth_type === 'password') {
            connectConfig.password = host.password
        } else if (host.auth_type === 'key') {
            connectConfig.privateKey = host.private_key
            if (host.passphrase) {
                connectConfig.passphrase = host.passphrase
            }
        }

        client.connect(connectConfig)
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
