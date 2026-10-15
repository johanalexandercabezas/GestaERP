import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("sincroniza la versión patch sin modificar versiones de dependencias", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gestaerp-bump-version-"));
  try {
    await mkdir(path.join(root, "scripts"), { recursive: true });
    await mkdir(path.join(root, "src-tauri"), { recursive: true });
    await copyFile(
      new URL("./bump-version.mjs", import.meta.url),
      path.join(root, "scripts", "bump-version.mjs"),
    );
    await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "1.2.3" }));
    await writeFile(
      path.join(root, "package-lock.json"),
      JSON.stringify({ version: "1.2.3", packages: { "": { version: "1.2.3" } } }),
    );
    await writeFile(
      path.join(root, "src-tauri", "tauri.conf.json"),
      JSON.stringify({ version: "1.2.3" }),
    );
    await writeFile(
      path.join(root, "src-tauri", "Cargo.toml"),
      '[package]\nname = "appsdesktop"\nversion = "1.2.3"\n',
    );
    await writeFile(
      path.join(root, "src-tauri", "Cargo.lock"),
      '[[package]]\nname = "appsdesktop"\nversion = "1.2.3"\n\n' +
        '[[package]]\nname = "some-dependency"\nversion = "1.2.3"\n',
    );

    await execFileAsync(process.execPath, [
      path.join(root, "scripts", "bump-version.mjs"),
      "patch",
    ]);

    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
    const tauriConfig = JSON.parse(
      await readFile(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
    );
    const cargoToml = await readFile(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
    const cargoLock = await readFile(path.join(root, "src-tauri", "Cargo.lock"), "utf8");
    assert.equal(packageJson.version, "1.2.4");
    assert.equal(packageLock.version, "1.2.4");
    assert.equal(packageLock.packages[""].version, "1.2.4");
    assert.equal(tauriConfig.version, "1.2.4");
    assert.match(cargoToml, /version = "1\.2\.4"/);
    assert.match(cargoLock, /name = "appsdesktop"\r?\nversion = "1\.2\.4"/);
    assert.match(cargoLock, /name = "some-dependency"\r?\nversion = "1\.2\.3"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
