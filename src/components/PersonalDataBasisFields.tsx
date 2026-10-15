import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  PersonalDataSubject,
  ProcessingBasisInput,
  ProcessingBasisRecord,
} from "../types/personalData";

interface Props {
  subject: PersonalDataSubject;
  subjectId?: number;
  value: ProcessingBasisInput;
  onChange: (value: ProcessingBasisInput) => void;
}

const fieldClass =
  "w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary";

export default function PersonalDataBasisFields({
  subject,
  subjectId,
  value,
  onChange,
}: Props) {
  const [history, setHistory] = useState<ProcessingBasisRecord[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const update = (patch: Partial<ProcessingBasisInput>) =>
    onChange({ ...value, ...patch });

  const toggleHistory = async () => {
    if (!subjectId) return;
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryError("");
    try {
      const records = await invoke<ProcessingBasisRecord[]>(
        "list_personal_data_basis_history",
        { subjectType: subject, subjectId },
      );
      setHistory(records);
      setHistoryOpen(true);
    } catch (error) {
      setHistoryError(String(error));
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-theme bg-input/40 p-4">
      <div>
        <h4 className="font-semibold text-primary">
          Trazabilidad de tratamiento de datos
        </h4>
        <p className="mt-1 text-xs text-secondary">
          Registra la base, finalidad, fecha y medio de soporte. Esta constancia
          documenta lo declarado por el operador; no verifica ni sustituye la
          autorización del titular ni la revisión jurídica.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-secondary">
          Base o situación aplicable *
          <select
            value={value.basis}
            onChange={(event) => {
              const basis = event.target.value as ProcessingBasisInput["basis"];
              update({
                basis,
                basisDetail: "",
                evidenceMethod:
                  basis === "authorization"
                    ? "signed_paper"
                    : basis === "legal_exception"
                      ? "legal_exception"
                      : "assessment",
              });
            }}
            className={`${fieldClass} mt-1 text-sm`}
          >
            <option value="">Selecciona una opción...</option>
            <option value="authorization">Autorización del titular</option>
            <option value="legal_exception">Excepción / otra base legal</option>
            {subject !== "employee" && (
              <option value="not_personal_data">
                Se evaluó que no hay datos personales
              </option>
            )}
          </select>
        </label>
        <label className="text-xs text-secondary">
          Fecha de obtención o evaluación *
          <input
            type="date"
            value={value.effectiveDate}
            onChange={(event) => update({ effectiveDate: event.target.value })}
            className={`${fieldClass} mt-1 text-sm`}
          />
        </label>

        <label className="col-span-2 text-xs text-secondary">
          Finalidad del tratamiento *
          <input
            value={value.purpose}
            maxLength={500}
            onChange={(event) => update({ purpose: event.target.value })}
            placeholder="Ej.: gestión de la relación comercial y facturación"
            className={`${fieldClass} mt-1 text-sm`}
          />
        </label>

        {value.basis === "authorization" ? (
          <label className="text-xs text-secondary">
            Medio en que se obtuvo *
            <select
              value={value.evidenceMethod}
              onChange={(event) =>
                update({ evidenceMethod: event.target.value })
              }
              className={`${fieldClass} mt-1 text-sm`}
            >
              <option value="signed_paper">Formato físico firmado</option>
              <option value="digital_form">Formulario digital</option>
              <option value="email">Correo electrónico</option>
              <option value="recorded_verbal">Registro de autorización verbal</option>
              <option value="other">Otro medio</option>
            </select>
          </label>
        ) : value.basis ? (
          <label className="text-xs text-secondary">
            Soporte de la evaluación *
            <span className={`${fieldClass} mt-1 block text-sm`}>
              {value.basis === "legal_exception"
                ? "Base legal / excepción"
                : "Evaluación del operador"}
            </span>
          </label>
        ) : (
          <div className="text-xs text-secondary">
            Selecciona primero la base aplicable.
          </div>
        )}

        <label className="text-xs text-secondary">
          Referencia de soporte (opcional)
          <input
            value={value.evidenceReference}
            maxLength={160}
            onChange={(event) =>
              update({ evidenceReference: event.target.value })
            }
            placeholder="Folio o ubicación del soporte"
            className={`${fieldClass} mt-1 text-sm`}
          />
        </label>

        {(value.basis === "legal_exception" ||
          value.basis === "not_personal_data") && (
          <label className="col-span-2 text-xs text-secondary">
            {value.basis === "legal_exception"
              ? "Describe la excepción o base legal y su soporte *"
              : "Describe por qué este registro no contiene datos personales *"}
            <textarea
              value={value.basisDetail}
              maxLength={500}
              onChange={(event) => update({ basisDetail: event.target.value })}
              rows={2}
              className={`${fieldClass} mt-1 resize-y text-sm`}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-secondary">
        No adjuntes aquí documentos de identidad ni copias de autorizaciones;
        guarda solo una referencia para ubicar el soporte por separado.
      </p>
      {subjectId && (
        <div className="border-t border-theme pt-3">
          <button
            type="button"
            onClick={toggleHistory}
            className="text-sm text-accent hover:underline"
          >
            {historyOpen ? "Ocultar historial" : "Ver historial de constancias"}
          </button>
          {historyError && (
            <p role="alert" className="mt-2 text-sm text-danger-theme">
              {historyError}
            </p>
          )}
          {historyOpen && (
            <ol className="mt-3 space-y-3">
              {history?.map((record, index) => (
                <li
                  key={`${record.recordedAt}-${index}`}
                  className="rounded-md border border-theme bg-card p-3 text-xs text-secondary"
                >
                  <p className="font-medium text-primary">
                    {record.basis === "authorization"
                      ? "Autorización"
                      : record.basis === "legal_exception"
                        ? "Excepción / base legal"
                        : "Evaluación: no datos personales"}
                    {" · "}Aplicable desde {record.effectiveDate}
                  </p>
                  <p className="mt-1">Finalidad: {record.purpose}</p>
                  {record.basisDetail && (
                    <p className="mt-1">Detalle: {record.basisDetail}</p>
                  )}
                  <p className="mt-1">
                    Medio: {record.evidenceMethod}
                    {record.evidenceReference
                      ? ` · Referencia: ${record.evidenceReference}`
                      : ""}
                  </p>
                  <p className="mt-1">
                    Registrado por {record.recordedByName} ·{" "}
                    {new Date(record.recordedAt).toLocaleString()}
                  </p>
                </li>
              ))}
              {history?.length === 0 && (
                <li className="text-xs text-secondary">
                  No hay constancias previas para este registro.
                </li>
              )}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
