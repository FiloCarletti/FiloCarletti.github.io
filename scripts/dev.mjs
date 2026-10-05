// Server di sviluppo per una singola app:  npm run dev -- <slug>
import { createServer } from 'vite'
import { listApps, viteConfigFor } from './vite-config.mjs'

const slug = process.argv[2] ?? 'dashboard'
if (!listApps().includes(slug)) {
  console.error(`App non trovata: apps/${slug}. Disponibili: ${listApps().join(', ')}`)
  process.exit(1)
}
const server = await createServer({
  ...viteConfigFor(slug, { mode: 'development' }),
  logLevel: 'info',
  server: { port: 5173, fs: { strict: false } },
})
await server.listen()
server.printUrls()
