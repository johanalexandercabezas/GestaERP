import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUpdaterManifest } from "./updater-manifest.mjs";

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gestaerp-updater-"));
  await mkdir(path.join(root, "src-tauri", "target", "bundle", "nsis"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "1.0.1" }));
  await writeFile(
    path.join(root, "package-lock.json"),
    JSON.stringify({ version: "1.0.1", packages: { "": { version: "1.0.1" } } }),
  );
  await writeFile(
    path.join(root, "src-tauri", "tauri.conf.json"),
    JSON.stringify({
      version: "1.0.1",
      plugins: {
        updater: {
          pubkey: Buffer.from("untrusted comment: minisign public key: test\nRWQtest=").toString(
            "base64",
          ),
          endpoints: [
            "https://github.com/johanalexandercabezas/GestaERP/releases/latest/download/latest.json",
          ],
        },
      },
    }),
  );
  await writeFile(
    path.join(root, "src-tauri", "Cargo.toml"),
    '[package]\nname = "fixture"\nversion = "1.0.1"\n',
  );
  await writeFile(
    path.join(root, "src-tauri", "Cargo.lock"),
    '[[package]]\nname = "appsdesktop"\nversion = "1.0.1"\n',
  );
  const installer = path.join(
    root,
    "src-tauri",
    "target",
    "bundle",
    "nsis",
    "GestaERP_1.0.1_x64-setup.exe",
  );
  await writeFile(installer, "fixture installer");
  await writeFile(`${installer}.sig`, "valid-signature");
  return { root, installer };
}

test("construye el manifest firmado con la versión y Release correctas", async () => {
  const { root } = await makeFixture();
  try {
    const manifest = await createUpdaterManifest({
      bundleDir: root,
      tag: "v1.0.1",
      repository: "johanalexandercabezas/GestaERP",
    });
    assert.deepEqual(manifest, {
      version: "1.0.1",
      notes: "Actualización de GestaERP 1.0.1.",
      platforms: {
        "windows-x86_64": {
          signature: "valid-signature",
          url: "https://github.com/johanalexandercabezas/GestaERP/releases/download/v1.0.1/GestaERP_1.0.1_x64-setup.exe",
        },
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rechaza versiones desalineadas entre tag, frontend, Tauri y Cargo", async () => {
  const { root } = await makeFixture();
  try {
    await writeFile(
      path.join(root, "src-tauri", "Cargo.toml"),
      '[package]\nname = "fixture"\nversion = "1.0.0"\n',
    );
    await assert.rejects(
      createUpdaterManifest({
        bundleDir: root,
        tag: "v1.0.1",
        repository: "johanalexandercabezas/GestaERP",
      }),
      /no coincide con las versiones/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rechaza un instalador sin firma del updater", async () => {
  const { root, installer } = await makeFixture();
  try {
    await rm(`${installer}.sig`);
    await assert.rejects(
      createUpdaterManifest({
        bundleDir: root,
        tag: "v1.0.1",
        repository: "johanalexandercabezas/GestaERP",
      }),
      /No se encontró la firma/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("incluye las notas de publicación en el manifest", async () => {
  const { root } = await makeFixture();
  try {
    const manifest = await createUpdaterManifest({
      bundleDir: root,
      tag: "v1.0.1",
      repository: "johanalexandercabezas/GestaERP",
      notes: "Correcciones de estabilidad.\n\nMejoras de seguridad.",
    });
    assert.equal(manifest.notes, "Correcciones de estabilidad.\n\nMejoras de seguridad.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lee la versión del proyecto aunque los instaladores estén en otra carpeta", async () => {
  const { root } = await makeFixture();
  const bundleDir = path.join(root, "artifacts");
  try {
    await mkdir(bundleDir);
    await writeFile(path.join(bundleDir, "GestaERP_1.0.1_x64-setup.exe"), "fixture installer");
    await writeFile(
      path.join(bundleDir, "GestaERP_1.0.1_x64-setup.exe.sig"),
      "valid-signature",
    );
    const manifest = await createUpdaterManifest({
      bundleDir,
      projectRoot: root,
      tag: "v1.0.1",
      repository: "johanalexandercabezas/GestaERP",
    });
    assert.equal(manifest.version, "1.0.1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rechaza el manifest si Tauri apunta a otro repositorio", async () => {
  const { root } = await makeFixture();
  try {
    await assert.rejects(
      createUpdaterManifest({
        bundleDir: root,
        tag: "v1.0.1",
        repository: "johanalexandercabezas/otro-repo",
      }),
      /endpoint Tauri Updater debe apuntar/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rechaza una clave pública placeholder o con formato incorrecto", async () => {
  const { root } = await makeFixture();
  try {
    const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
    const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
    tauriConfig.plugins.updater.pubkey = "REEMPLAZAR_CON_CLAVE_PUBLICA_TAURI";
    await writeFile(tauriConfigPath, JSON.stringify(tauriConfig));
    await assert.rejects(
      createUpdaterManifest({
        bundleDir: root,
        tag: "v1.0.1",
        repository: "johanalexandercabezas/GestaERP",
      }),
      /clave Minisign válida/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
