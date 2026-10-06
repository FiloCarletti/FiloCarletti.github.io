// Contenuti del gioco: risorse, strutture, ricerche, territori, genoma, Albero Madre, traguardi.
// Solo dati e predicati sullo stato: la logica sta in engine.js.
// Bilanciamento: `node apps/micelio/tools/simula.mjs` simula un giocatore per N giorni.

export const RESOURCES = [
  { id: 'nutrienti', name: 'Nutrienti', icon: '🟤', cap: 100, desc: 'Sostanze assorbite dal terreno: la base di tutto.' },
  { id: 'acqua', name: 'Acqua', icon: '💧', cap: 100, desc: 'Trasportata dai rizomorfi attraverso la rete.' },
  { id: 'zuccheri', name: 'Zuccheri', icon: '🍯', cap: 80, desc: 'Ricevuti dagli alberi in cambio di nutrienti e acqua.' },
  { id: 'segnali', name: 'Segnali', icon: '⚡', cap: 60, desc: 'Impulsi elettrici tra i nodi: servono per la ricerca.' },
  { id: 'enzimi', name: 'Enzimi', icon: '🧪', cap: 80, desc: 'Sciolgono legno e roccia.' },
  { id: 'minerali', name: 'Minerali', icon: '💎', cap: 80, desc: 'Estratti dalla decomposizione.' },
  { id: 'luce', name: 'Luce', icon: '✨', cap: 40, desc: 'Bioluminescenza dei corpi fruttiferi: nutre l’Albero Madre.' },
]

/** Il deposito di una risorsa raddoppia a ogni livello; costa questa frazione della capienza attuale. */
export const STORAGE_COST = 0.3

/** Riserva: i convertitori lasciano sempre almeno questa frazione del deposito (regolabile per risorsa). */
export const DEFAULT_RESERVE = 0.25
export const RESERVE_STEPS = [0, 0.25, 0.5, 0.75, 0.9]

// in/out: unità al secondo per struttura. `main`: risorsa su cui agisce la stagione.
export const BUILDINGS = [
  {
    id: 'ifa', name: 'Ifa', icon: '🧵', main: 'nutrienti',
    desc: 'Un filamento sottile che assorbe nutrienti dal terreno.',
    cost: { nutrienti: 10 }, g: 1.14, out: { nutrienti: 0.5 },
  },
  {
    id: 'rizomorfo', name: 'Rizomorfo', icon: '🌿', main: 'acqua',
    desc: 'Un fascio di ife che risucchia acqua dal sottosuolo.',
    cost: { nutrienti: 30 }, g: 1.14, out: { acqua: 0.4 },
    req: (s) => (s.b.ifa ?? 0) >= 3, hint: 'Possiedi 3 ife.',
  },
  {
    id: 'micorriza', name: 'Micorriza', icon: '🌳', main: 'zuccheri',
    desc: 'Si avvolge alle radici di un albero: gli cede nutrienti e acqua, riceve zuccheri.',
    cost: { nutrienti: 120, acqua: 60 }, g: 1.16, in: { nutrienti: 0.8, acqua: 0.6 }, out: { zuccheri: 0.5 },
    req: (s) => (s.b.rizomorfo ?? 0) >= 3, hint: 'Possiedi 3 rizomorfi.',
  },
  {
    id: 'nodo', name: 'Nodo di rete', icon: '🕸️', main: 'segnali',
    desc: 'Un incrocio della rete che brucia zuccheri per generare segnali.',
    cost: { nutrienti: 400, zuccheri: 60 }, g: 1.18, in: { zuccheri: 0.4 }, out: { segnali: 0.25 },
    req: (s) => (s.b.micorriza ?? 0) >= 2, hint: 'Possiedi 2 micorrize.',
  },
  {
    id: 'cordone', name: 'Cordone miceliare', icon: '🪢', main: 'nutrienti',
    desc: 'Ife intrecciate in un cavo spesso: assorbe molto di più.',
    cost: { nutrienti: 3000, segnali: 120 }, g: 1.15, out: { nutrienti: 6, acqua: 3 },
    req: (s) => s.rs.cordoni, hint: 'Ricerca: Cordoni miceliari.',
  },
  {
    id: 'ghiandola', name: 'Ghiandola enzimatica', icon: '🧪', main: 'enzimi',
    desc: 'Trasforma zuccheri e acqua in enzimi digestivi.',
    cost: { nutrienti: 2500, zuccheri: 300 }, g: 1.17, in: { zuccheri: 0.6, acqua: 0.8 }, out: { enzimi: 0.3 },
    req: (s) => s.rs.enzimologia, hint: 'Ricerca: Enzimologia.',
  },
  {
    id: 'decompositore', name: 'Decompositore', icon: '🍂', main: 'minerali',
    desc: 'Digerisce legno morto e roccia: libera minerali e molti nutrienti.',
    cost: { nutrienti: 15000, enzimi: 250 }, g: 1.18, in: { enzimi: 0.4 }, out: { minerali: 0.25, nutrienti: 5 },
    req: (s) => s.rs.decomposizione, hint: 'Ricerca: Decomposizione.',
  },
  {
    id: 'radice', name: 'Radice ospite', icon: '🌲', main: 'zuccheri',
    desc: 'Un albero intero adotta la rete: zuccheri e acqua senza chiedere nulla.',
    cost: { zuccheri: 20000, minerali: 800 }, g: 1.17, out: { zuccheri: 4, acqua: 6 },
    req: (s) => s.terr >= 3, hint: 'Conquista il Ruscello.',
  },
  {
    id: 'corpo', name: 'Corpo fruttifero', icon: '🍄', main: 'luce',
    desc: 'Un fungo che emerge in superficie e brilla nel buio.',
    cost: { nutrienti: 2e5, minerali: 3000, enzimi: 2000 }, g: 1.2, in: { zuccheri: 3, minerali: 0.2 }, out: { luce: 0.15 },
    req: (s) => s.terr >= 6, hint: 'Conquista la Radura.',
  },
  {
    id: 'lanterna', name: 'Colonia lanterna', icon: '🏮', main: 'luce',
    desc: 'Centinaia di funghi luminosi sincronizzati.',
    cost: { minerali: 1e5, luce: 400 }, g: 1.22, in: { zuccheri: 40, enzimi: 6 }, out: { luce: 2.5 },
    req: (s) => s.rs.sincronia, hint: 'Ricerca: Sincronia luminosa.',
  },
]

// Effetti (fx): { t: 'all', x } produzione totale · { t: 'b', id, x } una struttura · { t: 'click', x }
// { t: 'cap', x } capienza di tutti i depositi · { t: 'spore', x } spore alla sporulazione
// { t: 'season', x } riduce i malus stagionali di x (0..1) · { t: 'cost', x } costo delle strutture
export const RESEARCH = [
  { id: 'assorbimento', name: 'Assorbimento attivo', cost: { segnali: 10 }, fx: [{ t: 'click', x: 3 }], desc: 'Il tocco assorbe il triplo.' },
  { id: 'ife_ramificate', name: 'Ife ramificate', cost: { segnali: 20 }, fx: [{ t: 'b', id: 'ifa', x: 2 }] },
  { id: 'capillarita', name: 'Capillarità', cost: { segnali: 40 }, fx: [{ t: 'b', id: 'rizomorfo', x: 2 }] },
  { id: 'scambio', name: 'Scambio equo', cost: { segnali: 60 }, fx: [{ t: 'b', id: 'micorriza', x: 1.5 }] },
  { id: 'enzimologia', name: 'Enzimologia', cost: { segnali: 120 }, fx: [], desc: 'Sblocca la Ghiandola enzimatica.' },
  { id: 'cordoni', name: 'Cordoni miceliari', cost: { segnali: 200 }, fx: [], desc: 'Sblocca il Cordone miceliare.' },
  { id: 'ife_settate', name: 'Ife settate', cost: { segnali: 350 }, fx: [{ t: 'b', id: 'ifa', x: 2 }], need: ['ife_ramificate'] },
  { id: 'impulsi', name: 'Impulsi elettrici', cost: { segnali: 500 }, fx: [{ t: 'b', id: 'nodo', x: 2 }] },
  { id: 'decomposizione', name: 'Decomposizione', cost: { segnali: 800, enzimi: 150 }, fx: [], desc: 'Sblocca il Decompositore.', need: ['enzimologia'] },
  { id: 'economia', name: 'Crescita economa', cost: { segnali: 1200 }, fx: [{ t: 'cost', x: 0.9 }] },
  { id: 'rete_estesa', name: 'Rete estesa', cost: { segnali: 2000 }, fx: [{ t: 'all', x: 1.25 }] },
  { id: 'capillarita2', name: 'Vasi capillari', cost: { segnali: 3500 }, fx: [{ t: 'b', id: 'rizomorfo', x: 2 }], need: ['capillarita'] },
  { id: 'cordoni2', name: 'Cordoni intrecciati', cost: { segnali: 5000, minerali: 200 }, fx: [{ t: 'b', id: 'cordone', x: 2 }], need: ['cordoni'] },
  { id: 'micorriza2', name: 'Fiducia reciproca', cost: { segnali: 8000 }, fx: [{ t: 'b', id: 'micorriza', x: 2 }], need: ['scambio'] },
  { id: 'chimica', name: 'Chimica del suolo', cost: { segnali: 12000, minerali: 500 }, fx: [{ t: 'b', id: 'ghiandola', x: 2 }], need: ['enzimologia'] },
  { id: 'osmosi', name: 'Osmosi', cost: { segnali: 20000 }, fx: [{ t: 'cap', x: 1.5 }] },
  { id: 'letargo', name: 'Letargo attivo', cost: { segnali: 30000 }, fx: [{ t: 'season', x: 0.3 }], desc: 'Riduce del 30% i malus delle stagioni.' },
  { id: 'humus', name: 'Humus', cost: { segnali: 45000, minerali: 2000 }, fx: [{ t: 'b', id: 'decompositore', x: 2 }], need: ['decomposizione'] },
  { id: 'memoria', name: 'Memoria della rete', cost: { segnali: 80000 }, fx: [{ t: 'all', x: 1.5 }], need: ['rete_estesa'] },
  { id: 'impulsi2', name: 'Potenziale d’azione', cost: { segnali: 1.5e5 }, fx: [{ t: 'b', id: 'nodo', x: 2 }], need: ['impulsi'] },
  { id: 'radici2', name: 'Radici profonde', cost: { segnali: 2.5e5, minerali: 1e4 }, fx: [{ t: 'b', id: 'radice', x: 2 }] },
  { id: 'ife3', name: 'Ife giganti', cost: { segnali: 4e5 }, fx: [{ t: 'b', id: 'ifa', x: 3 }, { t: 'b', id: 'cordone', x: 2 }], need: ['ife_settate'] },
  { id: 'sporogenesi', name: 'Sporogenesi', cost: { segnali: 6e5 }, fx: [{ t: 'spore', x: 1.25 }] },
  { id: 'fotoforo', name: 'Fotofori', cost: { segnali: 1e6, luce: 100 }, fx: [{ t: 'b', id: 'corpo', x: 2 }], need: ['sporogenesi'] },
  { id: 'sincronia', name: 'Sincronia luminosa', cost: { segnali: 2e6, luce: 300 }, fx: [], desc: 'Sblocca la Colonia lanterna.', need: ['fotoforo'] },
  { id: 'osmosi2', name: 'Pressione osmotica', cost: { segnali: 3e6 }, fx: [{ t: 'cap', x: 2 }], need: ['osmosi'] },
  { id: 'letargo2', name: 'Ciclo perpetuo', cost: { segnali: 5e6 }, fx: [{ t: 'season', x: 0.3 }], need: ['letargo'] },
  { id: 'coscienza', name: 'Coscienza del bosco', cost: { segnali: 1e7 }, fx: [{ t: 'all', x: 2 }], need: ['memoria'] },
  { id: 'lanterna2', name: 'Lanterne gemelle', cost: { segnali: 3e7, luce: 5000 }, fx: [{ t: 'b', id: 'lanterna', x: 2 }], need: ['sincronia'] },
  { id: 'sporogenesi2', name: 'Spore alate', cost: { segnali: 8e7 }, fx: [{ t: 'spore', x: 1.5 }], need: ['sporogenesi'] },
  { id: 'coscienza2', name: 'Mente collettiva', cost: { segnali: 3e8 }, fx: [{ t: 'all', x: 3 }], need: ['coscienza'] },
]

// Territori in ordine: si conquistano uno dopo l'altro, nella partita in corso.
// Dopo l'ultimo con nome continuano all'infinito (vedi territoryAt in engine.js).
export const TERRITORIES = [
  { name: 'Sottobosco', icon: '🌱', cost: {}, fx: [], desc: 'Dove tutto comincia: un po’ di terra umida sotto le foglie.' },
  { name: 'Ceppo marcito', icon: '🪵', cost: { nutrienti: 1500, acqua: 800 }, fx: [{ t: 'all', x: 1.1 }], desc: '+10% a tutta la produzione.' },
  { name: 'Radici del faggio', icon: '🌳', cost: { nutrienti: 15000, zuccheri: 2000 }, fx: [{ t: 'b', id: 'micorriza', x: 1.5 }, { t: 'all', x: 1.1 }], desc: 'Micorrize +50%, produzione +10%.' },
  { name: 'Ruscello', icon: '🏞️', cost: { nutrienti: 1.2e5, zuccheri: 2e4, segnali: 2000 }, fx: [{ t: 'b', id: 'rizomorfo', x: 2 }, { t: 'all', x: 1.15 }], desc: 'Rizomorfi ×2, produzione +15%. Sblocca la Radice ospite.' },
  { name: 'Tronco caduto', icon: '🪓', cost: { nutrienti: 5e5, enzimi: 5000 }, fx: [{ t: 'b', id: 'decompositore', x: 1.5 }, { t: 'all', x: 1.2 }], desc: 'Decompositori +50%, produzione +20%.' },
  { name: 'Pietraia', icon: '🪨', cost: { nutrienti: 3e6, enzimi: 1e4, minerali: 2000 }, fx: [{ t: 'b', id: 'decompositore', x: 2 }, { t: 'all', x: 1.2 }], desc: 'Decompositori ×2, produzione +20%.' },
  { name: 'Radura', icon: '☀️', cost: { nutrienti: 1.5e7, minerali: 8000, zuccheri: 1e6 }, fx: [{ t: 'all', x: 1.25 }], desc: 'Produzione +25%. Sblocca il Corpo fruttifero.' },
  { name: 'Palude', icon: '🐸', cost: { nutrienti: 2e8, acqua: 5e7, luce: 150 }, fx: [{ t: 'b', id: 'corpo', x: 1.5 }, { t: 'all', x: 1.3 }], desc: 'Corpi fruttiferi +50%, produzione +30%.' },
  { name: 'Grotta', icon: '🕳️', cost: { nutrienti: 1.5e9, minerali: 1e6, luce: 1500 }, fx: [{ t: 'b', id: 'lanterna', x: 2 }, { t: 'all', x: 1.4 }], desc: 'Colonie lanterna ×2, produzione +40%.' },
  { name: 'Foresta antica', icon: '🌲', cost: { nutrienti: 1.5e10, segnali: 1e8, luce: 1.5e4 }, fx: [{ t: 'all', x: 1.5 }, { t: 'spore', x: 1.25 }], desc: 'Produzione +50%, spore +25%.' },
]
/** Oltre l'ultimo territorio: costi ×FAR_COST e +FAR_BONUS a ogni passo. */
export const FAR_COST = 12
export const FAR_BONUS = 1.25

// Genoma: potenziamenti permanenti comprati con le spore. Costo = base · g^livello.
export const GENOME = [
  { id: 'vigore', name: 'Vigore', icon: '💪', base: 1, g: 1.5, per: 0.3, desc: '+30% a tutta la produzione per livello.' },
  { id: 'riserve', name: 'Riserve', icon: '🫙', base: 2, g: 1.7, per: 0.5, desc: '+50% alla capienza dei depositi per livello.' },
  { id: 'germoglio', name: 'Germoglio', icon: '🌱', base: 1, g: 2.2, max: 10, desc: 'Ogni partita inizia con 5 ife e 3 rizomorfi in più per livello.' },
  { id: 'fertile', name: 'Spore fertili', icon: '🌬️', base: 3, g: 1.8, per: 0.2, desc: '+20% di spore alla sporulazione per livello.' },
  { id: 'resilienza', name: 'Resilienza', icon: '🛡️', base: 4, g: 2.2, max: 5, per: 0.12, desc: 'Malus delle stagioni −12% per livello.' },
  { id: 'esplorazione', name: 'Esplorazione', icon: '🧭', base: 5, g: 2, max: 8, per: 0.1, desc: 'Territori −10% di costo per livello.' },
  { id: 'intuito', name: 'Intuito', icon: '💡', base: 3, g: 2, max: 8, per: 0.1, desc: 'Ricerche −10% di costo per livello.' },
  { id: 'tocco', name: 'Tocco esperto', icon: '👆', base: 1, g: 1.5, max: 20, per: 1, desc: 'Il tocco vale +100% per livello e il 2% della produzione di nutrienti.' },
]

// Albero Madre: progetto permanente (sopravvive alla sporulazione). Ogni stadio si nutre di luce.
export const TREE = {
  stages: 12,
  cost: (k) => ({ luce: Math.round(300 * 4 ** k) }),
  all: 1.25, // ×1.25 alla produzione per stadio
  spore: 0.15, // +15% spore per stadio
  names: ['Seme', 'Plantula', 'Alberello', 'Giovane', 'Fusto', 'Chioma', 'Albero', 'Albero grande', 'Patriarca', 'Albero secolare', 'Albero millenario', 'Albero Madre'],
}

// Stagioni: la giornata reale è un anno (6 ore per stagione, ora locale).
export const SEASONS = [
  { id: 'inverno', name: 'Inverno', icon: '❄️', fx: { '*': 0.7, segnali: 2 }, desc: 'Tutto rallenta (−30%), ma i segnali raddoppiano.' },
  { id: 'primavera', name: 'Primavera', icon: '🌱', fx: { nutrienti: 1.5, acqua: 1.3 }, desc: 'Nutrienti +50%, acqua +30%.' },
  { id: 'estate', name: 'Estate', icon: '☀️', fx: { zuccheri: 1.6, acqua: 0.6, luce: 1.3 }, desc: 'Zuccheri +60%, luce +30%, acqua −40%.' },
  { id: 'autunno', name: 'Autunno', icon: '🍂', fx: { nutrienti: 1.3, minerali: 1.6, enzimi: 1.3 }, desc: 'Foglie a terra: nutrienti +30%, minerali +60%, enzimi +30%.' },
]

/** Bonus di ogni traguardo alla produzione (additivo). */
export const ACH_BONUS = 0.02

const fmtN = (n) => (n >= 1e6 ? `${n / 1e6} M` : n >= 1e3 ? `${n / 1e3} K` : String(n))
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0)
const DAY = 86400000

export const ACHIEVEMENTS = [
  ...BUILDINGS.flatMap((b) =>
    [1, 25, 50, 100, 150].map((n) => ({
      id: `b_${b.id}_${n}`, icon: b.icon, name: n === 1 ? `Prima ${b.name.toLowerCase()}` : `${n} × ${b.name}`,
      desc: `Possiedi ${n} ${b.name.toLowerCase()} nella stessa partita.`, test: (s) => (s.b[b.id] ?? 0) >= n,
    })),
  ),
  ...[1e3, 1e5, 1e7, 1e9, 1e11, 1e13, 1e15].map((n, i) => ({
    id: `nut_${i}`, icon: '🟤', name: `Assorbiti ${n >= 1e3 ? n.toExponential(0).replace('e+', 'e') : n}`,
    desc: `Produci ${n.toLocaleString('it-IT')} nutrienti in totale.`, test: (s) => (s.life.earned.nutrienti ?? 0) >= n,
  })),
  ...[1e3, 1e5, 1e7, 1e9].map((n, i) => ({
    id: `luce_${i}`, icon: '✨', name: `Luce ${fmtN(n)}`, desc: `Produci ${n.toLocaleString('it-IT')} di luce in totale.`,
    test: (s) => (s.life.earned.luce ?? 0) >= n,
  })),
  ...[5, 15, 25, RESEARCH.length].map((n) => ({
    id: `rs_${n}`, icon: '🔬', name: n === RESEARCH.length ? 'Enciclopedia' : `${n} ricerche`,
    desc: `Completa ${n} ricerche nella stessa partita.`, test: (s) => Object.keys(s.rs).length >= n,
  })),
  ...TERRITORIES.slice(1).map((t, i) => ({
    id: `terr_${i + 1}`, icon: t.icon, name: t.name, desc: `Conquista: ${t.name}.`, test: (s) => s.terr >= i + 1,
  })),
  ...[12, 15, 20].map((n) => ({ id: `terr_far_${n}`, icon: '🗺️', name: `Oltre il bosco (${n})`, desc: `Conquista ${n} territori in una partita.`, test: (s) => s.terr >= n })),
  ...[1, 3, 10, 25, 50].map((n) => ({
    id: `spor_${n}`, icon: '🌬️', name: n === 1 ? 'Prima sporulazione' : `${n} sporulazioni`,
    desc: `Sporula ${n} volt${n === 1 ? 'a' : 'e'}.`, test: (s) => s.life.spor >= n,
  })),
  ...[10, 100, 1000, 1e4].map((n) => ({
    id: `spore_${n}`, icon: '🍄', name: `${fmtN(n)} spore`, desc: `Raccogli ${n.toLocaleString('it-IT')} spore in totale.`,
    test: (s) => s.life.sporeTot >= n,
  })),
  ...[10, 25, 50].map((n) => ({ id: `gen_${n}`, icon: '🧬', name: `Genoma ${n}`, desc: `Raggiungi ${n} livelli di genoma in totale.`, test: (s) => sum(s.gen) >= n })),
  ...[1, 4, 8, 12].map((n) => ({
    id: `tree_${n}`, icon: '🌳', name: TREE.names[n - 1], desc: `Fai crescere l’Albero Madre fino allo stadio ${n}.`, test: (s) => s.tree >= n,
  })),
  ...[1, 3, 7, 14, 30, 60, 100].map((n) => ({
    id: `days_${n}`, icon: '📅', name: n === 1 ? 'Un giorno nel bosco' : `${n} giorni nel bosco`,
    desc: `Gioca da ${n} giorn${n === 1 ? 'o' : 'i'}.`, test: (s, now) => now - s.created >= n * DAY,
  })),
  ...[100, 1000, 1e4].map((n) => ({ id: `click_${n}`, icon: '👆', name: `${fmtN(n)} tocchi`, desc: `Tocca il terreno ${n.toLocaleString('it-IT')} volte.`, test: (s) => s.life.clicks >= n })),
  { id: 'all_seasons', icon: '🔄', name: 'Un anno intero', desc: 'Gioca in tutte e quattro le stagioni.', test: (s) => (s.seasonsSeen ?? []).length >= 4 },
]
