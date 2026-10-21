#!/usr/bin/env node
/*
  Exports, signs and stages a live-update (see docs/OTA.md).

    node scripts/publish-ota.mjs --channel beta [--version 1.2.3] [--skip-build] [--upload]
    node scripts/publish-ota.mjs --setup                        # upload ota-server/ (.htaccess) once
    node scripts/publish-ota.mjs --upload-only --channel beta   # re-upload what is already staged
    node scripts/publish-ota.mjs --promote                      # copy the beta release to production

  Output is written to ota-dist/<channel>/<platform>/:
    assets/<md5>[.ext]                   bundle + assets (upload first, only the missing ones)
    .htaccess                            carries this manifest's expo-signature (upload before the manifest)
    manifest.json                        what the app polls (upload last)
    history/manifest-<version>.json      old manifests, for rollbacks
*/
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEMVER,
  buildManifest,
  defaultVersion,
  signManifest,
  signatureHtaccess,
} from "./ota-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// FTP settings live in .env (gitignored); real environment variables win.
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  /* no .env file */
}

// curl guesses the protocol from the host name when there is no scheme, so make it explicit.
if (process.env.OTA_FTP_URL) {
  const url = process.env.OTA_FTP_URL.trim();
  if (/^https?:\/\//i.test(url)) {
    console.error("\n✖ OTA_FTP_URL must be an ftp:// URL, not http(s).\n");
    process.exit(1);
  }
  process.env.OTA_FTP_URL = /^ftps?:\/\//i.test(url) ? url : `ftp://${url}`;
}

const otaConfig = JSON.parse(readFileSync(path.join(root, "ota.config.json"), "utf8"));
const { platform } = otaConfig;
const outRoot = path.join(root, "ota-dist");

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) fail(`Unexpected argument: ${argv[i]}`);
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else args[key] = argv[++i];
  }
  return args;
};

const run = (cmd, cmdArgs, options = {}) =>
  execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8", ...options });

const channelDirOf = (channel) => path.join(outRoot, channel, platform);

const checkChannel = (channel) => {
  if (!otaConfig.channels.includes(channel)) {
    fail(`--channel must be one of: ${otaConfig.channels.join(", ")}`);
  }
};

const promote = () => {
  const from = channelDirOf("beta");
  const to = channelDirOf("production");
  if (!existsSync(path.join(from, "manifest.json"))) fail(`No beta release staged at ${from}`);
  mkdirSync(path.join(to, "assets"), { recursive: true });
  mkdirSync(path.join(to, "history"), { recursive: true });
  // The manifest points at production URLs, so it is rebuilt there (and re-signed) rather than copied.
  // Keeping the beta asset files is enough: they are re-uploaded by name.
  const manifest = JSON.parse(readFileSync(path.join(from, "manifest.json"), "utf8"));
  const rewrite = (asset) => ({
    ...asset,
    url: asset.url.replace(`/beta/${platform}/`, `/production/${platform}/`),
  });
  manifest.launchAsset = rewrite(manifest.launchAsset);
  manifest.assets = manifest.assets.map(rewrite);
  for (const name of readdirSync(path.join(from, "assets"))) {
    copyFileSync(path.join(from, "assets", name), path.join(to, "assets", name));
  }
  writeManifest(to, manifest);
  console.log(`✔ Promoted ${manifest.extra.otaVersion} to production.`);
  return "production";
};

const privateKeyPath = () =>
  path.resolve(
    root,
    process.env.OTA_PRIVATE_KEY_PATH ||
      path.join(os.homedir(), ".lore-llm-ota", "mobile", "private-key.pem"),
  );

// Signs the exact bytes that are written, so the server must serve the file untouched.
const writeManifest = (dir, manifest) => {
  const keyPath = privateKeyPath();
  if (!existsSync(keyPath)) fail(`Private key not found at ${keyPath} (set OTA_PRIVATE_KEY_PATH).`);
  const body = JSON.stringify(manifest);
  const signature = signManifest(body, readFileSync(keyPath, "utf8"));
  writeFileSync(path.join(dir, "manifest.json"), body);
  const htaccess = signatureHtaccess(signature);
  writeFileSync(path.join(dir, ".htaccess"), htaccess);
  // History keeps the signature too: a rollback re-uploads both files.
  const tag = manifest.extra.otaVersion;
  writeFileSync(path.join(dir, "history", `manifest-${tag}.json`), body);
  writeFileSync(path.join(dir, "history", `manifest-${tag}.htaccess`), htaccess);
};

const publish = (args) => {
  const channel = args.channel;
  checkChannel(channel);

  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  let sha = "nogit";
  try {
    sha = run("git", ["rev-parse", "--short", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    /* not a git checkout */
  }
  const version = typeof args.version === "string" ? args.version : defaultVersion(pkg.version, sha);
  if (!SEMVER.test(version)) fail(`Invalid version "${version}": must be semver.`);

  const exportDir = path.join(root, "dist");
  if (!args["skip-build"]) {
    console.log("› Exporting…");
    rmSync(exportDir, { recursive: true, force: true });
    run("npx", ["expo", "export", "--platform", platform], { stdio: "inherit" });
  }
  if (!existsSync(path.join(exportDir, "metadata.json"))) {
    fail(`${exportDir}/metadata.json not found: run without --skip-build.`);
  }

  // The embedded config must match the binary's; `expo config` resolves app.json the same way.
  const expoConfig = JSON.parse(
    run("npx", ["expo", "config", "--json", "--type", "public"], {
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  if (String(expoConfig.runtimeVersion) !== otaConfig.runtimeVersion) {
    fail(
      `app.json runtimeVersion (${expoConfig.runtimeVersion}) differs from ota.config.json (${otaConfig.runtimeVersion}).`,
    );
  }

  console.log("› Building the manifest…");
  const { manifest, files } = buildManifest({
    exportDir,
    platform,
    runtimeVersion: otaConfig.runtimeVersion,
    baseUrl: otaConfig.baseUrl,
    channel,
    expoConfig,
    version,
  });

  const dir = channelDirOf(channel);
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  mkdirSync(path.join(dir, "history"), { recursive: true });
  for (const [remote, local] of files) copyFileSync(local, path.join(dir, "assets", remote));
  writeManifest(dir, manifest);

  console.log(`\n✔ Release ${version} staged in ota-dist/${channel}/${platform}/ (${files.size} files)`);
  return channel;
};

const printUploadHelp = (channel) => {
  console.log(
    "\nUpload (assets first, .htaccess, manifest last):\n" +
      `  ota-dist/${channel}/${platform}/  ->  ${otaConfig.baseUrl}/${channel}/${platform}/\n` +
      "or set OTA_FTP_URL and pass --upload (see docs/OTA.md).",
  );
};

// FTP(S) through curl (no extra dependency). Credentials go through a curl
// config on stdin so they never show up in the process list.
const ftpPut = (localFile, remoteUrl, { user, password, tls }) => {
  const quote = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const config = [
    `user = ${quote(`${user}:${password}`)}`,
    `url = ${quote(remoteUrl)}`,
    `upload-file = ${quote(localFile)}`,
    "ftp-create-dirs",
    "fail",
    "silent",
    "show-error",
  ];
  if (tls) config.push("ssl-reqd");
  // Extra CA file for hosts that do not send their intermediate certificate (CI on Linux).
  if (process.env.OTA_FTP_CACERT) config.push(`cacert = ${quote(process.env.OTA_FTP_CACERT)}`);
  try {
    execFileSync("curl", ["--config", "-"], {
      cwd: root,
      input: config.join("\n") + "\n",
      stdio: ["pipe", "inherit", "inherit"],
    });
  } catch {
    fail(`FTP upload failed for ${remoteUrl} (see the curl error above).`);
  }
};

const ftpOptions = () => {
  const user = process.env.OTA_FTP_USER;
  const password = process.env.OTA_FTP_PASSWORD;
  if (!process.env.OTA_FTP_URL) fail("Upload needs OTA_FTP_URL (+ user/password) in .env.");
  if (!user || !password) fail("FTP upload needs OTA_FTP_USER and OTA_FTP_PASSWORD.");
  // OTA_FTP_TLS=0 only if the host really has no FTPS (credentials then travel in clear).
  return { user, password, tls: process.env.OTA_FTP_TLS !== "0" };
};

// Assets are content-hashed: an HTTP 200 on the public URL means it is already there.
const alreadyOnline = async (url) => {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(15000) });
    return res.status === 200;
  } catch {
    return false;
  }
};

const upload = async (channel) => {
  const opts = ftpOptions();
  const base = process.env.OTA_FTP_URL.replace(/\/+$/, "");
  const dir = channelDirOf(channel);
  console.log(`› Uploading to ${base}/${channel}/${platform}/ (FTP${opts.tls ? "S" : ", NO TLS"})…`);

  // Assets first, manifest last: the app never sees a manifest without its files.
  const assetsDir = path.join(dir, "assets");
  let skipped = 0;
  for (const file of readdirSync(assetsDir)) {
    if (await alreadyOnline(`${otaConfig.baseUrl}/${channel}/${platform}/assets/${file}`)) {
      skipped++;
      continue;
    }
    console.log(`  ${file}`);
    ftpPut(path.join(assetsDir, file), `${base}/${channel}/${platform}/assets/${file}`, opts);
  }
  if (skipped) console.log(`  (${skipped} assets already online)`);
  console.log("  .htaccess");
  ftpPut(path.join(dir, ".htaccess"), `${base}/${channel}/${platform}/.htaccess`, opts);
  console.log("  manifest.json");
  ftpPut(path.join(dir, "manifest.json"), `${base}/${channel}/${platform}/manifest.json`, opts);
};

const args = parseArgs(process.argv.slice(2));

if (args.setup) {
  const opts = ftpOptions();
  const base = process.env.OTA_FTP_URL.replace(/\/+$/, "");
  ftpPut(path.join(root, "ota-server", ".htaccess"), `${base}/.htaccess`, opts);
  console.log("✔ Server folder ready.");
  process.exit(0);
}

if (args["upload-only"]) {
  checkChannel(args.channel);
  if (!existsSync(path.join(channelDirOf(args.channel), "manifest.json"))) {
    fail(`Nothing staged in ota-dist/${args.channel}/${platform}/.`);
  }
  await upload(args.channel);
  console.log("✔ Uploaded.");
  process.exit(0);
}

const channel = args.promote ? promote() : publish(args);
if (args.upload) {
  await upload(channel);
  console.log("✔ Uploaded.");
} else printUploadHelp(channel);
