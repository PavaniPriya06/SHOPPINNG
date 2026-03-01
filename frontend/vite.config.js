import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend runs on port 5000
const BACKEND_URL = 'http://localhost:5000';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        host: true, // Expose to network for mobile testing
        proxy: {
            '/api': { target: BACKEND_URL, changeOrigin: true },
            '/uploads': { target: BACKEND_URL, changeOrigin: true }
        }
    },
    build: {
        outDir: 'dist',
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            output: {
                manualChunks: {
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    'ui-vendor': ['tailwindcss', 'react-hot-toast', 'framer-motion', 'react-icons']
                }
            }
        }
    }
})
