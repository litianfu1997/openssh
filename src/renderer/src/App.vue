<template>
  <div class="app-layout">
    <!-- 自定义标题栏 -->
    <TitleBar @open-settings="showSettingsDialog = true" />

    <div class="app-body">
      <!-- 左侧边栏：主机列表 -->
      <Sidebar
        :hosts="hosts"
        :active-session-id="activeSessionId"
        @connect="handleConnect"
        @open-sftp="createSftpTab"
        @manage-host="openHostDialog"
        @refresh="loadHosts"
      />

      <!-- 右侧主内容区：标签页 + 终端 -->
      <div class="main-area">
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
import { ref, onMounted } from 'vue'
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
const editingHost = ref(null)

async function loadHosts() {
  hosts.value = await window.electronAPI.hosts.getAll()
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

function closeSession(sessionId) {
  window.electronAPI.ssh.disconnect(sessionId)
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
  toClose.forEach(s => window.electronAPI.ssh.disconnect(s.id))
  sessions.value = sessions.value.filter(s => s.id === keepId)
  activeSessionId.value = keepId
}

// 重命名会话标签
function renameSession({ id, name }) {
  const session = sessions.value.find(s => s.id === id)
  if (session) session.hostName = name
}

onMounted(loadHosts)
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
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
</style>
