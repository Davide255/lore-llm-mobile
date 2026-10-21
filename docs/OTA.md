# Live (OTA) updates

Ships JS and asset changes to installed iOS builds without a store release. Self-hosted: no third-party service, only static files on the same Tophost server as the Athly apps (`https://www.athly.it/ota/lore/mobile/`). Same design as `AthlyTrainerMobile/docs/OTA.md`; the client is `expo-updates` (Expo Updates protocol v1). The desktop app has its own flow: `lore-llm-desktop/docs/OTA.md`.

## What it can and cannot do
- **Replaces only the JS bundle and assets.** Anything native needs a store release: new or upgraded native modules, config plugins, `modules/`, Info.plist, entitlements, SDK bumps. After such a change bump `runtimeVersion` in `app.json` **and** `ota.config.json` (they must match, the script checks) so old builds never receive a bundle they cannot run.
- Apple allows downloaded interpreted code (Guideline 3.3.2) only if it does not change the app's primary purpose. Mention OTA in the App Review notes.

## How it works
1. `expo-updates` runs in manual mode (`checkAutomatically: "NEVER"`). `src/lib/ota.ts` checks 10 s after start and when the app returns to the foreground (at most every 15 min), downloads in the background and shows a toast. The bundle is applied at the **next cold start**, never mid-session. Settings → "Controlla aggiornamenti" forces a check and shows the running bundle.
2. The manifest is **signed** (RSA-SHA256) with the private key. The app holds the certificate (`certs/certificate.pem`, embedded at build time) and rejects any manifest whose signature does not match.
3. If an update crashes at launch, expo-updates rolls back to the previous bundle by itself.
4. A manifest is only used by builds with the same `runtimeVersion`.
5. Debug builds and the dev client never update (`!__DEV__ && Updates.isEnabled`).

## One-time setup (needs a TestFlight/store build afterwards)
1. The signing key is `~/.lore-llm-ota/mobile/private-key.pem` (outside the repo, `chmod 600`). **Back it up** (password manager). If you lose it, existing installs can never be updated again: a new certificate means a new store build. The matching certificate is `certs/certificate.pem` (public, committed; valid 10 years, code-signing key usage).
2. Rebuild the native project so it contains `expo-updates` and the certificate: `npx expo prebuild --platform ios`, then build a Release configuration (build number must be raised). OTA reaches only builds that contain them.
3. Copy `.env.example` to `.env` and fill `OTA_FTP_USER` / `OTA_FTP_PASSWORD` (same FTP account as Athly).
4. `npm run ota:publish -- --setup` uploads `ota-server/.htaccess` once. The folder `ota/lore/mobile` is created by the first upload.

## Publishing
```bash
npm run ota:publish -- --channel beta                 # export, sign → ota-dist/beta/ios/
npm run ota:publish -- --channel beta --upload        # same, then upload
npm run ota:publish -- --upload-only --channel beta   # re-upload what is staged
npm run ota:publish -- --promote --upload             # re-point the beta release at production
```
Options: `--version <semver>` (default `<package version>-ota.d<date>t<time>.g<sha>`), `--skip-build`.

Server layout (`ota.config.json` → `baseUrl`):
```
<baseUrl>/<channel>/ios/manifest.json       # upload LAST, no-cache, application/expo+json
<baseUrl>/<channel>/ios/.htaccess           # generated: carries this manifest's expo-signature
<baseUrl>/<channel>/ios/assets/<md5>[.ext]  # upload FIRST, only the missing ones
```
`EXPO_PUBLIC_*` values are inlined at export time, so publish with the same environment as the store build.

## Channels
`beta` and `production`. Builds read `production` (the `updates.url` in `app.json`). There is no in-app beta switch: switching URL at runtime needs `setUpdateURLAndRequestHeadersOverride`, which expo-updates only supports with `disableAntiBrickingMeasures: true` (turns off rollback protections).

## Rollback
- Update that crashes at launch: automatic.
- Update that runs but misbehaves: upload an older `history/manifest-<version>.json` as `manifest.json` **and** the matching `history/manifest-<version>.htaccess` as `.htaccess` (the signature is bound to the manifest bytes). Assets of old releases stay online.

## CI
`.github/workflows/ota.yml` publishes on push to `prepare` (beta) and `main` (production), or by hand from the Actions tab. There is no `prepare` branch yet: until it exists, only `main` and manual runs publish. Secrets: `OTA_PRIVATE_KEY` (whole PEM), `OTA_FTP_URL` (`ftp://ftp.athly.it/public_html/ota/lore/mobile`), `OTA_FTP_USER`, `OTA_FTP_PASSWORD`. Bump `version` in `package.json` to release; an already-live version is skipped. Restrict who can edit workflows: the key lives in GitHub too.

## Not verified yet (do on a real device before relying on it)
The export, manifest and signature were checked locally (the signature verifies against `certs/certificate.pem`). Still to check on a device: (1) the server sends `expo-signature`, `expo-protocol-version` and `application/expo+json` through the nginx front, (2) an update downloads and applies after a cold start, (3) a tampered manifest is rejected, (4) a different `runtimeVersion` is ignored, (5) offline start is not delayed, (6) a crashing bundle rolls back.
