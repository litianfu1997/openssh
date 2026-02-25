<script setup>
import { sftpAPI, dialogAPI, sshAPI } from '@/api/tauri-bridge'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import SftpToolbar from './SftpToolbar.vue'
import SftpTree from './SftpTree.vue'
import SftpBreadcrumb from './SftpBreadcrumb.vue'
import SftpFileList from './SftpFileList.vue'
import SftpPreview from './SftpPreview.vue'
import SftpEditor from './SftpEditor.vue'
import TransferQueue from './TransferQueue.vue'

// Props
const props = defineProps({
  session: {
    type: Object,
    required: true
  },
  visible: {
    type: Boolean,
    default: false
  }
})

// 状�?
const currentPath = ref('.')
const absoluteHomePath = ref('/')
const fileList = ref([])
const treeData = ref([])
const selectedFiles = ref([])
const previewFile = ref(null)
const bookmarks = ref([])
const transfers = ref([])
const isTreeLoading = ref(false)
const isListLoading = ref(false)
const isInitialLoading = ref(true)
const showPreview = ref(false)
const editingFile = ref(null)
const toast = ref(null)  // { message, type: 'success'|'error' }
let toastTimer = null
let unlistenUploadProgress = null   // Tauri 事件取消订阅函数
let unlistenDownloadProgress = null // Tauri 事件取消订阅函数

// 计算属�?
const selectedCount = computed(() => selectedFiles.value.length)

// 方法
const loadDirectory = async (path) => {
  isListLoading.value = true
  try {
    const result = await sftpAPI.ls(props.session.id, path || '.')
    fileList.value = result
    if (path) currentPath.value = path
  } catch (error) {
    console.error('Failed to load directory:', error)
  } finally {
    isListLoading.value = false
  }
}

const loadTree = async () => {
  isTreeLoading.value = true
  try {
    const rootPath = absoluteHomePath.value === '/' && currentPath.value === '.' ? '.' : absoluteHomePath.value
    const result = await sftpAPI.ls(props.session.id, rootPath)
    treeData.value = result.filter(f => f.name !== '.' && f.name !== '..').map(f => ({ ...f, path: rootPath === '/' ? '/' + f.name : rootPath + '/' + f.name }))
  } catch (error) {
    console.error('Failed to load tree:', error)
  } finally {
    isTreeLoading.value = false
  }
}

const handleLoadChildren = async (node) => {
  if (node.children && node.children.length > 0) return
  if (node.type !== 'directory') return
  
  node.isLoading = true
  try {
    const result = await sftpAPI.ls(props.session.id, node.path)
    node.children = result.filter(f => f.name !== '.' && f.name !== '..').map(f => ({
      ...f,
      path: node.path === '/' ? `/${f.name}` : `${node.path}/${f.name}`,
    }))
  } catch (error) {
    console.error('Failed to load sub-directory:', error)
  } finally {
    node.isLoading = false
  }
}

const refresh = () => {
  if (props.session.status !== 'connected') {
    loadInitialData()
  } else {
    loadDirectory(currentPath.value)
    loadTree()
  }
}

const handleFilesSelect = (files) => {
  selectedFiles.value = files
}

const handleFileDblClick = async (file) => {
  if (file.type === 'directory') {
    const newPath = currentPath.value === '/' ? `/${file.name}` : (currentPath.value === '.' ? file.name : `${currentPath.value}/${file.name}`)
    await loadDirectory(newPath)
    selectedFiles.value = []
  } else {
    previewFile.value = file
    showPreview.value = true
  }
}

const handleTreeNavigate = (path) => {
  loadDirectory(path)
}

const handleBreadcrumbNavigate = (path) => {
  loadDirectory(path)
}

const handleUpload = async () => {
  let result
  try {
    result = await dialogAPI.showOpenDialog({
      properties: ['openFile', 'multiSelections']
    })
  } catch (e) {
    // 用户取消对话框时 Tauri 可能抛出异常，安全处理
    console.warn('Upload dialog error:', e)
    return
  }

  if (!result.canceled && result.filePaths.length > 0) {
    for (const localPath of result.filePaths) {
      const fileName = localPath.split(/[/\\]/).pop()
      const remotePath = currentPath.value === '/' ? `/${fileName}` : (currentPath.value === '.' ? `./${fileName}` : `${currentPath.value}/${fileName}`)

      const transferId = Date.now().toString() + Math.random().toString().slice(2)
      transfers.value.push({
        id: transferId,
        fileName,
        type: 'upload',
        progress: 0,
        speed: 0,
        paused: false
      })

      try {
        await sftpAPI.upload(props.session.id, transferId, localPath, remotePath)
        refresh()
      } catch (error) {
        if (String(error).includes('Cancelled')) {
          showToast(`文件 ${fileName} 上传已取消`, 'info')
        } else {
          console.error('Upload failed:', error)
          showToast(`文件 ${fileName} 上传失败`, 'error')
        }
      } finally {
        const index = transfers.value.findIndex(t => t.id === transferId)
        if (index > -1) transfers.value.splice(index, 1)
      }
    }
  }
}


const handleDownload = async () => {
  for (const file of selectedFiles.value) {
    if (file.type === 'directory') continue

    try {
      const result = await dialogAPI.showSaveDialog({
        defaultPath: file.name
      })

      if (!result.canceled) {
        const transferId = Date.now().toString() + Math.random().toString().slice(2)
        transfers.value.push({
          id: transferId,
          fileName: file.name,
          type: 'download',
          progress: 0,
          speed: 0,
          paused: false
        })

        try {
          const remotePath = currentPath.value === '/' ? `/${file.name}` : (currentPath.value === '.' ? file.name : `${currentPath.value}/${file.name}`)
          await sftpAPI.download(props.session.id, transferId, remotePath, result.filePath)
        } catch (error) {
          if (String(error).includes('Cancelled')) {
            showToast(`文件 ${file.name} 下载已取消`, 'info')
          } else {
            console.error('Download failed:', error)
            showToast(`文件 ${file.name} 下载失败`, 'error')
          }
        } finally {
          const index = transfers.value.findIndex(t => t.id === transferId)
          if (index > -1) transfers.value.splice(index, 1)
        }
      }
    } catch (e) {
      // 捕获对话框本身可能抛出的任何意外异常（如用户取消）
      console.warn('Download dialog error for', file.name, e)
    }
  }
}

const handleDelete = async (files) => {
  const targets = files && files.length ? files : selectedFiles.value
  if (!targets.length) return
  if (!confirm(`确定要删�?${targets.length} 个项目吗？`)) return

  for (const file of targets) {
    try {
      const path = currentPath.value === '/' ? `/${file.name}` : (currentPath.value === '.' ? file.name : `${currentPath.value}/${file.name}`)
      await sftpAPI.delete(props.session.id, path)
    } catch (error) {
      console.error('Delete failed:', error)
    }
  }
  selectedFiles.value = []
  refresh()
}

const handleMkdir = async () => {
  const name = prompt('请输入文件夹名称:')
  if (!name) return

  try {
    const path = currentPath.value === '/' ? `/${name}` : (currentPath.value === '.' ? name : `${currentPath.value}/${name}`)
    await sftpAPI.mkdir(props.session.id, path)
    refresh()
  } catch (error) {
    console.error('Mkdir failed:', error)
    alert('创建文件夹失败: ' + error.message)
  }
}

const handleTogglePreview = () => {
  showPreview.value = !showPreview.value
  if (!showPreview.value) {
    previewFile.value = null
  } else if (!previewFile.value && selectedFiles.value.length === 1) {
    previewFile.value = selectedFiles.value[0]
  }
}

const getBookmarksKey = () => `sftp-bookmarks-${props.session.hostId}`

const loadBookmarks = () => {
  try {
    const saved = localStorage.getItem(getBookmarksKey())
    if (saved) bookmarks.value = JSON.parse(saved)
  } catch (e) {
    console.error('Failed to load bookmarks', e)
  }
}

const saveBookmarks = () => {
  localStorage.setItem(getBookmarksKey(), JSON.stringify(bookmarks.value))
}

const handleAddBookmark = () => {
  const existing = bookmarks.value.find(b => b.path === currentPath.value)
  if (existing) {
    showToast('当前路径已在收藏夹', 'info')
    return
  }
  
  const defaultName = currentPath.value.split('/').pop() || '/'
  
  bookmarks.value.push({
    name: defaultName,
    path: currentPath.value
  })
  saveBookmarks()
  showToast('添至收藏成功', 'success')
}

const handleRemoveBookmark = (path) => {
  bookmarks.value = bookmarks.value.filter(b => b.path !== path)
  saveBookmarks()
}

const handleEditBookmark = ({ path, name }) => {
  const bk = bookmarks.value.find(b => b.path === path)
  if(!bk) return
  if(name && name.trim() !== '') {
    bk.name = name.trim()
    saveBookmarks()
  }
}

const handleRename = async (file) => {
  const oldName = file.name
  const newName = prompt('请输入新名称:', oldName)
  if (!newName || newName === oldName) return
  const oldPath = currentPath.value === '/' ? `/${oldName}` : (currentPath.value === '.' ? oldName : `${currentPath.value}/${oldName}`)
  const newPath = currentPath.value === '/' ? `/${newName}` : (currentPath.value === '.' ? newName : `${currentPath.value}/${newName}`)
  try {
    await sftpAPI.rename(props.session.id, oldPath, newPath)
    refresh()
  } catch (error) {
    console.error('Rename failed:', error)
    alert('重命名失败: ' + error.message)
  }
}

const handleEditFile = (file) => {
  if (file.type === 'directory') return
  editingFile.value = file
}

const onEditorSaved = async (file) => {
  showToast(`�?${file.name} 已保存到服务器`, 'success')
  await loadDirectory(currentPath.value) // 仅刷新当前目录结构，而不是刷新整棵树
}

const showToast = (message, type = 'success') => {
  clearTimeout(toastTimer)
  toast.value = { message, type }
  toastTimer = setTimeout(() => { toast.value = null }, 3500)
}

const handlePauseTransfer = async (transferId) => {
  const t = transfers.value.find(x => x.id === transferId)
  if (t) {
    t.paused = true
    t.speed = 0
    await sftpAPI.pause(transferId)
  }
}

const handleResumeTransfer = async (transferId) => {
  const t = transfers.value.find(x => x.id === transferId)
  if (t) {
    t.paused = false
    await sftpAPI.resume(transferId)
  }
}

const handleCancelTransfer = async (transferId) => {
  const index = transfers.value.findIndex(t => t.id === transferId)
  if (index > -1) {
    await sftpAPI.cancel(transferId)
    // 触发 rejected callback, transfers 从那里自动移�?
  }
}

const handlePreview = (file) => {
  previewFile.value = file
  showPreview.value = true
}

const loadInitialData = async () => {
  isInitialLoading.value = true

  if (props.session.status !== 'connected') {
    try {
      props.session.status = 'connecting'
      await sshAPI.connect(props.session.id, props.session.hostId)
      await sftpAPI.connect(props.session.id, props.session.hostId)
      props.session.status = 'connected'
    } catch (e) {
      console.error('SFTP connect failed:', e)
      props.session.status = 'error'
      isInitialLoading.value = false
      return
    }
  }

  try {
    // 获取家目录路径
    const homeAbs = await sftpAPI.realpath(props.session.id, '.')
    if (homeAbs) absoluteHomePath.value = homeAbs

    // 解析目标路径
    let targetPath = props.session.initialCwd || '.'
    if (targetPath.startsWith('~')) {
      targetPath = targetPath.replace(/^~/, homeAbs || '.')
    }

    const absPath = await sftpAPI.realpath(props.session.id, targetPath)
    if (absPath) {
      currentPath.value = absPath
    } else {
      currentPath.value = targetPath
    }
  } catch (e) {
    console.error('Failed to resolve paths', e)
  }

  // 加载目录和树
  await Promise.all([loadDirectory(currentPath.value), loadTree()])
  isInitialLoading.value = false
}

// 生命周期
onMounted(() => {
  loadBookmarks()
  loadInitialData()

  // Tauri listen 返回 Promise<UnlistenFn>，保存取消订阅函数
  sftpAPI.onUploadProgress(({ sessionId, remotePath, bytesTransferred, totalBytes, speed }) => {
    if (sessionId !== props.session.id) return
    const fileName = remotePath.split('/').pop()
    const transfer = transfers.value.find(t => t.fileName === fileName && t.type === 'upload')
    if (transfer && totalBytes > 0 && !transfer.paused) {
      transfer.progress = Math.round((bytesTransferred / totalBytes) * 100)
      if (speed !== undefined) transfer.speed = speed
    }
  }).then((unlisten) => {
    unlistenUploadProgress = unlisten
  })

  sftpAPI.onDownloadProgress(({ sessionId, remotePath, bytesTransferred, totalBytes, speed }) => {
    if (sessionId !== props.session.id) return
    const fileName = remotePath.split('/').pop()
    const transfer = transfers.value.find(t => t.fileName === fileName && t.type === 'download')
    if (transfer && totalBytes > 0 && !transfer.paused) {
      transfer.progress = Math.round((bytesTransferred / totalBytes) * 100)
      if (speed !== undefined) transfer.speed = speed
    }
  }).then((unlisten) => {
    unlistenDownloadProgress = unlisten
  })
})

onUnmounted(() => {
  // 调用 Tauri 返回的取消订阅函数
  unlistenUploadProgress?.()
  unlistenDownloadProgress?.()
  sshAPI.disconnect(props.session.id)
})
</script>

<template>
  <div class="sftp-pane">
    <!-- 初始加载遮罩层 -->
    <div v-if="isInitialLoading" class="initial-loading-overlay">
      <div class="loading-box">
        <div class="spinner" />
        <div class="loading-text">正在连接 SFTP...</div>
      </div>
    </div>

    <SftpToolbar
      :selected-count="selectedCount"
      :bookmarks="bookmarks"
      :current-path="currentPath"
      @upload="handleUpload"
      @download="handleDownload"
      @delete="handleDelete"
      @mkdir="handleMkdir"
      @refresh="refresh"
      @toggle-preview="handleTogglePreview"
      @add-bookmark="handleAddBookmark"
      @remove-bookmark="handleRemoveBookmark"
      @edit-bookmark="handleEditBookmark"
      @navigate="handleTreeNavigate"
    />

    <div class="sftp-main">
      <SftpTree
        :tree-data="treeData"
        :current-path="currentPath"
        :loading="isTreeLoading"
        @navigate="handleTreeNavigate"
        @load-children="handleLoadChildren"
      />

      <div class="sftp-content">
        <SftpBreadcrumb
          :path="currentPath"
          @navigate="handleBreadcrumbNavigate"
        />

        <SftpFileList
          :files="fileList"
          :loading="isListLoading"
          @select="handleFilesSelect"
          @dblclick="handleFileDblClick"
          @download="handleDownload"
          @delete="handleDelete"
          @rename="handleRename"
          @preview="handlePreview"
          @edit-file="handleEditFile"
        />

        <SftpPreview
          v-if="showPreview && previewFile"
          :file="previewFile"
          :session-id="session.id"
          :current-path="currentPath"
          @close="previewFile = null; showPreview = false"
        />
      </div>
    </div>

    <!-- 内置代码编辑�?(全屏覆盖 SFTP 界面) -->
    <SftpEditor
      v-if="editingFile"
      :file="editingFile"
      :session-id="session.id"
      :current-path="currentPath"
      @saved="onEditorSaved"
      @close="editingFile = null"
    />

    <TransferQueue 
      :transfers="transfers" 
      @pause="handlePauseTransfer"
      @resume="handleResumeTransfer"
      @cancel="handleCancelTransfer"
    />

    <!-- Toast 通知 -->
    <Transition name="toast-slide">
      <div v-if="toast" class="sftp-toast" :class="`toast-${toast.type}`">
        {{ toast.message }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.sftp-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  
  /* Map internal component variables to global theme variables */
  --bg-color: var(--color-bg);
  --bg-secondary: var(--color-bg-2);
  --border-color: var(--color-border);
  --text-color: var(--color-text);
  --text-secondary: var(--color-text-2);
  --hover-bg: var(--color-bg-4);
  --selection-bg: var(--color-primary-light);
  --selection-text: var(--color-primary-dark);
  --accent-color: var(--color-primary);
  
  background: var(--bg-color);
  color: var(--text-color);
}

.sftp-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sftp-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Loading Overlay */
.initial-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color);
  z-index: 100;
}

.loading-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 32px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-color);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Toast */
.sftp-toast {
  position: absolute;
  bottom: 56px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 18px;
  border-radius: 20px;
  font-size: 13px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 999;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.toast-success { background: #166534; color: #bbf7d0; border: 1px solid #16a34a; }
.toast-error   { background: #7f1d1d; color: #fecaca; border: 1px solid #b91c1c; }
.toast-info    { background: #1e3a5f; color: #bae6fd; border: 1px solid #0284c7; }

.toast-slide-enter-active, .toast-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-slide-enter-from, .toast-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
