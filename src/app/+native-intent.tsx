/**
 * The OAuth redirect (`lorellm://auth/callback?code=…`) belongs to the sign-in flow
 * in the generic-oauth2 module, not to a screen: if iOS also hands it to the app,
 * stay where we are instead of showing "Unmatched Route".
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return /^(lorellm:\/\/)?\/?auth\/callback\b/.test(path) ? null : path;
  } catch {
    return path;
  }
}
