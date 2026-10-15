import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, FileText, LockKeyhole, ShieldCheck, X } from "lucide-react";
import type { LegalAcceptanceStatus } from "../types/legal";
import { LEGAL_PROVIDER, PRIVACY_SECTIONS, TERMS_SECTIONS } from "../legal/policies";

interface Props {
  status: LegalAcceptanceStatus;
  onAccepted: (status: LegalAcceptanceStatus) => void;
}

type DocumentKind = "terms" | "privacy";

const documents = {
  terms: { title: "Términos de uso y licencia", sections: TERMS_SECTIONS },
  privacy: { title: "Aviso de privacidad y tratamiento de datos", sections: PRIVACY_SECTIONS },
};

export default function LegalAcceptanceView({ status, onAccepted }: Props) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [openDocument, setOpenDocument] = useState<DocumentKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const acceptDocuments = async () => {
    if (!termsAccepted || !privacyAcknowledged || saving) return;
    setSaving(true);
    setError("");
    try {
      const acceptedStatus = await invoke<LegalAcceptanceStatus>("accept_current_legal_documents", {
        termsAccepted: true,
        privacyNoticeAcknowledged: true,
      });
      onAccepted(acceptedStatus);
    } catch (cause) {
      setError(`No se pudo registrar la aceptación. ${String(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface text-primary overflow-y-auto">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <header className="mb-7">
          <div className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center mb-4">
            <ShieldCheck size={25} />
          </div>
          <p className="text-xs uppercase tracking-wider text-accent font-semibold">Antes de continuar</p>
          <h1 className="text-2xl font-bold mt-1">Condiciones de uso y privacidad</h1>
          <p className="text-sm text-secondary mt-2">
            Lee los dos documentos. Debes aceptar los términos y confirmar por separado que conoces el
            aviso de privacidad para activar la prueba o una licencia.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 mb-5">
          <button
            type="button"
            onClick={() => setOpenDocument("terms")}
            className="text-left bg-card border border-theme rounded-xl p-4 hover:border-accent transition-colors"
          >
            <FileText className="text-accent mb-2" size={19} />
            <span className="block font-semibold">Términos de uso</span>
            <span className="block text-xs text-secondary mt-1">Versión vigente: {status.terms_version}</span>
            <span className="block text-xs text-accent mt-3">Leer documento</span>
          </button>
          <button
            type="button"
            onClick={() => setOpenDocument("privacy")}
            className="text-left bg-card border border-theme rounded-xl p-4 hover:border-accent transition-colors"
          >
            <LockKeyhole className="text-accent mb-2" size={19} />
            <span className="block font-semibold">Aviso de privacidad</span>
            <span className="block text-xs text-secondary mt-1">Versión vigente: {status.privacy_notice_version}</span>
            <span className="block text-xs text-accent mt-3">Leer documento</span>
          </button>
        </div>

        <section className="bg-card border border-theme rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-3 text-sm">
            <input
              id="accept-terms"
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              className="mt-1 accent-indigo-600"
            />
            <div>
              <label htmlFor="accept-terms" className="cursor-pointer">He leído y acepto los términos de uso y licencia.</label>
              <button type="button" onClick={() => setOpenDocument("terms")} className="block mt-1 text-accent underline">
                Leer términos completos
              </button>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <input
              id="acknowledge-privacy"
              type="checkbox"
              checked={privacyAcknowledged}
              onChange={(event) => setPrivacyAcknowledged(event.target.checked)}
              className="mt-1 accent-indigo-600"
            />
            <div>
              <label htmlFor="acknowledge-privacy" className="cursor-pointer">
                Confirmo que he leído el aviso de privacidad y entiendo que esta constancia no reemplaza la
                autorización que mi negocio deba obtener de clientes, trabajadores u otros titulares cuyos datos
                incorpore al ERP.
              </label>
              <button type="button" onClick={() => setOpenDocument("privacy")} className="block mt-1 text-accent underline">
                Leer aviso completo
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-warning-theme bg-warning-theme p-3 text-xs text-warning-theme flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>
              Borradores provisionales: el registro legal de Gestasofttech Colombia está en trámite y estos textos
              requieren revisión jurídica antes de la distribución comercial general.
              Revisa también la identificación tributaria publicada.
            </p>
          </div>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={acceptDocuments}
            disabled={!termsAccepted || !privacyAcknowledged || saving}
            className="w-full rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Registrando aceptación…" : "Aceptar y continuar"}
          </button>
          <p className="text-[11px] text-secondary text-center">
            Se guarda localmente la versión, fecha/hora del equipo, versión del ERP y método de aceptación.
            No se registra identidad verificada ni IP, ni se genera una firma electrónica certificada.
          </p>
          <p className="text-[11px] text-secondary text-center">
            Proveedor informado: {LEGAL_PROVIDER.name} · {LEGAL_PROVIDER.city} · {LEGAL_PROVIDER.email}
          </p>
        </section>
      </div>

      {openDocument && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-document-title"
            className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-surface border border-theme shadow-xl"
          >
            <header className="px-5 py-4 border-b border-theme flex items-center justify-between gap-3">
              <div>
                <h2 id="legal-document-title" className="font-semibold">{documents[openDocument].title}</h2>
                <p className="text-xs text-secondary">Borrador provisional · revisión jurídica pendiente</p>
              </div>
              <button
                type="button"
                aria-label="Cerrar documento"
                onClick={() => setOpenDocument(null)}
                className="p-2 rounded-lg hover:bg-surface-elevated text-secondary"
              >
                <X size={18} />
              </button>
            </header>
            <div className="overflow-y-auto p-5 space-y-5">
              {documents[openDocument].sections.map((section) => (
                <article key={section.heading}>
                  <h3 className="text-sm font-semibold mb-1">{section.heading}</h3>
                  <p className="text-sm leading-6 text-secondary">{section.body}</p>
                </article>
              ))}
            </div>
            <footer className="px-5 py-3 border-t border-theme flex justify-end">
              <button
                type="button"
                onClick={() => setOpenDocument(null)}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium"
              >
                Volver a aceptación
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
