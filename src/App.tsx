import { useState, useEffect, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// CODE SPLITTING: Lazy loading por vista
// ============================================================
const SetupView = lazy(() => import("./views/SetupView"));
const LoginView = lazy(() => import("./views/LoginView"));
const DashboardView = lazy(() => import("./views/DashboardView"));
const ProductsView = lazy(() => import("./views/ProductsView"));
const POSView = lazy(() => import("./views/POSView"));
const PurchasesView = lazy(() => import("./views/PurchasesView"));
const SuppliersView = lazy(() => import("./views/SuppliersView"));
const CashView = lazy(() => import("./views/CashView"));
const BackupView = lazy(() => import("./views/BackupView"));
const CustomersView = lazy(() => import("./views/CustomersView"));
const ReportsView = lazy(() => import("./views/ReportsView"));
const UsersView = lazy(() => import("./views/UsersView"));
const ExpensesView = lazy(() => import("./views/ExpensesView"));
const ReceivablesView = lazy(() => import("./views/ReceivablesView"));
const EmployeesView = lazy(() => import("./views/EmployeesView"));
const PayrollView = lazy(() => import("./views/PayrollView"));
const LicenseActivationView = lazy(() => import("./views/LicenseActivationView"));
const PhysicalInventoryView = lazy(() => import("./views/PhysicalInventoryView"));
const CalendarView = lazy(() => import("./views/CalendarView"));
const AcercaView = lazy(() => import("./views/AcercaView"));
const ServicesView = lazy(() => import("./views/ServicesView"));
const QuotationsView = lazy(() => import("./views/QuotationsView"));
const PayablesView = lazy(() => import("./views/PayablesView"));
const KardexView = lazy(() => import("./views/KardexView"));
const AuditView = lazy(() => import("./views/AuditView"));
const AccountingView = lazy(() => import("./views/AccountingView"));
const ForceOpenCashModal = lazy(() => import("./views/ForceOpenCashModal"));
const HelpAssistant = lazy(() => import("./views/HelpAssistant"));
const GestaHelpView = lazy(() => import("./views/GestaHelpView"));
const LegalDocumentsView = lazy(() => import("./views/LegalDocumentsView"));
import { useThemeStore } from "./stores/theme-store";
import PremiumToaster from "./components/ui/PremiumToast";
import UpdaterNotice from "./components/UpdaterNotice";
import ErrorBoundary from "./components/ErrorBoundary";
import DatabaseSecurityView from "./views/DatabaseSecurityView";
import LegalAcceptanceView from "./views/LegalAcceptanceView";
import type { LegalAcceptanceStatus } from "./types/legal";
import { openExternal } from "./utils/openExternal";
import {
  LayoutDashboard, Package, ShoppingCart, ClipboardList, Building2,
  Users, UserCog, Banknote, Receipt, HandCoins, FileBarChart, HardDrive,
  Briefcase, DollarSign, Bell, Sun, Moon, ChevronLeft, ChevronRight,
  Shield, AlertTriangle, ClipboardCheck, Calendar, Info, Headphones, FileText, FileSpreadsheet, Activity, Sparkles
} from "lucide-react";
import type { UserInfo, LicenseInfo, NotificationItem } from "./types/auth";
import { ROLES } from "./types/auth";

type View = "dashboard" | "products" | "pos" | "purchases" | "services" | "quotations" | "payables" | "kardex" | "suppliers" | "cash" | "backups" | "customers" | "reports" | "users" | "expenses" | "receivables" | "employees" | "payroll" | "physical_inventory" | "audit" | "accounting" | "calendar" | "acerca" | "gestahelp" | "legal";

const menuItems = [
  { view: "dashboard" as View, icon: LayoutDashboard, label: "Dashboard" },
  { view: "products" as View, icon: Package, label: "Productos" },
  { view: "pos" as View, icon: ShoppingCart, label: "Punto de Venta" },
  { view: "services" as View, icon: Briefcase, label: "Servicios" },
  { view: "purchases" as View, icon: ClipboardList, label: "Compras" },
  { view: "quotations" as View, icon: FileText, label: "Cotizaciones" },
  { view: "kardex" as View, icon: FileSpreadsheet, label: "Kardex" },
  { view: "physical_inventory" as View, icon: ClipboardCheck, label: "Auditoría Stock", adminOnly: true },
  { view: "audit" as View, icon: Activity, label: "Auditoría Sistema", adminOnly: true },
  { view: "accounting" as View, icon: DollarSign, label: "Cierre Contable", adminOnly: true },
  { view: "suppliers" as View, icon: Building2, label: "Proveedores" },
  { view: "customers" as View, icon: Users, label: "Clientes" },
  { view: "employees" as View, icon: Briefcase, label: "Empleados" },
  { view: "payroll" as View, icon: DollarSign, label: "Nómina" },
  { view: "cash" as View, icon: Banknote, label: "Caja" },
  { view: "expenses" as View, icon: Receipt, label: "Gastos" },
  { view: "receivables" as View, icon: HandCoins, label: "Cuentas por Cobrar" },
  { view: "payables" as View, icon: HandCoins, label: "Cuentas por Pagar" },
  { view: "reports" as View, icon: FileBarChart, label: "Reportes" },
  { view: "backups" as View, icon: HardDrive, label: "Backups" },
  { view: "calendar" as View, icon: Calendar, label: "Calendario" },
  { view: "users" as View, icon: UserCog, label: "Usuarios", adminOnly: true },
  { view: "acerca" as View, icon: Info, label: "Acerca de" },
  { view: "legal" as View, icon: Shield, label: "Legal y privacidad" },
  { view: "gestahelp" as View, icon: Sparkles, label: "⭐ GestaHelp" },
];

function App() {
  const [databaseSecurity, setDatabaseSecurity] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [businessName, setBusinessName] = useState("Mi Negocio");
  const [loadingSession, setLoadingSession] = useState(true);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [assistantContextView, setAssistantContextView] = useState<View>("dashboard");
  const [legalStatus, setLegalStatus] = useState<LegalAcceptanceStatus | null>(null);
  const [legalLoadError, setLegalLoadError] = useState<string | null>(null);
  const [cashOpen, setCashOpen] = useState<boolean | null>(null);
  const [forceCash, setForceCash] = useState(false);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [showLicenseManager, setShowLicenseManager] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const { theme, toggleTheme, loadTheme } = useThemeStore();

  useEffect(() => {
    const disableContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", disableContextMenu);
    return () => document.removeEventListener("contextmenu", disableContextMenu);
  }, []);

  useEffect(() => {
    invoke<{ status: string }>("get_database_security_state")
      .then(result => setDatabaseSecurity(result.status))
      .catch(() => setDatabaseSecurity("error"));
  }, []);

  useEffect(() => {
    if (databaseSecurity !== "ready") return;
    loadTheme();
    const loadNotifications = () => {
      invoke<NotificationItem[]>("get_notifications").then(setNotifications).catch(() => {});
    };
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [currentView, databaseSecurity, loadTheme]);

  // ═══════════════════════════════════════════
  // INIT: Cargar todo en paralelo
  // ═══════════════════════════════════════════
  useEffect(() => {
    if (databaseSecurity !== "ready") return;
    const initApp = async () => {
      try {
        const results = await Promise.allSettled([
          invoke<boolean>("is_setup_complete"),
          invoke<LicenseInfo>("get_license_status"),
          invoke<string | null>("get_business_logo"),
          invoke<string | null>("get_setting", { key: "nombre_negocio" }),
          invoke<LegalAcceptanceStatus>("get_legal_acceptance_status"),
        ]);

        const [setupResult, licenseResult, logoResult, nameResult, legalResult] = results;

        if (setupResult.status === "fulfilled") setSetupComplete(setupResult.value);
        else setSetupComplete(false);

        if (licenseResult.status === "fulfilled" && licenseResult.value) setLicense(licenseResult.value);
        if (logoResult.status === "fulfilled" && logoResult.value) setLogoBase64(logoResult.value);
        if (nameResult.status === "fulfilled" && nameResult.value) setBusinessName(nameResult.value);
        if (legalResult.status === "fulfilled") {
          setLegalStatus(legalResult.value);
          setLegalLoadError(null);
        } else {
          setLegalStatus(null);
          setLegalLoadError(String(legalResult.reason));
        }
      } catch {
        setSetupComplete(false);
      } finally {
        setLoadingSession(false);
      }
    };
    initApp();
  }, [databaseSecurity]);

  useEffect(() => {
    if (databaseSecurity !== "ready" || !currentUser) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let retryDelay = 30_000;

    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => { void syncWhenOnline(); }, delay);
    };
    const syncWhenOnline = async () => {
      if (stopped) return;
      if (!navigator.onLine) {
        schedule(60_000);
        return;
      }
      try {
        const [, , configured] = await invoke<[number, number, boolean]>("get_backup_sync_status");
        if (!configured) {
          schedule(5 * 60_000);
          return;
        }
        const result = await invoke<{ pending: number; errors: string[] }>("sync_backups");
        if (result.errors.length) throw new Error(result.errors.join("; "));
        if (result.pending > 0) {
          schedule(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30 * 60_000);
          return;
        }
        retryDelay = 30_000;
        schedule(15 * 60_000);
      } catch (error) {
        console.warn("La sincronización de backups se reintentará:", error);
        schedule(retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30 * 60_000);
      }
    };
    const onOnline = () => { void syncWhenOnline(); };
    window.addEventListener("online", onOnline);
    void syncWhenOnline();
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [databaseSecurity, currentUser]);

  const checkCashStatus = async (user: UserInfo) => {
    if (user.role === ROLES.CASHIER) {
      try {
        const openReg = await invoke<unknown>("get_open_register");
        setCashOpen(openReg !== null);
        setForceCash(true);
      } catch { setCashOpen(false); setForceCash(true); }
    } else {
      // FIX: Para admin y otros roles, la caja no es obligatoria.
      // Inicializar inmediatamente para evitar que el GATE 4 quede en "Verificando caja..."
      setCashOpen(true);
      setForceCash(false);
    }
  };

  const handleSetupComplete = () => {
    setSetupComplete(true);
    invoke<string | null>("get_business_logo").then(b64 => { if (b64) setLogoBase64(b64); }).catch(() => {});
    invoke<string | null>("get_setting", { key: "nombre_negocio" }).then(name => { if (name) setBusinessName(name); }).catch(() => {});
  };

  const handleLogin = (user: UserInfo) => {
    setCurrentUser(user);
    checkCashStatus(user);
    // FIX: No sobrescribir license si ya está activa. La licencia no cambia
    // con el login. Si get_license_status falla después del login, no debe
    // sobrescribir un license activo y reactivar el GATE 1 (pantalla de licencias).
    if (!license?.activated) {
      invoke<LicenseInfo>("get_license_status")
        .then(lic => setLicense(lic))
        .catch(() => {});
    }
  };

  const handleLogout = () => {
    invoke("logout").then(() => setCurrentUser(null)).catch(() => {});
  };

  const handleLicenseActivated = () => {
    invoke<LicenseInfo>("get_license_status")
      .then(lic => { setLicense(lic); setShowLicenseManager(false); })
      .catch(() => { setLicense(null); setShowLicenseManager(false); });
  };

  const reloadLegalStatus = async () => {
    setLegalStatus(null);
    setLegalLoadError(null);
    try {
      setLegalStatus(await invoke<LegalAcceptanceStatus>("get_legal_acceptance_status"));
    } catch (error) {
      setLegalLoadError(String(error));
    }
  };

  // ═══════════════════════════════════════════
  // RENDER GATES — Nuevo flujo
  // ═══════════════════════════════════════════

  if (databaseSecurity !== "ready") {
    if (databaseSecurity === null) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      );
    }
    return (
      <DatabaseSecurityView
        status={databaseSecurity}
        onStatusChange={setDatabaseSecurity}
        onReady={() => {
          setDatabaseSecurity("ready");
          setSetupComplete(null);
          setLoadingSession(true);
        }}
      />
    );
  }

  // Loading
  if (setupComplete === null || loadingSession) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (legalLoadError) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-danger">No se pudo comprobar la aceptación legal: {legalLoadError}</p>
        <button onClick={reloadLegalStatus} className="px-4 py-2 rounded-lg bg-accent text-white">
          Reintentar
        </button>
      </div>
    );
  }

  if (!legalStatus) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!legalStatus.terms_accepted || !legalStatus.privacy_notice_acknowledged) {
    return <LegalAcceptanceView status={legalStatus} onAccepted={setLegalStatus} />;
  }

  // Si está en modo "cambiar plan" desde el dashboard
  if (showLicenseManager) {
    return (
      <LicenseActivationView
        onActivated={handleLicenseActivated}
        onBack={() => setShowLicenseManager(false)}
      />
    );
  }

  // GATE 1: Licencia primero
  if (!license?.activated) {
    return <LicenseActivationView onActivated={handleLicenseActivated} />;
  }

  // GATE 2: Setup obligatorio después de licencia
  if (!setupComplete) {
    return <SetupView onComplete={handleSetupComplete} />;
  }

  // GATE 3: Login
  if (!currentUser) {
    return <LoginView onLogin={handleLogin} />;
  }

  // GATE 4: Caja (solo para cajeros)
  if (forceCash && cashOpen === false) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <ForceOpenCashModal userId={currentUser.id} onOpened={() => setCashOpen(true)} />
      </div>
    );
  }
  // FIX: Solo mostrar "Verificando caja..." si forceCash es true y cashOpen aún es null.
  // Para admins y otros roles, forceCash es false, por lo que este gate se omite.
  if (forceCash && cashOpen === null) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-secondary">Verificando caja...</p>
      </div>
    );
  }

  // ═══════════════════ MAIN LAYOUT ═══════════════════
  const allowed = license?.modules || [];
  const unreadCount = notifications.length;
  // FIX: Eliminado useMemo que violaba las reglas de hooks al estar después de
  // los return de los gates. Ahora es una variable normal calculada en cada render.
  let currentViewComponent;
  const alwaysAvailableViews = new Set<View>(["acerca", "calendar", "services", "gestahelp", "legal"]);
  const availableViews = menuItems
    .filter((item) => allowed.includes(item.view) || alwaysAvailableViews.has(item.view))
    .map((item) => item.view);
  if (currentView === "dashboard") currentViewComponent = <DashboardView />;
  else if (currentView === "products" && allowed.includes("products")) currentViewComponent = <ProductsView role={currentUser.role} />;
  else if (currentView === "pos" && allowed.includes("pos")) currentViewComponent = <POSView userId={currentUser.id} />;
  else if (currentView === "purchases" && allowed.includes("purchases")) currentViewComponent = <PurchasesView userId={currentUser.id} />;
  else if (currentView === "services") currentViewComponent = <ServicesView />;
  else if (currentView === "quotations") currentViewComponent = <QuotationsView />;
  else if (currentView === "kardex") currentViewComponent = <KardexView />;
  else if (currentView === "physical_inventory" && allowed.includes("physical_inventory") && currentUser.role === ROLES.ADMIN) currentViewComponent = <PhysicalInventoryView />;
  else if (currentView === "audit") currentViewComponent = <AuditView />;
  else if (currentView === "accounting") currentViewComponent = <AccountingView />;
  else if (currentView === "suppliers" && allowed.includes("suppliers")) currentViewComponent = <SuppliersView />;
  else if (currentView === "payables" && allowed.includes("payables")) currentViewComponent = <PayablesView />;
  else if (currentView === "customers" && allowed.includes("customers")) currentViewComponent = <CustomersView />;
  else if (currentView === "employees" && allowed.includes("employees")) currentViewComponent = <EmployeesView />;
  else if (currentView === "payroll") currentViewComponent = <PayrollView />;
  else if (currentView === "cash" && allowed.includes("cash")) currentViewComponent = <CashView userId={currentUser.id} />;
  else if (currentView === "expenses" && allowed.includes("expenses")) currentViewComponent = <ExpensesView userId={currentUser.id} />;
  else if (currentView === "receivables" && allowed.includes("receivables")) currentViewComponent = <ReceivablesView />;
  else if (currentView === "reports" && allowed.includes("reports")) currentViewComponent = <ReportsView />;
  else if (currentView === "backups" && allowed.includes("backups")) currentViewComponent = <BackupView />;
  else if (currentView === "calendar") currentViewComponent = <CalendarView />;
  else if (currentView === "users" && allowed.includes("users") && currentUser.role === ROLES.ADMIN) currentViewComponent = <UsersView />;
  else if (currentView === "acerca") currentViewComponent = <AcercaView />;
  else if (currentView === "legal") currentViewComponent = <LegalDocumentsView status={legalStatus} />;
  else if (currentView === "gestahelp") currentViewComponent = (
    <GestaHelpView view={assistantContextView} availableViews={availableViews} onNavigate={(target) => {
      const destination = menuItems.find((item) => item.view === target);
      if (destination && availableViews.includes(destination.view)) setCurrentView(destination.view);
    }} />
  );
  else currentViewComponent = <DashboardView />;

  return (
    <div className="flex h-screen bg-surface text-primary">
      <PremiumToaster />
      <UpdaterNotice />

      <motion.aside
        initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={`bg-sidebar border-r border-theme flex flex-col transition-all duration-300 ${sidebarCollapsed ? "w-16" : "w-64"}`}
      >
        <div className="p-5 border-b border-theme">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5">
                {logoBase64 ? (
                  <img src={`data:image/png;base64,${logoBase64}`} alt="Logo" className="w-8 h-8 rounded-lg object-contain border border-theme" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-linear-to-br from-accent to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                    {businessName.charAt(0).toUpperCase()}
                  </div>
                )}
                <motion.h1 className="text-lg font-bold text-accent">GestaERP</motion.h1>
              </div>
            )}
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1 rounded-lg text-secondary hover:text-primary hover:bg-surface transition-colors">
              {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>
          {!sidebarCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <p className="text-xs text-secondary mt-1">{businessName}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <Shield size={12} className="text-accent" />
                <p className="text-xs text-secondary">Plan: <span className="text-accent font-medium capitalize">{license?.plan}</span> | {license?.days_left} días</p>
              </div>
              {license && license.days_left <= 5 && license.days_left > 0 && (
                <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-warning-theme text-warning-theme text-xs">
                  <AlertTriangle size={12} />
                  <span>¡Licencia expira en {license.days_left} día{license.days_left !== 1 ? 's' : ''}!</span>
                </div>
              )}
            </motion.div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <motion.button
            onClick={() => openExternal("https://wa.me/573244826034?text=Hola%2C%20necesito%20soporte%20con%20GestaERP")}
            type="button"
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-secondary hover:bg-surface hover:text-green-500 transition-colors">
            <Headphones size={18} />{!sidebarCollapsed && "Soporte"}
          </motion.button>

          {menuItems.map((item, index) => {
            if (item.adminOnly && currentUser.role !== ROLES.ADMIN) return null;
            if (!allowed.includes(item.view) && item.view !== "acerca" && item.view !== "calendar" && item.view !== "services" && item.view !== "gestahelp" && item.view !== "legal") return null;
            const Icon = item.icon;
            return (
              <motion.button key={item.view} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }}
                whileHover={{ scale: 1.02, x: 4 }} whileTap={{ scale: 0.98 }} onClick={() => {
                  if (item.view !== "gestahelp") setAssistantContextView(item.view);
                  setCurrentView(item.view);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${currentView === item.view ? "bg-accent/20 text-accent font-medium" : "text-secondary hover:bg-surface"}`}
                title={sidebarCollapsed ? item.label : undefined}>
                <Icon size={18} />{!sidebarCollapsed && item.label}
              </motion.button>
            );
          })}

          {/* Cambiar de plan */}
          <motion.button
            onClick={() => setShowLicenseManager(true)}
            whileHover={{ scale: 1.02, x: 4 }}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-secondary hover:bg-surface transition-colors mt-2"
            title={sidebarCollapsed ? "Cambiar plan" : undefined}
          >
            <Shield size={18} />{!sidebarCollapsed && "Cambiar plan"}
          </motion.button>
        </nav>

        <div className="p-4 border-t border-theme">
          {!sidebarCollapsed && (
            <>
              <p className="text-sm text-secondary">{currentUser.full_name}</p>
              <div className="relative mt-2">
                <button onClick={() => setShowNotifications(!showNotifications)} className="w-full flex items-center gap-2 text-left text-sm text-secondary hover:text-primary transition">
                  <Bell size={16} /> Notificaciones
                  {unreadCount > 0 && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="ml-auto bg-danger text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">{unreadCount}</motion.span>
                  )}
                </button>
              </div>
              <button onClick={handleLogout} className="mt-2 w-full text-left text-sm text-danger hover:opacity-80 transition">Cerrar sesión</button>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-secondary">Tema</span>
                <motion.button onClick={toggleTheme} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  className="relative w-14 h-7 rounded-full transition-colors duration-300" style={{ backgroundColor: theme === 'dark' ? '#6366f1' : '#f59e0b' }}
                  aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
                  <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center ${theme === 'dark' ? 'translate-x-7' : 'translate-x-0'}`}>
                    {theme === 'dark' ? <Sun size={14} color="#f59e0b" /> : <Moon size={14} color="#6366f1" />}
                  </motion.span>
                </motion.button>
              </div>
            </>
          )}
          {sidebarCollapsed && (
            <div className="flex flex-col items-center gap-3">
              <button onClick={handleLogout} className="text-danger hover:opacity-80 transition"><ChevronLeft size={16} /></button>
              <motion.button onClick={toggleTheme} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="relative w-10 h-6 rounded-full" style={{ backgroundColor: theme === 'dark' ? '#6366f1' : '#f59e0b' }}>
                <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 30 }} className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center ${theme === 'dark' ? 'translate-x-4' : 'translate-x-0.5'}`}>
                  {theme === 'dark' ? <Sun size={12} color="#f59e0b" /> : <Moon size={12} color="#6366f1" />}
                </motion.span>
              </motion.button>
            </div>
          )}
        </div>
      </motion.aside>

      <main className="flex-1 overflow-auto bg-surface relative" role="main" aria-label="Área principal de contenido">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }} className="flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-secondary">Cargando módulo...</p>
            </motion.div>
          </div>
        }>
          <AnimatePresence mode="wait">
            <motion.div key={currentView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }} className="h-full" role="region">
              {/* P2-02 FIX: ErrorBoundary captura errores de renderizado de cada vista */}
              <ErrorBoundary>
                {currentViewComponent}
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </Suspense>

        <button
          onClick={() => openExternal("https://wa.me/573244826034?text=Hola%2C%20necesito%20soporte%20con%20GestaERP")}
          type="button"
          className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110" title="Soporte por WhatsApp">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </button>
      </main>
      <HelpAssistant />
    </div>
  );
}

export default App;