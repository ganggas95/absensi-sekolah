const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const appDir = path.resolve(__dirname, "..");
const androidDir = path.join(appDir, "android");
const appConfigPath = path.join(appDir, "app.json");
const signingPropertiesPath = path.join(androidDir, "keystore.properties");
const keystorePath = path.join(androidDir, "app", "absensi-release.keystore");
const keystoreRelativePath = "app/absensi-release.keystore";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: androidDir,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function ensureReleaseKeystore() {
  const propertiesExist = fs.existsSync(signingPropertiesPath);
  const keystoreExists = fs.existsSync(keystorePath);

  if (propertiesExist && keystoreExists) {
    return;
  }
  if (propertiesExist || keystoreExists) {
    throw new Error(
      "Release keystore configuration is incomplete. Restore both android/keystore.properties " +
        "and android/app/absensi-release.keystore from a secure backup.",
    );
  }

  const keytool = process.platform === "win32" ? "keytool.exe" : "keytool";
  const password = crypto.randomBytes(32).toString("base64url");
  run(keytool, [
    "-genkeypair",
    "-alias",
    "absensi-guru",
    "-keyalg",
    "RSA",
    "-keysize",
    "2048",
    "-validity",
    "10000",
    "-dname",
    "CN=Absensi Guru SMPI, OU=Mobile, O=SMPI Bina Cendekia Aqwam, C=ID",
    "-storetype",
    "PKCS12",
    "-keystore",
    keystorePath,
    "-storepass",
    password,
    "-keypass",
    password,
    "-noprompt",
  ]);
  fs.writeFileSync(
    signingPropertiesPath,
    [
      `storeFile=${keystoreRelativePath}`,
      `storePassword=${password}`,
      "keyAlias=absensi-guru",
      `keyPassword=${password}`,
      "",
    ].join("\n"),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Created a local release signing key. Keep android/app/absensi-release.keystore " +
      "and android/keystore.properties backed up securely; do not share or commit them.",
  );
}

function bumpVersion() {
  const config = JSON.parse(fs.readFileSync(appConfigPath, "utf8"));
  const currentVersion = config.expo.version;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(currentVersion);
  if (!match) {
    throw new Error(`Expected app.json expo.version to be semantic X.Y.Z, got ${currentVersion}`);
  }

  const versionCode = Number(config.expo.android.versionCode);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode >= 2100000000) {
    throw new Error(`Invalid Android versionCode: ${config.expo.android.versionCode}`);
  }

  config.expo.version = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
  config.expo.android.versionCode = versionCode + 1;
  fs.writeFileSync(appConfigPath, `${JSON.stringify(config, null, 2)}\n`);
  return { version: config.expo.version, versionCode: config.expo.android.versionCode };
}

try {
  ensureReleaseKeystore();
  const { version, versionCode } = bumpVersion();
  console.log(`Building release APK version ${version} (versionCode ${versionCode})...`);

  const gradleWrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  run(gradleWrapper, [":app:assembleRelease"], {
    shell: process.platform === "win32",
  });

  const apkPath = path.join(
    androidDir,
    "app",
    "build",
    "outputs",
    "apk",
    "release",
    "app-release.apk",
  );
  const sharePath = path.join(
    path.dirname(apkPath),
    `Absensi-Guru-v${version}.apk`,
  );
  fs.copyFileSync(apkPath, sharePath);
  console.log(`Production APK ready: ${sharePath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
