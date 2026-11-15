import type { ProjectIcon } from '@/api';
import type { createFakeWorker } from '@/api/cloud/fake-worker';

/**
 * Content for App Store screenshots (EXPO_PUBLIC_DEMO=store, dev builds only): four projects
 * written by a connected Claude agent. The base files are a few minutes old; once the app has
 * loaded every project, Claude makes a handful of "live" edits, which the next poll records
 * with their diffs, so Activity and the change screen have something to show.
 */

type Worker = ReturnType<typeof createFakeWorker>;

const CLAUDE = 'agent-claude';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

const index = (title: string, summary: string, files: string[]) =>
  `# ${title}\n\n${summary}\n\n## File\n\n${files.map((f) => `- [${f}](${f})`).join('\n')}\n`;

const BASE: Record<string, string> = {
  'App mobile/index.md': index(
    'App mobile',
    "App iOS e iPadOS per consultare e modificare la knowledge base. Versione 1.0 quasi pronta: manca l'accesso con Apple e il materiale per l'App Store.",
    ['checklist.md', 'roadmap.md', 'decisioni/sincronizzazione.md', 'decisioni/layout-ipad.md'],
  ),
  'App mobile/checklist.md':
    "## Versione 1.0\n\n- [x] Elenco progetti e cartelle\n- [x] Editor markdown con anteprima\n- [x] Accesso con Google\n- [ ] Accesso con Apple\n- [ ] Screenshot per l'App Store\n- [ ] Testi della scheda in italiano e inglese\n\n## Versione 1.1\n\n- [ ] Copia offline\n- [ ] Widget attività aperte\n",
  'App mobile/roadmap.md':
    "# Roadmap\n\n## Ottobre\n- Beta privata su TestFlight\n- Sincronizzazione in background\n\n## Novembre\n- Widget con le attività aperte\n- Condivisione di un file come link\n\n## Dicembre\n- Layout a due colonne su iPad\n- Ricerca nel contenuto dei file\n",
  'App mobile/decisioni/sincronizzazione.md':
    '# Sincronizzazione\n\nPolling ogni 10 secondi su un cursore di versione: costa una richiesta e scarica solo i file cambiati.\n\n**Scartato:** WebSocket, troppo costoso da mantenere aperto in background.\n',
  'App mobile/decisioni/layout-ipad.md':
    "# Layout iPad\n\nBarra laterale con i progetti, contenuto a destra. L'editor mostra testo e anteprima affiancati quando c'è spazio.\n",

  'Ricerca LLM/index.md': index(
    'Ricerca LLM',
    "Scelta del modello per generare automaticamente l'index.md di ogni progetto: criteri, risultati e prompt.",
    ['checklist.md', 'valutazione-modelli.md', 'prompt-v3.md', 'fonti.md'],
  ),
  'Ricerca LLM/checklist.md':
    '- [x] Definire i criteri\n- [x] Raccogliere 20 progetti di prova\n- [x] Provare il Modello A\n- [ ] Provare il Modello B\n- [ ] Provare il Modello C\n- [ ] Misurare la latenza\n- [ ] Stimare i costi\n- [ ] Scrivere il prompt definitivo\n- [ ] Presentare i risultati\n',
  'Ricerca LLM/valutazione-modelli.md':
    "# Valutazione modelli\n\nConfronto dei modelli candidati per il riassunto automatico di `index.md`.\n\n## Criteri\n\n- **Fedeltà**: nessuna informazione inventata rispetto ai file del progetto\n- **Sintesi**: l'indice deve stare in una schermata\n- **Latenza**: sotto i 4 secondi per progetti fino a 50 file\n- **Costo**: per 1.000 rigenerazioni\n\n## Risultati\n\n- **Modello A** — fedeltà 4,6 / 5 · 2,1 s · ottimo sulle checklist\n- **Modello B** — fedeltà 4,2 / 5 · 1,4 s · a volte omette le decisioni\n- **Modello C** — fedeltà 3,8 / 5 · 3,9 s · troppo verboso\n\n## Decisione\n\nUsiamo il **Modello A** come predefinito e il B come fallback quando la coda è lunga.\n\n> Rivalutare a fine trimestre con il nuovo set di 40 progetti reali.\n",
  'Ricerca LLM/prompt-v3.md':
    "# Prompt v3\n\n```text\nRiassumi il progetto in al massimo 8 righe.\nCita solo ciò che compare nei file.\nElenca le decisioni prese e le attività aperte.\n```\n\nRispetto alla v2: niente introduzione, elenco delle decisioni sempre presente.\n",
  'Ricerca LLM/fonti.md':
    '# Fonti\n\n- Benchmark interni di ottobre\n- Note della call con il team prodotto\n- Feedback dei tester sulla beta\n',

  'Sito web/index.md': index(
    'Sito web',
    'Landing page di Lore: testi, SEO e pubblicazione. Quasi completata.',
    ['checklist.md', 'landing.md', 'seo.md'],
  ),
  'Sito web/checklist.md':
    '## Lancio\n\n- [x] Testi della home\n- [x] Screenshot aggiornati\n- [x] Pagina privacy\n- [x] Dominio e certificato\n',
  'Sito web/landing.md':
    '# Landing\n\n## Titolo\nLa tua knowledge base, scritta insieme agli agenti.\n\n## Sottotitolo\nProgetti, checklist e note in markdown: Claude e Codex li tengono aggiornati, tu vedi ogni modifica.\n',
  'Sito web/seo.md': '# SEO\n\n- Title: Lore — knowledge base per agenti AI\n- Description: progetti e note in markdown, modificati dagli agenti\n',

  'Lancio beta/index.md': index('Lancio beta', 'Piano per aprire la beta pubblica.', ['checklist.md', 'piano-di-lancio.md']),
  'Lancio beta/piano-di-lancio.md': '# Piano di lancio\n\n## Obiettivo\n200 tester attivi entro fine mese.\n',
};

/** Card descriptions and icons (kept on the device, like the app does). */
const PROJECTS: Record<string, { description: string; icon: ProjectIcon }> = {
  'App mobile': { description: 'App iOS e iPadOS: versione 1.0 e roadmap.', icon: 'code' },
  'Ricerca LLM': { description: "Quale modello genera il miglior index.md.", icon: 'science' },
  'Sito web': { description: 'Landing page, SEO e pubblicazione.', icon: 'web' },
  'Lancio beta': { description: 'Beta pubblica: canali, calendario e metriche.', icon: 'rocket' },
};

/** Claude's edits after the projects are loaded, oldest first (the last one tops Activity). */
const LIVE: [string, string][] = [
  [
    'Lancio beta/checklist.md',
    "## Beta pubblica\n\n- [x] Gruppo esterno su TestFlight\n- [ ] Link pubblico di invito\n- [ ] Modulo per i feedback\n- [ ] Email di benvenuto\n\n## Dopo il lancio\n\n- [ ] Raccogliere i primi feedback\n- [ ] Correggere i bug bloccanti\n",
  ],
  [
    'Lancio beta/piano-di-lancio.md',
    "# Piano di lancio\n\n## Obiettivo\n200 tester attivi entro fine mese.\n\n## Canali\n- Newsletter (1.800 iscritti)\n- Post su LinkedIn e X\n- Community Discord\n\n## Calendario\n- **Lunedì** — apertura del link pubblico\n- **Mercoledì** — email ai primi iscritti\n- **Venerdì** — prima raccolta di feedback\n\n## Metriche\n- Tester attivi dopo 7 giorni\n- Progetti creati per tester\n",
  ],
  ['App mobile/roadmap.md', BASE['App mobile/roadmap.md']!.replace('- Widget con le attività aperte\n', '- Widget con le attività aperte\n- Notifiche quando un agente modifica un file\n')],
  [
    'Ricerca LLM/valutazione-modelli.md',
    BASE['Ricerca LLM/valutazione-modelli.md'] +
      '\n## Aggiornamento\n\nCon il prompt v3 la fedeltà del Modello B sale a **4,5 / 5**: lo teniamo come fallback.\n',
  ],
  [
    'Sito web/checklist.md',
    '## Lancio\n\n- [x] Testi della home\n- [x] Screenshot aggiornati\n- [x] Pagina privacy\n- [x] Dominio e certificato\n- [x] Pagina di supporto\n- [ ] Versione in inglese\n\n## Dopo il lancio\n\n- Monitorare le visite della prima settimana\n',
  ],
  ['Ricerca LLM/checklist.md', BASE['Ricerca LLM/checklist.md']!.replace('- [ ] Provare il Modello B', '- [x] Provare il Modello B')],
  ['App mobile/checklist.md', BASE['App mobile/checklist.md']!.replace('- [ ] Accesso con Apple', '- [x] Accesso con Apple')],
];

export function seedStore(worker: Worker) {
  worker.startLogIdsAt(Math.floor(Date.now() / 1000) * 100);
  worker.addAgent({
    agent_id: CLAUDE,
    name: 'Claude',
    agent_type: 'claude',
    project_scope: '*',
    access_level: 'read_write',
    created_at: minutesAgo(60 * 24 * 12).toISOString(),
  });
  const paths = Object.keys(BASE);
  paths.forEach((path, i) => {
    const at = minutesAgo(40 - i);
    // index.md is compiled by the server, everything else was written by Claude.
    if (path.endsWith('/index.md')) worker.put('', path, BASE[path]!, at);
    else worker.agentWrite(CLAUDE, path, BASE[path]!, at);
  });
  void playLiveEdits(worker, [...new Set(paths.map((p) => p.split('/')[0]!))]);
}

async function playLiveEdits(worker: Worker, projects: string[]) {
  // Imported lazily: '@/api' depends on the session module, which installs the demo.
  const { kb } = await import('@/api');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // Wait for the demo user (setting it resets the client), then load every project so
  // each edit is recorded with its diff.
  const { authUser } = await import('@/auth/session');
  while (!authUser.get()) await sleep(300);
  await sleep(2000);
  for (;;) {
    try {
      await Promise.all(projects.map((p) => kb.listFolderTree(p)));
      await Promise.all(Object.entries(PROJECTS).map(([name, meta]) => kb.updateProject(name, meta)));
      break;
    } catch {
      await sleep(500);
    }
  }
  await sleep(1500);
  // All at once (a second apart on the clock), so a single poll records every diff.
  LIVE.forEach(([path, content], i) => worker.agentWrite(CLAUDE, path, content, new Date(Date.now() - (LIVE.length - i) * 1000)));
  // The client polls every 10 s: give it time to record the edits, then show each screen.
  await sleep(14_000);
  await autopilot();
}

/**
 * Walks through the screenshot screens, announcing each one in the Metro log
 * (`[store-scene] <n> <name>`), so screenshots can be taken without touching the simulator.
 */
async function autopilot() {
  const { router } = await import('expo-router');
  const { kb } = await import('@/api');
  const { routes } = await import('@/lib/routes');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const roadmapChange = (await kb.listActivity()).find((e) => e.path === 'App mobile/roadmap.md' && e.changeId)?.changeId;

  const scenes: [string, string, Parameters<typeof router.push>[0] | null][] = [
    ['projects', '/', null],
    ['project', '/', routes.folder('App mobile')],
    ['checklist', '/', routes.file('App mobile/checklist.md')],
    ['document', '/', routes.file('Ricerca LLM/valutazione-modelli.md')],
    ['editor', '/', routes.edit('Lancio beta/piano-di-lancio.md')],
    ['activity', '/activity', null],
    ['change', '/activity', roadmapChange ? routes.change(roadmapChange) : null],
    ['agent', '/activity', routes.agent(CLAUDE)],
    ['connect-agent', '/', routes.connectAgent()],
    ['settings', '/settings', null],
  ];
  // Leave and come back, so the project cards pick up their descriptions.
  router.navigate('/settings');
  await sleep(1500);
  for (const [i, [name, tab, screen]] of scenes.entries()) {
    if (router.canDismiss()) router.dismissAll();
    router.navigate(tab as Parameters<typeof router.navigate>[0]);
    if (screen) {
      await sleep(600);
      router.push(screen);
    }
    await sleep(2500);
    console.log(`[store-scene] ${i + 1} ${name}`);
    await sleep(12_000);
  }
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/');
  console.log('[store-scene] done');
}
