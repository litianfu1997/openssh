<template>
  <Transition name="dialog-fade">
    <div v-if="visible" class="dialog-overlay" @click="close">
      <div class="dialog-box settings-dialog" @click.stop>
        <div class="dialog-header">
          <h3>{{ $t('settings.title') }}</h3>
          <button class="close-btn" @click="close" aria-label="Close settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="dialog-content">
          <div class="version-section">
            <img :src="iconPath" alt="LynxShell" class="app-logo" />
            <div class="app-name">LynxShell</div>
            <div class="app-version-badge">v{{ appVersion }}</div>
          </div>

          <div class="settings-group">
            <div class="setting-item">
              <div class="setting-content">
                <div class="setting-title">{{ $t('settings.auto_update') }}</div>
                <div class="setting-desc">{{ $t('settings.auto_update_desc') }}</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" v-model="autoUpdateEnabled" @change="toggleAutoUpdate" />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-item">
              <div class="setting-content">
                <div class="setting-title">{{ $t('settings.terminal_history') }}</div>
                <div class="setting-desc">{{ $t('settings.terminal_history_desc') }}</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" v-model="terminalHistoryEnabled" @change="toggleTerminalHistory" />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="setting-item">
              <div class="setting-content">
                <div class="setting-title">{{ $t('settings.terminal_font_size') }}</div>
                <div class="setting-desc">{{ $t('settings.terminal_font_size_desc').replace('{size}', terminalFontSize) }}</div>
              </div>
              <div class="font-size-control">
                <button class="font-size-btn" @click="changeTerminalFontSize(-1)" :disabled="terminalFontSize <= 8">-</button>
                <div class="font-size-value">{{ terminalFontSize }}</div>
                <button class="font-size-btn" @click="changeTerminalFontSize(1)" :disabled="terminalFontSize >= 36">+</button>
              </div>
            </div>
          </div>

          <Transition name="slide-fade">
            <div class="update-status-card" v-if="updateStatus">
              <div class="status-header">
                <span class="status-indicator" :class="updateStatus"></span>
                <span class="status-text">
                  <template v-if="updateStatus === 'checking'">{{ $t('settings.checking') }}...</template>
                  <template v-else-if="updateStatus === 'available'">{{ $t('settings.update_available') }} v{{ updateMessage }}</template>
                  <template v-else-if="updateStatus === 'not-available'">{{ $t('settings.latest') }}</template>
                  <template v-else-if="updateStatus === 'downloading'">{{ $t('settings.downloading') }}</template>
                  <template v-else-if="updateStatus === 'downloaded'">{{ $t('settings.update_downloaded') }}</template>
                  <template v-else-if="updateStatus === 'error'">{{ $t('settings.update_error') }}</template>
                  <template v-else>{{ updateMessage }}</template>
                </span>
              </div>

              <div class="progress-bar-container" v-if="updateStatus === 'downloading'">
                <div class="progress-bar-fill" :style="{ width: downloadProgress + '%' }"></div>
              </div>
              <div class="progress-text" v-if="updateStatus === 'downloading'">{{ downloadProgress }}%</div>

              <div class="update-actions" v-if="updateStatus === 'available' || updateStatus === 'downloaded'">
                <button class="btn-primary btn-sm btn-block" @click="installUpdate">
                  {{ updateStatus === 'available' ? '确认下载' : $t('settings.install_now') }}
                </button>
              </div>

              <div class="update-error-msg" v-if="updateStatus === 'error'">{{ updateMessage }}</div>
            </div>
          </Transition>
        </div>

        <div class="dialog-footer">
          <button class="btn-secondary check-btn" @click="checkUpdate" :disabled="checking">
            <span v-if="checking" class="spinner"></span>
            <span>{{ checking ? $t('settings.checking') : $t('settings.check_update') }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { appAPI } from '@/api/tauri-bridge'
import { ref, onMounted } from 'vue'
import iconPath from '@/assets/icon.png'

const AUTO_UPDATE_KEY = 'autoUpdateEnabled'

defineProps({
  visible: Boolean
})

const emit = defineEmits(['update:visible'])

const appVersion = ref('0.0.0')
const autoUpdateEnabled = ref(true)
const terminalHistoryEnabled = ref(true)
const terminalFontSize = ref(13)
const checking = ref(false)
const updateStatus = ref('')
const updateMessage = ref('')
const downloadProgress = ref(0)

function close() {
  emit('update:visible', false)
}

async function loadConfig() {
  try {
    appVersion.value = await appAPI.getVersion()
    autoUpdateEnabled.value = localStorage.getItem(AUTO_UPDATE_KEY) !== 'false'
    terminalHistoryEnabled.value = await appAPI.getTerminalHistoryConfig()
    terminalFontSize.value = parseInt(localStorage.getItem('terminalFontSize')) || 13
  } catch (e) {
    console.error('Failed to load settings', e)
  }
}

function toggleAutoUpdate() {
  localStorage.setItem(AUTO_UPDATE_KEY, String(autoUpdateEnabled.value))
}

async function toggleTerminalHistory() {
  try {
    await appAPI.setTerminalHistoryConfig(terminalHistoryEnabled.value)
    window.dispatchEvent(new CustomEvent('terminal-history-settings-changed', {
      detail: { enabled: terminalHistoryEnabled.value }
    }))
  } catch (e) {
    console.error('Failed to save terminal history settings', e)
  }
}

function changeTerminalFontSize(delta) {
  const newSize = terminalFontSize.value + delta
  if (newSize >= 8 && newSize <= 36) {
    terminalFontSize.value = newSize
    localStorage.setItem('terminalFontSize', String(newSize))
    window.dispatchEvent(new CustomEvent('terminal-font-size-changed', {
      detail: { size: newSize }
    }))
  }
}

async function checkUpdate() {
  if (checking.value) return

  checking.value = true
  updateStatus.value = 'checking'
  updateMessage.value = ''

  try {
    await appAPI.checkManual()
  } catch (e) {
    updateStatus.value = 'error'
    updateMessage.value = e?.message || String(e)
    checking.value = false
  }
}

function installUpdate() {
  appAPI.install()
}

onMounted(() => {
  loadConfig()

  appAPI.onStatus((status, info) => {
    checking.value = status === 'checking'
    updateStatus.value = status

    if (status === 'checking') {
      updateMessage.value = ''
      return
    }

    if (status === 'available') {
      updateMessage.value = info?.version || ''
      return
    }

    if (status === 'not-available') {
      updateMessage.value = ''
      return
    }

    if (status === 'downloaded') {
      updateMessage.value = info?.version || ''
      return
    }

    if (status === 'error') {
      updateMessage.value = typeof info === 'string' ? info : (info?.message || '')
    }
  })

  appAPI.onProgress((progress) => {
    updateStatus.value = 'downloading'
    downloadProgress.value = typeof progress === 'number'
      ? Math.floor(progress)
      : Math.floor(progress?.percent || 0)
    updateMessage.value = `${downloadProgress.value}%`
  })
})
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px 20px calc(20px + var(--keyboard-inset)) 20px;
}

.settings-dialog {
  width: min(460px, 100%);
  max-height: min(86vh, 760px);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-2);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text-2);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: var(--color-bg-3);
  color: var(--color-text);
}

.dialog-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.version-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-2);
  border-radius: 14px;
}

.app-logo {
  width: 64px;
  height: 64px;
}

.app-name {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.1;
}

.app-version-badge {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 700;
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
}

.setting-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.setting-desc {
  font-size: 13px;
  color: var(--color-text-3);
  line-height: 1.4;
}

.font-size-control {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--color-bg-3);
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
}

.font-size-btn {
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 16px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.font-size-btn:hover:not(:disabled) {
  background: var(--color-bg-4);
}

.font-size-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.font-size-value {
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-mono);
  min-width: 20px;
  text-align: center;
}

.toggle-switch {
  position: relative;
  width: 48px;
  height: 28px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: var(--color-bg-4);
  transition: .25s ease;
  border-radius: 28px;
  border: 1px solid transparent;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 22px;
  width: 22px;
  left: 2px;
  bottom: 2px;
  background-color: #fff;
  transition: .25s ease;
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

.update-status-card {
  background: var(--color-bg-2);
  border-radius: 12px;
  padding: 14px;
  border: 1px solid var(--color-border-light);
}

.status-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-text-3);
}

.status-indicator.available { background-color: var(--color-success); box-shadow: 0 0 0 3px var(--color-success-light); }
.status-indicator.checking { background-color: var(--color-warning); animation: pulse 1.5s infinite; }
.status-indicator.downloading { background-color: var(--color-primary); }
.status-indicator.error { background-color: var(--color-danger); }

.status-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

.progress-bar-container {
  height: 6px;
  background: var(--color-bg-4);
  border-radius: 99px;
  overflow: hidden;
  margin: 12px 0 6px;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 99px;
  transition: width 0.3s ease;
}

.progress-text {
  text-align: right;
  font-size: 12px;
  color: var(--color-text-2);
  font-family: var(--font-mono);
}

.update-actions {
  margin-top: 10px;
}

.update-error-msg {
  color: var(--color-danger);
  font-size: 12px;
  margin-top: 8px;
}

.dialog-footer {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: var(--color-bg-2);
  border-top: 1px solid var(--color-border-light);
}

.check-btn {
  width: 100%;
  justify-content: center;
  height: 40px;
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
  color: var(--color-text);
  font-weight: 600;
  border-radius: 10px;
}

.check-btn:hover:not(:disabled) {
  background: var(--color-bg-3);
}

.check-btn:disabled {
  opacity: 0.75;
  cursor: wait;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-text-3);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-right: 8px;
}

.btn-block {
  display: flex;
  width: 100%;
  justify-content: center;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active {
  transition: all 0.25s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}

@media (max-width: 768px) {
  .dialog-overlay {
    align-items: flex-end;
    padding: 0 0 var(--keyboard-inset) 0;
    backdrop-filter: none;
  }

  .settings-dialog {
    width: 100%;
    max-height: 90vh;
    border-radius: 18px 18px 0 0;
    border-bottom: none;
  }

  .dialog-header {
    padding: 16px;
  }

  .dialog-header h3 {
    font-size: 30px;
  }

  .close-btn {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: var(--color-bg-3);
  }

  .dialog-content {
    padding: 14px;
    gap: 12px;
  }

  .app-logo {
    width: 56px;
    height: 56px;
  }

  .app-name {
    font-size: 20px;
  }

  .setting-title {
    font-size: 15px;
  }

  .setting-desc {
    font-size: 12px;
  }
}
</style>
