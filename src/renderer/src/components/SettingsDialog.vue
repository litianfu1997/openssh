<template>
  <Transition name="dialog-fade">
    <div v-if="visible" class="dialog-overlay" @click="close">
      <div class="dialog-box settings-dialog" @click.stop>
        <div class="dialog-header">
          <h3>{{ $t('settings.title') }}</h3>
          <button class="close-btn" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="dialog-content">
          <!-- 版本信息 -->
          <div class="version-section">
            <div class="logo-container">
              <img :src="iconPath" alt="Logo" class="app-logo" />
            </div>
            <div class="app-info">
              <div class="app-name">OpenSSH</div>
              <div class="app-version-badge">v{{ appVersion }}</div>
            </div>
          </div>

          <!-- 设置项列表 -->
          <div class="settings-group">
            <div class="setting-item">
              <div class="setting-content">
                <div class="setting-title">{{ $t('settings.auto_update') }}</div>
                <div class="setting-desc">{{ $t('settings.auto_update_desc') }}</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" v-model="autoUpdateEnabled" @change="toggleAutoUpdate">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- 更新状态区域 -->
          <Transition name="slide-fade">
            <div class="update-status-card" v-if="updateStatus">
              <div class="status-header">
                <span class="status-indicator" :class="updateStatus"></span>
                <span class="status-text">
                  <template v-if="updateStatus === 'checking'">{{ $t('settings.checking') }}...</template>
                  <template v-else-if="updateStatus === 'available'">{{ $t('settings.update_available') }} v{{ updateMessage }}</template>
                  <template v-else-if="updateStatus === 'not-available'">已是最新版本</template>
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
               <div class="update-error-msg" v-if="updateStatus === 'error'">
                {{ updateMessage }}
              </div>
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

const props = defineProps({
  visible: Boolean
})
const emit = defineEmits(['update:visible'])

const appVersion = ref('0.1.25') // TODO: fetch from IPC
const autoUpdateEnabled = ref(true)
const checking = ref(false)
const updateStatus = ref('')
const updateMessage = ref('')
const downloadProgress = ref(0)

function close() {
  emit('update:visible', false)
}

// 自动更新逻辑
async function loadConfig() {
  try {
    appVersion.value = await appAPI.getVersion()
    autoUpdateEnabled.value = await appAPI.getConfig()
  } catch (e) {
    console.error('Failed to load settings', e)
  }
}

async function toggleAutoUpdate() {
  try {
    await appAPI.setConfig(autoUpdateEnabled.value)
  } catch (e) {
    console.error('Failed to save settings', e)
  }
}

async function checkUpdate() {
  if (checking.value) return
  checking.value = true
  updateStatus.value = 'checking'
  updateMessage.value = ''
  
  try {
    const result = await appAPI.checkManual()
    // result 是 updateCheckResult 对象
    // 如果没有更新，result?.updateInfo.version 可能就是当前版本
    // 但通常 update-not-available 事件会触发
  } catch (e) {
    updateStatus.value = 'error'
    updateMessage.value = e.message
    checking.value = false
  }
}

function installUpdate() {
  appAPI.install()
}

// 监听主进程的 updater 消息
onMounted(() => {
  loadConfig()

  appAPI.onStatus((status, info) => {
    checking.value = status === 'checking'
    updateStatus.value = status
    
    if (status === 'checking') {
      updateMessage.value = ''
    } else if (status === 'available') {
      // info 是 updateInfo
      updateMessage.value = info.version
    } else if (status === 'not-available') {
      updateMessage.value = ''
    } else if (status === 'downloaded') {
      updateMessage.value = info.version
    } else if (status === 'error') {
      updateMessage.value = info // info 是 error message
    }
  })

  appAPI.onProgress((progressObj) => {
    updateStatus.value = 'downloading'
    downloadProgress.value = Math.floor(progressObj.percent)
    updateMessage.value = `${downloadProgress.value}%`
  })
})
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.settings-dialog {
  width: 420px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: dialog-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-bg-2);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text-2);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
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
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Version Section */
.version-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 8px;
}

.logo-container {
  margin-bottom: 16px;
  filter: drop-shadow(0 4px 12px rgba(79, 142, 247, 0.2));
}

.app-logo {
  width: 72px;
  height: 72px;
  display: block;
}

.app-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.app-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.01em;
}

.app-version-badge {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 600;
}

/* Settings Group */
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-light);
  border-radius: 12px;
  transition: all 0.2s;
}

.setting-item:hover {
  border-color: var(--color-border);
  background: var(--color-bg-3);
}

.setting-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.setting-desc {
  font-size: 12px;
  color: var(--color-text-3);
  line-height: 1.4;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
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
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-bg-4);
  transition: .3s cubic-bezier(0.4, 0.0, 0.2, 1);
  border-radius: 24px;
  border: 1px solid transparent;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: .3s cubic-bezier(0.4, 0.0, 0.2, 1);
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

.toggle-switch input:focus-visible + .toggle-slider {
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

/* Update Status Card */
.update-status-card {
  background: var(--color-bg-3);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid var(--color-border-light);
}

.status-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
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
  margin: 12px 0 8px 0;
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
  margin-top: 12px;
}

.update-error-msg {
  color: var(--color-danger);
  font-size: 12px;
  margin-top: 8px;
  line-height: 1.4;
}

/* Footer */
.dialog-footer {
  padding: 16px 20px;
  background: var(--color-bg-2);
  border-top: 1px solid var(--color-border-light);
  display: flex;
  justify-content: center;
}

.check-btn {
  width: 100%;
  justify-content: center;
  height: 36px;
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
  color: var(--color-text);
  font-weight: 500;
  border-radius: 8px;
  transition: all 0.2s;
}

.check-btn:hover:not(:disabled) {
  background: var(--color-bg-3);
  border-color: var(--color-border);
}

.check-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

/* Spinner */
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

/* Animations */
@keyframes dialog-pop {
  0% { opacity: 0; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
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
  transition: all 0.3s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}
</style>
