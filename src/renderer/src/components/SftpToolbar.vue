<script setup>
const props = defineProps({
  selectedCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits([
  'upload',
  'download',
  'delete',
  'mkdir',
  'refresh',
  'togglePreview',
  'addBookmark'
])

const handleUpload = () => {
  emit('upload')
}

const handleDownload = () => {
  emit('download')
}

const handleDelete = () => {
  emit('delete')
}

const handleMkdir = () => {
  emit('mkdir')
}

const handleRefresh = () => {
  emit('refresh')
}
</script>

<template>
  <div class="sftp-toolbar">
    <button @click="handleMkdir" title="新建文件夹">
      <span>📁+</span>
    </button>
    <button @click="handleUpload" title="上传文件">
      <span>↑ 上传</span>
    </button>
    <button @click="handleDownload" :disabled="selectedCount === 0" title="下载文件">
      <span>↓ 下载</span>
    </button>
    <button @click="handleDelete" :disabled="selectedCount === 0" title="删除">
      <span>🗑️</span>
    </button>
    <button @click="handleRefresh" title="刷新">
      <span>🔄</span>
    </button>
    <button @click="emit('togglePreview')" title="切换预览">
      <span>👁️</span>
    </button>
    <button @click="emit('addBookmark')" title="添加收藏">
      <span>⭐</span>
    </button>
  </div>
</template>

<style scoped>
.sftp-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.sftp-toolbar button {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.sftp-toolbar button:hover:not(:disabled) {
  background: var(--hover-bg);
}

.sftp-toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
