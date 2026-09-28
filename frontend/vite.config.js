import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Enables HTTPS when running npm run dev:https or when HTTPS=true
const isHttps = process.env.HTTPS === 'true' || process.env.VITE_HTTPS === 'true' || process.argv.includes('--https')

export default defineConfig(({ mode }) => {
  const isHttps = mode === 'https' || process.env.HTTPS === 'true' || process.env.VITE_HTTPS === 'true'

  return {
    plugins: [
      react(),
      ...(isHttps ? [basicSsl()] : [])
    ],
    server: {
      port: 5173,
      host: true,
    }
  }
})
