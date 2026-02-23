import Store from 'electron-store'
import { v4 as uuidv4 } from 'uuid'
import { encryptHost, decryptHost } from './crypto.js'

const store = new Store({
  name: 'hosts',
  defaults: { hosts: [] }
})

// 数据迁移：检查并转换旧的明文数据
function migrateDataIfNeeded() {
  const hosts = store.get('hosts', [])
  let needsMigration = false

  // 检查是否有需要迁移的数据
  for (const host of hosts) {
    // 如果密码是字符串类型，说明是旧的明文数据
    if (host.password && typeof host.password === 'string') {
      needsMigration = true
      break
    }
    if (host.private_key && typeof host.private_key === 'string') {
      needsMigration = true
      break
    }
    if (host.passphrase && typeof host.passphrase === 'string') {
      needsMigration = true
      break
    }
  }

  if (needsMigration) {
    console.log('检测到旧格式数据，正在迁移到加密存储...')
    const encryptedHosts = hosts.map(host => {
      // 如果已经是加密格式（对象类型），则跳过
      if (host.password && typeof host.password === 'object') {
        return host
      }
      if (host.private_key && typeof host.private_key === 'object') {
        return host
      }
      // 否则进行加密
      return encryptHost(host)
    })
    store.set('hosts', encryptedHosts)
    console.log('数据迁移完成')
  }
}

// 初始化时执行迁移
migrateDataIfNeeded()

export function getHosts() {
  const hosts = store.get('hosts', [])
  return hosts.map(h => decryptHost(h))
}

export function getHost(id) {
  const hosts = store.get('hosts', [])
  const host = hosts.find(h => h.id === id)
  return host ? decryptHost(host) : null
}

export function saveHost(host) {
  const hosts = store.get('hosts', [])

  if (host.id) {
    // 更新现有主机
    const idx = hosts.findIndex(h => h.id === host.id)
    if (idx > -1) {
      // 合并现有数据（保留未修改的字段）
      const existingHost = hosts[idx]
      const merged = { ...existingHost, ...host }
      const encrypted = encryptHost(merged)
      hosts[idx] = encrypted
      store.set('hosts', hosts)
      return host.id
    }
  }

  // 新建主机
  const newHost = {
    ...host,
    id: uuidv4(),
    group_name: host.group_name || '默认分组',
    tags: host.tags || [],
    port: host.port || 22,
    auth_type: host.auth_type || 'password',
    created_at: new Date().toISOString()
  }

  const encrypted = encryptHost(newHost)
  hosts.push(encrypted)
  store.set('hosts', hosts)
  return newHost.id
}

export function deleteHost(id) {
  const hosts = store.get('hosts', []).filter(h => h.id !== id)
  store.set('hosts', hosts)
  return true
}

export function updateLastConnected(id) {
  const hosts = store.get('hosts', [])
  const idx = hosts.findIndex(h => h.id === id)
  if (idx > -1) {
    hosts[idx].last_connected = new Date().toISOString()
    store.set('hosts', hosts)
  }
}
