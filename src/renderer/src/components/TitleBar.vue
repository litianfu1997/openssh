<template>
  <div class="titlebar" @dblclick="maximize">
    <!-- 应用图标 + 名称 -->
    <div class="titlebar-left">
      <div class="app-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#4f8ef7" opacity="0.2"/>
          <path d="M4 17l5-5-5-5M11 19h9" stroke="#4f8ef7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="app-name">OpenSSH</span>
    </div>

    <!-- 拖拽区域 -->
    <div class="titlebar-drag" />

    <!-- 窗口控制按钮 -->
    <div class="titlebar-controls">
      <button class="theme-btn" @click="toggleTheme" :title="isDark ? 'Light Mode' : 'Dark Mode'">
        <svg v-if="isDark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
      
      <button class="theme-btn" @click="$emit('open-settings')" title="Settings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>

      <div class="divider-v" />
      <button class="lang-btn" @click="toggleLang" title="Switch Language">
        {{ locale === 'zh' ? 'EN' : '中' }}
      </button>
      <div class="divider-v" />
      <button class="ctrl-btn" title="最小化" @click="minimize">
        <svg width="10" height="2" viewBox="0 0 10 2"><rect width="10" height="2" rx="1" fill="currentColor"/></svg>
      </button>
      <button class="ctrl-btn" title="最大化" @click="maximize">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
      <button class="ctrl-btn ctrl-close" title="关闭" @click="close">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { windowAPI } from '@/api/tauri-bridge'
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const isDark = ref(true)

function toggleTheme() {
  isDark.value = !isDark.value
  applyTheme()
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

function applyTheme() {
  if (isDark.value) {
    document.documentElement.classList.remove('light-mode')
  } else {
    document.documentElement.classList.add('light-mode')
  }
}

function toggleLang() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('locale', locale.value)
}

function minimize() { windowAPI.minimize() }
function maximize() { windowAPI.maximize() }
function close() { windowAPI.close() }

onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  isDark.value = savedTheme !== 'light'
  applyTheme()
})
</script>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  height: var(--titlebar-height);
  background: var(--color-bg-2);
  border-bottom: 1px solid var(--color-border);
  user-select: none;
  -webkit-app-region: drag;
  flex-shrink: 0;
  padding: 0 8px;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.app-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
}

.app-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: 0.03em;
}

.titlebar-drag {
  flex: 1;
}

.titlebar-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-3);
  cursor: pointer;
  transition: all var(--transition);
}

.lang-btn {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-3);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 8px;
  height: 24px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  -webkit-app-region: no-drag;
}

.lang-btn:hover {
  background: var(--color-bg-4);
  color: var(--color-text);
}

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-3);
  cursor: pointer;
  border-radius: var(--radius-sm);
  -webkit-app-region: no-drag;
}
.theme-btn:hover {
  background: var(--color-bg-4);
  color: var(--color-text);
}

.divider-v {
  width: 1px;
  height: 14px;
  background: var(--color-border);
  margin: 0 4px;
}

.ctrl-btn:hover {
  background: var(--color-bg-4);
  color: var(--color-text);
}

.ctrl-close:hover {
  background: var(--color-danger);
  color: #fff;
}
</style>
