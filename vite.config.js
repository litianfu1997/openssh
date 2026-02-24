import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
    root: 'src/renderer',
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src/renderer/src')
        }
    },
    plugins: [vue()],
    optimizeDeps: {
        include: [
            'monaco-editor/esm/vs/language/json/json.worker',
            'monaco-editor/esm/vs/language/css/css.worker',
            'monaco-editor/esm/vs/language/html/html.worker',
            'monaco-editor/esm/vs/language/typescript/ts.worker',
            'monaco-editor/esm/vs/editor/editor.worker'
        ]
    },
    worker: {
        format: 'es'
    },
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        outDir: '../../out/renderer',
        emptyOutDir: true
    }
})
