<template>
  <div class="terminal-pane" :class="{ hidden: !visible }">
    <!-- 连接中状态 -->
    <div v-if="session.status === 'connecting'" class="connecting-overlay">
      <div class="connecting-box">
        <div class="spinner" />
        <div class="connecting-info">
          <div class="connecting-title">{{ $t('term.connecting') }}</div>
          <div class="connecting-addr">{{ session.host }}</div>
        </div>
      </div>
    </div>

    <!-- 连接失败 -->
    <div v-else-if="session.status === 'error'" class="error-overlay">
      <div class="error-box">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="error-title">{{ $t('term.error') }}</div>
        <div class="error-msg">{{ session.errorMessage }}</div>
        <button class="btn btn-primary btn-sm" @click="retry">{{ $t('term.retry') }}</button>
      </div>
    </div>

    <!-- xterm 终端容器 -->
    <div ref="termRef" class="xterm-container" @contextmenu.prevent="showCtxMenu" />

    <!-- 右键菜单 -->
    <Transition name="ctx-fade">
      <div
        v-if="ctxMenu.show"
        class="ctx-menu"
        :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
        @mouseleave="ctxMenu.show = false"
      >
        <button class="ctx-item" @click="copySelection">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          {{ $t('term.ctx_copy') }}
          <span class="ctx-shortcut">Ctrl+Shift+C</span>
        </button>
        <button class="ctx-item" @click="pasteFromClipboard">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          </svg>
          {{ $t('term.ctx_paste') }}
          <span class="ctx-shortcut">Ctrl+Shift+V</span>
        </button>
        <div class="ctx-divider" />
        <button class="ctx-item" @click="clearTerminal">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          {{ $t('term.ctx_clear') }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { sshAPI } from '@/api/tauri-bridge'
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const props = defineProps({
  session: { type: Object, required: true },
  visible: { type: Boolean, default: false }
})

const termRef = ref(null)
let terminal = null
let fitAddon = null
let resizeObserver = null
let unlistenData = null   // Tauri 事件取消订阅函数
let unlistenClosed = null // Tauri 事件取消订阅函数
let themeObserver = null
let clickHandler = null

// 右键菜单状态
const ctxMenu = ref({ show: false, x: 0, y: 0 })

function showCtxMenu(e) {
  // 计算菜单位置，避免超出屏幕边界
  const menuW = 180
  const menuH = 110
  const x = e.clientX + menuW > window.innerWidth ? e.clientX - menuW : e.clientX
  const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY
  ctxMenu.value = { show: true, x, y }
}

// 隐藏右键菜单
function hideCtxMenu() {
  ctxMenu.value.show = false
}

// 复制选中内容
async function copySelection() {
  hideCtxMenu()
  const text = terminal?.getSelection()
  if (text) {
    await navigator.clipboard.writeText(text)
    terminal.clearSelection()
  }
  terminal?.focus()
}

// 粘贴剪贴板内容
async function pasteFromClipboard() {
  hideCtxMenu()
  try {
    const text = await navigator.clipboard.readText()
    if (text && props.session.status === 'connected') {
      // 使用 terminal.paste 保留换行符等特殊字符
      terminal.paste(text)
    }
  } catch {
    // 权限被拒绝时的降级处理
    console.warn('无法读取剪贴板')
  } finally {
    terminal?.focus()
  }
}

// 清屏
function clearTerminal() {
  hideCtxMenu()
  terminal?.clear()
  terminal?.focus()
}

const darkTheme = {
  background: '#0f1117',
  foreground: '#e2e8f0',
  cursor: '#4f8ef7',
  cursorAccent: '#0f1117',
  black: '#1e2535',
  brightBlack: '#2a3347',
  red: '#f87171',
  brightRed: '#fc8181',
  green: '#34d399',
  brightGreen: '#6ee7b7',
  yellow: '#fbbf24',
  brightYellow: '#fcd34d',
  blue: '#4f8ef7',
  brightBlue: '#74a8f9',
  magenta: '#c084fc',
  brightMagenta: '#d8b4fe',
  cyan: '#22d3ee',
  brightCyan: '#67e8f9',
  white: '#e2e8f0',
  brightWhite: '#f8fafc',
  selectionBackground: 'rgba(79, 142, 247, 0.3)'
}

const lightTheme = {
  background: '#ffffff',
  foreground: '#24292f',
  cursor: '#24292f',
  cursorAccent: '#ffffff',
  black: '#24292f',
  brightBlack: '#6e7781',
  red: '#cf222e',
  brightRed: '#a40e26',
  green: '#1a7f37',
  brightGreen: '#2da44e',
  yellow: '#d4a72c',
  brightYellow: '#bf8700',
  blue: '#0969da',
  brightBlue: '#218bff',
  magenta: '#8250df',
  brightMagenta: '#a371f7',
  cyan: '#1b7c83',
  brightCyan: '#3192aa',
  white: '#6e7781',
  brightWhite: '#8c959f',
  selectionBackground: 'rgba(9, 105, 218, 0.2)'
}



function createTerminal() {
  const isLight = document.documentElement.classList.contains('light-mode')

  terminal = new Terminal({
    theme: isLight ? lightTheme : darkTheme,
    fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.5,
    letterSpacing: 0.5,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 5000,
    allowTransparency: true,
    macOptionIsMeta: true
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(new WebLinksAddon((e, uri) => {
    window.open(uri, '_blank')
  }))

  terminal.open(termRef.value)
  fitAddon.fit()

  // ===== 复制粘贴快捷键拦截 =====
  // 返回 false 表示阻止事件传给终端，返回 true 表示正常传递
  terminal.attachCustomKeyEventHandler((e) => {
    // Ctrl+Shift+C：复制选中内容
    if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
      const selection = terminal.getSelection()
      if (selection) {
        navigator.clipboard.writeText(selection)
        terminal.clearSelection()
      }
      return false
    }
    // Ctrl+Shift+V：粘贴
    if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
      navigator.clipboard.readText().then((text) => {
        if (text) terminal.paste(text)
        terminal.focus()
      }).catch(() => {
        terminal.focus()
      })
      return false
    }
    return true
  })

  // 点击任意位置隐藏右键菜单并保证终端重新获取焦点
  clickHandler = () => {
    hideCtxMenu()
    // 如果没有选中文本，则保证终端获取焦点
    if (!terminal.hasSelection()) {
      terminal.focus()
    }
  }
  termRef.value?.addEventListener('click', clickHandler)

  // 用户输入转发给主进程
  terminal.onData((data) => {
    sshAPI.input(props.session.id, data)
  })

  // 捕获终端标题，尝试提取当前路径 (Linux bash 默认标题: user@host: ~/path)
  terminal.onTitleChange((title) => {
    const parts = title.split(':')
    if (parts.length >= 2) {
      const maybePath = parts.slice(1).join(':').trim()
      props.session.cwd = maybePath
    }
  })

  terminal.onResize(({ cols, rows }) => {
    sshAPI.resize(props.session.id, cols, rows)
  })

  // 自适应大小
  resizeObserver = new ResizeObserver(() => {
    if (props.visible) {
      requestAnimationFrame(() => {
        fitAddon.fit()
        terminal.focus()
      })
    }
  })
  resizeObserver.observe(termRef.value)

  // 监听主题变化
  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'class') {
        const isLight = document.documentElement.classList.contains('light-mode')
        terminal.options.theme = isLight ? lightTheme : darkTheme
      }
    }
  })
  themeObserver.observe(document.documentElement, { attributes: true })

  // 监听主进程传来的数据 (Tauri listen 返回 Promise<UnlistenFn>)
  sshAPI.onData(({ sessionId, data }) => {
    if (sessionId === props.session.id) {
      terminal.write(data)
    }
  }).then((unlisten) => {
    unlistenData = unlisten
  })

  sshAPI.onClosed(({ sessionId }) => {
    if (sessionId === props.session.id) {
      props.session.status = 'closed'
      terminal.write('\r\n\x1b[33m[连接已关闭]\x1b[0m\r\n')
    }
  }).then((unlisten) => {
    unlistenClosed = unlisten
  })
}

async function connect() {
  props.session.status = 'connecting'
  try {
    await sshAPI.connect(props.session.id, props.session.hostId)
    props.session.status = 'connected'
    requestAnimationFrame(() => {
      fitAddon?.fit()
      terminal?.focus()
    })
    const { cols, rows } = terminal
    sshAPI.resize(props.session.id, cols, rows)
  } catch (err) {
    props.session.status = 'error'
    props.session.errorMessage = err
  }
}

async function retry() {
  terminal?.clear()
  await connect()
}

watch(() => props.visible, (v) => {
  if (v) {
    requestAnimationFrame(() => {
      fitAddon?.fit()
      terminal?.focus()
    })
  }
})

onMounted(async () => {
  createTerminal()
  terminal?.focus()
  await connect()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  if (termRef.value && clickHandler) {
    termRef.value.removeEventListener('click', clickHandler)
  }
  // 调用 Tauri 返回的取消订阅函数
  unlistenData?.()
  unlistenClosed?.()
  terminal?.dispose()
  sshAPI.disconnect(props.session.id)
})
</script>

<style scoped>
.terminal-pane {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.terminal-pane.hidden {
  pointer-events: none;
  opacity: 0;
  position: absolute;
  z-index: -1;
}

.xterm-container {
  flex: 1;
  overflow: hidden;
  /* 上下左留一点边距，右侧 0 确保滚动条紧贴屏幕边缘 */
  padding: 4px 0 4px 4px;
}

/* 覆盖 xterm 默认样式 */
:deep(.xterm) { height: 100%; }
:deep(.xterm-viewport) { 
  background: transparent !important; 
  cursor: default !important; /* 让滚动条不显示为编辑光标 */
  z-index: 10; /* 置于顶层避免被 screen 遮挡 */
}
/* 给 Terminal 独立放宽一点滚动条方便拖拉 */
:deep(.xterm-viewport::-webkit-scrollbar) {
  width: 12px;
}
:deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: var(--color-text-3);
  border: 3px solid var(--color-bg);
  border-radius: 999px;
  background-clip: padding-box;
}
:deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background: var(--color-text-2);
  border: 3px solid var(--color-bg);
  background-clip: padding-box;
}

.connecting-overlay, .error-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  z-index: 10;
}

.connecting-box {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px 32px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.error-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 40px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  text-align: center;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.connecting-info { display: flex; flex-direction: column; gap: 4px; }
.connecting-title { font-size: 14px; font-weight: 600; }
.connecting-addr { font-size: 12px; color: var(--color-text-2); font-family: var(--font-mono); }

.error-title { font-size: 16px; font-weight: 600; color: var(--color-danger); }
.error-msg { font-size: 13px; color: var(--color-text-2); max-width: 300px; word-break: break-all; }

/* ===== 右键菜单 ===== */
.ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  background: var(--color-bg-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 4px;
  box-shadow: var(--shadow);
  user-select: none;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 12px;
  font-family: var(--font-sans);
  cursor: pointer;
  text-align: left;
  transition: background var(--transition);
}
.ctx-item:hover { background: var(--color-bg-4); }

.ctx-shortcut {
  margin-left: auto;
  font-size: 10px;
  color: var(--color-text-3);
}

.ctx-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

/* 右键菜单动画 */
.ctx-fade-enter-active, .ctx-fade-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.ctx-fade-enter-from, .ctx-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
