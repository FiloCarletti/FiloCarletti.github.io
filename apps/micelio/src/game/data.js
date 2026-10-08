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
// { t: 'season', x } riduce i malus di stagioni e meteo di x (0..1) · { t: 'cost', x } costo delle strutture
// { t: 'res', id, x } strutture che producono quella risorsa · { t: 'slot', x } spedizioni contemporanee in più
// { t: 'expTime', x } durata delle spedizioni · { t: 'luck', x } probabilità dei reperti più rari
// Tratti degli anelli e reperti applicano lo stesso effetto una volta per copia / livello.
// Salvataggi: gli id (e l'ordine dei territori) non vanno mai cambiati, solo aggiunti.
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
  // espansione
  { id: 'catalizzatori', name: 'Catalizzatori', cost: { segnali: 6e7, enzimi: 1e5 }, fx: [{ t: 'b', id: 'ghiandola', x: 3 }], need: ['chimica', 'sincronia'], desc: 'Più enzimi per le colonie lanterna.' },
  { id: 'micorriza3', name: 'Rete di scambio', cost: { segnali: 2e8, zuccheri: 1e9 }, fx: [{ t: 'res', id: 'zuccheri', x: 2 }], need: ['micorriza2', 'lanterna2'] },
  { id: 'lanterna3', name: 'Aurora sotterranea', cost: { segnali: 1e9, luce: 1e7 }, fx: [{ t: 'res', id: 'luce', x: 2 }], need: ['lanterna2', 'catalizzatori'] },
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

// ---------------------------------------------------------------- espansione: meteo, anelli, spedizioni
// Meccaniche legate al tempo reale: la produzione aiuta, ma non basta a bruciarle in pochi giorni.

// Meteo: uno al giorno (ora locale), estratto dalla data. Si somma alla stagione.
export const WEATHER = [
  { id: 'sereno', name: 'Sereno', icon: '🌤️', w: 30, fx: {}, desc: 'Nessun effetto.' },
  { id: 'pioggia', name: 'Pioggia', icon: '🌧️', w: 18, fx: { acqua: 1.6, zuccheri: 1.2, luce: 0.8 }, desc: 'Acqua +60%, zuccheri +20%, luce −20%.' },
  { id: 'nebbia', name: 'Nebbia', icon: '🌫️', w: 12, fx: { luce: 1.5, enzimi: 1.3 }, desc: 'L’umidità piace ai funghi: luce +50%, enzimi +30%.' },
  { id: 'vento', name: 'Vento', icon: '🍃', w: 10, fx: { nutrienti: 1.4, minerali: 1.2 }, desc: 'Foglie e rami a terra: nutrienti +40%, minerali +20%.' },
  { id: 'temporale', name: 'Temporale', icon: '⛈️', w: 8, fx: { '*': 0.9, segnali: 2.2 }, desc: 'Tutto −10%, ma i fulmini eccitano la rete: segnali ×2,2.' },
  { id: 'siccita', name: 'Siccità', icon: '🏜️', w: 9, fx: { acqua: 0.5, minerali: 1.5, enzimi: 1.2 }, desc: 'Acqua −50%, minerali +50%, enzimi +20%.' },
  { id: 'luna', name: 'Luna piena', icon: '🌕', w: 7, fx: { luce: 2 }, desc: 'I corpi fruttiferi brillano: luce ×2.' },
  { id: 'gelata', name: 'Gelata', icon: '🧊', w: 6, fx: { '*': 0.8, segnali: 1.5 }, desc: 'Tutto −20%, segnali +50%.' },
]

// Anelli: quando l'Albero Madre è adulto, a ogni mezzanotte (fine dell'anno del bosco) matura
// un anello. Si forma pagandolo in luce e scegliendo uno di tre tratti, che restano per sempre.
// Gli anelli maturi non formati si accumulano: non si perde nulla saltando un giorno.
export const RINGS = {
  cost: (k) => ({ luce: Math.round(1e9 * 1.3 ** k) }),
  choices: 3,
}
export const RING_TRAITS = [
  { id: 'rigoglio', name: 'Rigoglio', icon: '🌿', fx: [{ t: 'all', x: 1.15 }] },
  { id: 'luminoso', name: 'Anello luminoso', icon: '✨', fx: [{ t: 'res', id: 'luce', x: 1.3 }] },
  { id: 'linfa', name: 'Linfa dolce', icon: '🍯', fx: [{ t: 'res', id: 'zuccheri', x: 1.3 }] },
  { id: 'falda', name: 'Falda', icon: '💧', fx: [{ t: 'res', id: 'acqua', x: 1.4 }] },
  { id: 'humus', name: 'Humus', icon: '🟤', fx: [{ t: 'res', id: 'nutrienti', x: 1.3 }] },
  { id: 'catalisi', name: 'Catalisi', icon: '🧪', fx: [{ t: 'res', id: 'enzimi', x: 1.4 }] },
  { id: 'cristallo', name: 'Cristallo', icon: '💎', fx: [{ t: 'res', id: 'minerali', x: 1.3 }] },
  { id: 'sinapsi', name: 'Sinapsi', icon: '⚡', fx: [{ t: 'res', id: 'segnali', x: 1.4 }] },
  { id: 'capienza', name: 'Legno denso', icon: '🫙', fx: [{ t: 'cap', x: 1.5 }] },
  { id: 'fertile', name: 'Fertilità', icon: '🌬️', fx: [{ t: 'spore', x: 1.15 }] },
  { id: 'scorza', name: 'Scorza dura', icon: '🛡️', fx: [{ t: 'season', x: 0.12 }] },
  { id: 'passo', name: 'Passo lungo', icon: '🧭', fx: [{ t: 'expTime', x: 0.92 }] },
  { id: 'fortuna', name: 'Fortuna', icon: '🍀', fx: [{ t: 'luck', x: 1.15 }] },
  { id: 'economia', name: 'Parsimonia', icon: '🪙', fx: [{ t: 'cost', x: 0.9 }] },
]
export const RING_MILESTONES = [
  { n: 3, fx: [{ t: 'slot', x: 1 }], text: '+1 spedizione contemporanea.' },
  { n: 7, text: 'Sblocca le Caverne di cristallo.' },
  { n: 14, fx: [{ t: 'slot', x: 1 }], text: '+1 spedizione contemporanea.' },
  { n: 21, text: 'Sblocca le Radici del mondo.' },
  { n: 30, fx: [{ t: 'all', x: 2 }], text: 'Anello d’oro: produzione ×2.' },
  { n: 50, fx: [{ t: 'all', x: 2 }, { t: 'luck', x: 1.5 }], text: 'Anello d’argento: produzione ×2, fortuna +50%.' },
  { n: 100, fx: [{ t: 'all', x: 3 }], text: 'Anello del secolo: produzione ×3.' },
]

// Spedizioni: le ife esplorano un bioma per ore reali e tornano con un reperto.
// Il costo è una frazione della capienza attuale dei depositi.
export const RARITIES = [
  { id: 'comune', name: 'Comune' },
  { id: 'raro', name: 'Raro' },
  { id: 'epico', name: 'Epico' },
  { id: 'leggendario', name: 'Leggendario' },
]
const HOUR = 3600e3
export const BIOMES = [
  { id: 'lettiera', name: 'Lettiera di foglie', icon: '🍂', ms: 1 * HOUR, cost: { nutrienti: 0.2 }, odds: [85, 15, 0, 0], desc: 'Appena sotto la superficie.' },
  { id: 'sottosuolo', name: 'Sottosuolo profondo', icon: '🕳️', ms: 4 * HOUR, cost: { nutrienti: 0.25, acqua: 0.25 }, odds: [60, 32, 8, 0], req: (s) => s.life.maxTerr >= 5, hint: 'Conquista la Pietraia.', desc: 'Buio, freddo, pieno di sorprese.' },
  { id: 'falda', name: 'Falda acquifera', icon: '🌊', ms: 8 * HOUR, cost: { acqua: 0.4, zuccheri: 0.3 }, odds: [40, 40, 18, 2], req: (s) => s.life.maxTerr >= 7, hint: 'Conquista la Palude.', desc: 'Le ife seguono l’acqua fin dove nessuno è arrivato.' },
  { id: 'cristalli', name: 'Caverne di cristallo', icon: '💠', ms: 12 * HOUR, cost: { minerali: 0.4, enzimi: 0.3 }, odds: [0, 45, 45, 10], req: (s) => s.rings >= 7, hint: 'L’Albero Madre deve avere 7 anelli.', desc: 'Geodi enormi nella roccia.' },
  { id: 'radici', name: 'Radici del mondo', icon: '🌍', ms: 24 * HOUR, cost: { luce: 0.5, segnali: 0.3 }, odds: [0, 0, 60, 40], req: (s) => s.rings >= 21, hint: 'L’Albero Madre deve avere 21 anelli.', desc: 'Dove si incontrano tutte le reti del mondo.' },
]
/** Le spedizioni si sbloccano conquistando questo territorio (Tronco caduto). */
export const EXP_TERR = 4
export const RELIC_MAX = 5

// Reperti: r = indice in RARITIES. L'effetto si applica una volta per livello (max RELIC_MAX o `max`).
export const RELICS = [
  { id: 'ghianda', r: 0, name: 'Ghianda', icon: '🌰', fx: [{ t: 'b', id: 'ifa', x: 1.3 }] },
  { id: 'rugiada', r: 0, name: 'Goccia di rugiada', icon: '💧', fx: [{ t: 'res', id: 'acqua', x: 1.2 }] },
  { id: 'lombrico', r: 0, name: 'Lombrico', icon: '🪱', fx: [{ t: 'res', id: 'nutrienti', x: 1.2 }] },
  { id: 'foglia', r: 0, name: 'Foglia scheletrica', icon: '🍁', fx: [{ t: 'b', id: 'micorriza', x: 1.25 }] },
  { id: 'sasso', r: 0, name: 'Sasso levigato', icon: '🪨', fx: [{ t: 'cap', x: 1.2 }] },
  { id: 'piuma', r: 0, name: 'Piuma', icon: '🪶', fx: [{ t: 'click', x: 2 }] },
  { id: 'bacca', r: 0, name: 'Bacca di ginepro', icon: '🫐', fx: [{ t: 'res', id: 'zuccheri', x: 1.2 }] },
  { id: 'lumaca', r: 0, name: 'Guscio di lumaca', icon: '🐌', fx: [{ t: 'res', id: 'segnali', x: 1.2 }] },
  { id: 'ambra', r: 1, name: 'Ambra', icon: '🟠', fx: [{ t: 'all', x: 1.1 }] },
  { id: 'conchiglia', r: 1, name: 'Conchiglia fossile', icon: '🐚', fx: [{ t: 'res', id: 'minerali', x: 1.3 }] },
  { id: 'quarzo', r: 1, name: 'Quarzo', icon: '🔮', fx: [{ t: 'res', id: 'luce', x: 1.2 }] },
  { id: 'seme_alato', r: 1, name: 'Seme alato', icon: '🪽', fx: [{ t: 'spore', x: 1.08 }] },
  { id: 'ragno', r: 1, name: 'Tela di ragno', icon: '🕷️', fx: [{ t: 'b', id: 'nodo', x: 1.4 }] },
  { id: 'formica', r: 1, name: 'Formica operaia', icon: '🐜', fx: [{ t: 'b', id: 'decompositore', x: 1.4 }] },
  { id: 'corteccia', r: 1, name: 'Corteccia antica', icon: '🪵', fx: [{ t: 'season', x: 0.08 }] },
  { id: 'fungo_fossile', r: 2, name: 'Fungo fossile', icon: '🦴', fx: [{ t: 'res', id: 'enzimi', x: 1.4 }] },
  { id: 'lucciola', r: 2, name: 'Lucciola', icon: '🪲', fx: [{ t: 'res', id: 'luce', x: 1.4 }] },
  { id: 'termitaio', r: 2, name: 'Termitaio', icon: '🏰', fx: [{ t: 'b', id: 'ghiandola', x: 1.5 }] },
  { id: 'bussola', r: 2, name: 'Bussola di radici', icon: '🧭', fx: [{ t: 'expTime', x: 0.9 }] },
  { id: 'quadrifoglio', r: 2, name: 'Quadrifoglio', icon: '🍀', fx: [{ t: 'luck', x: 1.2 }] },
  { id: 'cuore', r: 3, name: 'Cuore di quercia', icon: '❤️‍🔥', fx: [{ t: 'all', x: 1.3 }] },
  { id: 'spora_primordiale', r: 3, name: 'Spora primordiale', icon: '🧬', fx: [{ t: 'spore', x: 1.25 }] },
  { id: 'mappa', r: 3, name: 'Mappa delle radici', icon: '🗺️', max: 2, fx: [{ t: 'slot', x: 1 }] },
  { id: 'clessidra', r: 3, name: 'Clessidra di resina', icon: '⏳', fx: [{ t: 'expTime', x: 0.85 }] },
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
  // id stabili: rs_31 era "tutte le ricerche" quando erano 31
  ...[5, 15, 25, 31].map((n) => ({
    id: `rs_${n}`, icon: '🔬', name: `${n} ricerche`,
    desc: `Completa ${n} ricerche nella stessa partita.`, test: (s) => Object.keys(s.rs).length >= n,
  })),
  { id: 'rs_all', icon: '📚', name: 'Enciclopedia', desc: 'Completa tutte le ricerche nella stessa partita.', test: (s) => RESEARCH.every((r) => s.rs[r.id]) },
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
  // espansione
  ...[1, 7, 14, 30, 60, 100].map((n) => ({
    id: `ring_${n}`, icon: '🪵', name: n === 1 ? 'Primo anello' : `${n} anelli`,
    desc: `L’Albero Madre forma ${n} anell${n === 1 ? 'o' : 'i'}.`, test: (s) => s.rings >= n,
  })),
  ...[1, 10, 50, 200, 500].map((n) => ({
    id: `exp_${n}`, icon: '🎒', name: n === 1 ? 'Prima spedizione' : `${n} spedizioni`,
    desc: `Riporta a casa ${n} spedizion${n === 1 ? 'e' : 'i'}.`, test: (s) => s.life.exp >= n,
  })),
  ...[5, 12, RELICS.length].map((n) => ({
    id: `relic_${n}`, icon: '🏺', name: n === RELICS.length ? 'Museo del bosco' : `${n} reperti`,
    desc: `Trova ${n} reperti diversi.`, test: (s) => Object.keys(s.relics).length >= n,
  })),
  ...RARITIES.slice(1).map((r, i) => ({
    id: `relic_r${i + 1}`, icon: ['💙', '💜', '🧡'][i], name: `Reperto ${r.name.toLowerCase()}`,
    desc: `Trova un reperto ${r.name.toLowerCase()}.`, test: (s) => RELICS.some((x) => x.r === i + 1 && s.relics[x.id]),
  })),
  { id: 'relic_max', icon: '⭐', name: 'Pezzo da museo', desc: `Porta un reperto al livello ${RELIC_MAX}.`, test: (s) => Object.values(s.relics).some((l) => l >= RELIC_MAX) },
  { id: 'all_weather', icon: '🌈', name: 'Ogni tempo', desc: 'Vivi tutti i tipi di meteo.', test: (s) => s.weatherSeen.length >= WEATHER.length },
]
