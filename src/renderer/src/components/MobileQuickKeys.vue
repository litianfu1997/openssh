<template>
  <div class="mobile-keyboard-panel" :class="{ 'expanded': activeTab === 'pc' }">
    <!-- Panel Content Area -->
    <div class="panel-content">
      <!-- Quick Keys Pane -->
      <div v-show="activeTab === 'quick'" class="keys-scroll-row">
        <button 
          class="quick-key-btn" 
          :class="{ active: modifierState.ctrl }" 
          @click="toggleModifier('ctrl')"
        >
          Ctrl
        </button>
        <button 
          class="quick-key-btn" 
          :class="{ active: modifierState.alt }" 
          @click="toggleModifier('alt')"
        >
          Alt
        </button>

        <template v-if="modifierState.ctrl">
          <button 
            v-for="letter in ctrlLetters" 
            :key="letter" 
            class="quick-key-btn letter-btn"
            @click="sendCtrl(letter)"
          >
            {{ letter }}
          </button>
        </template>

        <template v-else>
          <!-- Custom Keys -->
          <button 
            v-for="key in customKeys" 
            :key="key.id" 
            class="quick-key-btn custom-key-btn" 
            @click="sendInput(key.cmd)"
            @contextmenu.prevent="editCustomKey(key)"
          >
            {{ key.name }}
          </button>

          <!-- Normal System Keys -->
          <button 
            v-for="key in normalKeys" 
            :key="key.id" 
            class="quick-key-btn" 
            @click="handleNormalKey(key)"
          >
            <span v-if="key.icon" v-html="key.icon" class="key-icon"></span>
            <span v-else>{{ $t(`mobile_keys.${key.id}`) }}</span>
          </button>

          <!-- Add Custom Key Button -->
          <button 
            class="quick-key-btn add-custom-btn" 
            @click="openCustomKeyDialog()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </template>
      </div>

      <!-- PC Keys Pane (Expanded Grid) -->
      <div v-show="activeTab === 'pc'" class="pc-keys-grid">
        <button v-for="key in pcKeys" :key="key.id" class="pc-key-btn" @click="sendInput(key.code)">
          {{ key.label }}
        </button>
      </div>
    </div>

    <!-- Tab Bar -->
    <div class="tabs-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'system' }" @click="setTab('system')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/>
          <line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/>
          <line x1="6" y1="12" x2="6.01" y2="12"/><line x1="10" y1="12" x2="10.01" y2="12"/><line x1="14" y1="12" x2="14.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/>
          <line x1="8" y1="16" x2="16" y2="16"/>
        </svg>
        <span>{{ $t('mobile_keys.tab_system') }}</span>
      </button>

      <button class="tab-btn" :class="{ active: activeTab === 'quick' }" @click="setTab('quick')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        <span>{{ $t('mobile_keys.tab_quick') }}</span>
      </button>

      <button class="tab-btn" :class="{ active: activeTab === 'pc' }" @click="setTab('pc')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <span>{{ $t('mobile_keys.tab_pc') }}</span>
      </button>
    </div>
  </div>

  <MobileCustomKeyDialog 
    v-if="showCustomDialog"
    :custom-key="editingCustomKey"
    @close="showCustomDialog = false"
    @saved="onCustomKeySaved"
    @deleted="onCustomKeyDeleted"
  />
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import MobileCustomKeyDialog from './MobileCustomKeyDialog.vue'

const emit = defineEmits(['send-input', 'send-key', 'focus-terminal', 'blur-terminal'])

const activeTab = ref('system') // 'system', 'quick', 'pc'

const customKeys = ref([])
const showCustomDialog = ref(false)
const editingCustomKey = ref(null)

onMounted(() => {
  try {
    const saved = localStorage.getItem('mobileCustomKeys')
    if (saved) {
      customKeys.value = JSON.parse(saved)
    }
  } catch (e) {
    console.error('Failed to load custom keys', e)
  }
})

function saveCustomKeys() {
  localStorage.setItem('mobileCustomKeys', JSON.stringify(customKeys.value))
}

const normalKeys = [
  { id: 'esc', code: '\x1b' },
  { id: 'tab', code: '\t' },
  { id: 'slash', code: '/', icon: '/' },
  { id: 'dash', code: '-', icon: '-' },
  { id: 'up', code: '\x1b[A', icon: '↑' },
  { id: 'down', code: '\x1b[B', icon: '↓' },
  { id: 'left', code: '\x1b[D', icon: '←' },
  { id: 'right', code: '\x1b[C', icon: '→' }
]

const ctrlLetters = ['C', 'D', 'Z', 'L', 'A', 'E', 'U', 'K', 'R', 'W']

const pcKeys = [
  { id: 'esc', label: 'Esc', code: '\x1b' },
  { id: 'tab', label: 'Tab', code: '\t' },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `f${i+1}`, label: `F${i+1}`, code: `\x1b[${[11,12,13,14,15,17,18,19,20,21,23,24][i]}~` })),
  { id: 'insert', label: 'Ins', code: '\x1b[2~' },
  { id: 'delete', label: 'Del', code: '\x1b[3~' },
  { id: 'home', label: 'Home', code: '\x1b[H' },
  { id: 'end', label: 'End', code: '\x1b[F' },
  { id: 'pgup', label: 'PgUp', code: '\x1b[5~' },
  { id: 'pgdn', label: 'PgDn', code: '\x1b[6~' },
  { id: 'up', label: '↑', code: '\x1b[A' },
  { id: 'down', label: '↓', code: '\x1b[B' },
  { id: 'left', label: '←', code: '\x1b[D' },
  { id: 'right', label: '→', code: '\x1b[C' }
]

const modifierState = reactive({
  ctrl: false,
  alt: false
})

function setTab(tab) {
  activeTab.value = tab
  if (tab === 'system') {
    emit('focus-terminal')
  } else {
    // 强制当前焦点元素（比如终端内嵌的 textarea）失去焦点以收起系统输入法
    if (document.activeElement) {
      document.activeElement.blur()
    }
    emit('blur-terminal')
  }
}

function toggleModifier(mod) {
  modifierState[mod] = !modifierState[mod]
}

function sendCtrl(letter) {
  const code = letter.charCodeAt(0) - 64
  let output = String.fromCharCode(code)

  if (modifierState.alt) {
    output = '\x1b' + output
  }

  emit('send-input', output)
}

function sendInput(code) {
  let output = code
  if (modifierState.alt && code !== '\x1b') {
    output = '\x1b' + output
  }
  emit('send-input', output)
}

function handleNormalKey(key) {
  sendInput(key.code)
}

function getActiveModifiers() {
  return { ...modifierState }
}

function resetModifiers() {
  modifierState.ctrl = false
  modifierState.alt = false
}

// Custom Key Management
function openCustomKeyDialog() {
  editingCustomKey.value = null
  showCustomDialog.value = true
}

function editCustomKey(key) {
  editingCustomKey.value = { ...key }
  showCustomDialog.value = true
}

function onCustomKeySaved(keyObj) {
  const idx = customKeys.value.findIndex(k => k.id === keyObj.id)
  if (idx >= 0) {
    customKeys.value[idx] = keyObj
  } else {
    customKeys.value.push(keyObj)
  }
  saveCustomKeys()
  showCustomDialog.value = false
}

function onCustomKeyDeleted(id) {
  customKeys.value = customKeys.value.filter(k => k.id !== id)
  saveCustomKeys()
}

defineExpose({
  getActiveModifiers,
  resetModifiers
})
</script>

<style scoped>
.mobile-keyboard-panel {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-2);
  border-top: 1px solid var(--color-border);
  width: 100%;
  transition: height 0.2s ease;
}

.panel-content {
  display: flex;
  flex-direction: column;
}

/* Quick Keys Pane */
.keys-scroll-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 8px 6px;
  white-space: nowrap;
  width: 100%;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.keys-scroll-row::-webkit-scrollbar { display: none; }

/* PC Keys Pane */
.pc-keys-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  padding: 8px 6px;
  height: 180px;
  overflow-y: auto;
}

/* Generic Key Button */
.quick-key-btn, .pc-key-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-family: var(--font-mono), var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.1s ease;
  user-select: none;
  -webkit-touch-callout: none;
}

.quick-key-btn {
  flex-shrink: 0;
  height: 36px;
  min-width: 48px;
  padding: 0 12px;
  font-size: 14px;
}

.pc-key-btn {
  height: 40px;
  font-size: 12px;
}

.quick-key-btn:active, .pc-key-btn:active {
  background: var(--color-primary-light);
  transform: scale(0.95);
}

.custom-key-btn {
  color: var(--color-primary);
  border-color: var(--color-primary-light);
  font-weight: 600;
}

.add-custom-btn {
  min-width: 40px;
  color: var(--color-text-3);
  border-style: dashed;
}
.add-custom-btn:active {
  background: var(--color-bg-4);
  color: var(--color-text);
}

.quick-key-btn.active {
  background: var(--color-primary);
  color: #ffffff;
  border-color: var(--color-primary);
}

.key-icon { font-size: 16px; line-height: 1; }
.letter-btn { font-weight: 700; color: var(--color-primary); min-width: 40px; }

/* Tab Bar */
.tabs-bar {
  display: flex;
  border-top: 1px solid var(--color-border-light);
  background: var(--color-bg-2);
}

.tab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 0;
  background: transparent;
  border: none;
  color: var(--color-text-3);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s;
}

.tab-btn svg {
  opacity: 0.7;
}

.tab-btn.active {
  color: var(--color-primary);
}

.tab-btn.active svg {
  opacity: 1;
}
</style>
