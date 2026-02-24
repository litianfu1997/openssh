<script setup>
import { ref, computed } from 'vue'
import SftpTreeNode from './SftpTreeNode.vue'

const props = defineProps({
  treeData: {
    type: Array,
    default: () => []
  },
  currentPath: {
    type: String,
    default: '.'
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['navigate', 'load-children'])

const expandedNodes = ref(new Set(['.']))

const toggleExpand = (node) => {
  if (expandedNodes.value.has(node.path)) {
    expandedNodes.value.delete(node.path)
  } else {
    expandedNodes.value.add(node.path)
    if (node.type === 'directory' && (!node.children || node.children.length === 0)) {
      emit('load-children', node)
    }
  }
}

const handleNodeClick = (path) => {
  emit('navigate', path)
}

const isExpanded = (path) => expandedNodes.value.has(path)

const sortedTreeData = computed(() => {
  return [...props.treeData].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1
    if (a.type !== 'directory' && b.type === 'directory') return 1
    return a.name.localeCompare(b.name)
  })
})
</script>

<template>
  <div class="sftp-tree">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else class="tree-root">
      <SftpTreeNode
        v-for="node in sortedTreeData"
        :key="node.path"
        :node="node"
        :current-path="currentPath"
        :is-expanded="isExpanded"
        @navigate="handleNodeClick"
        @toggle="toggleExpand"
      />
    </div>
  </div>
</template>

<style scoped>
.sftp-tree {
  width: 250px;
  border-right: 1px solid var(--border-color);
  overflow: auto;
  background: var(--bg-secondary);
}

.loading {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
}

.tree-root {
  padding: 8px 0;
}
</style>
