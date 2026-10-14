import { FormEvent, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { KeyRound, ShieldCheck } from "lucide-react";

interface DatabaseSecurityViewProps {
  status: string;
  onReady: () => void;
  onStatusChange: (status: string) => void;
}

export default function DatabaseSecurityView({ status, onReady, onStatusChange }: DatabaseSecurityViewProps) {
  const [phrase, setPhrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [backupPath, setBackupPath] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const creating = status === "new_database" || status === "migration_required";

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
      const restoringPortableBackup = status === "new_database" && backupPath.trim().length > 0;
      if (restoringPortableBackup) {
        await invoke("recover_database_key", {
          recoveryPhrase: phrase,
          backupPath: backupPath.trim(),
        });
      } else if (creating) {
        await invoke("initialize_database_security", { recoveryPhrase: phrase });
      } else {
        await invoke("recover_database_key", { recoveryPhrase: phrase });
      }
      setPhrase("");
      setConfirmation("");
      setBackupPath("");
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
          <label className="mt-4 block text-sm font-medium text-primary">
            Ruta a un backup cifrado .gbackup (opcional)
            <input
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-primary outline-none focus:border-accent"
              onChange={event => setBackupPath(event.target.value)}
              placeholder={"Ej.: C:\\Users\\Usuario\\Desktop\\gestaerp_....gbackup"}
              value={backupPath}
            />
            <span className="mt-1 block text-xs text-secondary">
              Si restauras desde otro equipo, usa la misma frase de recuperación del backup.
            </span>
          </label>
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
              : status === "new_database" && backupPath.trim()
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
