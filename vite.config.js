import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const targetPlatform = env.VITE_TARGET_PLATFORM || 'desktop'
    const isAndroidBuild = targetPlatform === 'android'

    return {
        root: 'src/renderer',
        resolve: {
            alias: {
                '@': resolve(__dirname, 'src/renderer/src'),
                '@editor-component': resolve(
                    __dirname,
                    isAndroidBuild
                        ? 'src/renderer/src/components/LightweightEditor.vue'
                        : 'src/renderer/src/components/MonacoEditor.vue'
                )
            }
        },
        plugins: [vue()],
        optimizeDeps: isAndroidBuild
            ? { include: [] }
            : {
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
    }
})
