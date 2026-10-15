import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export async function createUpdaterManifest({ bundleDir, projectRoot = bundleDir, tag, repository, notes }) {
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error("Indica un repositorio GitHub válido (propietario/repositorio).");
  }
  const version = await validateReleaseVersion({ root: projectRoot, tag, repository });

  const files = await listFiles(bundleDir);
  const installers = files.filter((file) => /setup\.exe$/i.test(file));
  if (installers.length !== 1) {
    throw new Error(
      `Se esperaba exactamente un instalador *-setup.exe; encontrados: ${installers.length}.`,
    );
  }

  const installer = installers[0];
  const signature = `${installer}.sig`;
  if (!files.includes(signature)) {
    throw new Error(`No se encontró la firma del instalador: ${signature}`);
  }

  const tagUrl = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}`;
  const assetUrl = `${tagUrl}/${encodeURIComponent(path.basename(installer))}`;
  const signatureText = (await readFile(path.join(bundleDir, signature), "utf8")).trim();
  if (!signatureText) {
    throw new Error("La firma del instalador está vacía.");
  }

  return {
    version,
    notes: notes || `Actualización de GestaERP ${version}.`,
    platforms: {
      "windows-x86_64": {
        signature: signatureText,
        url: assetUrl,
      },
    },
  };
}

export async function validateReleaseVersion({ root, tag, repository }) {
  const version = parseTag(tag);
  const { versions, updater } = await readProjectVersions(root);
  if (versions.some((projectVersion) => projectVersion !== version)) {
    throw new Error(
      `El tag ${tag} no coincide con las versiones del proyecto: ${versions.join(", ")}`,
    );
  }
  if (repository) {
    const expectedEndpoint = `https://github.com/${repository}/releases/latest/download/latest.json`;
    if (!Array.isArray(updater.endpoints) || !updater.endpoints.includes(expectedEndpoint)) {
      throw new Error(`El endpoint Tauri Updater debe apuntar a ${expectedEndpoint}.`);
    }
  }

  if (typeof updater.pubkey !== "string") {
    throw new Error("No se configuró la clave pública del updater en tauri.conf.json.");
  }
  const publicKey = Buffer.from(updater.pubkey, "base64").toString("utf8");
  if (
    !publicKey.startsWith("untrusted comment: minisign public key:") ||
    !/^RW[A-Za-z0-9+/]+=*$/m.test(publicKey)
  ) {
    throw new Error(
      "La clave pública del updater en tauri.conf.json no es una clave Minisign válida.",
    );
  }
  return version;
}

function parseTag(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag ?? "");
  if (!match) throw new Error(`Tag inválido: ${tag}. Usa el formato vX.Y.Z.`);
  return match.slice(1).join(".");
}

async function readProjectVersions(root) {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  const tauriConfig = JSON.parse(
    await readFile(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  const cargoToml = await readFile(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
  const cargoLock = await readFile(path.join(root, "src-tauri", "Cargo.lock"), "utf8");
  const cargoVersion = /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1];
  const cargoLockVersion =
    /^\[\[package\]\]\r?\nname = "appsdesktop"\r?\nversion = "([^"]+)"/m.exec(cargoLock)?.[1];
  if (!cargoVersion) throw new Error("No se encontró la versión del paquete en Cargo.toml.");
  if (!cargoLockVersion) throw new Error("No se encontró la versión del paquete en Cargo.lock.");
  return {
    versions: [
      packageJson.version,
      packageLock.version,
      packageLock.packages?.[""]?.version,
      tauriConfig.version,
      cargoVersion,
      cargoLockVersion,
    ],
    updater: tauriConfig.plugins?.updater ?? { pubkey: "", endpoints: [] },
  };
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(directory, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length;) {
    const key = process.argv[index];
    if (key === "--validate-only") {
      args.set(key, true);
      index += 1;
    } else {
      args.set(key, process.argv[index + 1]);
      index += 2;
    }
  }

  const bundleDir = path.resolve(args.get("--bundle-dir") ?? "");
  const projectRoot = path.resolve(args.get("--project-root") ?? process.cwd());
  const tag = args.get("--tag");
  const repository = args.get("--repository") ?? process.env.GITHUB_REPOSITORY;
  if (args.has("--validate-only")) {
    const version = await validateReleaseVersion({ root: projectRoot, tag, repository });
    console.log(`Versiones alineadas para v${version}.`);
    return;
  }
  const manifest = await createUpdaterManifest({
    bundleDir,
    projectRoot,
    tag,
    repository,
    notes: args.has("--notes-file")
      ? await readFile(path.resolve(args.get("--notes-file")), "utf8")
      : args.get("--notes"),
  });
  await writeFile(path.join(bundleDir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Manifest de actualización generado para v${manifest.version}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
