<template>
  <Teleport to="body">
    <div class="dialog-mask">
      <div class="dialog slide-up-enter-active">
        <!-- 对话框头部 -->
        <div class="dialog-header">
          <h2 class="dialog-title">{{ isEdit ? $t('dialog.title_edit') : $t('dialog.title_add') }}</h2>
          <button class="btn-icon" @click="$emit('close')">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- 表单 -->
        <div class="dialog-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">{{ $t('dialog.name') }} *</label>
              <input v-model="form.name" class="form-input" :placeholder="$t('dialog.placeholder_name')" />
            </div>
            <div class="form-group" style="flex: 0 0 100px">
              <label class="form-label">{{ $t('dialog.group') }}</label>
              <input v-model="form.group_name" class="form-input" :placeholder="$t('dialog.placeholder_group')" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">{{ $t('dialog.host') }} *</label>
              <input v-model="form.host" class="form-input" :placeholder="$t('dialog.placeholder_host')" />
            </div>
            <div class="form-group" style="flex: 0 0 90px">
              <label class="form-label">{{ $t('dialog.port') }}</label>
              <input v-model.number="form.port" class="form-input" type="number" placeholder="22" min="1" max="65535" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">{{ $t('dialog.username') }} *</label>
            <input v-model="form.username" class="form-input" placeholder="root" />
          </div>

          <!-- 认证方式切换 -->
          <div class="auth-tabs">
            <button
              class="auth-tab"
              :class="{ active: form.auth_type === 'password' }"
              @click="form.auth_type = 'password'"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {{ $t('dialog.auth_password') }}
            </button>
            <button
              class="auth-tab"
              :class="{ active: form.auth_type === 'key' }"
              @click="form.auth_type = 'key'"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              {{ $t('dialog.auth_key') }}
            </button>
          </div>

          <template v-if="form.auth_type === 'password'">
            <div class="form-group">
              <label class="form-label">{{ $t('dialog.password') }}</label>
              <input v-model="form.password" class="form-input" type="password" :placeholder="$t('dialog.password')" autocomplete="new-password" />
            </div>
          </template>

          <template v-else>
            <div class="form-group">
              <label class="form-label">{{ $t('dialog.private_key') }}</label>
              <textarea
                v-model="form.private_key"
                class="form-textarea"
                :placeholder="$t('dialog.placeholder_key')"
                rows="5"
              />
            </div>
            <div class="form-group">
              <label class="form-label">{{ $t('dialog.passphrase') }}</label>
              <input v-model="form.passphrase" class="form-input" type="password" :placeholder="$t('dialog.placeholder_passphrase')" />
            </div>
          </template>

          <div class="form-group">
            <label class="form-label">{{ $t('dialog.desc') }}</label>
            <input v-model="form.description" class="form-input" :placeholder="$t('dialog.placeholder_desc')" />
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="dialog-footer">
          <button
            v-if="isEdit"
            class="btn btn-danger"
            @click="handleDelete"
          >删除</button>
          <div style="flex:1" />
          <!-- 测试连接状态 -->
          <transition name="fade">
            <span v-if="testStatus" class="test-badge" :class="testStatus">
              <svg v-if="testStatus === 'testing'" class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              <svg v-else-if="testStatus === 'success'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              <span class="test-badge-text">{{ testMessage }}</span>
            </span>
          </transition>
          <button
            class="btn btn-test"
            :disabled="!isValid || testStatus === 'testing'"
            @click="handleTest"
          >
            {{ testStatus === 'testing' ? $t('dialog.testing') : $t('dialog.test_connection') }}
          </button>
          <button class="btn btn-ghost" @click="$emit('close')">{{ $t('dialog.cancel') }}</button>
          <button class="btn btn-primary" :disabled="!isValid" @click="handleSave">
            {{ isEdit ? $t('dialog.save') : $t('dialog.title_add') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { hostsAPI, sshAPI } from '@/api/tauri-bridge'
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  host: { type: Object, default: null }
})

const emit = defineEmits(['close', 'saved'])

const form = ref({
  id: null,
  name: '',
  host: '',
  port: 22,
  username: '',
  auth_type: 'password',
  password: '',
  private_key: '',
  passphrase: '',
  group_name: '', // 默认留空，显示 placeholder
  description: ''
})

// 测试连接状态: '' | 'testing' | 'success' | 'failed'
const testStatus = ref('')
const testMessage = ref('')

const isEdit = computed(() => !!props.host?.id)

const isValid = computed(() =>
  form.value.name.trim() &&
  form.value.host.trim() &&
  form.value.username.trim()
)



function getGroupValue(g) {
  if (!g || g === '默认分组' || g === 'Default Group') return ''
  return g
}

watch(() => props.host, (h) => {
  if (h) {
    Object.assign(form.value, {
      ...h,
      group_name: getGroupValue(h.group_name)
    })
  } else {
    // 重置表单
     form.value = {
      id: null,
      name: '',
      host: '',
      port: 22,
      username: '',
      auth_type: 'password',
      password: '',
      private_key: '',
      passphrase: '',
      group_name: '',
      description: ''
    }
  }
  // 切换主机时重置测试状态
  testStatus.value = ''
  testMessage.value = ''
}, { immediate: true })

async function handleSave() {
  if (!isValid.value) return
  const data = { ...form.value }
  // 如果分组为空，则存为 'Default Group' 方便国际化
  if (!data.group_name.trim()) {
    data.group_name = 'Default Group'
  }
  if(data.id === null) delete data.id; await hostsAPI.save(data)
  emit('saved')
}

async function handleTest() {
  if (!isValid.value) return
  testStatus.value = 'testing'
  testMessage.value = t('dialog.testing')
  try {
    const testConfig = {
      host: form.value.host,
      port: form.value.port || 22,
      username: form.value.username,
      auth_type: form.value.auth_type,
      password: form.value.password,
      private_key: form.value.private_key,
      passphrase: form.value.passphrase
    }
    console.log('[handleTest] Sending config:', testConfig)
    const result = await sshAPI.test(testConfig)
    console.log('[handleTest] Result:', result, typeof result)
    if (result && result.success) {
      testStatus.value = 'success'
      testMessage.value = t('dialog.test_success')
    } else {
      testStatus.value = 'failed'
      testMessage.value = result?.message || t('dialog.test_failed')
    }
  } catch (e) {
    console.error('[handleTest] Error:', e)
    testStatus.value = 'failed'
    testMessage.value = e.message || t('dialog.test_failed')
  }
  // 5 秒后自动清除
  setTimeout(() => {
    testStatus.value = ''
    testMessage.value = ''
  }, 5000)
}

async function handleDelete() {
  if (!confirm(t('dialog.confirm_delete', { name: form.value.name }))) return
  await hostsAPI.delete(form.value.id)
  emit('saved')
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
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog {
  width: 520px;
  max-height: 90vh;
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
}

.dialog-title {
  font-size: 14px;
  font-weight: 600;
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
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row > .form-group {
  flex: 1;
}

.auth-tabs {
  display: flex;
  gap: 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 3px;
}

.auth-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-3);
  font-size: 12px;
  font-family: var(--font-sans);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition);
}

.auth-tab.active {
  background: var(--color-bg-3);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.dialog-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}
.dialog-footer .btn {
  font-size: 12px;
  padding: 5px 12px;
}

/* 测试连接按钮 */
.btn-test {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  padding: 5px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-3);
  color: var(--color-text-2);
  cursor: pointer;
  transition: all var(--transition);
  font-family: var(--font-sans);
}
.btn-test:hover:not(:disabled) {
  background: var(--color-bg-4);
  color: var(--color-text);
  border-color: var(--color-primary);
}
.btn-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 测试结果徽章 */
.test-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
}
.test-badge.testing {
  background: rgba(99, 179, 237, 0.1);
  border-color: rgba(99, 179, 237, 0.3);
  color: #63b3ed;
}
.test-badge.success {
  background: rgba(72, 187, 120, 0.12);
  border-color: rgba(72, 187, 120, 0.35);
  color: #48bb78;
}
.test-badge.failed {
  background: rgba(252, 129, 74, 0.12);
  border-color: rgba(252, 129, 74, 0.35);
  color: #fc814a;
}
.test-badge-text {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 旋转动画 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spin {
  animation: spin 1s linear infinite;
}

/* fade 过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
