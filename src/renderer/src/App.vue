<template>
  <div class="app-layout" :class="{ 'mobile-platform': isMobilePlatform }">
    <!-- 自定义标题栏 -->
    <TitleBar 
      :show-menu-btn="!isMobilePlatform || !!activeSessionId"
      @open-settings="showSettingsDialog = true" 
      @toggle-sidebar="mobileSidebarOpen = !mobileSidebarOpen" 
    />

    <div class="app-body">
      <!-- 左侧边栏：主机列表 -->
      <div 
        v-if="!isMobilePlatform || (isMobilePlatform && activeSessionId)"
        class="mobile-sidebar-overlay" 
        :class="{ show: mobileSidebarOpen }" 
        @click="mobileSidebarOpen = false"
      ></div>
      <Sidebar
        v-show="!isMobilePlatform || !activeSessionId || mobileSidebarOpen"
        class="adaptive-sidebar"
        :class="{ 
          'mobile-drawer': isMobilePlatform && activeSessionId,
          'mobile-open': mobileSidebarOpen, 
          'mobile-full': isMobilePlatform && !activeSessionId 
        }"
        :hosts="hosts"
        :active-session-id="activeSessionId"
        :sessions="sessions"
        :ping-statuses="pingStatuses"
        @connect="handleConnect($event); mobileSidebarOpen = false"
        @open-sftp="createSftpTab($event); mobileSidebarOpen = false"
        @manage-host="openHostDialog"
        @refresh="loadHosts"
      />
      <!-- 右侧主内容区：标签页 + 终端 -->
      <div class="main-area" v-show="!isMobilePlatform || activeSessionId">
        <!-- 空状态 -->
        <WelcomeScreen
          v-if="sessions.length === 0"
          @new-host="openHostDialog(null)"
        />

        <!-- 标签页 -->
        <template v-else>
          <TabBar
            :sessions="sessions"
            :active-id="activeSessionId"
            @activate="activeSessionId = $event"
            @close="closeSession"
            @duplicate="duplicateSession"
            @close-others="closeOtherSessions"
            @rename="renameSession"
            @open-sftp-cwd="handleOpenSftpCwd"
          />

          <div class="terminals-wrap">
            <TerminalPane
              v-for="session in sessions"
              :key="session.id"
              :session="session"
              :visible="session.id === activeSessionId && session.type === TAB_TYPES.TERMINAL"
            />
            <SftpPane
              v-for="session in sessions"
              :key="session.id"
              :session="session"
              :visible="session.id === activeSessionId && session.type === TAB_TYPES.SFTP"
              v-show="session.id === activeSessionId && session.type === TAB_TYPES.SFTP"
            />
          </div>
        </template>
      </div>
    </div>

    <!-- 添加/编辑主机对话框 -->
    <HostDialog
      v-if="showHostDialog"
      :host="editingHost"
      @close="showHostDialog = false"
      @saved="onHostSaved"
    />

    <SettingsDialog
      v-if="showSettingsDialog"
      v-model:visible="showSettingsDialog"
    />
  </div>
</template>

<script setup>
import { sshAPI, hostsAPI, sftpAPI } from '@/api/tauri-bridge'
import { platform } from '@tauri-apps/plugin-os'
import { ref, onMounted, onUnmounted } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import TabBar from './components/TabBar.vue'
import TerminalPane from './components/TerminalPane.vue'
import SftpPane from './components/SftpPane.vue'
import WelcomeScreen from './components/WelcomeScreen.vue'
import HostDialog from './components/HostDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'

// 标签类型
const TAB_TYPES = {
  TERMINAL: 'terminal',
  SFTP: 'sftp'
}

const hosts = ref([])
const sessions = ref([]) 
const activeSessionId = ref(null)
const showHostDialog = ref(false)
const showSettingsDialog = ref(false)
const mobileSidebarOpen = ref(false)
const isMobilePlatform = ref(false)
const editingHost = ref(null)
const pingStatuses = ref({})

function checkAllHosts() {
  console.log('Starting checkAllHosts for', hosts.value.length, 'hosts')
  for (const host of hosts.value) {
    pingStatuses.value[host.id] = 'checking'
  }
  Promise.allSettled(hosts.value.map(async host => {
    try {
      const plainHost = JSON.parse(JSON.stringify(host))
      const res = await sshAPI.test(plainHost)
      
      pingStatuses.value[host.id] = res.success ? 'success' : 'error'
    } catch (e) {
      console.error('Test error for', host.name, e)
      pingStatuses.value[host.id] = 'error'
    }
  }))
}

async function loadHosts() {
  hosts.value = await hostsAPI.getAll()
  checkAllHosts()
}

function openHostDialog(host) {
  editingHost.value = host || null
  showHostDialog.value = true
}

async function onHostSaved() {
  showHostDialog.value = false
  await loadHosts()
}

async function handleConnect(host) {
  const sessionId = uuidv4()
  sessions.value.push({
    id: sessionId,
    type: TAB_TYPES.TERMINAL,
    hostId: host.id,
    hostName: host.name,
    host: `${host.username}@${host.host}:${host.port}`,
    status: 'connecting'
  })
  activeSessionId.value = sessionId
}

// 创建 SFTP 标签
async function createSftpTab(host) {
  const sessionId = uuidv4()
  sessions.value.push({
    id: sessionId,
    type: TAB_TYPES.SFTP,
    hostId: host.id,
    hostName: `${host.name} SFTP`,
    host: `${host.username}@${host.host}:${host.port}`,
    status: 'connecting'
  })
  activeSessionId.value = sessionId
}

// 在指定路径打开 SFTP
async function handleOpenSftpCwd(session) {
  const host = hosts.value.find(h => h.id === session.hostId)
  if (!host) return
  
  const sessionId = uuidv4()
  sessions.value.push({
    id: sessionId,
    type: TAB_TYPES.SFTP,
    hostId: host.id,
    hostName: `${host.name} SFTP`,
    host: `${host.username}@${host.host}:${host.port}`,
    status: 'connecting',
    initialCwd: session.cwd
  })
  activeSessionId.value = sessionId
}

function closeSession(sessionId) {
  const session = sessions.value.find(s => s.id === sessionId)
  if (session) {
    // 根据会话类型调用对应的断开方法
    if (session.type === TAB_TYPES.SFTP) {
      sftpAPI.disconnect(sessionId)
    } else {
      sshAPI.disconnect(sessionId)
    }
  }
  const idx = sessions.value.findIndex(s => s.id === sessionId)
  if (idx > -1) {
    sessions.value.splice(idx, 1)
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessions.value[Math.max(0, idx - 1)]?.id || null
    }
  }
}

// 复制会话：对同一台主机新开一个连接
function duplicateSession(session) {
  const sessionId = uuidv4()
  sessions.value.push({
    id: sessionId,
    type: session.type || TAB_TYPES.TERMINAL,
    hostId: session.hostId,
    hostName: session.hostName,
    host: session.host,
    status: 'connecting'
  })
  activeSessionId.value = sessionId
}

// 关闭其他标签（保留指定 sessionId 的标签）
function closeOtherSessions(keepId) {
  const toClose = sessions.value.filter(s => s.id !== keepId)
  toClose.forEach(s => sshAPI.disconnect(s.id))
  sessions.value = sessions.value.filter(s => s.id === keepId)
  activeSessionId.value = keepId
}

// 重命名会话标签
function renameSession({ id, name }) {
  const session = sessions.value.find(s => s.id === id)
  if (session) session.hostName = name
}

onMounted(async () => {
  const p = await platform()
  isMobilePlatform.value = p === 'android' || p === 'ios'
  loadHosts()

  if (isMobilePlatform.value) {
    // 监听窗口大小变化以计算移动端软键盘高度
    // 初始记录完整高度
    const initialHeight = window.innerHeight
    window.addEventListener('resize', () => {
      const currentHeight = window.innerHeight
      if (currentHeight < initialHeight) {
        // 键盘弹起
        const keyboardHeight = initialHeight - currentHeight
        document.documentElement.style.setProperty('--keyboard-inset', `${keyboardHeight}px`)
      } else {
        // 键盘收起
        document.documentElement.style.setProperty('--keyboard-inset', '0px')
      }
    })
  }
})

onUnmounted(() => {
})
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-layout.mobile-platform {
  padding-bottom: calc(env(safe-area-inset-bottom) + var(--keyboard-inset, 0px));
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
}

.terminals-wrap {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.mobile-sidebar-overlay {
  display: none;
}

.app-layout.mobile-platform .adaptive-sidebar.mobile-drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 100;
  width: min(84vw, 320px);
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.35);
  transform: translateX(-100%);
  transition: transform 0.3s ease;
  will-change: transform;
  height: 100%;
}

.app-layout.mobile-platform .adaptive-sidebar.mobile-drawer.mobile-open {
  transform: translateX(0);
}

.app-layout.mobile-platform .mobile-sidebar-overlay {
  display: block;
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 99;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.app-layout.mobile-platform .mobile-sidebar-overlay.show {
  opacity: 1;
  pointer-events: auto;
}

.app-layout.mobile-platform .adaptive-sidebar.mobile-full {
  position: static;
  width: 100%;
  transform: none;
  box-shadow: none;
  flex: 1;
}

@media (max-width: 768px) {
  .adaptive-sidebar {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    will-change: transform;
    height: 100%;
  }

  .adaptive-sidebar.mobile-open {
    transform: translateX(0);
  }

  .mobile-sidebar-overlay {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
  }

  .mobile-sidebar-overlay.show {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
