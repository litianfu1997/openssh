<template>
  <Teleport to="body">
    <div class="dialog-mask" @click="$emit('close')">
      <div class="dialog slide-up-enter-active" @click.stop>
        <div class="dialog-header">
          <h2 class="dialog-title">{{ isEdit ? $t('mobile_keys.edit_custom') : $t('mobile_keys.add_custom') }}</h2>
          <button class="btn-icon" @click="$emit('close')">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          <div class="form-group">
            <label class="form-label">{{ $t('mobile_keys.custom_name') }}</label>
            <input v-model="form.name" class="form-input" :placeholder="$t('mobile_keys.custom_name_placeholder')" maxlength="5" />
          </div>

          <div class="form-group">
            <label class="form-label">{{ $t('mobile_keys.custom_cmd') }}</label>
            <textarea
              v-model="form.cmd"
              class="form-textarea"
              :placeholder="$t('mobile_keys.custom_cmd_placeholder')"
              rows="3"
            />
          </div>
        </div>

        <div class="dialog-footer">
          <button
            v-if="isEdit"
            class="btn btn-danger btn-delete"
            @click="handleDelete"
          >{{ $t('dialog.delete') }}</button>
          
          <div class="footer-spacer" />

          <button class="btn btn-primary btn-save" :disabled="!isValid" @click="handleSave">
            {{ isEdit ? $t('dialog.save') : $t('dialog.title_add') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Confirm Dialog -->
    <ConfirmDialog
      v-model:visible="showDeleteConfirm"
      type="danger"
      :title="$t('dialog.delete')"
      :message="$t('mobile_keys.custom_delete_confirm')"
      :confirm-text="$t('dialog.delete')"
      @confirm="confirmDelete"
    />
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps({
  customKey: { type: Object, default: null }
})

const emit = defineEmits(['close', 'saved', 'deleted'])

const form = ref({
  id: '',
  name: '',
  cmd: ''
})

const showDeleteConfirm = ref(false)

const isEdit = computed(() => !!props.customKey?.id)

const isValid = computed(() => form.value.name.trim() && form.value.cmd.trim())

watch(() => props.customKey, (k) => {
  if (k) {
    form.value = { ...k }
  } else {
    form.value = { id: '', name: '', cmd: '' }
  }
}, { immediate: true })

function handleSave() {
  if (!isValid.value) return
  
  // Create an ID for new keys
  const keyToSave = { ...form.value }
  if (!keyToSave.id) {
    keyToSave.id = `cmd_${Date.now()}`
  }

  emit('saved', keyToSave)
}

function handleDelete() {
  showDeleteConfirm.value = true
}

function confirmDelete() {
  emit('deleted', form.value.id)
  showDeleteConfirm.value = false
}
</script>

<style scoped>
.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
  padding: 20px 20px calc(20px + var(--keyboard-inset)) 20px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog {
  width: min(400px, 100%);
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-bg-2);
}

.dialog-title {
  font-size: 20px;
  font-weight: 700;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-3);
  cursor: pointer;
  transition: all var(--transition);
}

.btn-icon:hover {
  background: var(--color-bg-4);
  color: var(--color-text);
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-2);
}

.footer-spacer {
  flex: 1;
}

.btn {
  padding: 6px 16px;
  font-size: 14px;
}

@media (max-width: 768px) {
  .dialog-mask {
    align-items: flex-end;
    justify-content: stretch;
    padding: 0 0 var(--keyboard-inset) 0;
    backdrop-filter: none;
  }

  .dialog {
    width: 100%;
    border-radius: 18px 18px 0 0;
    border-bottom: none;
  }

  .dialog-header {
    padding: 14px 16px;
  }

  .dialog-title {
    font-size: 24px;
  }

  .btn-icon {
    width: 32px;
    height: 32px;
    background: var(--color-bg-3);
    border-radius: 50%;
  }

  .dialog-body {
    padding: 16px;
  }

  .dialog-footer {
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  }

  .form-input, .form-textarea {
    font-size: 16px; 
    padding: 12px;
  }
}
</style>
