import { requireOptionalNativeModule } from 'expo';

/**
 * Expo port of the generic-oauth2 Capacitor plugin
 * (https://github.com/Davide255/generic-oauth2). The options and results
 * mirror the plugin's `definitions.ts`; only the iOS implementation exists.
 */

export interface OAuth2AuthenticateBaseOptions {
  /** The app id (client id) you get from the OAuth provider. */
  appId?: string;
  /** e.g. https://accounts.google.com/o/oauth2/auth */
  authorizationBaseUrl?: string;
  /** Grant to execute, e.g. `code`. */
  responseType?: string;
  /** Where the provider redirects after authentication (its scheme closes the auth session). */
  redirectUrl?: string;
  /** Token endpoint for the authorization code flow. Without it the authorization response is returned. */
  accessTokenEndpoint?: string;
  pkceEnabled?: boolean;
  /** Space-delimited scopes. */
  scope?: string;
  /** CSRF state; generated when missing. */
  state?: string;
  /** Extra query parameters for the authorization URL. */
  additionalParameters?: Record<string, string>;
  logsEnabled?: boolean;
}

export interface IosOptions extends OAuth2AuthenticateBaseOptions {
  /** Don't share cookies with Safari (no "already signed in" shortcut). Default false. */
  prefersEphemeralWebBrowserSession?: boolean;
}

export interface OAuth2AuthenticateOptions extends OAuth2AuthenticateBaseOptions {
  /** iOS values override the base ones. */
  ios?: IosOptions;
}

export interface OAuth2RefreshTokenOptions {
  appId: string;
  accessTokenEndpoint: string;
  refreshToken: string;
  scope?: string;
}

/** Raw token endpoint response (`id_token`, `access_token`, `refresh_token`, `expires_in`, …). */
export type TokenResponse = Record<string, unknown> & {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

/** Rejection codes, as in the plugin. */
export const OAuth2Errors = {
  USER_CANCELLED: 'USER_CANCELLED',
  STATES_NOT_MATCH: 'ERR_STATES_NOT_MATCH',
  NO_AUTHORIZATION_CODE: 'ERR_NO_AUTHORIZATION_CODE',
  INVALID_GRANT: 'invalid_grant',
} as const;

interface NativeModule {
  authenticate(options: OAuth2AuthenticateOptions): Promise<{ access_token_response?: TokenResponse; access_token?: string } & Record<string, unknown>>;
  refreshToken(options: OAuth2RefreshTokenOptions): Promise<TokenResponse>;
  logout(options: OAuth2AuthenticateOptions): Promise<boolean>;
}

const native = requireOptionalNativeModule<NativeModule>('GenericOAuth2');

function unavailable(): never {
  throw Object.assign(new Error('GenericOAuth2 è disponibile solo su iOS'), { code: 'ERR_UNAVAILABLE' });
}

export const GenericOAuth2 = {
  isAvailable: native != null,
  /** Authorization in an ASWebAuthenticationSession; resolves with `{ access_token_response }`. */
  authenticate: (options: OAuth2AuthenticateOptions) => (native ?? unavailable()).authenticate(options),
  /** A new token set for a refresh token; rejects with the provider's `error` code (e.g. `invalid_grant`). */
  refreshToken: (options: OAuth2RefreshTokenOptions) => (native ?? unavailable()).refreshToken(options),
  logout: (options: OAuth2AuthenticateOptions = {}) => (native ? native.logout(options) : Promise.resolve(true)),
};
