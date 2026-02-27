<template>
  <div class="mobile-quick-keys">
    <!-- 将特殊键以两行展示，或者通过滚动条展示均可，考虑到手机宽度，一般是可滚动的行 -->
    <div class="keys-scroll-row">
      <button 
        v-for="key in keys" 
        :key="key.id" 
        class="quick-key-btn" 
        :class="{ active: key.isModifier && modifierState[key.id] }"
        @touchstart.prevent="handleKey(key)"
        @mousedown.prevent="handleKey(key)"
      >
        <span v-if="key.icon" v-html="key.icon" class="key-icon"></span>
        <span v-else>{{ $t(`mobile_keys.${key.id}`) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'

const emit = defineEmits(['send-input', 'send-key'])

// 预定义快捷键列表
// isModifier 表示它是修饰符，比如 Ctrl/Alt 这种按下后保持高亮直到按下一个字符
const keys = [
  { id: 'esc', code: '\x1b', type: 'char' },
  { id: 'ctrl', type: 'modifier', isModifier: true },
  { id: 'alt', type: 'modifier', isModifier: true },
  { id: 'tab', code: '\t', type: 'char' },
  { id: 'up', code: '\x1b[A', type: 'char', icon: '↑' },
  { id: 'down', code: '\x1b[B', type: 'char', icon: '↓' },
  { id: 'left', code: '\x1b[D', type: 'char', icon: '←' },
  { id: 'right', code: '\x1b[C', type: 'char', icon: '→' }
]

const modifierState = reactive({
  ctrl: false,
  alt: false
})

function handleKey(key) {
  if (key.type === 'modifier') {
    modifierState[key.id] = !modifierState[key.id]
  } else if (key.type === 'char') {
    let output = key.code

    // 如果启用了 Alt（相当于发送 ESC + 字符）
    if (modifierState.alt) {
      if (key.id !== 'esc') {
        output = '\x1b' + output
      }
      modifierState.alt = false // 发送后重置
    }

    emit('send-input', output)
    
    // 如果启用了 Ctrl，这部分逻辑一般是输入普通字母时需要的，
    // 因为这上面没有字母键盘。但在虚拟面板上点其他键时，也将其重置。
    // 如果想要让终端处理，我们可以暴露 modifier 状态，不过这超出了基本快捷键面板的范围。
    modifierState.ctrl = false
  }
}

// 提供一个供外部组件调用的方法，用于在使用系统软键盘输入字母时计算 ctrl 的组合。
function getActiveModifiers() {
  return { ...modifierState }
}

function resetModifiers() {
  modifierState.ctrl = false
  modifierState.alt = false
}

defineExpose({
  getActiveModifiers,
  resetModifiers
})
</script>

<style scoped>
.mobile-quick-keys {
  display: flex;
  background: var(--color-bg-2);
  border-top: 1px solid var(--color-border);
  padding: 6px 4px;
  width: 100%;
}

.keys-scroll-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  white-space: nowrap;
  scrollbar-width: none; /* Firefox */
}

.keys-scroll-row::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Edge */
}

.quick-key-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  min-width: 44px;
  padding: 0 10px;
  background: var(--color-bg-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 13px;
  font-family: var(--font-mono), var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.1s ease;
  user-select: none;
  -webkit-touch-callout: none;
}

.quick-key-btn:active {
  background: var(--color-primary-light);
  transform: scale(0.95);
}

.quick-key-btn.active {
  background: var(--color-primary);
  color: #ffffff;
  border-color: var(--color-primary);
}

.key-icon {
  font-size: 16px;
  line-height: 1;
}

/* 仅在移动端屏幕或较小屏幕度下显示，这可通过外部组件通过 @media 控制 */
</style>
