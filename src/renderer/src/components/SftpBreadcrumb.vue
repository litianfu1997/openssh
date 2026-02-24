<script setup>
import { ref, computed, nextTick } from 'vue'

const props = defineProps({
  path: {
    type: String,
    default: '.'
  }
})

const emit = defineEmits(['navigate'])

const isEditing = ref(false)
const inputPath = ref('')
const inputRef = ref(null)

const breadcrumbs = computed(() => {
  if (props.path === '.') return [{ name: '~', path: '.' }]
  if (props.path === '/') return [{ name: '/', path: '/' }]

  const parts = props.path.split('/')
  const result = []
  let currentPath = ''

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part && i > 0) continue // ignore empty except root
    
    if (i === 0) {
      currentPath = part
      // If part is empty, it means path started with '/'. Use 'Root' or '/' as name, but better not '/' to avoid duplicate slash look
      result.push({
        name: part === '' ? 'Root' : (part === '.' ? '~' : part),
        path: part === '' ? '/' : part
      })
    } else {
      currentPath = currentPath === '' ? `/${part}` : (currentPath === '/' ? `/${part}` : `${currentPath}/${part}`)
      result.push({
        name: part,
        path: i === parts.length - 1 ? props.path : currentPath
      })
    }
  }

  return result
})

const handleNavigate = (path) => {
  if (isEditing.value) return
  emit('navigate', path)
}

const startEditing = () => {
  isEditing.value = true
  inputPath.value = props.path === '.' ? '/' : props.path
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

const applyEdit = () => {
  if (!isEditing.value) return
  isEditing.value = false
  if (inputPath.value && inputPath.value.trim() !== props.path) {
    let newPath = inputPath.value.trim()
    if (newPath === '/') newPath = '.'
    emit('navigate', newPath)
  }
}

const cancelEdit = () => {
  isEditing.value = false
}
</script>

<template>
  <div class="sftp-breadcrumb" @click.self="startEditing">
    <template v-if="!isEditing">
      <span
        v-for="(crumb, index) in breadcrumbs"
        :key="index"
        class="breadcrumb-item"
        :class="{ 'is-last': index === breadcrumbs.length - 1 }"
        @click="handleNavigate(crumb.path)"
      >
        {{ crumb.name }}
        <span v-if="index < breadcrumbs.length - 1" class="separator">/</span>
      </span>
      <div class="breadcrumb-spacer" @click="startEditing"></div>
    </template>
    <div v-else class="breadcrumb-input-container">
      <input
        ref="inputRef"
        v-model="inputPath"
        type="text"
        class="breadcrumb-input"
        @keyup.enter="applyEdit"
        @blur="applyEdit"
        @keyup.escape="cancelEdit"
      />
    </div>
  </div>
</template>

<style scoped>
.sftp-breadcrumb {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
  cursor: text;
  min-height: 37px;
}

.breadcrumb-spacer {
  flex: 1;
  height: 100%;
  cursor: text;
}

.breadcrumb-item {
  cursor: pointer;
  color: var(--text-color);
}

.breadcrumb-item:hover:not(.is-last) {
  color: var(--accent-color);
}

.breadcrumb-item.is-last {
  cursor: default;
  font-weight: 500;
}

.separator {
  margin: 0 4px;
  color: var(--text-secondary);
}

.breadcrumb-input-container {
  flex: 1;
  display: flex;
}

.breadcrumb-input {
  flex: 1;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  padding: 4px 8px;
  font-size: 13px;
  border-radius: 4px;
  outline: none;
  font-family: inherit;
  width: 100%;
}

.breadcrumb-input:focus {
  border-color: var(--accent-color);
}
</style>
