// Server di sviluppo con TUTTE le app, come in produzione:
//   npm run dev                 -> http://localhost:5173/ (dashboard)
//   npm run dev -- <slug>       -> stampa anche http://localhost:5173/<slug>/
// Ogni app ha la sua istanza Vite (base /<slug>/) montata su un unico server HTTP;
// /<slug> senza barra finale viene rediretto a /<slug>/.
// Per il login da localhost, in Supabase > Authentication > URL Configuration
// deve esserci il Redirect URL  http://localhost:5173/**
import http from 'node:http'
import { createServer } from 'vite'
import { DASHBOARD, listApps, viteConfigFor, writeManifest } from './vite-config.mjs'

const PORT = Number(process.env.PORT ?? 5173)
const focus = process.argv[2]
const slugs = listApps()
if (focus && !slugs.includes(focus)) {
  console.error(`App non trovata: apps/${focus}. Disponibili: ${slugs.join(', ')}`)
  process.exit(1)
}
writeManifest()

const servers = {}
let i = 0
for (const slug of slugs) {
  servers[slug] = await createServer({
    ...viteConfigFor(slug, { mode: 'development' }),
    appType: 'spa',
    server: { middlewareMode: true, hmr: { port: 24678 + i++ }, fs: { strict: false } },
  })
}

http
  .createServer((req, res) => {
    const { pathname, search } = new URL(req.url, 'http://localhost')
    const slug = pathname.split('/')[1]
    if (slug && slug !== DASHBOARD && servers[slug]) {
      if (pathname === `/${slug}`) {
        res.writeHead(302, { Location: `/${slug}/${search}` })
        return res.end()
      }
      return servers[slug].middlewares(req, res)
    }
    servers[DASHBOARD].middlewares(req, res)
  })
  .listen(PORT, () => {
    console.log(`\n  Dashboard  http://localhost:${PORT}/`)
    for (const s of slugs.filter((s) => s !== DASHBOARD)) {
      console.log(`  ${s === focus ? '→' : ' '} ${s.padEnd(18)} http://localhost:${PORT}/${s}/`)
    }
    console.log()
  })
