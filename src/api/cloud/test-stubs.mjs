// Module hook for tests: replaces the React Native modules the cloud client imports and
// resolves the `@/` alias and extension-less imports, so the client runs under plain node.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const stubs = {
  'react-native': 'export const AppState = { currentState: "active", addEventListener() {} };',
  '@react-native-async-storage/async-storage':
    'export default { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };',
  '@/auth/session': 'export const idToken = async () => "token";',
};

const file = (base) => [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => existsSync(c) && statSync(c).isFile());

export async function resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  const target = specifier.startsWith('@/')
    ? file(SRC + specifier.slice(2))
    : specifier.startsWith('.') && context.parentURL?.startsWith('file:')
      ? file(fileURLToPath(new URL(specifier, context.parentURL)))
      : undefined;
  return target ? { url: pathToFileURL(target).href, shortCircuit: true } : next(specifier, context);
}
