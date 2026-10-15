import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kind = process.argv[2];
const allowedKinds = ["patch", "minor", "major"];
if (!allowedKinds.includes(kind)) {
  console.error(`Uso: node scripts/bump-version.mjs <${allowedKinds.join("|")}>`);
  process.exitCode = 1;
} else {
  try {
    const packageJsonPath = path.join(root, "package.json");
    const packageLockPath = path.join(root, "package-lock.json");
    const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
    const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
    const cargoLockPath = path.join(root, "src-tauri", "Cargo.lock");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    const packageLock = JSON.parse(await readFile(packageLockPath, "utf8"));
    const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
    const cargoToml = await readFile(cargoPath, "utf8");
    const cargoLock = await readFile(cargoLockPath, "utf8");

    const versionMatch = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(packageJson.version);
    if (!versionMatch)
      throw new Error(`La versión actual no es SemVer X.Y.Z: ${packageJson.version}`);
    const [major, minor, patch] = versionMatch.slice(1).map(Number);
    const nextVersion =
      kind === "major"
        ? `${major + 1}.0.0`
        : kind === "minor"
          ? `${major}.${minor + 1}.0`
          : `${major}.${minor}.${patch + 1}`;
    const cargoUpdated = cargoToml.replace(
      /^(\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m,
      `$1${nextVersion}$2`,
    );
    if (cargoUpdated === cargoToml)
      throw new Error("No se pudo actualizar version en src-tauri/Cargo.toml.");
    const cargoLockUpdated = cargoLock.replace(
      /^(\[\[package\]\]\r?\nname = "appsdesktop"\r?\nversion = ")[^"]+(")/m,
      `$1${nextVersion}$2`,
    );
    if (cargoLockUpdated === cargoLock) {
      throw new Error("No se pudo actualizar la versión de appsdesktop en src-tauri/Cargo.lock.");
    }

    packageJson.version = nextVersion;
    packageLock.version = nextVersion;
    if (!packageLock.packages?.[""])
      throw new Error('package-lock.json no contiene la entrada raíz packages[""].');
    packageLock.packages[""].version = nextVersion;
    tauriConfig.version = nextVersion;

    await Promise.all([
      writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`),
      writeFile(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`),
      writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`),
      writeFile(cargoPath, cargoUpdated),
      writeFile(cargoLockPath, cargoLockUpdated),
    ]);
    console.log(`Versión sincronizada en npm, Tauri y Cargo: ${nextVersion}`);
    console.log(`Después de probar, crea el tag v${nextVersion} y envíalo a GitHub.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
