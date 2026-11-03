import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const src = (p: string) => path.resolve(import.meta.dirname, './src', p)
const normalize = (p: string) => path.resolve(p.split('?')[0]).toLowerCase()

/**
 * DEMO REJIM (`npm run dev -- --mode demo`): haqiqiy Firebase va server
 * o'rniga namunaviy ma'lumot (src/demo). Faqat sahifalarni ko'rib tekshirish
 * uchun — oddiy yig'ilishga bu fayllar umuman kirmaydi.
 *
 * Almashtirish import YO'LI hal bo'lgandan keyin qilinadi: `@/lib/api` ham,
 * `./api` ham bir xil faylga boradi va ikkalasi ham ushlanadi.
 */
function demoModules(): Plugin {
  const packages: Record<string, string> = {
    'firebase/firestore': src('demo/firestore.ts'),
    'firebase/auth': src('demo/auth.ts'),
    'firebase/app': src('demo/app.ts'),
  }
  const files = new Map([[normalize(src('lib/api.ts')), src('demo/api.ts')]])
  return {
    name: 'selta-demo-modules',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (packages[source]) return packages[source]
      if (!importer || importer.includes(`${path.sep}demo${path.sep}`) || importer.includes('/demo/')) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return (resolved && files.get(normalize(resolved.id))) ?? null
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [...(mode === 'demo' ? [demoModules()] : []), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
}))
