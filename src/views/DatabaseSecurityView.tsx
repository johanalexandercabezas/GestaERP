import { FormEvent, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { KeyRound, ShieldCheck } from "lucide-react";

interface RecoveryBackup {
  filename: string;
  created: string;
  size: number;
  encrypted: boolean;
}

interface RecoveryBackupCatalog {
  directory: string;
  backups: RecoveryBackup[];
}

interface DatabaseSecurityViewProps {
  status: string;
  onReady: () => void;
  onStatusChange: (status: string) => void;
}

export default function DatabaseSecurityView({ status, onReady, onStatusChange }: DatabaseSecurityViewProps) {
  const [phrase, setPhrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [backupCatalog, setBackupCatalog] = useState<RecoveryBackupCatalog | null>(null);
  const [selectedBackup, setSelectedBackup] = useState("");
  const [backupCatalogError, setBackupCatalogError] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const creating = status === "new_database" || status === "migration_required";

  useEffect(() => {
    if (status !== "new_database") {
      setBackupCatalog(null);
      setSelectedBackup("");
      setBackupCatalogError("");
      return;
    }

    let cancelled = false;
    invoke<RecoveryBackupCatalog>("list_recovery_backups")
      .then(catalog => {
        if (cancelled) return;
        setBackupCatalog(catalog);
        setSelectedBackup(catalog.backups.length === 1 ? catalog.backups[0].filename : "");
        setBackupCatalogError("");
      })
      .catch(cause => {
        if (cancelled) return;
        setBackupCatalogError(String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (creating && phrase !== confirmation) {
      setError("Las frases no coinciden.");
      return;
    }
    if (phrase.trim().length < 16) {
      setError("Usa una frase de al menos 16 caracteres.");
      return;
    }
    setWorking(true);
    try {
      const restoringPortableBackup = status === "new_database" && selectedBackup.length > 0;
      if (restoringPortableBackup) {
        await invoke("recover_database_key", {
          recoveryPhrase: phrase,
          backupFilename: selectedBackup,
        });
      } else if (creating) {
        await invoke("initialize_database_security", { recoveryPhrase: phrase });
      } else {
        await invoke("recover_database_key", { recoveryPhrase: phrase });
      }
      setPhrase("");
      setConfirmation("");
      setSelectedBackup("");
      onReady();
    } catch (cause) {
      setError(String(cause));
      try {
        const result = await invoke<{ status: string }>("get_database_security_state");
        onStatusChange(result.status);
      } catch {
        // The original command error remains visible in the form.
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-xl border border-border bg-panel p-8 shadow-xl">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
          {creating ? <ShieldCheck size={24} /> : <KeyRound size={24} />}
        </div>
        <h1 className="text-2xl font-semibold text-primary">
          {creating ? "Protege tu base de datos" : "Recupera el acceso a tus datos"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-secondary">
          {status === "migration_required"
            ? "La base de datos existente se migrará a SQLCipher antes de continuar. No cierres la aplicación durante el proceso."
            : status === "new_database"
              ? "La base local se cifrará con SQLCipher. Esta frase también permite recuperarla en otro equipo."
              : "La clave no está disponible en el almacén seguro de este equipo. Ingresa la frase usada al proteger la base."}
        </p>
        {creating && (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-secondary">
            Guarda la frase en un lugar seguro fuera de este equipo. Si se pierde, la base cifrada no se puede recuperar.
          </p>
        )}
        {status === "new_database" && (
          <div className="mt-4 rounded-md border border-border bg-surface p-3">
            <label className="block text-sm font-medium text-primary" htmlFor="recovery-backup">
              Restaurar desde un backup cifrado (opcional)
            </label>
            {backupCatalog === null && !backupCatalogError ? (
              <p className="mt-2 text-sm text-secondary">Buscando backups...</p>
            ) : backupCatalog?.backups.length ? (
              <select
                className="mt-2 w-full rounded-md border border-border bg-panel px-3 py-2 text-primary outline-none focus:border-accent"
                id="recovery-backup"
                onChange={event => setSelectedBackup(event.target.value)}
                value={selectedBackup}
              >
                <option value="">Crear una base nueva</option>
                {backupCatalog.backups.map(backup => (
                  <option key={backup.filename} value={backup.filename}>
                    {backup.filename} · {backup.created}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm text-secondary">
                No se encontraron backups cifrados. Puedes crear una base nueva.
              </p>
            )}
            <p className="mt-2 break-all text-xs text-secondary">
              Para restaurar desde otro equipo, copia el archivo .gbackup a:{" "}
              <code>{backupCatalog?.directory ?? "la carpeta de datos de GestaERP"}</code>.
              Se detectará automáticamente. Usa la misma frase de recuperación del backup.
            </p>
            {backupCatalog?.backups.length && backupCatalog.backups.length > 1 && !selectedBackup && (
              <p className="mt-2 text-xs text-warning">
                Hay varios backups; selecciona explícitamente cuál quieres restaurar.
              </p>
            )}
            {backupCatalogError && (
              <p className="mt-2 text-xs text-danger" role="alert">
                No se pudo buscar backups: {backupCatalogError}
              </p>
            )}
          </div>
        )}
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-primary">
            Frase de recuperación
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-primary outline-none focus:border-accent"
              onChange={event => setPhrase(event.target.value)}
              required
              type="password"
              value={phrase}
            />
          </label>
          {creating && (
            <label className="block text-sm font-medium text-primary">
              Confirma la frase
              <input
                autoComplete="new-password"
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-primary outline-none focus:border-accent"
                onChange={event => setConfirmation(event.target.value)}
                required
                type="password"
                value={confirmation}
              />
            </label>
          )}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button
            className="w-full rounded-md bg-accent px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            disabled={working}
            type="submit"
          >
            {working
              ? "Procesando de forma segura..."
              : status === "new_database" && selectedBackup
                ? "Restaurar backup y continuar"
                : creating
                  ? "Cifrar y continuar"
                  : "Desbloquear base"}
          </button>
        </form>
      </section>
    </main>
  );
}
