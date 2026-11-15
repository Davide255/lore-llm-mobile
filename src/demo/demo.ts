import { LogBox } from 'react-native';

import { createFakeWorker } from '@/api/cloud/fake-worker';
import { seedStore } from '@/demo/store-seed';

/**
 * Local demo (dev builds only, EXPO_PUBLIC_DEMO=1): the in-memory fake Worker answers every
 * call to the Lore API, so projects and files can be created, edited, moved, starred and
 * searched with no server and no sign-in. Data lives in memory and resets on reload.
 * EXPO_PUBLIC_DEMO=store loads the App Store screenshot content instead (see store-seed.ts).
 */
const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO;
export const DEMO = __DEV__ && (DEMO_MODE === '1' || DEMO_MODE === 'store');

/** Name of the fake signed-in user. */
export const DEMO_USER_NAME = DEMO_MODE === 'store' ? 'Marta Ferri' : 'Debug User';

export function installDemoWorker() {
  const worker = createFakeWorker();
  if (DEMO_MODE === 'store') {
    seedStore(worker);
    LogBox.ignoreAllLogs(); // no dev warning banners in the screenshots
  } else seedPlayground(worker);

  const apiUrl = (process.env.EXPO_PUBLIC_LORE_API_URL ?? 'https://lore-llm-dev.davide-bera2021.workers.dev').replace(/\/+$/, '');
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return url.startsWith(apiUrl) ? worker.fetch(input, init) : realFetch(input, init);
  }) as typeof fetch;
}

function seedPlayground(worker: ReturnType<typeof createFakeWorker>) {
  worker.put(
    '',
    'Benvenuto/Introduzione.md',
    '# Benvenuto in Lore\n\nQuesta è una **demo locale**: nessun server, nessun login.\n\n- Crea progetti e file con il pulsante +\n- Modifica questa nota\n- Prova la ricerca e le stelle\n\n```ts\nconst demo = true;\n```\n\nFormula: $E = mc^2$\n',
  );
  worker.put('', 'Benvenuto/checklist.md', '- [x] Aprire la demo\n- [ ] Creare un progetto\n- [ ] Modificare un file\n- [ ] Spostare un file\n');
  worker.put('', 'Benvenuto/Guida lunga.md', longNote());
  worker.put('', 'Benvenuto/Idee.md', '# Idee\n\nUna nota di esempio da rinominare, spostare o eliminare.\n');
  worker.put('', 'Viaggio in Giappone/Itinerario.md', '# Itinerario\n\n## Tokyo\nShibuya, Asakusa, Akihabara.\n\n## Kyoto\nFushimi Inari, Arashiyama.\n');
  worker.put('', 'Viaggio in Giappone/checklist.md', '- [x] Passaporto\n- [x] Voli\n- [ ] Hotel\n- [ ] JR Pass\n');
  worker.put('', 'Ricette/Carbonara.md', '# Carbonara\n\n**Ingredienti:** spaghetti, guanciale, uova, pecorino.\n\nNiente panna!\n');

  // Notes for the Studio tab (the study mode itself is faked in study-demo.ts).
  worker.put('', 'Analisi 1/analisi-1-limiti.md', '# Limiti\n\n## Limiti notevoli\n\nlim sin x / x = 1 per x → 0.\n\n## Condizione necessaria\n\nSe ∑ aₙ converge allora aₙ → 0 (non vale il viceversa).\n');
  worker.put('', 'Analisi 1/serie/taylor-esercizi.md', '# Taylor\n\nSviluppi di eˣ, sin x, cos x attorno a 0.\n');
  worker.put('', 'Analisi 1/serie/criterio-rapporto.md', '# Criterio del rapporto\n\nSia ∑ aₙ a termini positivi e L = lim aₙ₊₁/aₙ. Se L < 1 converge, se L > 1 diverge, con L = 1 non decide.\n');

  worker.addTeam('demo', 'Team Demo', 'owner');
  worker.put('t:demo', 'Roadmap/Q1.md', '# Roadmap Q1\n\n- Lancio app\n- Feedback utenti\n');
  worker.put('t:demo', 'Roadmap/checklist.md', '- [x] Design\n- [ ] Beta\n- [ ] Release\n');
  worker.invite('inv1', 'invited', 'Team Invitato', 'editor');
}

/** A deliberately long document, to try scrolling and the side-by-side editor. */
function longNote(): string {
  const out = ['# Guida lunga', '', 'Una nota molto lunga per provare lo scorrimento sincronizzato di editor e anteprima.', ''];
  for (let i = 1; i <= 30; i++) {
    out.push(`## Capitolo ${i}`, '');
    out.push(`Questo è il paragrafo introduttivo del capitolo ${i}. Contiene **testo in grassetto**, *corsivo* e \`codice inline\` per vedere come viene reso.`, '');
    out.push(`- Primo punto del capitolo ${i}`, `- Secondo punto con un [link](Idee.md)`, `- [ ] Attività da completare ${i}`, '');
    out.push(`> Citazione del capitolo ${i}: la pazienza è la virtù dei forti.`, '');
    out.push('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.', '');
  }
  return out.join('\n');
}
