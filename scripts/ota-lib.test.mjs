import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SEMVER,
  buildManifest,
  contentTypeFor,
  defaultVersion,
  md5Hex,
  nativeFingerprint,
  sha256Base64Url,
  signManifest,
  signatureHtaccess,
} from "./ota-lib.mjs";

const makeExport = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ota-export-"));
  mkdirSync(path.join(dir, "assets"));
  mkdirSync(path.join(dir, "_expo/static/js/ios"), { recursive: true });
  writeFileSync(path.join(dir, "_expo/static/js/ios/entry-x.hbc"), "bundle-bytes");
  writeFileSync(path.join(dir, "assets/aaa"), "icon-bytes");
  writeFileSync(
    path.join(dir, "metadata.json"),
    JSON.stringify({
      fileMetadata: {
        ios: {
          bundle: "_expo/static/js/ios/entry-x.hbc",
          assets: [{ path: "assets/aaa", ext: "png" }],
        },
      },
    }),
  );
  return dir;
};

test("sha256Base64Url has no padding or url-unsafe characters", () => {
  const hash = sha256Base64Url(Buffer.from("hello"));
  assert.equal(hash, "LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ");
  assert.doesNotMatch(hash, /[+/=]/);
});

test("contentTypeFor falls back to octet-stream", () => {
  assert.equal(contentTypeFor("png"), "image/png");
  assert.equal(contentTypeFor(".TTF"), "font/ttf");
  assert.equal(contentTypeFor("xyz"), "application/octet-stream");
});

test("buildManifest describes the bundle and assets with content-addressed urls", () => {
  const { manifest, files } = buildManifest({
    exportDir: makeExport(),
    platform: "ios",
    runtimeVersion: "1",
    baseUrl: "https://example.test/ota/trainer",
    channel: "beta",
    expoConfig: { name: "x" },
    version: "1.0.0-ota.d1.gabc",
    id: "00000000-0000-4000-8000-000000000000",
    createdAt: "2026-10-20T00:00:00.000Z",
  });

  const bundleKey = md5Hex(Buffer.from("bundle-bytes"));
  assert.equal(manifest.runtimeVersion, "1");
  assert.equal(manifest.launchAsset.key, bundleKey);
  assert.equal(manifest.launchAsset.contentType, "application/javascript");
  assert.equal(manifest.launchAsset.fileExtension, undefined);
  assert.equal(
    manifest.launchAsset.url,
    `https://example.test/ota/trainer/beta/ios/assets/${bundleKey}.hbc`,
  );
  assert.equal(manifest.assets[0].fileExtension, ".png");
  assert.equal(manifest.assets[0].contentType, "image/png");
  assert.equal(manifest.extra.otaVersion, "1.0.0-ota.d1.gabc");
  assert.deepEqual([...files.keys()].sort(), [
    `${bundleKey}.hbc`,
    `${manifest.assets[0].key}.png`,
  ].sort());
});

test("signManifest produces a signature the public key verifies", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const body = JSON.stringify({ id: "x" });
  const header = signManifest(
    body,
    privateKey.export({ type: "pkcs8", format: "pem" }),
  );
  const match = /^sig="([A-Za-z0-9+/=]+)", keyid="main"$/.exec(header);
  assert.ok(match, header);
  const ok = createVerify("RSA-SHA256").update(body).verify(publicKey, match[1], "base64");
  assert.equal(ok, true);
  // A different body must not verify.
  assert.equal(
    createVerify("RSA-SHA256").update(body + " ").verify(publicKey, match[1], "base64"),
    false,
  );
});

test("signatureHtaccess embeds the header for manifest.json only", () => {
  const out = signatureHtaccess('sig="abc", keyid="main"');
  assert.match(out, /FilesMatch "\^manifest\\\.json\$"/);
  assert.match(out, /Header set expo-signature 'sig="abc", keyid="main"'/);
});

test("defaultVersion is valid semver", () => {
  const v = defaultVersion("1.0.0", "abc1234", new Date("2026-10-20T22:30:00Z"));
  assert.equal(v, "1.0.0-ota.d20261020t2230.gabc1234");
  assert.match(v, SEMVER);
});

test("nativeFingerprint changes with native deps, plugins and iOS config, not with JS-only edits", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ota-native-"));
  const pkg = { version: "1.0.0", dependencies: { expo: "~58.0.0", "react-native": "0.88.1", "mathjax-full": "^3.2.2" } };
  const expo = { version: "1.0.0", plugins: ["expo-router"], ios: { buildNumber: "8", supportsTablet: true } };
  const base = nativeFingerprint({ pkg, expo, rootDir: dir });
  const fp = (p, e) => nativeFingerprint({ pkg: p, expo: e, rootDir: dir });

  // Not native: app version, build number, a pure-JS dependency.
  assert.equal(fp({ ...pkg, version: "1.0.1", dependencies: { ...pkg.dependencies, "mathjax-full": "^4.0.0" } },
    { ...expo, version: "1.0.1", ios: { ...expo.ios, buildNumber: "9" } }), base);
  // Native: SDK / RN bump, a new native module, a plugin, an iOS setting.
  assert.notEqual(fp({ ...pkg, dependencies: { ...pkg.dependencies, "react-native": "0.89.0" } }, expo), base);
  assert.notEqual(fp({ ...pkg, dependencies: { ...pkg.dependencies, "react-native-webview": "14.0.1" } }, expo), base);
  assert.notEqual(fp(pkg, { ...expo, plugins: [...expo.plugins, "expo-secure-store"] }), base);
  assert.notEqual(fp(pkg, { ...expo, ios: { ...expo.ios, supportsTablet: false } }), base);
});

test("nativeFingerprint covers the local native modules and plugins", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ota-native-"));
  mkdirSync(path.join(dir, "plugins"));
  const input = { pkg: { dependencies: {} }, expo: {}, rootDir: dir };
  const before = nativeFingerprint(input);
  writeFileSync(path.join(dir, "plugins/p.js"), "module.exports = 1");
  assert.notEqual(nativeFingerprint(input), before);
});
