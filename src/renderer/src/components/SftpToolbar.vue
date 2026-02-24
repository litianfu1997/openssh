<script setup>
import { computed } from 'vue'
import { FolderPlus, Upload, Download, Trash2, RefreshCw, Eye, Star, Search } from 'lucide-vue-next'

const props = defineProps({
  selectedCount: {
    type: Number,
    default: 0
  },
  bookmarks: {
    type: Array,
    default: () => []
  },
  currentPath: {
    type: String,
    default: ''
  }
})

const emit = defineEmits([
  'upload',
  'download',
  'delete',
  'mkdir',
  'refresh',
  'toggle-preview',
  'add-bookmark',
  'remove-bookmark',
  'edit-bookmark',
  'navigate'
])

import { ref, onMounted, onUnmounted } from 'vue'

const showBookmarkMenu = ref(false)

const toggleBookmarkMenu = () => {
  showBookmarkMenu.value = !showBookmarkMenu.value
}

const searchQuery = ref('')

const filteredBookmarks = computed(() => {
  if (!searchQuery.value) return props.bookmarks
  const lower = searchQuery.value.toLowerCase()
  return props.bookmarks.filter(b => 
    b.name.toLowerCase().includes(lower) || 
    b.path.toLowerCase().includes(lower)
  )
})

const closeBookmarkMenu = () => {
  showBookmarkMenu.value = false
  searchQuery.value = ''
}

const handleNavigate = (path) => {
  emit('navigate', path)
  closeBookmarkMenu()
}

const editingBookmarkPath = ref(null)
const editingBookmarkName = ref('')
const bmInputRef = ref(null)

const startEdit = (bk) => {
  editingBookmarkPath.value = bk.path
  editingBookmarkName.value = bk.name
  // Using setTimeout to wait for v-if DOM update to focus input
  setTimeout(() => {
    if (bmInputRef.value && bmInputRef.value[0]) {
      bmInputRef.value[0].focus()
      bmInputRef.value[0].select()
    } else if (bmInputRef.value) {
      bmInputRef.value.focus()
      bmInputRef.value.select()
    }
  }, 50)
}

const confirmEdit = () => {
  if (editingBookmarkPath.value) {
    if (editingBookmarkName.value.trim() !== '') {
      emit('edit-bookmark', { path: editingBookmarkPath.value, name: editingBookmarkName.value.trim() })
    }
    editingBookmarkPath.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', closeBookmarkMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', closeBookmarkMenu)
})


</script>

<template>
  <div class="sftp-toolbar">
    <div class="toolbar-group">
      <button class="tool-btn" @click="emit('mkdir')" title="新建文件夹">
        <FolderPlus :size="14" />
        <span>新建文件夹</span>
      </button>
      <button class="tool-btn" @click="emit('upload')" title="上传">
        <Upload :size="14" />
        <span>上传</span>
      </button>
      <button class="tool-btn" @click="emit('download')" :disabled="selectedCount === 0" title="下载所选">
        <Download :size="14" />
        <span>下载</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="tool-btn danger" @click="emit('delete')" :disabled="selectedCount === 0" title="删除所选">
        <Trash2 :size="14" />
        <span>删除</span>
      </button>
      <button class="tool-btn" @click="emit('refresh')" title="刷新当前目录">
        <RefreshCw :size="14" />
        <span>刷新</span>
      </button>
      <button class="tool-btn" @click="emit('toggle-preview')" :disabled="selectedCount !== 1" title="预览所选文件">
        <Eye :size="14" />
        <span>预览</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group bm-group">
      <button class="tool-btn" @click="emit('add-bookmark')" title="收藏当前路径">
        <Star :size="14" :fill="bookmarks.some(b => b.path === currentPath) ? 'currentColor' : 'none'" />
        <span>收藏</span>
      </button>
      <button class="tool-btn bm-dropdown-btn" @click.stop="toggleBookmarkMenu" title="查看收藏夹">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>

      <!-- 收藏夹下拉菜单 -->
      <Transition name="fade">
        <div v-if="showBookmarkMenu" class="bookmark-menu" @click.stop>
          <div class="bm-header">我的收藏</div>
          <div class="bm-search-wrap">
            <Search :size="13" class="bm-search-icon" />
            <input type="text" v-model="searchQuery" placeholder="搜索备注或路径..." class="bm-search-input" />
          </div>
          
          <div v-if="bookmarks.length === 0" class="bm-empty">暂无收藏路径</div>
          <div v-else-if="filteredBookmarks.length === 0" class="bm-empty">未找到匹配项</div>
          <div v-else class="bm-list">
            <div v-for="bk in filteredBookmarks" :key="bk.path" class="bm-item" @click="handleNavigate(bk.path)">
              <div class="bm-info">
                <input 
                  v-if="editingBookmarkPath === bk.path"
                  ref="bmInputRef"
                  v-model="editingBookmarkName"
                  class="bm-rename-input"
                  @click.stop
                  @keydown.enter.stop="confirmEdit"
                  @keydown.esc.stop="editingBookmarkPath = null"
                  @blur="confirmEdit"
                />
                <template v-else>
                  <span class="bm-name" :title="bk.name">{{ bk.name }}</span>
                  <span class="bm-path" :title="bk.path">{{ bk.path }}</span>
                </template>
              </div>
              <div class="bm-actions" v-if="editingBookmarkPath !== bk.path">
                <button class="bm-act-btn" @click.stop="startEdit(bk)" title="修改备注">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="bm-act-btn bm-act-danger" @click.stop="emit('remove-bookmark', bk.path)" title="取消收藏">
                   <Trash2 :size="12" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.sftp-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary, #131825);
  border-bottom: 1px solid var(--border-color, #2a3347);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background: var(--border-color, #2a3347);
  margin: 0 4px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-color, #e2e8f0);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.tool-btn span {
  white-space: nowrap;
}

/* Hover & Active Effects */
.tool-btn:hover:not(:disabled) {
  background: var(--hover-bg, rgba(255,255,255,0.08));
  border-color: rgba(255,255,255,0.1);
  transform: translateY(-1px);
}

.tool-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
}

/* Disabled State */
.tool-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(100%);
}

/* Danger Button Specific */
.tool-btn.danger:hover:not(:disabled) {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.2);
}

/* ===== 书签菜单 ===== */
.bm-group {
  position: relative;
}

.bm-dropdown-btn {
  padding: 6px 4px;
}

.bookmark-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  width: 260px;
  background: var(--color-bg-3, #1e2535);
  border: 1px solid var(--border-color, #2a3347);
  border-radius: 6px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.bm-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #94a3b8);
  border-bottom: 1px solid var(--border-color, #2a3347);
  background: var(--color-bg-2, #161b27);
  border-radius: 6px 6px 0 0;
}

.bm-search-wrap {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color, #2a3347);
  background: var(--color-bg-2);
}

.bm-search-icon {
  color: var(--text-secondary);
  margin-right: 6px;
}

.bm-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 12px;
  color: var(--text-color);
  font-family: inherit;
}

.bm-search-input::placeholder {
  color: var(--text-secondary, #64748b);
  opacity: 0.6;
}

.bm-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary, #64748b);
  font-size: 12px;
}

.bm-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
}

.bm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.bm-item:hover {
  background: var(--hover-bg, rgba(255,255,255,0.05));
}

.bm-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}

.bm-name {
  font-size: 13px;
  color: var(--text-color);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-path {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-rename-input {
  width: 100%;
  padding: 2px 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-primary);
  border-radius: 3px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
  outline: none;
}

.bm-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.bm-item:hover .bm-actions {
  opacity: 1;
}

.bm-act-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bm-act-btn:hover {
  background: var(--color-border);
  color: var(--text-color);
}

.bm-act-danger:hover {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
