<template>
  <div class="sidebar">
    <!-- 顶部操作栏 -->
    <div class="sidebar-header">
      <div class="search-wrap">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="searchQuery"
          class="search-input"
          :placeholder="$t('sidebar.search')"
        />
      </div>
      <button class="btn-icon" :title="$t('sidebar.add_host')" @click="$emit('manage-host', null)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- 主机列表 -->
    <div class="host-list">
      <template v-if="filteredGroups.length === 0">
        <div class="empty-tip">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
          <span>{{ $t('sidebar.no_hosts') }}</span>
          <button class="btn btn-primary btn-sm" @click="$emit('manage-host', null)">{{ $t('sidebar.add_host') }}</button>
        </div>
      </template>

      <div v-for="group in filteredGroups" :key="group.name" class="host-group">
        <div class="group-header" @click="toggleGroup(group.name)">
          <svg
            class="group-arrow"
            :class="{ collapsed: collapsedGroups.has(group.name) }"
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          >
            <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="group-name">{{ group.name }}</span>
          <span class="group-count">{{ group.hosts.length }}</span>
        </div>

        <div v-if="!collapsedGroups.has(group.name)" class="group-hosts">
          <div
            v-for="host in group.hosts"
            :key="host.id"
            class="host-item"
            :class="{ active: isActiveHost(host.id) }"
            @click="$emit('connect', host)"
            @contextmenu.prevent="showContextMenu($event, host)"
          >
            <div class="host-status-dot" :class="getStatusClass(host.id)" />
            <div class="host-info">
              <div class="host-name">{{ host.name }}</div>
              <div class="host-addr">{{ host.username }}@{{ host.host }}:{{ host.port }}</div>
            </div>
            <div class="host-actions">
              <button
                class="btn-icon-sm"
                title="SFTP"
                @click.stop="$emit('open-sftp', host)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </button>
              <button
                class="btn-icon-sm"
                :title="$t('sidebar.edit')"
                @click.stop="$emit('manage-host', host)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="sidebar-footer">
      <button class="footer-btn" @click="$emit('refresh')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
          <path d="M8 16H3v5" stroke-linecap="round"/>
        </svg>
        {{ $t('sidebar.refresh') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  hosts: { type: Array, default: () => [] },
  activeSessionId: { type: String, default: null }
})

const emit = defineEmits(['connect', 'open-sftp', 'manage-host', 'refresh'])

const searchQuery = ref('')
const collapsedGroups = ref(new Set())

const filteredGroups = computed(() => {
  const q = searchQuery.value.toLowerCase()
  const filtered = q
    ? props.hosts.filter(h =>
        h.name.toLowerCase().includes(q) ||
        h.host.toLowerCase().includes(q) ||
        h.username.toLowerCase().includes(q)
      )
    : props.hosts

  const groups = {}
  for (const host of filtered) {
    const rawGroup = host.group_name || '默认分组'
    // 如果组名是“默认分组”，则尝试国际化
    const displayGroup = (rawGroup === '默认分组' || rawGroup === 'Default Group') 
      ? t('sidebar.group_default') 
      : rawGroup
      
    if (!groups[displayGroup]) groups[displayGroup] = { name: displayGroup, hosts: [] }
    groups[displayGroup].hosts.push(host)
  }
  return Object.values(groups)
})

function toggleGroup(name) {
  if (collapsedGroups.value.has(name)) {
    collapsedGroups.value.delete(name)
  } else {
    collapsedGroups.value.add(name)
  }
}

function isActiveHost(hostId) {
  return false // 可以根据 activeSessionId 判断
}

function getStatusClass(hostId) {
  return '' // connected / connecting
}

function showContextMenu(event, host) {
  // TODO: 右键菜单
}
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  background: var(--color-bg-2);
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--color-border);
}

.search-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 8px;
  color: var(--color-text-3);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 5px 8px 5px 28px;
  background: var(--color-bg-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 12px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color var(--transition);
}

.search-input:focus {
  border-color: var(--color-primary);
}

.search-input::placeholder { color: var(--color-text-3); }

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-2);
  cursor: pointer;
  transition: all var(--transition);
  flex-shrink: 0;
}

.btn-icon:hover {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.host-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.empty-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  color: var(--color-text-3);
  font-size: 12px;
}

.host-group { margin-bottom: 2px; }

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  cursor: pointer;
  border-radius: 0;
  transition: background var(--transition);
}
.group-header:hover { background: var(--color-bg-3); }

.group-arrow {
  color: var(--color-text-3);
  transition: transform var(--transition);
  flex-shrink: 0;
}
.group-arrow.collapsed { transform: rotate(-90deg); }

.group-name {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  font-size: 10px;
  color: var(--color-text-3);
  background: var(--color-bg-4);
  padding: 0 5px;
  border-radius: 999px;
  min-width: 16px;
  text-align: center;
}

.group-hosts { padding: 2px 0; }

.host-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px 7px 20px;
  cursor: pointer;
  border-radius: 0;
  transition: background var(--transition);
  position: relative;
}

.host-item:hover {
  background: var(--color-bg-3);
}

.host-item.active {
  background: var(--color-primary-light);
}

.host-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 60%;
  background: var(--color-primary);
  border-radius: 0 2px 2px 0;
}

.host-item:hover .host-actions { opacity: 1; }

.host-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-border-light);
  flex-shrink: 0;
}
.host-status-dot.connected { background: var(--color-success); box-shadow: 0 0 4px var(--color-success); }
.host-status-dot.connecting { background: var(--color-warning); }

.host-info {
  flex: 1;
  min-width: 0;
}

.host-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.host-addr {
  font-size: 11px;
  color: var(--color-text-3);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.host-actions {
  opacity: 0;
  transition: opacity var(--transition);
  display: flex;
  gap: 2px;
}

.btn-icon-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-3);
  cursor: pointer;
  transition: all var(--transition);
}
.btn-icon-sm:hover {
  background: var(--color-bg-4);
  color: var(--color-text);
}

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--color-border);
}

.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 6px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-3);
  font-size: 12px;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all var(--transition);
}

.footer-btn:hover {
  background: var(--color-bg-3);
  color: var(--color-text-2);
}
</style>
