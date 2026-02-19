import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'
import i18n from './i18n.js'

createApp(App).use(i18n).mount('#app')
