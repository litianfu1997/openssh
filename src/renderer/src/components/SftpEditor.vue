<script setup>
import { sftpAPI } from '@/api/tauri-bridge'
import { ref, watch, computed } from 'vue'
import FileIcon from './FileIcon.vue'
import MonacoEditor from './MonacoEditor.vue'

const props = defineProps({
  file: { type: Object, required: true },
  sessionId: { type: String, required: true },
  currentPath: { type: String, default: '.' }
})

const emit = defineEmits(['close', 'saved'])

const content = ref('')
const originalContent = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref(null)

const isModified = computed(() => content.value !== originalContent.value)

const remotePath = computed(() => {
  if (props.currentPath === '.') return props.file.name
  return `${props.currentPath}/${props.file.name}`
})

const language = computed(() => {
  const ext = props.file.name.split('.').pop()?.toLowerCase()
  const map = {
    'js': 'javascript',
    'ts': 'typescript',
    'vue': 'html',
    'json': 'json',
    'md': 'markdown',
    'html': 'html',
    'css': 'css',
    'py': 'python',
    'sh': 'shell',
    'bash': 'shell',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'sql': 'sql',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'ini': 'ini'
  }
  return map[ext] || 'plaintext'
})

const loadFile = async () => {
  loading.value = true
  error.value = null
  try {
    const result = await sftpAPI.getFile(props.sessionId, remotePath.value)
    if (result.isImage) {
      error.value = '无法在编辑器中打开图片。请使用预览功能。'
    } else if (result.isText) {
      content.value = result.content || ''
      originalContent.value = content.value
    } else {
      error.value = '不支持编辑此类型的二进制文件。'
    }
  } catch (err) {
    error.value = `加载失败: ${err.message}`
  } finally {
    loading.value = false
  }
}

const handleSave = async (newVal) => {
  if (newVal !== undefined) content.value = newVal
  if (!isModified.value) return

  saving.value = true
  try {
    await sftpAPI.putFile(props.sessionId, remotePath.value, content.value)
    originalContent.value = content.value
    emit('saved', props.file)
  } catch (err) {
    alert(`保存失败: ${err.message}`)
  } finally {
    saving.value = false
  }
}

const handleClose = () => {
  if (isModified.value) {
    if (!confirm('文件已修改，是否确认关闭而不保存？')) {
      return
    }
  }
  emit('close')
}

watch(() => props.file, loadFile, { immediate: true })

</script>

<template>
  <div class="sftp-editor-overlay">
    <div class="editor-header">
      <div class="file-info" :title="remotePath">
        <FileIcon :name="file.name" :is-directory="false" :size="16" />
        <span class="file-name">{{ file.name }}</span>
        <span v-if="isModified" class="modified-dot"></span>
      </div>
      
      <div class="editor-actions">
        <span v-if="saving" class="status-msg">
          <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          保存中...
        </span>
        <span v-else-if="!isModified" class="status-msg text-muted">已保存</span>
        
        <button class="action-btn save-btn" @click="handleSave()" :disabled="!isModified || saving">
          保存 (Ctrl+S)
        </button>
        <button class="action-btn close-btn" @click="handleClose()" :disabled="saving">
          关闭
        </button>
      </div>
    </div>

    <div class="editor-body">
      <div v-if="loading" class="state-overlay">
        <svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span>正在读取服务器文件...</span>
      </div>
      <div v-else-if="error" class="state-overlay error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{{ error }}</span>
      </div>
      <MonacoEditor
        v-else
        v-model="content"
        :language="language"
        @save="handleSave"
      />
    </div>
  </div>
</template>

<style scoped>
.sftp-editor-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-color, #0f1117);
  display: flex;
  flex-direction: column;
  z-index: 100;
  animation: slide-up 0.2s ease-out;
}

@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.editor-header {
  height: 48px;
  background: var(--bg-secondary, #131825);
  border-bottom: 1px solid var(--border-color, #2a3347);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-family: var(--font-mono, monospace);
  color: #e2e8f0;
}

.modified-dot {
  width: 8px;
  height: 8px;
  background: #f1fa8c;
  border-radius: 50%;
  box-shadow: 0 0 4px #f1fa8c;
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-msg {
  font-size: 12px;
  color: #a3be8c;
  display: flex;
  align-items: center;
  gap: 6px;
}
.text-muted {
  color: var(--text-secondary, #6b7280);
}

.action-btn {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
  background: var(--color-bg-3, #1e2535);
  color: var(--color-text, #e2e8f0);
}
.action-btn:hover:not(:disabled) {
  background: var(--color-bg-4, #2a3347);
}
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.save-btn {
  background: #2a3347;
  border-color: #3b4455;
  color: #58a6ff;
}
.save-btn:hover:not(:disabled) {
  background: #30363d;
  border-color: #58a6ff;
}
.close-btn:hover {
  background: #7f1d1d;
  color: #fecaca;
}

.editor-body {
  flex: 1;
  position: relative;
  display: flex;
  overflow: hidden;
}

.state-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary, #6b7280);
  background: var(--bg-color, #0f1117);
  font-size: 14px;
}
.state-overlay.error {
  color: #f87171;
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }
</style>
