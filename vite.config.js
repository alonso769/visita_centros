import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 1. Esto asegura que tu página cargue bien en https://usuario.github.io/repo/
  base: './', 
  
  // 2. Esto le dice a Vite: "No crees una carpeta 'dist', crea una carpeta 'docs'"
  build: {
    outDir: 'docs',
  }
})
