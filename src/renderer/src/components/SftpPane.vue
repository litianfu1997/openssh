<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SftpToolbar from './SftpToolbar.vue'
import SftpTree from './SftpTree.vue'
import SftpBreadcrumb from './SftpBreadcrumb.vue'
import SftpFileList from './SftpFileList.vue'
import SftpPreview from './SftpPreview.vue'
import TransferQueue from './TransferQueue.vue'

// Props
const props = defineProps({
  session: {
    type: Object,
    required: true
  }
})

// 状态
const currentPath = ref('.')
const fileList = ref([])
const treeData = ref([])
const selectedFiles = ref([])
const previewFile = ref(null)
const bookmarks = ref([])
const transfers = ref([])
const isTreeLoading = ref(false)
const isListLoading = ref(false)
const showPreview = ref(false)

// 计算属性
const selectedCount = computed(() => selectedFiles.value.length)

// 方法
const loadDirectory = async (path) => {
  isListLoading.value = true
  try {
    const result = await window.electronAPI.sftp.ls(props.session.id, path || '.')
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
    const result = await window.electronAPI.sftp.tree(props.session.id, '.', 2)
    treeData.value = result
  } catch (error) {
    console.error('Failed to load tree:', error)
  } finally {
    isTreeLoading.value = false
  }
}

const refresh = () => {
  loadDirectory(currentPath.value)
  loadTree()
}

const handleFilesSelect = (files) => {
  selectedFiles.value = files
  if (files.length === 1 && files[0].type === 'file') {
    previewFile.value = files[0]
    showPreview.value = true
  }
}

const handleFileDblClick = async (file) => {
  if (file.type === 'directory') {
    const newPath = currentPath.value === '.' ? file.name : `${currentPath.value}/${file.name}`
    await loadDirectory(newPath)
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
  const result = await window.electronAPI.dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections']
  })

  if (!result.canceled && result.filePaths.length > 0) {
    for (const localPath of result.filePaths) {
      const fileName = localPath.split('/').pop()
      const remotePath = currentPath.value === '.' ? `./${fileName}` : `${currentPath.value}/${fileName}`

      const transferId = Date.now().toString()
      transfers.value.push({
        id: transferId,
        fileName,
        type: 'upload',
        progress: 0,
        speed: 0
      })

      try {
        await window.electronAPI.sftp.upload(props.session.id, localPath, remotePath)
        const index = transfers.value.findIndex(t => t.id === transferId)
        if (index > -1) transfers.value.splice(index, 1)
        refresh()
      } catch (error) {
        console.error('Upload failed:', error)
      }
    }
  }
}

const handleDownload = async () => {
  for (const file of selectedFiles.value) {
    if (file.type === 'directory') continue

    const result = await window.electronAPI.dialog.showSaveDialog({
      defaultPath: file.name
    })

    if (!result.canceled) {
      const transferId = Date.now().toString()
      transfers.value.push({
        id: transferId,
        fileName: file.name,
        type: 'download',
        progress: 0,
        speed: 0
      })

      try {
        const remotePath = currentPath.value === '.' ? file.name : `${currentPath.value}/${file.name}`
        await window.electronAPI.sftp.download(props.session.id, remotePath, result.filePath)
        const index = transfers.value.findIndex(t => t.id === transferId)
        if (index > -1) transfers.value.splice(index, 1)
      } catch (error) {
        console.error('Download failed:', error)
      }
    }
  }
}

const handleDelete = async () => {
  if (!confirm(`确定要删除 ${selectedFiles.value.length} 个项目吗？`)) return

  for (const file of selectedFiles.value) {
    try {
      const path = currentPath.value === '.' ? file.name : `${currentPath.value}/${file.name}`
      await window.electronAPI.sftp.delete(props.session.id, path)
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
    const path = currentPath.value === '.' ? name : `${currentPath.value}/${name}`
    await window.electronAPI.sftp.mkdir(props.session.id, path)
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
  }
}

const handleAddBookmark = () => {
  bookmarks.value.push({
    name: currentPath.value.split('/').pop() || '/',
    path: currentPath.value
  })
}

// 生命周期
onMounted(() => {
  loadDirectory('.')
  loadTree()
})

onUnmounted(() => {
  window.electronAPI.sftp.removeUploadProgressListener()
  window.electronAPI.sftp.removeDownloadProgressListener()
})
</script>

<template>
  <div class="sftp-pane">
    <SftpToolbar
      :selected-count="selectedCount"
      @upload="handleUpload"
      @download="handleDownload"
      @delete="handleDelete"
      @mkdir="handleMkdir"
      @refresh="refresh"
      @toggle-preview="handleTogglePreview"
      @add-bookmark="handleAddBookmark"
    />

    <div class="sftp-main">
      <SftpTree
        :tree-data="treeData"
        :current-path="currentPath"
        :loading="isTreeLoading"
        @navigate="handleTreeNavigate"
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
        />

        <SftpPreview
          v-if="showPreview && previewFile"
          :file="previewFile"
          :session-id="session.id"
          @close="previewFile = null; showPreview = false"
        />
      </div>
    </div>

    <TransferQueue :transfers="transfers" />
  </div>
</template>

<style scoped>
.sftp-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
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
</style>
