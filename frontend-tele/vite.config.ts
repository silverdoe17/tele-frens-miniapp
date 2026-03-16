import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, './package.json'), 'utf8')
)

export default defineConfig(({ command, mode }) => {
  const appVersion = packageJson.version || '0.0.0'
  const buildTime = new Date().toISOString()

  if (command === 'build') {
    console.log(`[frontend-tele] Building version ${appVersion} (${buildTime})`)
  }

  return {
    base: '/miniapp/',
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __BUILD_TIME__: JSON.stringify(buildTime),
      __APP_MODE__: JSON.stringify(mode),
    },
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used - do not remove them
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
