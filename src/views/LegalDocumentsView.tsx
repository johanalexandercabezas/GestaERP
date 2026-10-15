import { AlertTriangle, FileText, LockKeyhole } from "lucide-react";
import { LEGAL_PROVIDER, PRIVACY_SECTIONS, TERMS_SECTIONS } from "../legal/policies";
import type { LegalAcceptanceStatus } from "../types/legal";

function receiptDate(value: string | null) {
  if (!value) return "Pendiente";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function LegalDocumentsView({ status }: { status: LegalAcceptanceStatus }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-5 sm:p-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="text-accent" /> Legal y privacidad
          </h1>
          <p className="text-sm text-secondary mt-2">
            Consulta las versiones vigentes y el comprobante local de aceptación de esta instalación.
          </p>
        </header>

        <div className="rounded-xl border border-warning-theme bg-warning-theme p-4 text-sm text-warning-theme flex gap-3">
          <AlertTriangle className="shrink-0" size={18} />
          <p>
            Estos documentos son borradores provisionales, no certifican el cumplimiento legal y requieren
            revisión jurídica antes de distribuir comercialmente GestaERP. El registro legal de Gestasofttech
            Colombia está en trámite. Verifica la identificación tributaria publicada.
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-2">
          <article className="bg-card border border-theme rounded-xl p-4">
            <div className="flex items-center gap-2 font-semibold"><FileText size={17} className="text-accent" /> Términos</div>
            <p className="text-xs text-secondary mt-2">Versión {status.terms_version}</p>
            <p className="text-xs text-secondary mt-1">Aceptados: {receiptDate(status.terms_accepted_at)}</p>
          </article>
          <article className="bg-card border border-theme rounded-xl p-4">
            <div className="flex items-center gap-2 font-semibold"><LockKeyhole size={17} className="text-accent" /> Aviso de privacidad</div>
            <p className="text-xs text-secondary mt-2">Versión {status.privacy_notice_version}</p>
            <p className="text-xs text-secondary mt-1">Reconocido: {receiptDate(status.privacy_notice_acknowledged_at)}</p>
          </article>
        </section>

        <section className="bg-card border border-theme rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Términos de uso y licencia</h2>
          <div className="space-y-5">
            {TERMS_SECTIONS.map((section) => (
              <article key={section.heading}>
                <h3 className="text-sm font-semibold mb-1">{section.heading}</h3>
                <p className="text-sm text-secondary leading-6">{section.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-card border border-theme rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Aviso de privacidad y tratamiento de datos</h2>
          <div className="space-y-5">
            {PRIVACY_SECTIONS.map((section) => (
              <article key={section.heading}>
                <h3 className="text-sm font-semibold mb-1">{section.heading}</h3>
                <p className="text-sm text-secondary leading-6">{section.body}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="border-t border-theme pt-4 text-xs text-secondary">
          Proveedor informado: {LEGAL_PROVIDER.name} · {LEGAL_PROVIDER.taxId} · {LEGAL_PROVIDER.city} · {LEGAL_PROVIDER.email}
          <p className="mt-1">La aceptación se conserva en la base local; su fecha depende del reloj del equipo.</p>
        </footer>
      </div>
    </div>
  );
}
