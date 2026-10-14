import { useState, useEffect, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { showToast } from "../components/ui/PremiumToast";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumModal from "../components/ui/PremiumModal";
import { HardDrive, Download, Upload, FolderOpen, Trash2, RotateCcw, Plus, AlertTriangle, CheckCircle, CloudDownload } from "lucide-react";

interface BackupInfo {
  filename: string;
  created: string;
  size: number;
  encrypted: boolean;
}

interface BackupSyncStatus {
  pending: number;
  uploaded: number;
  configured: boolean;
}

interface RemoteBackupInfo {
  filename: string;
  created: string;
  size: number;
  sha256: string;
}

export default function BackupView() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importPath, setImportPath] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [syncEndpoint, setSyncEndpoint] = useState("");
  const [syncToken, setSyncToken] = useState("");
  const [syncStatus, setSyncStatus] = useState<BackupSyncStatus>({ pending: 0, uploaded: 0, configured: false });
  const [syncing, setSyncing] = useState(false);
  const [remoteBackups, setRemoteBackups] = useState<RemoteBackupInfo[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);

  const loadSyncStatus = async () => {
    try {
      const [pending, uploaded, configured] = await invoke<[number, number, boolean]>("get_backup_sync_status");
      setSyncStatus({ pending, uploaded, configured });
    } catch (cause) {
      setError(String(cause));
    }
  };
  const loadBackups = async () => {
    try {
      const list = await invoke<BackupInfo[]>("list_backups");
      setBackups(list);
    } catch (e) {
      setError(String(e));
      console.error(e);
    }
  };

  useEffect(() => { loadBackups(); loadSyncStatus(); }, []);

  const handleCreate = async () => {
    setError("");
    setCreating(true);
    try {
      const result = await invoke<BackupInfo>("create_backup");
      showToast(`Backup "${result.filename}" creado exitosamente`, "success");
      loadBackups();
      try {
        const [, , configured] = await invoke<[number, number, boolean]>("get_backup_sync_status");
        if (configured) {
          const sync = await invoke<{ uploaded: number; errors: string[] }>("sync_backups");
          if (sync.errors.length) setError(`Backup local creado; la carga remota quedó pendiente: ${sync.errors.join("; ")}`);
        }
      } catch (cause) {
        setError(`Backup local creado; no se pudo comprobar la sincronización remota: ${String(cause)}`);
      }
      loadSyncStatus();
    } catch (e) {
      setError(String(e));
      showToast("Error al crear backup: " + String(e), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleConfigureSync = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await invoke("configure_backup_sync", { endpoint: syncEndpoint, token: syncToken });
      setSyncToken("");
      await loadSyncStatus();
      showToast("Sincronización remota configurada", "success");
    } catch (cause) {
      setError(String(cause));
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setError("");
    try {
      const result = await invoke<{ uploaded: number; pending: number; errors: string[] }>("sync_backups");
      await loadSyncStatus();
      if (result.errors.length) {
        setError(result.errors.join("; "));
      } else {
        showToast(`${result.uploaded} backup(s) sincronizados`, "success");
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSyncing(false);
    }
  };

  const handleLoadRemote = async () => {
    setLoadingRemote(true);
    setError("");
    try {
      setRemoteBackups(await invoke<RemoteBackupInfo[]>("list_remote_backups"));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoadingRemote(false);
    }
  };

  const handleDownloadRemote = async (remote: RemoteBackupInfo) => {
    setError("");
    try {
      const downloaded = await invoke<BackupInfo>("download_remote_backup", {
        filename: remote.filename,
        sha256: remote.sha256,
      });
      showToast(`Backup remoto "${downloaded.filename}" descargado`, "success");
      await loadBackups();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const handleRestore = async (filename: string) => {
    if (!confirm(`¿Restaurar el backup "${filename}"? La base de datos actual será reemplazada. Se recomienda reiniciar la aplicación después.`)) return;
    setError("");
    try {
      await invoke("restore_backup", { filename });
      showToast("Backup restaurado exitosamente. Reinicia la aplicación.", "success");
    } catch (e) {
      setError(String(e));
      showToast("Error al restaurar: " + String(e), "error");
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`¿Eliminar el backup "${filename}"?`)) return;
    setError("");
    try {
      await invoke("delete_backup", { filename });
      showToast(`Backup "${filename}" eliminado`, "success");
      loadBackups();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleExport = async (filename: string) => {
    setExporting(filename);
    setError("");
    try {
      const destPath = await invoke<string>("get_desktop_path");
      const result = await invoke<BackupInfo>("export_backup", { filename, destPath });
      setExporting(null);
      showToast(`Backup exportado al Escritorio como "${result.filename}"`, "success");
    } catch (e) {
      setError(String(e));
      showToast("Error al exportar: " + String(e), "error");
      setExporting(null);
    }
  };

  const handleImportClick = () => {
    setImportPath("");
    setShowImportModal(true);
  };

  const handleImportConfirm = async () => {
    if (!importPath.trim()) {
      setError("Selecciona un archivo de backup");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const result = await invoke<BackupInfo>("import_backup", { sourcePath: importPath });
      showToast(`Backup "${result.filename}" importado exitosamente`, "success");
      setShowImportModal(false);
      loadBackups();
    } catch (e) {
      setError(String(e));
      showToast("Error al importar: " + String(e), "error");
    } finally {
      setImporting(false);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await invoke("open_backups_folder");
    } catch (e) {
      setError(String(e));
    }
  };

  const handleResetDatabase = async () => {
    if (!confirm("¿Borrar TODO el historial? Se eliminarán ventas, compras, gastos, caja, movimientos, nóminas y datos de prueba. Se conservan productos, clientes, proveedores, empleados, licencia y configuración.")) return;
    setError("");
    setResetting(true);
    try {
      const result = await invoke<string>("reset_database");
      showToast(result || "Base de datos reiniciada", "success");
      loadBackups();
    } catch (e) {
      setError(String(e));
      showToast("Error al reiniciar: " + String(e), "error");
    } finally {
      setResetting(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <motion.h2
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold text-primary flex items-center gap-2"
        >
          <HardDrive className="text-accent" size={24} />
          Backups y Migración
          <span className="text-sm font-normal text-secondary ml-2">({backups.length} archivos)</span>
        </motion.h2>
        <div className="flex gap-2">
          <PremiumButton
            onClick={handleOpenFolder}
            variant="ghost"
            title="Abrir carpeta de backups en el explorador"
          >
            <FolderOpen size={16} />
            Carpeta
          </PremiumButton>
          <PremiumButton
            onClick={handleImportClick}
            variant="secondary"
          >
            <Upload size={16} />
            Importar
          </PremiumButton>
          <PremiumButton
            onClick={handleCreate}
            loading={creating}
          >
            <Plus size={16} />
            {creating ? "Creando..." : "Crear backup"}
          </PremiumButton>
          <PremiumButton
            onClick={handleResetDatabase}
            loading={resetting}
            variant="danger"
          >
            <Trash2 size={16} />
            {resetting ? "Limpiando..." : "Limpiar historial"}
          </PremiumButton>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-card border border-theme rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/20 flex items-center justify-center">
              <Download size={20} className="text-info" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Exportar backup</p>
              <p className="text-xs text-secondary">Copia un backup al Escritorio para migrar a otro PC</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-theme rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <Upload size={20} className="text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Importar backup</p>
              <p className="text-xs text-secondary">Restaura un backup desde USB o Escritorio</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card border border-theme rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <RotateCcw size={20} className="text-warning" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">Restaurar</p>
              <p className="text-xs text-secondary">Recupera una versión anterior de la base de datos</p>
            </div>
          </div>
        </motion.div>
      </div>

      <section className="mb-6 rounded-xl border border-theme bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-primary">Copia remota cifrada</h3>
            <p className="mt-1 text-sm text-secondary">
              Los archivos .gbackup ya están cifrados antes de salir del equipo. La cola local reintenta cargas cuando vuelve la conexión.
            </p>
            <p className="mt-2 text-xs text-secondary">
              {syncStatus.configured ? "Servicio configurado" : "Servicio sin configurar"} · {syncStatus.pending} pendiente(s) · {syncStatus.uploaded} cargado(s)
            </p>
          </div>
          <PremiumButton onClick={handleSyncNow} loading={syncing} disabled={!syncStatus.configured}>
            {syncing ? "Sincronizando..." : "Sincronizar ahora"}
          </PremiumButton>
        </div>
        <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleConfigureSync}>
          <input
            aria-label="URL HTTPS del servicio de backup"
            className="rounded-md border border-theme bg-input px-3 py-2 text-sm text-primary"
            onChange={event => setSyncEndpoint(event.target.value)}
            placeholder="https://backup.example.com"
            required
            type="url"
            value={syncEndpoint}
          />
          <input
            aria-label="Token de acceso remoto"
            className="rounded-md border border-theme bg-input px-3 py-2 text-sm text-primary"
            onChange={event => setSyncToken(event.target.value)}
            placeholder={syncStatus.configured ? "Token nuevo (no se muestra el almacenado)" : "Token de acceso"}
            required
            type="password"
            value={syncToken}
          />
          <PremiumButton type="submit" variant="secondary">Guardar configuración</PremiumButton>
        </form>
      </section>

      {syncStatus.configured && (
        <section className="mb-6 rounded-xl border border-theme bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-primary">Backups remotos</h3>
              <p className="mt-1 text-sm text-secondary">Descarga un artefacto cifrado e íntegro antes de restaurarlo.</p>
            </div>
            <PremiumButton onClick={handleLoadRemote} loading={loadingRemote} variant="secondary">
              <CloudDownload size={16} />
              Consultar servidor
            </PremiumButton>
          </div>
          {remoteBackups.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-secondary">
                  <tr><th className="p-2">Archivo remoto</th><th className="p-2">Fecha</th><th className="p-2 text-right">Tamaño</th><th /></tr>
                </thead>
                <tbody>
                  {remoteBackups.map(remote => (
                    <tr key={remote.filename} className="border-t border-theme">
                      <td className="p-2 font-mono text-accent">{remote.filename}</td>
                      <td className="p-2 text-secondary">{remote.created}</td>
                      <td className="p-2 text-right tabular-nums">{formatSize(remote.size)}</td>
                      <td className="p-2 text-right">
                        <PremiumButton onClick={() => handleDownloadRemote(remote)} size="sm" variant="ghost">
                          <Download size={14} /> Descargar
                        </PremiumButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loadingRemote && remoteBackups.length === 0 && (
            <p className="text-sm text-secondary">Sin lista cargada o el servidor no tiene backups.</p>
          )}
        </section>
      )}

      {error && (
        <div className="p-3 mb-4 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {backups.some(backup => !backup.encrypted) && (
        <div className="mb-4 rounded-lg border border-danger-theme bg-danger-theme p-3 text-sm text-danger-theme">
          Se encontraron backups antiguos sin cifrar (.db). No los exportes ni restaures; elimínalos después de confirmar que tienes un backup .gbackup válido.
        </div>
      )}

      {/* Backup table */}
      <div className="bg-card border border-theme rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-input text-primary text-sm">
              <tr>
                <th className="p-3">Archivo</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Tamaño</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {backups.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-secondary">
                    <HardDrive size={32} className="mx-auto mb-2 opacity-30" />
                    No hay backups disponibles
                    <p className="text-xs mt-1">Crea tu primer backup para empezar</p>
                  </td>
                </tr>
              )}
              {backups.map((b, index) => (
                <motion.tr
                  key={b.filename}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="border-t border-theme hover:bg-input/30 transition-colors"
                >
                  <td className="p-3 font-mono text-accent">
                    {b.filename}
                    {!b.encrypted && <span className="ml-2 rounded bg-danger/10 px-2 py-0.5 text-xs text-danger">SIN CIFRAR</span>}
                  </td>
                  <td className="p-3 text-secondary">{b.created}</td>
                  <td className="p-3 tabular-nums">{formatSize(b.size)}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {b.encrypted && (
                        <>
                          <button
                            onClick={() => handleExport(b.filename)}
                            disabled={exporting === b.filename}
                            className="p-1.5 rounded-lg text-secondary hover:text-info hover:bg-info/10 transition-all disabled:opacity-30"
                            title="Exportar al Escritorio (para migrar a otro PC)"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleRestore(b.filename)}
                            className="p-1.5 rounded-lg text-secondary hover:text-warning hover:bg-warning/10 transition-all"
                            title="Restaurar este backup"
                          >
                            <RotateCcw size={14} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(b.filename)}
                        className="p-1.5 rounded-lg text-secondary hover:text-danger hover:bg-danger/10 transition-all"
                        title="Eliminar backup"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      <PremiumModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Importar backup desde archivo externo"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-info/10 border border-info/30 rounded-lg p-4 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle size={16} className="text-info mt-0.5 shrink-0" />
              <div>
                <p className="text-primary font-medium">Migración desde otro computador</p>
                <p className="text-secondary mt-1 text-xs">
                  Selecciona un archivo de backup (.db) que hayas exportado desde la instalación anterior.
                  El archivo será copiado a la carpeta de backups y luego podrás restaurarlo.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-secondary mb-1">Ruta del archivo de backup</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={importPath}
                onChange={(e) => { setImportPath(e.target.value); setError(""); }}
                placeholder="Ej: D:\\backup_gestaerp.db o C:\\Users\\tu\\Desktop\\backup.db"
                className="flex-1 px-3 py-2.5 bg-input border border-theme rounded-lg text-primary placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
              />
            </div>
            <p className="text-xs text-secondary mt-1">
              Puedes escribir la ruta manualmente o copiar el archivo a una ubicación conocida.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowImportModal(false)} disabled={importing}>
              Cancelar
            </PremiumButton>
            <PremiumButton onClick={handleImportConfirm} loading={importing}>
              {importing ? "Importando..." : "Importar backup"}
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}