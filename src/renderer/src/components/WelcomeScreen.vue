<template>
  <div class="welcome">
    <div class="welcome-content">
      <!-- Logo -->
      <div class="logo">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <rect width="56" height="56" rx="16" fill="#4f8ef7" fill-opacity="0.12"/>
          <path d="M14 38l12-12-12-12M28 42h14" stroke="#4f8ef7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <h1 class="welcome-title">{{ $t('welcome.title') }}</h1>
      <p class="welcome-desc">{{ $t('welcome.desc') }}</p>

      <div class="welcome-actions">
        <button class="btn btn-primary" @click="$emit('new-host')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
          </svg>
          {{ $t('welcome.add_first') }}
        </button>
      </div>

      <!-- 快捷提示 -->
      <div class="tips">
        <div class="tip-item">
          <kbd>{{ $t('welcome.tips.connect') }}</kbd>
          <span>Click</span>
        </div>
        <div class="tip-divider" />
        <div class="tip-item">
          <kbd>+</kbd>
          <span>{{ $t('welcome.tips.add') }}</span>
        </div>
        <div class="tip-divider" />
        <div class="tip-item">
          <kbd>Auth</kbd>
          <span>{{ $t('welcome.tips.auth') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['new-host'])
</script>

<style scoped>
.welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
}

.welcome-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
  padding: 40px;
}

.logo {
  margin-bottom: 8px;
}

.welcome-title {
  font-size: 28px;
  font-weight: 600;
  background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-desc {
  font-size: 14px;
  color: var(--color-text-3);
  margin-top: -8px;
}

.welcome-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.tips {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  padding: 14px 24px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-2);
}

.tip-divider {
  width: 1px;
  height: 16px;
  background: var(--color-border);
}

kbd {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  background: var(--color-bg-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-sans);
  color: var(--color-primary);
  font-weight: 600;
}
</style>
