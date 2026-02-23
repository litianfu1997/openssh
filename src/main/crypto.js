import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import Store from 'electron-store'

// 加密配置存储
const keyStore = new Store({
  name: 'encryption',
  defaults: { encryptionKey: null }
})

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const SALT_LENGTH = 32
const AUTH_TAG_LENGTH = 16

/**
 * 获取或生成加密密钥
 * 基于机器特征生成，保证同一机器上可以解密
 */
function getEncryptionKey() {
  let key = keyStore.get('encryptionKey')
  if (key) {
    return Buffer.from(key, 'hex')
  }

  // 使用机器特征生成密钥
  const os = require('os')
  const userInfo = os.userInfo()
  const homedir = os.homedir()
  const platform = os.platform()
  const hostname = os.hostname()
  const cpus = os.cpus()
  const cpuModel = cpus[0]?.model || 'unknown'

  // 组合多个机器特征
  const machineFeatures = `${hostname}-${platform}-${userInfo.username}-${cpuModel}-${homedir}`

  // 使用主目录作为盐值
  const salt = Buffer.from(homedir.slice(0, SALT_LENGTH), 'utf8')

  // 使用 scrypt 从机器特征派生密钥
  const derivedKey = scryptSync(machineFeatures, salt, KEY_LENGTH)

  // 保存密钥
  keyStore.set('encryptionKey', derivedKey.toString('hex'))
  return derivedKey
}

/**
 * 加密文本
 * @param {string} plaintext - 明文
 * @returns {object} - { encrypted: string, iv: string, authTag: string }
 */
function encrypt(plaintext) {
  if (!plaintext) return null

  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  }
}

/**
 * 解密文本
 * @param {object} encryptedData - { encrypted: string, iv: string, authTag: string }
 * @returns {string} - 明文
 */
function decrypt(encryptedData) {
  if (!encryptedData) return null

  try {
    const key = getEncryptionKey()
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(encryptedData.iv, 'hex')
    )
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'))

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    console.error('解密失败:', error.message)
    return null
  }
}

/**
 * 加密主机对象中的敏感字段
 * @param {object} host - 主机配置对象
 * @returns {object} - 加密后的主机对象
 */
function encryptHost(host) {
  const result = { ...host }

  if (host.password) {
    result.password = encrypt(host.password)
  }
  if (host.private_key) {
    result.private_key = encrypt(host.private_key)
  }
  if (host.passphrase) {
    result.passphrase = encrypt(host.passphrase)
  }

  return result
}

/**
 * 解密主机对象中的敏感字段
 * @param {object} host - 主机配置对象
 * @returns {object} - 解密后的主机对象
 */
function decryptHost(host) {
  const result = { ...host }

  if (host.password && typeof host.password === 'object') {
    result.password = decrypt(host.password)
  }
  if (host.private_key && typeof host.private_key === 'object') {
    result.private_key = decrypt(host.private_key)
  }
  if (host.passphrase && typeof host.passphrase === 'object') {
    result.passphrase = decrypt(host.passphrase)
  }

  return result
}

export { encryptHost, decryptHost, encrypt, decrypt }
