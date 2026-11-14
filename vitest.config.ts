import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// LL5 — configuração de teste. O alias `@` espelha o tsconfig para que os
// módulos de src/ll5 importem '@/...' como no app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    reporters: ['verbose'],
  },
})
