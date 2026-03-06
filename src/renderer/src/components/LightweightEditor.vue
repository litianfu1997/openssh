<template>
  <div class="lightweight-editor">
    <textarea
      ref="editorRef"
      class="editor-input"
      :value="modelValue"
      :style="{ fontSize: `${props.fontSize}px` }"
      :readonly="readOnly"
      :spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      @input="handleInput"
      @keydown="handleKeydown"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'plaintext' },
  theme: { type: String, default: 'vs-dark' },
  readOnly: { type: Boolean, default: false },
  fontSize: { type: Number, default: 13 }
})

const emit = defineEmits(['update:modelValue', 'save'])

const editorRef = ref(null)

function handleInput(event) {
  emit('update:modelValue', event.target.value)
}

function handleKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    emit('save', editorRef.value?.value || props.modelValue)
  }
}

defineExpose({
  focus: () => editorRef.value?.focus(),
  getValue: () => editorRef.value?.value || props.modelValue
})
</script>

<style scoped>
.lightweight-editor {
  width: 100%;
  height: 100%;
  background: #0d1117;
}

.editor-input {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 12px 14px;
  background: transparent;
  color: #e2e8f0;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
  line-height: 1.55;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}

.editor-input::selection {
  background: rgba(79, 142, 247, 0.35);
}

.editor-input[readonly] {
  opacity: 0.8;
}
</style>
