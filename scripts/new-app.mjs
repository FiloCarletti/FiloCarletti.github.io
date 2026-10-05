// Crea una nuova app dal template:
//   npm run new-app -- <slug> "<Nome visibile>" "<descrizione>" "<emoji>"
import fs from 'node:fs'
import path from 'node:path'
import { APPS_DIR, RESERVED } from './vite-config.mjs'

const [slug, name, description = '', icon = '🧩'] = process.argv.slice(2)
if (!slug || !name) {
  console.error('Uso: npm run new-app -- <slug> "<Nome>" "[descrizione]" "[emoji]"')
  process.exit(1)
}
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || RESERVED.has(slug)) {
  console.error(`Slug non valido o riservato: ${slug}`)
  process.exit(1)
}
const dest = path.join(APPS_DIR, slug)
if (fs.existsSync(dest)) {
  console.error(`Esiste già: apps/${slug}`)
  process.exit(1)
}

const prefix = slug.replace(/-/g, '_') + '_'
const today = new Date().toISOString().slice(0, 10)
const replace = (s) =>
  s
    .replaceAll('__SLUG__', slug)
    .replaceAll('__NAME__', name)
    .replaceAll('__DESCRIPTION__', description)
    .replaceAll('__ICON__', icon)
    .replaceAll('__PREFIX__', prefix)
    .replaceAll('__DATE__', today)

function copy(src, dst) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true })
      copy(s, d)
    } else {
      fs.writeFileSync(d, replace(fs.readFileSync(s, 'utf8')))
    }
  }
}
fs.mkdirSync(dest, { recursive: true })
copy(path.join(APPS_DIR, '_template'), dest)
console.log(`Creata apps/${slug}  (prefisso tabelle: ${prefix})`)
