import * as SecureStore from 'expo-secure-store';

import { GenericOAuth2, OAuth2Errors, type TokenResponse } from '../../modules/generic-oauth2';
import { createSignal } from '@/data/store';

/**
 * Sign in with Google or Apple, brokered by AWS Cognito (the user pool the lore-llm
 * Worker trusts). Authorization Code + PKCE in an ASWebAuthenticationSession
 * via the generic-oauth2 module; the callback comes back on the app's
 * `lorellm://` scheme. Tokens live only in the keychain (expo-secure-store).
 */

const COGNITO_DOMAIN = (
  process.env.EXPO_PUBLIC_COGNITO_DOMAIN ?? 'https://eu-north-1orshbeg8h.auth.eu-north-1.amazoncognito.com'
).replace(/\/+$/, '');
// Public "Lore LLM Mobile" app client (no secret) in the dev pool.
const CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? '730nauiaj6dc4dfjdrfvrd7eak';
// Must match a callback URL registered on the app client.
const REDIRECT_URI = 'lorellm://auth/callback';
const SCOPES = 'openid email profile';
const TOKEN_ENDPOINT = `${COGNITO_DOMAIN}/oauth2/token`;

const STORE_KEY = 'lore.auth.v1';

interface Session {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Cognito identity provider names, passed as `identity_provider`. */
export type AuthProvider = 'Google' | 'SignInWithApple';

export const providerLabels: Record<AuthProvider, string> = { Google: 'Google', SignInWithApple: 'Apple' };

/** Signed-in Google or Apple account (via Cognito). The tokens never leave this module. */
export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  provider: AuthProvider;
}

let session: Session | null = null;
let refreshing: Promise<void> | null = null;

/** `undefined` while the keychain is being read at startup. */
export const authUser = createSignal<AuthUser | null | undefined>(undefined);

// ─── Persistence ─────────────────────────────────────────────────────────────

async function persist() {
  if (session) await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(session));
  else await SecureStore.deleteItemAsync(STORE_KEY);
}

export async function loadSession() {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    session = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    session = null;
  }
  authUser.set(userOf(session));
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

function claims(jwt: string): Record<string, string | undefined> & { identities?: { providerName?: string }[] } {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
    // atob gives Latin-1: rebuild the UTF-8 string (accented names).
    return JSON.parse(decodeURIComponent(Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  } catch {
    return {};
  }
}

function userOf(s: Session | null): AuthUser | null {
  if (!s) return null;
  const p = claims(s.idToken);
  const provider: AuthProvider = p.identities?.[0]?.providerName === 'SignInWithApple' ? 'SignInWithApple' : 'Google';
  // The pool maps Google's given name and Apple's firstName onto `name`, so it
  // may be a first name only (add the family name) or already the full name (keep it).
  const first = p.given_name || p.name;
  const full = !first ? p.family_name : !p.family_name || first.includes(p.family_name) ? first : `${first} ${p.family_name}`;
  return { id: p.sub ?? '', name: full || p.email || `Account ${providerLabels[provider]}`, email: p.email ?? null, provider };
}

function adopt(tok: TokenResponse, refreshToken?: string) {
  if (!tok.id_token || !tok.access_token) throw new Error('Risposta di Cognito non valida');
  session = {
    idToken: tok.id_token,
    accessToken: tok.access_token,
    // Refresh responses don't rotate the refresh token unless rotation is on.
    refreshToken: tok.refresh_token ?? refreshToken ?? '',
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  };
}

/**
 * A valid Cognito ID token for `Authorization: Bearer` calls to the Worker,
 * refreshed when close to expiry. Null when signed out.
 */
export async function idToken(): Promise<string | null> {
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60_000) return session.idToken;
  refreshing ??= (async () => {
    const current = session!;
    try {
      const tok = await GenericOAuth2.refreshToken({
        appId: CLIENT_ID,
        accessTokenEndpoint: TOKEN_ENDPOINT,
        refreshToken: current.refreshToken,
      });
      adopt(tok, current.refreshToken);
      await persist();
    } catch (err) {
      // Refresh token expired or revoked: the user has to sign in again.
      if ((err as { code?: string }).code === OAuth2Errors.INVALID_GRANT) await clear();
      else throw err;
    } finally {
      refreshing = null;
    }
  })();
  await refreshing;
  return session?.idToken ?? null;
}

async function clear() {
  session = null;
  await persist();
  authUser.set(null);
}

// ─── Sign in / out ───────────────────────────────────────────────────────────

/** Resolves with the user, or null when the user cancelled. */
export async function signIn(provider: AuthProvider): Promise<AuthUser | null> {
  let res;
  try {
    res = await GenericOAuth2.authenticate({
      appId: CLIENT_ID,
      authorizationBaseUrl: `${COGNITO_DOMAIN}/oauth2/authorize`,
      accessTokenEndpoint: TOKEN_ENDPOINT,
      responseType: 'code',
      redirectUrl: REDIRECT_URI,
      scope: SCOPES,
      pkceEnabled: true,
      // Straight to Google or Apple, skipping Cognito's hosted UI.
      additionalParameters: { identity_provider: provider },
    });
  } catch (err) {
    if ((err as { code?: string }).code === OAuth2Errors.USER_CANCELLED) return null;
    throw err;
  }
  if (!res.access_token_response) throw new Error('Accesso non riuscito');
  adopt(res.access_token_response);
  await persist();
  const user = userOf(session);
  authUser.set(user);
  return user;
}

export async function signOut() {
  const refreshToken = session?.refreshToken;
  await clear();
  await GenericOAuth2.logout().catch(() => {});
  if (!refreshToken) return;
  // Best effort: invalidate the refresh token server-side too.
  fetch(`${COGNITO_DOMAIN}/oauth2/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `token=${encodeURIComponent(refreshToken)}&client_id=${encodeURIComponent(CLIENT_ID)}`,
  }).catch(() => {});
}
