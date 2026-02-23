import { Client } from 'ssh2'
import { updateLastConnected } from './db'
import { posix } from 'path'

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

/**
 * 上传文件到远程服务器
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} localPath - 本地文件路径
 * @param {string} remotePath - 远程文件路径
 * @param {Function} onProgress - 进度回调函数 (bytesTransferred, totalBytes)
 * @returns {Promise<void>}
 */
export async function uploadFile(sessionId, localPath, remotePath, onProgress) {
    const sftp = await getSFTP(sessionId)
    const fs = await import('fs')

    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(localPath)
        const writeStream = sftp.createWriteStream(remotePath)

        const cleanup = () => {
            readStream.destroy()
            writeStream.destroy()
        }

        readStream.on('error', (err) => {
            cleanup()
            reject(err)
        })
        writeStream.on('error', (err) => {
            cleanup()
            reject(err)
        })

        if (onProgress) {
            // Use async file stats instead of sync
            fs.promises.stat(localPath).then((stats) => {
                const totalBytes = stats.size
                let bytesTransferred = 0

                readStream.on('data', (chunk) => {
                    bytesTransferred += chunk.length
                    try {
                        onProgress(bytesTransferred, totalBytes)
                    } catch (error) {
                        // Prevent callback crashes from affecting the upload
                        console.error('Progress callback error:', error)
                    }
                })
            }).catch(() => {
                // If stats fail, continue without progress tracking
            })
        }

        writeStream.on('close', resolve)
        readStream.pipe(writeStream)
    })
}

/**
 * 从远程服务器下载文件
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} remotePath - 远程文件路径
 * @param {string} localPath - 本地文件路径
 * @param {Function} onProgress - 进度回调函数 (bytesTransferred, totalBytes)
 * @returns {Promise<void>}
 */
export async function downloadFile(sessionId, remotePath, localPath, onProgress) {
    const sftp = await getSFTP(sessionId)
    const fs = await import('fs')

    return new Promise((resolve, reject) => {
        // 获取文件大小用于进度跟踪
        sftp.stat(remotePath, (err, stats) => {
            if (err) return reject(err)

            const totalBytes = stats.size
            let bytesTransferred = 0

            const readStream = sftp.createReadStream(remotePath)
            const writeStream = fs.createWriteStream(localPath)

            const cleanup = () => {
                readStream.destroy()
                writeStream.destroy()
            }

            readStream.on('error', (err) => {
                cleanup()
                reject(err)
            })
            writeStream.on('error', (err) => {
                cleanup()
                reject(err)
            })

            if (onProgress) {
                readStream.on('data', (chunk) => {
                    bytesTransferred += chunk.length
                    try {
                        onProgress(bytesTransferred, totalBytes)
                    } catch (error) {
                        // Prevent callback crashes from affecting the download
                        console.error('Progress callback error:', error)
                    }
                })
            }

            writeStream.on('close', resolve)
            readStream.pipe(writeStream)
        })
    })
}

/**
 * 删除远程文件
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} path - 远程文件路径
 * @returns {Promise<void>}
 */
export async function deletePath(sessionId, path) {
    const sftp = await getSFTP(sessionId)
    return new Promise((resolve, reject) => {
        sftp.unlink(path, (err) => {
            if (err) return reject(err)
            resolve()
        })
    })
}

/**
 * 递归删除远程目录
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} dirPath - 远程目录路径
 * @returns {Promise<void>}
 */
export async function deleteDirectoryRecursive(sessionId, dirPath) {
    const sftp = await getSFTP(sessionId)

    return new Promise((resolve, reject) => {
        sftp.readdir(dirPath, async (err, list) => {
            if (err) return reject(err)

            try {
                // 递归删除目录中的所有文件和子目录
                for (const item of list) {
                    if (item.filename === '.' || item.filename === '..') continue

                    // Use path.posix.join for consistent path handling
                    const fullPath = posix.join(dirPath, item.filename)

                    if (item.attrs.isDirectory()) {
                        await deleteDirectoryRecursive(sessionId, fullPath)
                    } else {
                        await deletePath(sessionId, fullPath)
                    }
                }

                // 删除空目录
                await new Promise((res, rej) => {
                    sftp.rmdir(dirPath, (err) => {
                        if (err) return rej(err)
                        res()
                    })
                })

                resolve()
            } catch (error) {
                reject(error)
            }
        })
    })
}

/**
 * 重命名远程文件或目录
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} oldPath - 原路径
 * @param {string} newPath - 新路径
 * @returns {Promise<void>}
 */
export async function renamePath(sessionId, oldPath, newPath) {
    const sftp = await getSFTP(sessionId)
    return new Promise((resolve, reject) => {
        sftp.rename(oldPath, newPath, (err) => {
            if (err) return reject(err)
            resolve()
        })
    })
}

/**
 * 创建远程目录
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} path - 目录路径
 * @returns {Promise<void>}
 */
export async function mkdir(sessionId, path) {
    const sftp = await getSFTP(sessionId)
    return new Promise((resolve, reject) => {
        sftp.mkdir(path, (err) => {
            if (err) return reject(err)
            resolve()
        })
    })
}

/**
 * 移动远程文件或目录（实际上是重命名）
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} oldPath - 原路径
 * @param {string} newPath - 新路径
 * @returns {Promise<void>}
 */
export async function movePath(sessionId, oldPath, newPath) {
    // 在 SFTP 中，移动就是重命名
    return renamePath(sessionId, oldPath, newPath)
}

/**
 * 读取远程文件内容（用于预览/编辑）
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} path - 文件路径
 * @returns {Promise<Buffer>} 文件内容
 */
export async function readFile(sessionId, path) {
    const sftp = await getSFTP(sessionId)
    return new Promise((resolve, reject) => {
        // First check file size to prevent loading huge files
        sftp.stat(path, (err, stats) => {
            if (err) return reject(err)

            const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
            if (stats.size > MAX_FILE_SIZE) {
                return reject(new Error(`File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is 10MB.`))
            }

            // File size is acceptable, proceed to read
            sftp.readFile(path, (err, data) => {
                if (err) return reject(err)
                resolve(data)
            })
        })
    })
}

/**
 * 写入远程文件内容（用于在线编辑）
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} path - 文件路径
 * @param {string|Buffer} content - 文件内容
 * @returns {Promise<void>}
 */
export async function writeFile(sessionId, path, content) {
    const sftp = await getSFTP(sessionId)
    return new Promise((resolve, reject) => {
        sftp.writeFile(path, content, (err) => {
            if (err) return reject(err)
            resolve()
        })
    })
}

/**
 * 获取远程文件信息
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} path - 文件路径
 * @returns {Promise<Object>} 文件信息
 */
export async function getStats(sessionId, path) {
    const sftp = await getSFTP(sessionId)
    return new Promise((resolve, reject) => {
        sftp.stat(path, (err, stats) => {
            if (err) return reject(err)
            resolve({
                size: stats.size,
                mode: stats.mode,
                mtime: stats.mtime * 1000,
                atime: stats.atime * 1000,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile()
            })
        })
    })
}

/**
 * 获取目录树结构（用于树形组件）
 * @param {string} sessionId - SSH 会话 ID
 * @param {string} rootPath - 根目录路径
 * @param {number} depth - 递归深度（默认 1，仅当前目录）
 * @returns {Promise<Array>} 目录树结构
 */
export async function getDirectoryTree(sessionId, rootPath, depth = 1) {
    const sftp = await getSFTP(sessionId)

    async function buildTree(path, currentDepth) {
        return new Promise((resolve, reject) => {
            sftp.readdir(path, async (err, list) => {
                if (err) return reject(err)

                try {
                    const items = []

                    for (const item of list) {
                        if (item.filename === '.' || item.filename === '..') continue

                        // Use path.posix.join for consistent path handling
                        const fullPath = posix.join(path, item.filename)
                        const isDirectory = item.attrs.isDirectory()

                        const treeNode = {
                            name: item.filename,
                            path: fullPath,
                            type: isDirectory ? 'directory' : 'file',
                            size: item.attrs.size,
                            mtime: item.attrs.mtime * 1000,
                            mode: item.attrs.mode
                        }

                        // 如果是目录且未达到最大深度，递归获取子项
                        if (isDirectory && currentDepth < depth) {
                            treeNode.children = await buildTree(fullPath, currentDepth + 1)
                        }

                        items.push(treeNode)
                    }

                    resolve(items)
                } catch (error) {
                    reject(error)
                }
            })
        })
    }

    return buildTree(rootPath, 1)
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
