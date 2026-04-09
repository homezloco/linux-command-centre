import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        $lib: resolve('src/renderer/src/lib'),
        $stores: resolve('src/renderer/src/stores'),
        $modules: resolve('src/renderer/src/modules')
      }
    },
    plugins: [svelte()]
  }
})
