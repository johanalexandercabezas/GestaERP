import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { showToast } from "../components/ui/PremiumToast";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumModal from "../components/ui/PremiumModal";
import { motion } from "framer-motion";
import { Shield, Check, Zap, Building2, Star, Crown, Clock, AlertTriangle, Info, Heart, ExternalLink, ClipboardCheck, Sparkles } from "lucide-react";

interface Props {
  onActivated: () => void;
}

interface LicenseInfo {
  plan: string;
  activated: boolean;
  expires_at: string;
  max_users: number;
  days_left: number;
  modules: string[];
}

interface ImplementationStatus {
  is_paid: boolean;
  code: string;
  generated_at: string;
  validated_at: string | null;
}

// ═══════════════════════════════════════════
// CONSTANTES DEL SISTEMA DE LICENCIAS
// ═══════════════════════════════════════════
const IMPLEMENTATION_COST = 30_000;
const WOMPI_IMPLEMENTACION = "https://checkout.wompi.co/l/6x5IkU";
const WHATSAPP_ONG = "https://wa.me/573244826034?text=Hola%2C%20somos%20una%20ONG%20y%20queremos%20activar%20GestaERP";

const ONG_PLAN = {
  id: "ong",
  name: "ONG / Fundación",
  price: 5_000,
  setupFee: 0,
  users: 1,
  wompiLink: "https://checkout.wompi.co/l/ywc2wk",
  features: ["Dashboard", "Productos", "Punto de Venta", "Compras", "Proveedores", "Gastos", "Cuentas por Cobrar", "Inventario Físico"],
  color: "from-emerald-500 to-teal-600",
  icon: Heart,
};

const CORP_PLANS = [
  {
    id: "basico",
    name: "Básico",
    price: 14_900,
    users: 1,
    wompiLink: "https://checkout.wompi.co/l/EzuS2v",
    features: ["Dashboard", "Productos", "Punto de Venta", "Compras", "Proveedores", "Gastos", "Cuentas por Cobrar", "Inventario Físico"],
    color: "from-blue-500 to-indigo-600",
    icon: Zap,
  },
  {
    id: "intermedio",
    name: "Intermedio",
    price: 29_900,
    users: 2,
    wompiLink: "https://checkout.wompi.co/l/zyPfYP",
    features: ["Todo Básico", "Nómina", "Caja", "Reportes", "Backups", "Usuarios", "Dashboard completo"],
    color: "from-purple-500 to-violet-600",
    icon: Star,
    popular: true,
  },
  {
    id: "avanzado",
    name: "Avanzado",
    price: 69_900,
    users: 6,
    wompiLink: "https://checkout.wompi.co/l/BYbEP6",
    features: ["Todo Intermedio", "Personalización", "Soporte prioritario", "Auditoría", "Cierre Contable", "Empleados", "Servicios"],
    color: "from-amber-500 to-orange-600",
    icon: Crown,
  },
];

// ═══════════════════════════════════════════
// COMPONENTES INTERNOS
// ═══════════════════════════════════════════

function getPlanDisplayName(planId: string): string {
  if (planId === "ong") return ONG_PLAN.name;
  const plan = CORP_PLANS.find((p) => p.id === planId);
  return plan ? plan.name : planId.charAt(0).toUpperCase() + planId.slice(1);
}

function LicenseStatusCard({ license }: { license: LicenseInfo }) {
  const daysLeft = license.days_left;
  const isExpired = daysLeft <= 0;
  const isWarning = daysLeft <= 5 && daysLeft > 0;

  return (
    <div className="bg-card border border-theme rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
          <Shield size={20} className="text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-primary">Plan {getPlanDisplayName(license.plan)}</h3>
          <p className="text-xs text-secondary capitalize">{license.plan}</p>
        </div>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-secondary">Usuarios máx:</span>
          <span className="font-medium text-primary">{license.max_users}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-secondary">Vence:</span>
          <span className="font-medium text-primary">{license.expires_at || "—"}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-secondary">Días restantes:</span>
          <span className={`font-bold text-lg tabular-nums ${isExpired ? "text-danger" : isWarning ? "text-warning" : "text-success"}`}>
            {daysLeft}
          </span>
        </div>
        {isWarning && (
          <div className="mt-2 p-2 bg-warning-theme border border-warning-theme rounded-lg text-warning-theme text-xs flex items-center gap-1.5">
            <AlertTriangle size={12} />
            ¡Tu licencia expira pronto! Renueva para no perder acceso.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// VISTA PRINCIPAL
// ═══════════════════════════════════════════

export default function LicenseActivationView({ onActivated }: Props) {
  const [currentLicense, setCurrentLicense] = useState<LicenseInfo | null>(null);
  const [loadingLicense, setLoadingLicense] = useState(true);
  const [activeTab, setActiveTab] = useState<"ong" | "corporativo">("corporativo");

  // Estados corporativos
  const [implementationPaid, setImplementationPaid] = useState(false);
  const [implementationCode, setImplementationCode] = useState("");
  const [validatingCode, setValidatingCode] = useState(false);
  const [implementationError, setImplementationError] = useState("");

  // Estados activación de plan
  const [selectedPlan, setSelectedPlan] = useState("intermedio");
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");
  const [showActivateModal, setShowActivateModal] = useState(false);

  const [trialLoading, setTrialLoading] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const lic = await invoke<LicenseInfo>("get_license_status");
        setCurrentLicense(lic);
      } catch {}
      try {
        const impl = await invoke<ImplementationStatus>("get_implementation_status");
        setImplementationPaid(impl.is_paid);
      } catch {}
      setLoadingLicense(false);
    };
    init();
  }, []);

  // ═══════════════════ VALIDAR CÓDIGO DE IMPLEMENTACIÓN ═══════════════════
  const handleValidateImplementation = async () => {
    if (!implementationCode.trim()) {
      setImplementationError("Ingresa el código de aceptación de 6 caracteres");
      return;
    }
    setValidatingCode(true);
    setImplementationError("");
    try {
      const result = await invoke<ImplementationStatus>("validate_implementation_code", {
        code: implementationCode.trim(),
      });
      if (result.is_paid) {
        setImplementationPaid(true);
        showToast("✅ Código de implementación validado. Ahora puedes elegir tu plan.", "success");
      }
    } catch (e) {
      setImplementationError(String(e));
    } finally {
      setValidatingCode(false);
    }
  };

  // ═══════════════════ ABRIR ENLACE DE PAGO ═══════════════════
  const openPaymentLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ═══════════════════ ACTIVAR LICENCIA ═══════════════════
  const handleActivateLicense = async () => {
    if (!licenseKey.trim()) {
      setActivateError("Ingresa la clave de licencia");
      return;
    }
    setActivating(true);
    setActivateError("");
    try {
      await invoke("activate_license", { key: licenseKey.trim(), plan: selectedPlan });
      showToast(`Plan ${getPlanDisplayName(selectedPlan)} activado exitosamente`, "success");
      setShowActivateModal(false);
      setLicenseKey("");
      onActivated();
    } catch (e) {
      setActivateError(String(e));
    } finally {
      setActivating(false);
    }
  };

  // ═══════════════════ TRIAL ═══════════════════
  const handleTrial = async () => {
    setTrialLoading(true);
    try {
      await invoke("activate_trial");
      showToast("Trial de 15 días activado. ¡Disfruta de todas las funciones!", "success");
      onActivated();
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setTrialLoading(false);
    }
  };

  const canActivateTrial = !currentLicense?.activated;

  if (loadingLicense) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  // ═══════════════════ RENDER ═══════════════════
  return (
    <div className="min-h-screen bg-surface overflow-auto">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-linear-to-br from-accent to-purple-600 flex items-center justify-center">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-primary mb-2">Licencias GestaERP</h1>
          <p className="text-secondary max-w-md mx-auto">
            Elige el plan ideal para tu negocio. Licencias de 30 días renovables.
          </p>
        </motion.div>

        {/* Current License */}
        {currentLicense && currentLicense.activated && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <LicenseStatusCard license={currentLicense} />
          </motion.div>
        )}

        {/* Trial */}
        {canActivateTrial && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="mb-8 p-6 rounded-xl border border-info/30 bg-linear-to-br from-info/5 to-info/10">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-info/20 flex items-center justify-center shrink-0">
                <Clock size={24} className="text-info" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-primary mb-1">Prueba GestaERP Gratis</h3>
                <p className="text-sm text-secondary mb-4">
                  15 días con todas las funciones. Sin tarjeta de crédito, sin compromiso.
                </p>
                <PremiumButton onClick={handleTrial} loading={trialLoading} variant="primary">
                  {trialLoading ? "Activando..." : "🎁 Activar prueba gratis 15 días"}
                </PremiumButton>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════ TABS: ONG | CORPORATIVO ═══════════════════ */}
        <div className="flex border-b border-theme mb-8">
          <button onClick={() => setActiveTab("ong")}
            className={`flex-1 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === "ong" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-secondary hover:text-primary"
            }`}>
            <Heart size={16} /> ONG / Fundación
          </button>
          <button onClick={() => setActiveTab("corporativo")}
            className={`flex-1 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === "corporativo" ? "text-accent border-b-2 border-accent" : "text-secondary hover:text-primary"
            }`}>
            <Building2 size={16} /> Planes Corporativos
          </button>
        </div>

        {/* ═══════════════════ TAB: ONG ═══════════════════ */}
        {activeTab === "ong" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="bg-card border border-emerald-500/30 rounded-2xl p-6 max-w-lg mx-auto">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Heart size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-primary">Plan ONG / Fundación</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-emerald-400">$5.000</span>
                  <span className="text-secondary">/mes</span>
                </div>
                <p className="text-xs text-success mt-1 font-medium">Sin costo de implementación</p>
                <p className="text-sm text-secondary mt-1">1 usuario • Sin ánimo de lucro</p>
              </div>

              {/* Pasos */}
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-emerald-400">1</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Realiza el pago mensual</p>
                    <p className="text-xs text-secondary">$5.000 COP por mes. Sin costo de implementación.</p>
                    <button onClick={() => openPaymentLink(ONG_PLAN.wompiLink)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                      <ExternalLink size={12} /> Pagar con Wompi → $5.000 COP
                    </button>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-emerald-400">2</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Verificación WhatsApp</p>
                    <p className="text-xs text-secondary">Envía RUT + cédula del RL. Tiempo de verificación: hasta 24 horas.</p>
                    <button onClick={() => openPaymentLink(WHATSAPP_ONG)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-green-400 hover:underline">
                      <ExternalLink size={12} /> Enviar documentos por WhatsApp
                    </button>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-emerald-400">3</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Recibe tu clave de licencia</p>
                    <p className="text-xs text-secondary">GestaSoftTech te enviará la clave GESTA-ONG-XXXXXX.</p>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="border-t border-theme pt-4 mb-4">
                <p className="text-xs text-secondary font-semibold uppercase tracking-wider mb-3">Módulos incluidos</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ONG_PLAN.features.map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-secondary">
                      <Check size={12} className="text-emerald-400 shrink-0" /> {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Activar */}
              <button onClick={() => { setSelectedPlan("ong"); setShowActivateModal(true); setActivateError(""); }}
                className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors">
                <Sparkles size={16} className="inline mr-1.5" />
                Ya tengo mi clave — Activar ONG
              </button>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════ TAB: CORPORATIVO ═══════════════════ */}
        {activeTab === "corporativo" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Paso 1: Implementación */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
                <ClipboardCheck size={20} className="text-accent" />
                Paso 1: Pago de Implementación
              </h3>

              {!implementationPaid ? (
                <div className="bg-card border border-theme rounded-xl p-6">
                  <p className="text-sm text-secondary mb-4">
                    Para acceder a los planes corporativos, primero debes pagar la implementación única de{' '}
                    <strong className="text-primary">${IMPLEMENTATION_COST.toLocaleString()} COP</strong>.
                    Recibirás un código de aceptación de 6 caracteres.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <PremiumButton onClick={() => openPaymentLink(WOMPI_IMPLEMENTACION)} variant="primary">
                      <ExternalLink size={14} /> Pagar implementación — ${IMPLEMENTATION_COST.toLocaleString()} COP
                    </PremiumButton>
                  </div>

                  <div className="border-t border-theme pt-4">
                    <p className="text-sm font-medium text-primary mb-3">
                      ¿Ya pagaste? Ingresa tu código de aceptación:
                    </p>
                    <div className="flex gap-2">
                      <input type="text" value={implementationCode}
                        onChange={(e) => { setImplementationCode(e.target.value.toUpperCase()); setImplementationError(""); }}
                        placeholder="Ej: A3B7K9" maxLength={6}
                        className="flex-1 px-4 py-2.5 bg-input border border-theme rounded-lg text-primary font-mono tracking-widest uppercase text-center text-lg focus:outline-none focus:ring-2 focus:ring-accent" />
                      <PremiumButton onClick={handleValidateImplementation} loading={validatingCode}>
                        {validatingCode ? "Validando..." : "Validar"}
                      </PremiumButton>
                    </div>
                    {implementationError && (
                      <p className="mt-2 text-xs text-danger flex items-center gap-1">
                        <AlertTriangle size={12} /> {implementationError}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex items-center gap-3">
                  <Check size={20} className="text-success shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-success">✅ Implementación verificada</p>
                    <p className="text-xs text-secondary">Ya puedes elegir tu plan corporativo.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Paso 2: Planes Corporativos */}
            {implementationPaid && (
              <>
                <h3 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
                  <Star size={20} className="text-accent" />
                  Paso 2: Elige tu Plan Corporativo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {CORP_PLANS.map((plan) => {
                    const Icon = plan.icon;
                    const isSelected = selectedPlan === plan.id;
                    return (
                      <motion.div key={plan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        whileHover={{ y: -4 }}
                        className={`relative bg-card border rounded-xl p-5 cursor-pointer transition-all duration-200 ${
                          isSelected ? "border-accent ring-2 ring-accent/20 shadow-lg" : "border-theme hover:border-accent/50"
                        }`}
                        onClick={() => { setSelectedPlan(plan.id); setActivateError(""); }}>
                        {plan.popular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                            <span className="px-3 py-0.5 text-xs font-semibold bg-accent text-white rounded-full">Más popular</span>
                          </div>
                        )}
                        <div className="text-center mb-4">
                          <div className={`w-12 h-12 mx-auto mb-3 rounded-xl bg-linear-to-br ${plan.color} flex items-center justify-center`}>
                            <Icon size={22} className="text-white" />
                          </div>
                          <h4 className="font-bold text-primary">{plan.name}</h4>
                          <div className="mt-2">
                            <span className="text-2xl font-bold text-primary">${plan.price.toLocaleString()}</span>
                            <span className="text-xs text-secondary">/mes</span>
                          </div>
                          <p className="text-xs text-secondary mt-1">{plan.users} usuario{plan.users > 1 ? "s" : ""}</p>
                        </div>
                        <ul className="space-y-1.5 mb-4">
                          {plan.features.slice(0, 6).map((f) => (
                            <li key={f} className="flex items-start gap-2 text-xs text-secondary">
                              <Check size={12} className="text-success mt-0.5 shrink-0" /> {f}
                            </li>
                          ))}
                        </ul>
                        <div className="space-y-2">
                          <button onClick={(e) => { e.stopPropagation(); openPaymentLink(plan.wompiLink); }}
                            className="w-full py-1.5 rounded-lg text-xs font-medium bg-input text-secondary hover:bg-accent/10 hover:text-accent transition-colors flex items-center justify-center gap-1">
                            <ExternalLink size={11} /> Pagar ${plan.price.toLocaleString()}/mes
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedPlan(plan.id); setShowActivateModal(true); setActivateError(""); }}
                            className={`w-full py-2 rounded-lg text-sm font-semibold transition-all ${
                              isSelected ? "bg-accent text-white hover:bg-accent-hover" : "bg-input text-secondary hover:bg-accent/10 hover:text-accent"
                            }`}>
                            {isSelected ? "Activar plan" : "Seleccionar"}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* Version info */}
        <div className="mt-12 text-center text-xs text-secondary border-t border-theme pt-4">
          GestaERP V 1.0.0 © 2026 — GestaSoftTech<br />
          CEO Johan Alexander Cabezas Huila — Todos los derechos reservados
        </div>
      </div>

      {/* ═══════════════════ MODAL DE ACTIVACIÓN ═══════════════════ */}
      <PremiumModal open={showActivateModal}
        onClose={() => { setShowActivateModal(false); setLicenseKey(""); setActivateError(""); }}
        title={`Activar plan: ${getPlanDisplayName(selectedPlan)}`} size="md">
        <div className="space-y-4">
          <div className="bg-input rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-secondary">Plan:</span>
              <span className="font-semibold text-primary">{getPlanDisplayName(selectedPlan)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary">Valor mensual:</span>
              <span className="font-bold text-primary">
                ${selectedPlan === "ong" ? ONG_PLAN.price.toLocaleString() : CORP_PLANS.find(p => p.id === selectedPlan)?.price.toLocaleString()} COP
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-secondary mb-1">Clave de activación</label>
            <input type="text" value={licenseKey}
              onChange={(e) => { setLicenseKey(e.target.value); setActivateError(""); }}
              placeholder="GESTA-INT-XXXXXXXX" autoComplete="off"
              className="w-full px-4 py-2.5 bg-input border border-theme rounded-lg text-primary font-mono tracking-wider uppercase text-center focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>

          {activateError && (
            <div className="p-3 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm flex items-center gap-2">
              <AlertTriangle size={14} /> {activateError}
            </div>
          )}

          <p className="text-xs text-secondary">
            La clave será enviada por GestaSoftTech tras verificar tu pago.
          </p>

          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowActivateModal(false)} disabled={activating}>
              Cancelar
            </PremiumButton>
            <PremiumButton onClick={handleActivateLicense} loading={activating}>
              {activating ? "Activando..." : "Activar licencia"}
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}