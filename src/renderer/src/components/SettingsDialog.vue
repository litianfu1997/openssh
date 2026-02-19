<template>
  <Transition name="dialog-fade">
    <div v-if="visible" class="dialog-overlay" @click="close">
      <div class="dialog-box settings-dialog" @click.stop>
        <div class="dialog-header">
          <h3>{{ $t('settings.title') }}</h3>
          <button class="close-btn" @click="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          <!-- 版本信息 -->
          <div class="version-info">
            <img src="../../assets/icon.png" alt="Logo" class="app-logo" />
            <div class="app-name">OpenSSH Client</div>
            <div class="app-version">v{{ appVersion }}</div>
          </div>

          <div class="divider"></div>

          <!-- 设置项 -->
          <div class="setting-item">
            <div class="setting-label">
              <span>{{ $t('settings.auto_update') }}</span>
              <small>{{ $t('settings.auto_update_desc') }}</small>
            </div>
            <label class="switch">
              <input type="checkbox" v-model="autoUpdateEnabled" @change="toggleAutoUpdate">
              <span class="slider round"></span>
            </label>
          </div>

          <div class="update-status-area" v-if="updateStatus">
             <div class="status-text">{{ updateMessage }}</div>
             <div class="progress-bar" v-if="downloadProgress > 0 && downloadProgress < 100">
                <div class="progress-fill" :style="{ width: downloadProgress + '%' }"></div>
             </div>
             <button v-if="updateStatus === 'downloaded'" class="btn-primary" @click="installUpdate">
               {{ $t('settings.install_now') }}
             </button>
          </div>

          <div class="actions">
            <button class="btn-secondary" @click="checkUpdate" :disabled="checking">
              {{ checking ? $t('settings.checking') : $t('settings.check_update') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  visible: Boolean
})
const emit = defineEmits(['update:visible'])

const appVersion = ref('0.1.6') // TODO: fetch from IPC
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
    appVersion.value = await window.electronAPI.updater.getVersion()
    autoUpdateEnabled.value = await window.electronAPI.updater.getConfig()
  } catch (e) {
    console.error('Failed to load settings', e)
  }
}

async function toggleAutoUpdate() {
  try {
    await window.electronAPI.updater.setConfig(autoUpdateEnabled.value)
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
    const result = await window.electronAPI.updater.checkManual()
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
  window.electronAPI.updater.install()
}

// 监听主进程的 updater 消息
onMounted(() => {
  loadConfig()

  window.electronAPI.updater.onStatus((status, info) => {
    checking.value = status === 'checking'
    updateStatus.value = status
    
    if (status === 'checking') {
      updateMessage.value = ''
    } else if (status === 'available') {
      // info 是 updateInfo
      updateMessage.value = `v${info.version}`
    } else if (status === 'not-available') {
      updateMessage.value = ''
    } else if (status === 'downloaded') {
      updateMessage.value = `v${info.version}`
    } else if (status === 'error') {
      updateMessage.value = info // info 是 error message
    }
  })

  window.electronAPI.updater.onProgress((progressObj) => {
    updateStatus.value = 'downloading'
    downloadProgress.value = Math.floor(progressObj.percent)
    updateMessage.value = `${downloadProgress.value}%`
  })
})
</script>

<style scoped>
.settings-dialog { width: 400px; }
.version-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
}
.app-logo { width: 64px; height: 64px; margin-bottom: 12px; }
.app-name { font-size: 18px; font-weight: 600; color: var(--color-text); }
.app-version { font-size: 13px; color: var(--color-text-3); margin-top: 4px; }

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.setting-label { display: flex; flex-direction: column; }
.setting-label span { font-size: 14px; color: var(--color-text); }
.setting-label small { font-size: 12px; color: var(--color-text-3); margin-top: 4px; }

/* Switch Toggle */
.switch { position: relative; display: inline-block; width: 44px; height: 24px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--color-bg-4); transition: .4s; border-radius: 24px; }
.slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: var(--color-text-2); transition: .4s; border-radius: 50%; }
input:checked + .slider { background-color: var(--color-primary); }
input:checked + .slider:before { transform: translateX(20px); background-color: #fff; }

.update-status-area {
  background: var(--color-bg-3);
  padding: 12px;
  border-radius: var(--radius);
  margin-top: 16px;
  text-align: center;
}
.status-text { font-size: 13px; color: var(--color-text-2); margin-bottom: 8px; }
.progress-bar { height: 4px; background: var(--color-bg-4); border-radius: 2px; overflow: hidden; margin: 8px 0; }
.progress-fill { height: 100%; background: var(--color-primary); transition: width 0.3s; }

.actions { margin-top: 24px; display: flex; justify-content: center; }
</style>
