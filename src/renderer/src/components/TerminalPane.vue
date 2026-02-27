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

    <!-- 原地幽灵文本补全（fixed 定位，不被 canvas 遮挡） -->
    <div v-if="isPopupOpen && ghostText" class="ghost-text" :style="ghostStyle">{{ ghostText }}</div>

    <!-- 联想提示下拉列表（fixed 定位，不被 canvas 遮挡） -->
    <Transition name="fade">
      <div v-if="isPopupOpen && suggestions.length > 0" class="autocomplete-popup" :style="popupStyle">
        <div
          v-for="(item, index) in suggestions"
          :key="index"
          class="ac-item"
          :class="{ selected: index === selectedIndex }"
          @mousedown.prevent="clickSuggestion(index)"
        >
          <span class="ac-typed">{{ localBuffer }}</span><span class="ac-rest">{{ item.slice(localBuffer.length) }}</span>
        </div>
      </div>
    </Transition>

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

    <MobileQuickKeys 
      class="mobile-keys-bar" 
      @send-input="handleMobileInput" 
    />
  </div>
</template>

<script setup>
import { appAPI, sshAPI, sftpAPI } from '@/api/tauri-bridge'
import { ref, onMounted, watch, onUnmounted, computed } from 'vue'
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import MobileQuickKeys from './MobileQuickKeys.vue'

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
let settingsHandler = null

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
    await writeText(text)
    terminal.clearSelection()
  }
  terminal?.focus()
}

// 粘贴剪贴板内容
async function pasteFromClipboard() {
  hideCtxMenu()
  try {
    const text = await readText()
    if (text && props.session.status === 'connected') {
      // 使用 terminal.paste 保留换行符等特殊字符
      terminal.paste(text)
    }
  } catch {
    console.warn('无法通过 Tauri 插件读取剪贴板')
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

  // ===== 自定义快捷键及补全拦截 =====
  terminal.attachCustomKeyEventHandler((e) => {
    if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
      const selection = terminal.getSelection()
      if (selection) {
        writeText(selection)
        terminal.clearSelection()
      }
      return false
    }
    if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
      readText().then((text) => {
        if (text) terminal.paste(text)
        terminal.focus()
      }).catch(() => { terminal.focus() })
      return false
    }

    if (e.type === 'keydown' && isPopupOpen.value) {
      if (e.key === 'ArrowDown') {
        selectedIndex.value = (selectedIndex.value + 1) % suggestions.value.length;
        e.preventDefault(); return false;
      }
      if (e.key === 'ArrowUp') {
        selectedIndex.value = (selectedIndex.value - 1 + suggestions.value.length) % suggestions.value.length;
        e.preventDefault(); return false;
      }
      if (e.key === 'Tab' || e.key === 'ArrowRight') {
        applySuggestion();
        e.preventDefault(); return false;
      }
      if (e.key === 'Escape') {
        isPopupOpen.value = false;
        e.preventDefault(); return false;
      }
    }
    return true
  })

  clickHandler = () => {
    hideCtxMenu()
    isPopupOpen.value = false
    if (!terminal.hasSelection()) terminal.focus()
  }
  termRef.value?.addEventListener('click', clickHandler)

  // 用户输入拦截与补全计算
  terminal.onData((data) => {
    // 如果处于 alternate buffer（通常是 vim, htop 等 TUI 程序），禁用补全逻辑
    if (terminal?.buffer.active.type === 'alternate') {
      localBuffer.value = ''
      isPopupOpen.value = false
      sshAPI.input(props.session.id, data)
      return
    }

    if (data === '\t') {
      // Tab 键：弹窗未打开时让 shell 原生处理
      if (!isPopupOpen.value) {
        isPopupOpen.value = false
        suggestions.value = []
        sshAPI.input(props.session.id, data)
      }
      return
    } else if (data.startsWith('\x1B')) {
      localBuffer.value = ''
      isPopupOpen.value = false
    } else if (data === '\r' || data === '\n') {
      // 仅清空本地缓冲区，不保存本地历史（只使用服务器历史）
      localBuffer.value = ''
    } else if (data === '\x7F' || data === '\b') {
      localBuffer.value = localBuffer.value.slice(0, -1)
    } else if (data === '\x03' || data === '\x04') {
      localBuffer.value = ''
      isPopupOpen.value = false
    } else if (data.length === 1 && data >= ' ' && data <= '~') {
      localBuffer.value += data
    }

    updateSuggestions()
    sshAPI.input(props.session.id, data)
  })

  terminal.onCursorMove(() => {
    if (isPopupOpen.value) updatePopupPosition()
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

    // 建立连接时先加载本地缓存的历史记录，解决网络慢时联想提示迟钝的问题
    const cachedHistory = appAPI.getHostHistory(props.session.hostId)
    if (cachedHistory && cachedHistory.length > 0) {
      cmdHistory.value = cachedHistory
      console.log('[autocomplete] Loaded history from local cache:', cachedHistory.length)
    }

    // 连接成功后，异步从服务器更新历史命令
    loadServerHistory()
  } catch (err) {
    props.session.status = 'error'
    props.session.errorMessage = err
  }
}

// 通过 SFTP 读取服务器的 shell 历史文件（每次连接都读最新的）
async function loadServerHistory() {
  const hostId = props.session.hostId
  const sftpSessionId = `hist_${props.session.id}`

  try {
    await sftpAPI.connect(sftpSessionId, hostId)
  } catch(e) {
    console.warn('[autocomplete] SFTP connect failed:', e)
    return
  }

  const historyFiles = [
    '~/.bash_history',
    '~/.zsh_history',
    '~/.local/share/fish/fish_history'
  ]

  let allCmds = []

  // 先解析 home 目录
  let home = '/root'
  try {
    home = await sftpAPI.realpath(sftpSessionId, '.')
  } catch(e) {}

  for (const filePath of historyFiles) {
    try {
      const realPath = filePath.replace('~', home)
      const content = await sftpAPI.readTextFile(sftpSessionId, realPath)
      if (content && content.length > 0) {
        allCmds.push(...parseHistoryFile(content, filePath))
      }
    } catch(e) {
      // 文件不存在，静默跳过
    }
  }

  if (allCmds.length > 0) {
    mergeServerHistory(allCmds)
    console.log('[autocomplete] Loaded', cmdHistory.value.length, 'server history items')
  }

  // 断开 SFTP 连接，避免连接泄漏
  try {
    await sftpAPI.disconnect(sftpSessionId)
  } catch(e) {
    console.warn('[autocomplete] SFTP disconnect failed:', e)
  }
}

// 解析不同 shell 的历史文件格式
function parseHistoryFile(content, filePath) {
  const lines = content.split('\n')
  const cmds = []

  if (filePath.includes('zsh_history')) {
    // zsh 格式: : timestamp:0;command
    for (const line of lines) {
      const match = line.match(/^:\s*\d+:\d+;(.+)/)
      if (match) {
        const cmd = match[1].trim()
        if (cmd && cmd.length > 1) cmds.push(cmd)
      } else {
        const trimmed = line.trim()
        if (trimmed && trimmed.length > 1 && !trimmed.startsWith('#')) cmds.push(trimmed)
      }
    }
  } else if (filePath.includes('fish_history')) {
    // fish 格式: - cmd: command
    for (const line of lines) {
      const match = line.match(/^- cmd:\s*(.+)/)
      if (match) {
        const cmd = match[1].trim()
        if (cmd && cmd.length > 1) cmds.push(cmd)
      }
    }
  } else {
    // bash 格式: 每行一个命令
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && trimmed.length > 1 && !trimmed.startsWith('#')) {
        cmds.push(trimmed)
      }
    }
  }

  return cmds
}

// 直接用服务器历史替换本地历史
function mergeServerHistory(serverCmds) {
  // 去重并只保留最后 500 条（最新在末尾，反转后最新的在前）
  const unique = [...new Set(serverCmds.map(c => c.trim()).filter(c => c.length > 1))]
  const finalHistory = unique.slice(-500).reverse() // 最新命令排在前面
  
  cmdHistory.value = finalHistory
  // 同步到本地缓存
  appAPI.saveHostHistory(props.session.hostId, finalHistory)
  
  console.log('[autocomplete] Server history loaded and cached:', finalHistory.length, 'items')
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
  historyEnabled.value = await appAPI.getTerminalHistoryConfig()
  settingsHandler = (e) => {
    historyEnabled.value = e.detail.enabled
    if (!historyEnabled.value) {
      isPopupOpen.value = false
      suggestions.value = []
    }
  }
  window.addEventListener('terminal-history-settings-changed', settingsHandler)

  createTerminal()
  terminal?.focus()
  await connect()
})

// ===== 终端内原位联想补全功能 =====
const localBuffer = ref('')
const isPopupOpen = ref(false)
const historyEnabled = ref(true)
const suggestions = ref([])
const selectedIndex = ref(0)
const cmdHistory = ref([])    // 仅存储服务器历史
const ghostStyle = ref({})
const popupStyle = ref({})

// 从 xterm 当前行缓冲区读取命令（去除 Prompt）
function readCurrentLineCmd() {
  if (!terminal) return ''
  const line = terminal.buffer.active.getLine(terminal.buffer.active.cursorY)
  if (!line) return ''
  const text = line.translateToString(true)
  // 去除 ANSI 转义码
  const raw = text.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
  // 常见 prompt 结尾模式：$ 、# 、% 、> 
  const promptMatch = raw.match(/(?:^|[\s\S]*)[\$#%>]\s(.+)$/)
  if (promptMatch) return promptMatch[1].trim()
  return raw.trim()
}

const ghostText = computed(() => {
  if (suggestions.value.length === 0) return '';
  const suggestion = suggestions.value[selectedIndex.value];
  if (suggestion.toLowerCase().startsWith(localBuffer.value.toLowerCase())) {
    return suggestion.slice(localBuffer.value.length);
  }
  return '';
})

// 仅展示用，不再保存本地历史
function saveHistory(_cmd) { /* no-op: 只使用服务器历史 */ }

function updateSuggestions() {
  if (!historyEnabled.value || !terminal || terminal.buffer.active.type === 'alternate' || !localBuffer.value.trim()) {
    isPopupOpen.value = false;
    suggestions.value = [];
    return;
  }
  
  const query = localBuffer.value.toLowerCase();
  const matches = cmdHistory.value.filter(h => h.toLowerCase().startsWith(query) && h.length > localBuffer.value.length);
  const allMatches = Array.from(new Set([...matches]));
  
  if (allMatches.length > 0) {
    suggestions.value = allMatches.slice(0, 8); // max 8 items
    selectedIndex.value = 0;
    isPopupOpen.value = true;
    requestAnimationFrame(updatePopupPosition);
  } else {
    isPopupOpen.value = false;
    suggestions.value = [];
  }
}

function updatePopupPosition() {
  if (!terminal || !termRef.value || terminal.buffer.active.type === 'alternate') {
    isPopupOpen.value = false;
    return;
  }
  const cursorX = terminal.buffer.active.cursorX
  const cursorY = terminal.buffer.active.cursorY

  const xtermScreen = termRef.value.querySelector('.xterm-screen')
  if (!xtermScreen) return

  // 用 fixed 定位：直接用 getBoundingClientRect 获得屏幕绝对坐标
  const rect = xtermScreen.getBoundingClientRect()

  const cellW = rect.width / terminal.cols
  const cellH = rect.height / terminal.rows

  const left = rect.left + cursorX * cellW
  const top  = rect.top  + cursorY * cellH

  ghostStyle.value = {
    position: 'fixed',
    left: left + 'px',
    top: top + 'px',
    height: cellH + 'px',
    lineHeight: cellH + 'px'
  }

  // 弹窗默认显示在光标下方，若超出屏幕底部则翻转到上方
  const popupH = Math.min(suggestions.value.length, 8) * 30 + 12
  const flipUp = top + cellH + popupH > window.innerHeight
  popupStyle.value = {
    position: 'fixed',
    left: left + 'px',
    top: flipUp ? (top - popupH - 4) + 'px' : (top + cellH + 4) + 'px'
  }
}

function applySuggestion() {
  const selected = suggestions.value[selectedIndex.value]
  if (selected) {
    const remainder = selected.slice(localBuffer.value.length)
    if (remainder.length > 0) {
      sshAPI.input(props.session.id, remainder)
      localBuffer.value += remainder
    }
    isPopupOpen.value = false
    suggestions.value = []
  }
}

function clickSuggestion(index) {
  selectedIndex.value = index;
  applySuggestion();
  terminal?.focus();
}

onUnmounted(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  window.removeEventListener('terminal-history-settings-changed', settingsHandler)
  if (termRef.value && clickHandler) {
    termRef.value.removeEventListener('click', clickHandler)
  }
  // 调用 Tauri 返回的取消订阅函数
  unlistenData?.()
  unlistenClosed?.()
  terminal?.dispose()
  sshAPI.disconnect(props.session.id)
})

function handleMobileInput(data) {
  if (props.session.status === 'connected') {
    sshAPI.input(props.session.id, data)
    terminal?.focus()
  }
}
</script>

<style scoped>
.terminal-pane {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.mobile-keys-bar {
  display: none;
}

@media (max-width: 768px) {
  .mobile-keys-bar {
    display: flex;
  }
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
  position: relative;
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

/* ===== 原位联想补全与弹窗（fixed 不被 canvas 遮挡） ===== */
.ghost-text {
  pointer-events: none;
  color: var(--color-text-3);
  opacity: 0.55;
  white-space: pre;
  z-index: 9990;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.5px;
}

.autocomplete-popup {
  z-index: 9991;
  background: var(--color-bg-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  padding: 4px;
  min-width: 200px;
  max-width: 500px;
}

.ac-item {
  padding: 6px 12px;
  font-size: 13px;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
  cursor: pointer;
  border-radius: 4px;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  letter-spacing: 0.5px;
}

.ac-typed {
  color: var(--color-text);
  font-weight: 600;
}

.ac-rest {
  color: var(--color-text-3);
}

.ac-item.selected {
  background: var(--color-primary-light);
}

.ac-item.selected .ac-typed,
.ac-item.selected .ac-rest {
  color: var(--color-primary);
}

.ac-item:hover {
  background: var(--color-bg-4);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.12s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
