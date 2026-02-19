<template>
  <div class="tabbar">
    <div class="tabs-scroll">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="tab"
        :class="{ active: session.id === activeId }"
        @click="$emit('activate', session.id)"
        @contextmenu.prevent="showCtxMenu($event, session)"
      >
        <div class="tab-status">
          <span v-if="session.status === 'connecting'" class="status-dot connecting" />
          <span v-else-if="session.status === 'connected'" class="status-dot connected" />
          <span v-else class="status-dot closed" />
        </div>

        <div
          class="tab-label"
          @dblclick.stop="startRename(session)"
        >
          <!-- 编辑状态：内联 input -->
          <input
            v-if="editingId === session.id"
            ref="renameInputRef"
            v-model="editingName"
            class="tab-rename-input"
            @keydown.enter.stop="confirmRename"
            @keydown.esc.stop="cancelRename"
            @blur="confirmRename"
            @click.stop
          />
          <!-- 正常显示 -->
          <template v-else>
            <span class="tab-name">{{ session.hostName }}</span>
            <span class="tab-host">{{ session.host }}</span>
          </template>
        </div>

        <button
          class="tab-close"
          title="关闭"
          @click.stop="$emit('close', session.id)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Tab 右键菜单 -->
    <Transition name="ctx-fade">
      <div
        v-if="ctxMenu.show"
        class="ctx-menu"
        :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
        @mouseleave="ctxMenu.show = false"
      >
        <button class="ctx-item" @click="handleRename">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          {{ $t('tab.rename') }}
        </button>
        <button class="ctx-item" @click="handleDuplicate">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          {{ $t('tab.duplicate') }}
        </button>
        <div class="ctx-divider" />
        <button class="ctx-item" @click="handleCloseOthers">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
          </svg>
          {{ $t('tab.close_others') }}
        </button>
        <button class="ctx-item danger" @click="handleClose">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
          </svg>
          {{ $t('tab.close_this') }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  activeId: { type: String, default: null }
})

const emit = defineEmits(['activate', 'close', 'duplicate', 'close-others', 'rename'])

// ===== 右键菜单 =====
const ctxMenu = ref({ show: false, x: 0, y: 0, session: null })

function showCtxMenu(e, session) {
  const menuW = 160
  const x = e.clientX + menuW > window.innerWidth ? e.clientX - menuW : e.clientX
  ctxMenu.value = { show: true, x, y: e.clientY, session }
}

function handleDuplicate() {
  const s = ctxMenu.value.session
  ctxMenu.value.show = false
  if (s) emit('duplicate', s)
}

function handleClose() {
  const s = ctxMenu.value.session
  ctxMenu.value.show = false
  if (s) emit('close', s.id)
}

function handleCloseOthers() {
  const s = ctxMenu.value.session
  ctxMenu.value.show = false
  if (s) emit('close-others', s.id)
}

// ===== 重命名 =====
const editingId = ref(null)
const editingName = ref('')
const renameInputRef = ref(null)

// 从右键菜单触发重命名
function handleRename() {
  const s = ctxMenu.value.session
  ctxMenu.value.show = false
  if (s) startRename(s)
}

// 双击或右键菜单进入重命名
async function startRename(session) {
  editingId.value = session.id
  editingName.value = session.hostName
  // 等 DOM 渲染 input 后聚焦并全选
  await nextTick()
  const input = renameInputRef.value
  if (input) {
    input.focus()
    input.select()
  }
}

// 确认重命名
function confirmRename() {
  if (!editingId.value) return
  const name = editingName.value.trim()
  if (name) {
    emit('rename', { id: editingId.value, name })
  }
  editingId.value = null
  editingName.value = ''
}

// 取消重命名
function cancelRename() {
  editingId.value = null
  editingName.value = ''
}
</script>

<style scoped>
.tabbar {
  display: flex;
  align-items: stretch;
  background: var(--color-bg-2);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  height: 36px;
  overflow: hidden;
  position: relative;
}

.tabs-scroll {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  flex: 1;
}
.tabs-scroll::-webkit-scrollbar { height: 0; }

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 12px;
  border-right: 1px solid var(--color-border);
  cursor: pointer;
  min-width: 140px;
  max-width: 200px;
  position: relative;
  transition: background var(--transition);
  flex-shrink: 0;
  user-select: none;
}
.tab:hover { background: var(--color-bg-3); }
.tab.active {
  background: var(--color-bg);
  border-bottom: 2px solid var(--color-primary);
}
.tab:hover .tab-close { opacity: 1; }

.tab-status { flex-shrink: 0; }
.status-dot {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-border-light);
}
.status-dot.connecting { background: var(--color-warning); animation: pulse 1.2s infinite; }
.status-dot.connected  { background: var(--color-success); }
.status-dot.closed     { background: var(--color-danger); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.tab-label {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.tab-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tab-host {
  font-size: 10px;
  color: var(--color-text-3);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  border-radius: 3px;
  color: var(--color-text-3);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition);
}
.tab-close:hover {
  background: var(--color-danger-light);
  color: var(--color-danger);
}

/* 内联重命名输入框 */
.tab-rename-input {
  width: 100%;
  padding: 1px 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-primary);
  border-radius: 3px;
  color: var(--color-text);
  font-size: 12px;
  font-family: var(--font-sans);
  font-weight: 500;
  outline: none;
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

/* ===== 右键菜单 ===== */
.ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 150px;
  background: var(--color-bg-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 4px;
  box-shadow: var(--shadow);
  user-select: none;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 12px;
  font-family: var(--font-sans);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition);
}
.ctx-item:hover { background: var(--color-bg-4); }
.ctx-item.danger { color: var(--color-danger); }
.ctx-item.danger:hover { background: var(--color-danger-light); }

.ctx-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

.ctx-fade-enter-active, .ctx-fade-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.ctx-fade-enter-from, .ctx-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
