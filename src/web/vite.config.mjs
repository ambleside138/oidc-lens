import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { Agent } from 'node:https'

export default defineConfig(() => {
  const certificates = process.env.OIDC_LENS_HTTPS_DIR
  const backend = process.env.OIDC_LENS_BFF_URL
  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      strictPort: true,
      https: certificates ? {
        cert: readFileSync(`${certificates}/local.crt`),
        key: readFileSync(`${certificates}/local.key`),
      } : undefined,
      watch: process.env.OIDC_LENS_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
      proxy: backend ? Object.fromEntries(['/api', '/auth', '/my-data', '/signin-oidc'].map(path => [path, {
        target: backend,
        // Preserve localhost:7443 so OIDC callbacks keep the registered origin.
        changeOrigin: false,
        // The local certificate is issued for localhost, including inside Docker.
        agent: certificates ? new Agent({ ca: readFileSync(`${certificates}/local.crt`), servername: 'localhost' }) : undefined,
      }])) : undefined,
    },
  }
})
