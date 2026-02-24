<script setup>
import { ref, computed } from 'vue'
import FileIcon from './FileIcon.vue'

const props = defineProps({
  files: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'dblclick', 'delete', 'rename', 'download', 'preview', 'context-action', 'edit-file'])

// ---- 选中状态 ----
const selectedIndices = ref([])   // 用数组替代 Set，方便响应式

const selectedSet = computed(() => new Set(selectedIndices.value))

const sortedFiles = computed(() => {
  return [...props.files].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1
    if (a.type !== 'directory' && b.type === 'directory') return 1
    return a.name.localeCompare(b.name)
  })
})

const selectedFileObjects = computed(() =>
  selectedIndices.value.map(i => sortedFiles.value[i]).filter(Boolean)
)

const toggleSelect = (index, event) => {
  if (event.ctrlKey || event.metaKey) {
    if (selectedSet.value.has(index)) {
      selectedIndices.value = selectedIndices.value.filter(i => i !== index)
    } else {
      selectedIndices.value = [...selectedIndices.value, index]
    }
  } else if (event.shiftKey && selectedIndices.value.length > 0) {
    const last = selectedIndices.value[selectedIndices.value.length - 1]
    const start = Math.min(last, index)
    const end = Math.max(last, index)
    const range = []
    for (let i = start; i <= end; i++) range.push(i)
    selectedIndices.value = [...new Set([...selectedIndices.value, ...range])]
  } else {
    selectedIndices.value = [index]
  }
  emit('select', selectedFileObjects.value)
}

const clearSelection = (event) => {
  if (event.target === event.currentTarget) {
    selectedIndices.value = []
    emit('select', [])
  }
}

const handleDblClick = (file) => {
  emit('dblclick', file)
}

// ---- 右键菜单 ----
const ctxMenu = ref({ show: false, x: 0, y: 0, file: null, index: -1 })

const showContextMenu = (event, file, index) => {
  // 如果右键的文件没有被选中，则切换选中到它
  if (!selectedSet.value.has(index)) {
    selectedIndices.value = [index]
    emit('select', [file])
  }
  const menuW = 180
  const menuH = 200
  const x = event.clientX + menuW > window.innerWidth ? event.clientX - menuW : event.clientX
  const y = event.clientY + menuH > window.innerHeight ? event.clientY - menuH : event.clientY
  ctxMenu.value = { show: true, x, y, file, index }
  // 点击其他地方关闭菜单
  setTimeout(() => window.addEventListener('click', closeCtxMenu, { once: true }), 0)
}

const closeCtxMenu = () => {
  ctxMenu.value.show = false
}

const ctxDownload = () => {
  closeCtxMenu()
  emit('download', selectedFileObjects.value)
}

const ctxDelete = () => {
  closeCtxMenu()
  emit('delete', selectedFileObjects.value)
}

const ctxRename = () => {
  const file = ctxMenu.value.file
  closeCtxMenu()
  if (file) emit('rename', file)
}

const ctxPreview = () => {
  const file = ctxMenu.value.file
  closeCtxMenu()
  if (file) emit('preview', file)
}

const ctxEditFile = () => {
  const file = ctxMenu.value.file
  closeCtxMenu()
  if (file) emit('edit-file', file)
}

// ---- 格式化 ----
const formatSize = (bytes) => {
  if (bytes == null || bytes === '') return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

const formatDate = (timestamp) => {
  if (!timestamp) return '-'
  const d = new Date(timestamp)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<template>
  <div class="sftp-file-list" @click="clearSelection">
    <!-- 表头 -->
    <div class="file-header">
      <span class="col-icon"></span>
      <span class="col-name">{{ $t('sftp.name') }}</span>
      <span class="col-size">{{ $t('sftp.file_size') }}</span>
      <span class="col-date">{{ $t('sftp.modified') }}</span>
    </div>

    <div v-if="loading" class="state-msg">
      <svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      {{ $t('sftp.loading') }}
    </div>
    <div v-else-if="sortedFiles.length === 0" class="state-msg">{{ $t('sftp.empty_directory') }}</div>

    <div v-else class="file-list-body">
      <div
        v-for="(file, index) in sortedFiles"
        :key="file.name"
        class="file-item"
        :class="{ 'is-selected': selectedSet.has(index) }"
        @click.stop="toggleSelect(index, $event)"
        @dblclick="handleDblClick(file)"
        @contextmenu.prevent.stop="showContextMenu($event, file, index)"
      >
        <FileIcon :name="file.name" :is-directory="file.type === 'directory'" :size="16" class="col-icon" />
        <span class="col-name file-name-text">{{ file.name }}</span>
        <span class="col-size text-muted">{{ file.type === 'directory' ? '' : formatSize(file.size) }}</span>
        <span class="col-date text-muted">{{ formatDate(file.mtime) }}</span>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.show"
        class="ctx-menu"
        :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
        @click.stop
      >
        <button class="ctx-item" @click="ctxPreview" :disabled="ctxMenu.file?.type === 'directory'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          {{ $t('sftp.preview') }}
        </button>
        <button class="ctx-item ctx-vscode" @click="ctxEditFile" :disabled="ctxMenu.file?.type === 'directory'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          {{ $t('sftp.edit_file') }}
        </button>
        <button class="ctx-item" @click="ctxDownload" :disabled="ctxMenu.file?.type === 'directory'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ $t('sftp.download') }}
        </button>
        <button class="ctx-item" @click="ctxRename">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          {{ $t('sftp.rename') }}
        </button>
        <div class="ctx-divider"></div>
        <button class="ctx-item ctx-danger" @click="ctxDelete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          {{ $t('sftp.delete') }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sftp-file-list {
  flex: 1;
  overflow: auto;
  background: var(--bg-color);
  display: flex;
  flex-direction: column;
  user-select: none;
}

.file-header {
  display: grid;
  grid-template-columns: 28px 1fr 90px 175px;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-color, #2a2f3e);
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  font-weight: 600;
  letter-spacing: 0.04em;
  position: sticky;
  top: 0;
  background: var(--bg-color);
  z-index: 1;
}

.file-list-body {
  flex: 1;
  padding: 4px 0;
}

.state-msg {
  padding: 48px;
  text-align: center;
  color: var(--text-secondary, #6b7280);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.file-item {
  display: grid;
  grid-template-columns: 28px 1fr 90px 175px;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  align-items: center;
  font-size: 13px;
  transition: background 0.1s;
}

.file-item:hover {
  background: var(--hover-bg, rgba(255,255,255,0.05));
}

.file-item.is-selected {
  background: var(--selection-bg, rgba(79, 142, 247, 0.15));
  color: var(--selection-text, inherit);
}

.file-item.is-selected:hover {
  background: var(--selection-bg, rgba(79, 142, 247, 0.2));
}

.col-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}
.col-name { overflow: hidden; }
.col-size { text-align: right; }
.col-date { text-align: right; }

.file-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-muted {
  color: var(--text-secondary, #6b7280);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.spin {
  animation: spin 1s linear infinite;
  color: var(--text-secondary, #6b7280);
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>

<!-- Right-click menu is teleported to body, so not scoped -->
<style>
.ctx-menu {
  position: fixed;
  z-index: 99999;
  min-width: 160px;
  background: var(--color-bg-3, #1e2535);
  border: 1px solid var(--color-border, #2a3347);
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  animation: ctx-pop 0.1s ease;
}
@keyframes ctx-pop {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--color-text, #e2e8f0);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.ctx-item:hover:not(:disabled) { background: var(--color-bg-4, #2a3347); }
.ctx-item:disabled { opacity: 0.4; cursor: not-allowed; }
.ctx-item.ctx-danger { color: #f87171; }
.ctx-item.ctx-danger:hover { background: rgba(248, 113, 113, 0.12); }
.ctx-item.ctx-vscode { color: #4fc3f7; }
.ctx-item.ctx-vscode:hover:not(:disabled) { background: rgba(79, 195, 247, 0.1); }
.ctx-divider {
  height: 1px;
  background: var(--color-border, #2a3347);
  margin: 4px 0;
}
</style>
