<script setup>
import { computed } from 'vue'
import FileIcon from './FileIcon.vue'

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    default: 0
  },
  currentPath: {
    type: String,
    default: '.'
  },
  isExpanded: {
    type: Function,
    required: true
  }
})

const emit = defineEmits(['navigate', 'toggle'])

const sortedChildren = computed(() => {
  if (!props.node.children) return []
  return [...props.node.children].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1
    if (a.type !== 'directory' && b.type === 'directory') return 1
    return a.name.localeCompare(b.name)
  })
})

const isSelected = computed(() => props.node.path === props.currentPath)
const expanded = computed(() => props.isExpanded(props.node.path))

const handleNodeClick = () => {
  emit('navigate', props.node.path)
}

const toggleExpand = () => {
  emit('toggle', props.node)
}

const handleNavigate = (path) => {
  emit('navigate', path)
}

const handleToggle = (childNode) => {
  emit('toggle', childNode)
}
</script>

<template>
  <div class="tree-node-wrapper">
    <div
      class="tree-node"
      :class="{ 'is-selected': isSelected }"
      :style="{ paddingLeft: `${depth * 16}px` }"
      @click.stop="handleNodeClick"
    >
      <div class="tree-node-content">
        <span
          class="expand-icon"
          @click.stop="toggleExpand"
        >
          <template v-if="node.type === 'directory'">
            <span v-if="node.isLoading" class="circular-loader"></span>
            <span v-else-if="expanded">▼</span>
            <span v-else>▶</span>
          </template>
        </span>
        <FileIcon :name="node.name" :is-directory="node.type === 'directory'" :is-expanded="expanded" :size="16" class="folder-icon" />
        <span class="node-name">{{ node.name }}</span>
      </div>
    </div>
    
    <div v-if="expanded && node.children?.length" class="tree-node-children">
      <!-- Self Referencing Component Strategy (Implicit Name by Vue, or explicit if we exported default, here using implicit filename) -->
      <SftpTreeNode
        v-for="child in sortedChildren"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :current-path="currentPath"
        :is-expanded="isExpanded"
        @navigate="handleNavigate"
        @toggle="handleToggle"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node-wrapper {
  display: flex;
  flex-direction: column;
}

.tree-node {
  user-select: none;
}

.tree-node-content {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  gap: 6px;
}

.tree-node-content:hover {
  background: var(--hover-bg);
}

.tree-node.is-selected > .tree-node-content {
  background: var(--selection-bg);
  color: var(--selection-text);
}

.expand-icon {
  width: 16px;
  text-align: center;
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.circular-loader {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-bottom-color: transparent;
  border-radius: 50%;
  animation: rotation 1s linear infinite;
}

@keyframes rotation {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.folder-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.node-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-node-children {
  display: flex;
  flex-direction: column;
}
</style>
