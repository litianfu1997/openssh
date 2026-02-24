<script setup>
import { sftpAPI } from '@/api/tauri-bridge'
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FileIcon from './FileIcon.vue'

const { t } = useI18n()

const props = defineProps({
  file: { type: Object, default: null },
  sessionId: { type: String, required: true },
  currentPath: { type: String, default: '.' }
})

const emit = defineEmits(['close'])

const content = ref('')
const imageBase64 = ref('')
const imageMime = ref('')
const loading = ref(false)
const error = ref(null)
const isText = ref(false)
const isImage = ref(false)

const remotePath = computed(() => {
  if (!props.file) return ''
  if (props.currentPath === '.') return props.file.name
  return `${props.currentPath}/${props.file.name}`
})

watch(() => props.file, async (newFile) => {
  content.value = ''
  imageBase64.value = ''
  imageMime.value = ''
  error.value = null
  isText.value = false
  isImage.value = false

  if (!newFile || newFile.type === 'directory') return

  loading.value = true
  try {
    const result = await sftpAPI.getFile(props.sessionId, remotePath.value)
    if (result.isImage) {
      isImage.value = true
      imageBase64.value = result.content
      imageMime.value = result.mimeType
    } else if (result.isText) {
      isText.value = true
      content.value = result.content
    } else {
      error.value = t('sftp.unsupported_preview')
    }
  } catch (err) {
    error.value = err?.message || t('sftp.load_error')
  } finally {
    loading.value = false
  }
}, { immediate: true })

const lineCount = computed(() => {
  if (!isText.value || !content.value) return 0
  return content.value.split('\n').length
})
</script>

<template>
  <div v-if="file" class="sftp-preview">
    <div class="preview-header">
      <div class="preview-title">
        <FileIcon :name="file.name" :is-directory="false" :size="14" />
        <span class="file-name-label">{{ file.name }}</span>
        <span v-if="isText && lineCount" class="line-count">{{ lineCount }} {{ $t('sftp.lines') }}</span>
      </div>
      <button @click="$emit('close')" class="close-btn" :title="$t('sftp.close_preview')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="preview-body">
      <!-- 加载中 -->
      <div v-if="loading" class="preview-state">
        <svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        {{ $t('sftp.loading') }}
      </div>

      <!-- 错误 -->
      <div v-else-if="error" class="preview-state error-text">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {{ error }}
      </div>

      <!-- 图片预览 -->
      <div v-else-if="isImage" class="image-preview-wrap">
        <img
          :src="`data:${imageMime};base64,${imageBase64}`"
          class="preview-image"
          :alt="$t('sftp.image_preview')"
        />
      </div>

      <!-- 文本预览 -->
      <div v-else-if="isText" class="text-preview-wrap">
        <div class="line-numbers" aria-hidden="true">
          <div v-for="n in lineCount" :key="n" class="line-number">{{ n }}</div>
        </div>
        <pre class="code-content">{{ content }}</pre>
      </div>

      <!-- 不支持 -->
      <div v-else class="preview-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
        </svg>
        {{ $t('sftp.unsupported_preview') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.sftp-preview {
  height: 280px;
  border-top: 1px solid var(--border-color, #2a3347);
  background: var(--bg-secondary, #131825);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-color, #0f1117);
  border-bottom: 1px solid var(--border-color, #2a3347);
  gap: 8px;
  flex-shrink: 0;
}

.preview-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.file-name-label {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-count {
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
  background: var(--color-bg-3, #1e2535);
  padding: 1px 6px;
  border-radius: 10px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.close-btn:hover {
  background: var(--hover-bg, rgba(255,255,255,0.05));
  color: var(--text-color, #e2e8f0);
}

.preview-body {
  flex: 1;
  overflow: hidden;
  display: flex;
}

.preview-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
}

.error-text { color: #f87171; }

/* 图片预览 */
.image-preview-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 8px;
}
.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}

/* 文本代码预览 */
.text-preview-wrap {
  flex: 1;
  display: flex;
  overflow: auto;
}

.line-numbers {
  flex-shrink: 0;
  padding: 10px 8px;
  background: var(--bg-color, #0f1117);
  border-right: 1px solid var(--border-color, #2a3347);
  text-align: right;
  color: var(--text-secondary, #6b7280);
  font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  min-width: 40px;
  user-select: none;
}
.line-number { height: 1.6em; }

.code-content {
  flex: 1;
  margin: 0;
  padding: 10px 14px;
  font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  color: var(--text-color, #e2e8f0);
  overflow: visible;
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
