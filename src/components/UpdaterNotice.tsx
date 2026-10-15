import { useEffect, useRef, useState } from "react";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { Download, X } from "lucide-react";
import { showToast } from "./ui/PremiumToast";
import { CHECK_UPDATES_EVENT } from "../utils/updaterEvents";

export default function UpdaterNotice() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);
  const installingRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let checking = false;
    const closeUpdate = (pending: Update) => {
      void pending.close().catch((error: unknown) => {
        console.warn("No se pudo liberar el recurso de actualización:", error);
      });
    };

    const checkForUpdates = async (manual: boolean) => {
      if (checking || installingRef.current) {
        if (manual && checking) showToast("La búsqueda de actualizaciones ya está en curso.", "info");
        return;
      }
      checking = true;
      try {
        const available = await check({ timeout: 15_000 });
        if (disposed) {
          if (available) closeUpdate(available);
          return;
        }
        if (!available) {
          if (manual) showToast("GestaERP está actualizado.", "success");
          return;
        }
        if (updateRef.current && updateRef.current.version === available.version) {
          closeUpdate(available);
          return;
        }
        if (updateRef.current && !installingRef.current) closeUpdate(updateRef.current);
        updateRef.current = available;
        setUpdate(available);
        setInstallError(null);
      } catch (error) {
        if (disposed) return;
        if (manual) {
          showToast(`No se pudieron buscar actualizaciones: ${String(error)}`, "error");
        } else {
          console.warn("No se pudo comprobar automáticamente si hay actualizaciones:", error);
        }
      } finally {
        checking = false;
      }
    };

    const onManualCheck = () => void checkForUpdates(true);
    window.addEventListener(CHECK_UPDATES_EVENT, onManualCheck);
    const initialCheck = window.setTimeout(() => void checkForUpdates(false), 10_000);
    const interval = window.setInterval(() => void checkForUpdates(false), 6 * 60 * 60 * 1000);

    return () => {
      disposed = true;
      window.removeEventListener(CHECK_UPDATES_EVENT, onManualCheck);
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      if (updateRef.current && !installingRef.current) closeUpdate(updateRef.current);
    };
  }, []);

  const dismiss = async () => {
    if (installing || !update) return;
    const pending = update;
    updateRef.current = null;
    setUpdate(null);
    setInstallError(null);
    try {
      await pending.close();
    } catch (error) {
      console.warn("No se pudo liberar el recurso de actualización:", error);
    }
  };

  const install = async () => {
    if (!update || installing) return;
    setInstalling(true);
    installingRef.current = true;
    setProgress(null);
    setInstallError(null);
    let contentLength: number | undefined;
    let downloadedBytes = 0;
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength;
          downloadedBytes = 0;
          setProgress(contentLength ? 0 : null);
        }
        if (event.event === "Finished") setProgress(100);
        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (contentLength) setProgress(Math.min(99, Math.floor(downloadedBytes / contentLength * 100)));
        }
      }, { timeout: 120_000 });
    } catch (error) {
      const message = `No se pudo instalar la actualización: ${String(error)}`;
      setInstallError(message);
      showToast(message, "error");
    } finally {
      installingRef.current = false;
      setInstalling(false);
    }
  };

  if (!update) return null;
  const progressLabel = progress === null
    ? "Descargando actualización…"
    : progress === 100
      ? "Descarga completa. Preparando instalación…"
      : `Descargando actualización… ${progress}%`;

  return (
    <section
      aria-label="Actualización disponible"
      className="fixed bottom-5 right-5 z-[100] w-[min(26rem,calc(100vw-2.5rem))] rounded-xl border border-theme bg-card p-5 shadow-2xl"
      role="status"
    >
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 shrink-0 text-accent" size={20} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-primary">Actualización disponible</h2>
          <p className="mt-1 text-sm text-secondary">GestaERP {update.version}</p>
          {update.body && (
            <p className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-secondary">
              {update.body}
            </p>
          )}
        </div>
        {!installing && (
          <button
            aria-label="Más tarde"
            className="rounded p-1 text-secondary hover:bg-input"
            onClick={() => void dismiss()}
            type="button"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {installError && <p className="mt-3 text-sm text-danger">{installError}</p>}
      {installing ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-secondary" aria-live="polite">{progressLabel}</p>
          <div
            aria-label={progressLabel}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress ?? undefined}
            className="h-2 overflow-hidden rounded-full bg-input"
            role="progressbar"
          >
            <div
              className={`h-full rounded-full bg-accent transition-all ${progress === null ? "w-1/3 animate-pulse" : ""}`}
              style={progress === null ? undefined : { width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-2 text-sm text-secondary hover:bg-input"
            onClick={() => void dismiss()}
            type="button"
          >
            Más tarde
          </button>
          <button
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            onClick={() => void install()}
            type="button"
          >
            Instalar y reiniciar
          </button>
        </div>
      )}
    </section>
  );
}
