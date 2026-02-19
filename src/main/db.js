import Store from 'electron-store'
import { v4 as uuidv4 } from 'uuid'

const store = new Store({
  name: 'hosts',
  defaults: { hosts: [] }
})

export function getHosts() {
  return store.get('hosts', [])
}

export function getHost(id) {
  return getHosts().find(h => h.id === id) || null
}

export function saveHost(host) {
  const hosts = getHosts()
  if (host.id) {
    // 更新现有主机
    const idx = hosts.findIndex(h => h.id === host.id)
    if (idx > -1) {
      hosts[idx] = { ...hosts[idx], ...host }
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
  hosts.push(newHost)
  store.set('hosts', hosts)
  return newHost.id
}

export function deleteHost(id) {
  const hosts = getHosts().filter(h => h.id !== id)
  store.set('hosts', hosts)
  return true
}

export function updateLastConnected(id) {
  const hosts = getHosts()
  const idx = hosts.findIndex(h => h.id === id)
  if (idx > -1) {
    hosts[idx].last_connected = new Date().toISOString()
    store.set('hosts', hosts)
  }
}
