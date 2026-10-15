import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { validateBootstrapAdminInput } from "../utils/authBootstrap";

interface SetupViewProps {
  onComplete: () => void;
}

interface RecoveryQuestion {
  id: string;
  prompt: string;
}

const REQUIRED_FIELDS = [
  { key: "nombre", label: "Nombre del negocio" },
  { key: "nit", label: "NIT" },
  { key: "telefono", label: "Teléfono" },
  { key: "direccion", label: "Dirección" },
  { key: "ciudad", label: "Ciudad" },
  { key: "email", label: "Correo electrónico" },
];

export default function SetupView({ onComplete }: SetupViewProps) {
  const [nombre, setNombre] = useState("");
  const [nit, setNit] = useState("");
  const [iva, setIva] = useState(false);
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [email, setEmail] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [bootstrapUsername, setBootstrapUsername] = useState("admin");
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [bootstrapConfirmPassword, setBootstrapConfirmPassword] = useState("");
  const [bootstrapFullName, setBootstrapFullName] = useState("Administrador principal");
  const [recoveryQuestions, setRecoveryQuestions] = useState<RecoveryQuestion[]>([]);
  const [recoveryAnswers, setRecoveryAnswers] = useState<Record<string, string>>({});
  const [loadingRecoveryQuestions, setLoadingRecoveryQuestions] = useState(true);

  // Logo (opcional)
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBytes, setLogoBytes] = useState<number[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const missingFields = useMemo(() => {
    const fieldValues: Record<string, string> = { nombre, nit, telefono, direccion, ciudad, email };
    return REQUIRED_FIELDS.filter((f) => !fieldValues[f.key].trim());
  }, [nombre, nit, telefono, direccion, ciudad, email]);
  const isFormValid = missingFields.length === 0;
  const recoveryAnswersValid =
    recoveryQuestions.length === 3 &&
    recoveryQuestions.every((question) => recoveryAnswers[question.id]?.trim());

  useEffect(() => {
    let cancelled = false;
    invoke<RecoveryQuestion[]>("get_recovery_setup_questions")
      .then((questions) => {
        if (cancelled) return;
        setRecoveryQuestions(questions);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(`No se pudieron preparar las preguntas de recuperación: ${String(cause)}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecoveryQuestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten archivos de imagen (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen no puede superar 5 MB");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      setLogoBytes(bytes);
      const previewReader = new FileReader();
      previewReader.onload = (ev) => setLogoPreview(ev.target?.result as string);
      previewReader.readAsDataURL(file);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleGuardar = async () => {
    if (!isFormValid) {
      const names = missingFields.map((f) => f.label).join(", ");
      setError(`Faltan los siguientes campos obligatorios: ${names}`);
      return;
    }

    const bootstrapErrors = validateBootstrapAdminInput({
      username: bootstrapUsername,
      password: bootstrapPassword,
      confirmPassword: bootstrapConfirmPassword,
      fullName: bootstrapFullName,
    });
    if (bootstrapErrors.length > 0) {
      setError(bootstrapErrors.join(" | "));
      return;
    }
    if (!recoveryAnswersValid) {
      setError(
        "Responde las 3 preguntas de recuperación para proteger el acceso del administrador.",
      );
      return;
    }

    setGuardando(true);
    setError("");
    try {
      await invoke("save_business_info", { nombre, nit, iva, telefono, direccion, ciudad, email });
      if (logoBytes) {
        await invoke("upload_business_logo", { logoBytes });
      }
      await invoke("create_bootstrap_admin", {
        username: bootstrapUsername,
        password: bootstrapPassword,
        fullName: bootstrapFullName,
        recoveryAnswers: recoveryQuestions.map((question) => ({
          questionId: question.id,
          answer: recoveryAnswers[question.id],
        })),
      });
      onComplete();
    } catch (e) {
      setError("Error al guardar: " + e);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-surface flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg bg-card border border-theme rounded-2xl shadow-2xl p-8">
        <h1 className="text-2xl font-bold text-primary mb-2">Configuración inicial</h1>
        <p className="text-secondary mb-6">
          Completa todos los campos para configurar GestaERP. Estos datos aparecerán en facturas,
          cotizaciones y reportes.
        </p>

        <div className="space-y-5">
          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-primary mb-2">
              Logo del negocio <span className="text-secondary font-normal">(opcional)</span>
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
                dragOver
                  ? "border-accent bg-accent/10 scale-[1.02]"
                  : logoPreview
                    ? "border-success bg-success/5"
                    : "border-theme hover:border-accent/50 hover:bg-surface-elevated"
              }`}
            >
              {logoPreview ? (
                <div className="flex items-center gap-4">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="w-20 h-20 object-contain rounded-lg border border-theme shadow-sm"
                  />
                  <div className="text-left">
                    <p className="text-sm font-medium text-success">✓ Logo cargado</p>
                    <p className="text-xs text-secondary mt-1">Clic para cambiar</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-2">
                    <svg
                      className="w-6 h-6 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-secondary">
                    Arrastra tu logo aquí o{" "}
                    <span className="text-accent font-medium">haz clic</span>
                  </p>
                  <p className="text-xs text-label mt-1">PNG, JPG o WebP · Máx 5 MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              Nombre del negocio <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={`w-full px-4 py-2.5 bg-input border rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent transition ${!nombre.trim() ? "border-danger/50" : "border-theme"}`}
              placeholder="Ej: Papelería La Esquina"
            />
          </div>

          {/* NIT */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              NIT <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={nit}
              onChange={(e) => setNit(e.target.value.replace(/\D/g, ""))}
              className={`w-full px-4 py-2.5 bg-input border rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent transition ${!nit.trim() ? "border-danger/50" : "border-theme"}`}
              placeholder="9001234567"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              Teléfono <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={15}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ""))}
              className={`w-full px-4 py-2.5 bg-input border rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent transition ${!telefono.trim() ? "border-danger/50" : "border-theme"}`}
              placeholder="3001234567"
            />
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              Dirección <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className={`w-full px-4 py-2.5 bg-input border rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent transition ${!direccion.trim() ? "border-danger/50" : "border-theme"}`}
              placeholder="Cra 10 #20-30, Centro"
            />
          </div>

          {/* Ciudad + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">
                Ciudad <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                className={`w-full px-4 py-2.5 bg-input border rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent transition ${!ciudad.trim() ? "border-danger/50" : "border-theme"}`}
                placeholder="Bogotá"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-1">
                Correo electrónico <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-4 py-2.5 bg-input border rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent transition ${!email.trim() ? "border-danger/50" : "border-theme"}`}
                placeholder="info@miempresa.com"
              />
            </div>
          </div>

          {/* IVA */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary">Responsable de IVA</span>
            <button
              type="button"
              onClick={() => setIva(!iva)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${iva ? "bg-accent" : "bg-muted"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${iva ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
          </div>

          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
            <h2 className="text-sm font-semibold text-primary">Crear primer administrador</h2>
            <p className="text-xs text-secondary mt-1">
              Este usuario será el primer acceso al ERP y se creará con una contraseña segura.
            </p>
            <div className="mt-3 grid gap-3">
              <input
                type="text"
                value={bootstrapFullName}
                onChange={(e) => setBootstrapFullName(e.target.value)}
                className="w-full px-4 py-2.5 bg-input border border-theme rounded-lg text-primary"
                placeholder="Nombre completo"
              />
              <input
                type="text"
                value={bootstrapUsername}
                onChange={(e) => setBootstrapUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-input border border-theme rounded-lg text-primary"
                placeholder="Usuario"
              />
              <input
                type="password"
                value={bootstrapPassword}
                onChange={(e) => setBootstrapPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-input border border-theme rounded-lg text-primary"
                placeholder="Contraseña segura"
              />
              <input
                type="password"
                value={bootstrapConfirmPassword}
                onChange={(e) => setBootstrapConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-input border border-theme rounded-lg text-primary"
                placeholder="Confirmar contraseña"
              />
            </div>
            <div className="mt-5 border-t border-accent/20 pt-4">
              <h3 className="text-sm font-semibold text-primary">Recuperación sin conexión</h3>
              <p className="mt-1 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-secondary">
                Responde y guarda estas respuestas fuera del equipo (papel o un lugar privado). Si
                las olvidas, no habrá correo ni SMS para recuperar la cuenta. Usa respuestas que
                puedas recordar y que otras personas no puedan adivinar.
              </p>
              {loadingRecoveryQuestions ? (
                <p className="mt-3 text-sm text-secondary">Preparando preguntas aleatorias...</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {recoveryQuestions.map((question, index) => (
                    <label className="block text-sm font-medium text-primary" key={question.id}>
                      {index + 1}. {question.prompt}
                      <input
                        autoComplete="off"
                        className="mt-1 w-full rounded-lg border border-theme bg-input px-4 py-2.5 text-primary"
                        onChange={(event) =>
                          setRecoveryAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                        placeholder="Tu respuesta privada"
                        type="password"
                        value={recoveryAnswers[question.id] ?? ""}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Campos faltantes */}
          {!isFormValid && (
            <div className="p-3 bg-warning-theme border border-warning-theme rounded-lg text-warning-theme text-xs">
              <strong>Campos pendientes:</strong> {missingFields.map((f) => f.label).join(", ")}
            </div>
          )}

          {error && (
            <div className="p-3 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleGuardar}
            disabled={
              guardando || !isFormValid || !recoveryAnswersValid || loadingRecoveryQuestions
            }
            className={`w-full py-2.5 rounded-lg font-semibold text-white transition ${
              guardando || !isFormValid || !recoveryAnswersValid || loadingRecoveryQuestions
                ? "bg-muted cursor-not-allowed opacity-50"
                : "bg-accent hover:bg-accent-hover active:scale-[0.98]"
            }`}
          >
            {guardando
              ? "Guardando..."
              : isFormValid
                ? "Guardar y continuar"
                : "Completa todos los campos obligatorios"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
