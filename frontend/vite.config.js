import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

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
    },
    build: {
      // Target modern browsers (all supported in production)
      target: 'es2020',
      // Raise warning threshold — chunks are intentional
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // Manual chunk splitting: isolate heavy deps so browser can cache them
          // independently from app code that changes frequently
          manualChunks(id) {
            // React core — almost never changes
            if (id.includes('node_modules/react') ||
                id.includes('node_modules/react-dom') ||
                id.includes('node_modules/scheduler')) {
              return 'vendor-react';
            }
            // Framer Motion — large, rarely changes
            if (id.includes('node_modules/framer-motion')) {
              return 'vendor-framer';
            }
            // Lucide icons — large icon set
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-lucide';
            }
            // Axios
            if (id.includes('node_modules/axios')) {
              return 'vendor-axios';
            }
          },
        },
      },
    },
  }
})
