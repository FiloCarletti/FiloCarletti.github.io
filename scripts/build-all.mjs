// Compila la dashboard e tutte le app in dist/, pronto per GitHub Pages.
//   npm run build                 -> tutto
//   npm run build:one -- <slug>   -> solo quella app (verifica veloce)
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'vite'
import {
  DIST_DIR, DASHBOARD, RESERVED, listApps, readMeta, baseFor, viteConfigFor, writeManifest,
} from './vite-config.mjs'

const onlyIdx = process.argv.indexOf('--only')
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null

const slugs = listApps()
const errors = []
for (const slug of slugs) {
  if (slug !== DASHBOARD && RESERVED.has(slug)) errors.push(`slug riservato: ${slug}`)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.push(`slug non valido (usa kebab-case): ${slug}`)
  readMeta(slug)
}
if (!slugs.includes(DASHBOARD)) errors.push('manca apps/dashboard')
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

writeManifest()

const targets = only ? [only] : [DASHBOARD, ...slugs.filter((s) => s !== DASHBOARD)]
if (only && !slugs.includes(only)) {
  console.error(`App non trovata: apps/${only}`)
  process.exit(1)
}

fs.rmSync(DIST_DIR, { recursive: true, force: true })
fs.mkdirSync(DIST_DIR, { recursive: true })

for (const slug of targets) {
  const t = Date.now()
  await build(viteConfigFor(slug))
  console.log(`✓ ${slug.padEnd(24)} ${baseFor(slug).padEnd(26)} ${Date.now() - t} ms`)
}

// GitHub Pages: niente Jekyll, 404 che riporta alla dashboard.
fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '')
fs.writeFileSync(
  path.join(DIST_DIR, '404.html'),
  `<!doctype html><meta charset="utf-8"><title>Non trovato</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#0f1115;color:#e6e8ee}a{color:#7aa2ff}</style>
<p>Pagina non trovata. <a href="/">Torna alla dashboard</a></p>`,
)
console.log(`\nBuild completata in dist/ (${targets.length} app)`)
