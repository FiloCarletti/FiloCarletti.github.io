// Configurazione Vite condivisa da tutte le app della monorepo.
// Ogni cartella in apps/<slug> viene servita su /<slug>/ (la dashboard su /).
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import vue from '@vitejs/plugin-vue'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const APPS_DIR = path.join(ROOT, 'apps')
export const DIST_DIR = path.join(ROOT, 'dist')
export const DASHBOARD = 'dashboard'
// Nomi che non possono diventare slug: collidono con file/cartelle della dashboard.
export const RESERVED = new Set(['dashboard', 'assets', 'apps', 'shared', '404', 'index'])

/** Elenco degli slug pubblicabili (esclude le cartelle che iniziano con "_"). */
export function listApps() {
  return fs
    .readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name)
}

export function readMeta(slug) {
  const file = path.join(APPS_DIR, slug, 'app.json')
  if (!fs.existsSync(file)) throw new Error(`apps/${slug}/app.json mancante`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function baseFor(slug) {
  return slug === DASHBOARD ? '/' : `/${slug}/`
}

export function viteConfigFor(slug, { mode = 'production' } = {}) {
  const appRoot = path.join(APPS_DIR, slug)
  const meta = readMeta(slug)
  return {
    configFile: false,
    root: appRoot,
    base: baseFor(slug),
    mode,
    plugins: [vue()],
    resolve: {
      alias: {
        '@shared': path.join(ROOT, 'packages/shared/src'),
        '@': path.join(appRoot, 'src'),
      },
    },
    define: {
      __APP_SLUG__: JSON.stringify(slug),
      __APP_NAME__: JSON.stringify(meta.name ?? slug),
    },
    server: { fs: { allow: [ROOT] } },
    build: {
      outDir: slug === DASHBOARD ? DIST_DIR : path.join(DIST_DIR, slug),
      emptyOutDir: false,
      assetsDir: slug === DASHBOARD ? 'assets' : '_assets',
    },
    logLevel: 'warn',
  }
}
