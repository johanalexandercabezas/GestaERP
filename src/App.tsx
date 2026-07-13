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
import { useThemeStore } from "./stores/theme-store";
import PremiumToaster from "./components/ui/PremiumToast";
import {
  LayoutDashboard, Package, ShoppingCart, ClipboardList, Building2,
  Users, UserCog, Banknote, Receipt, HandCoins, FileBarChart, HardDrive,
  Briefcase, DollarSign, Bell, Sun, Moon, ChevronLeft, ChevronRight,
  Shield, AlertTriangle, ClipboardCheck, Calendar, Info, Headphones, FileText, FileSpreadsheet, Activity
} from "lucide-react";

interface UserInfo { id: number; full_name: string; role: string; }
interface LicenseInfo { plan: string; activated: boolean; expires_at: string; max_users: number; days_left: number; modules: string[]; }
interface ImplementationStatus { is_paid: boolean; code: string; generated_at: string; validated_at: string | null; }
interface NotificationItem { type: string; message: string; priority: string; }

type View = "dashboard" | "products" | "pos" | "purchases" | "services" | "quotations" | "payables" | "kardex" | "suppliers" | "cash" | "backups" | "customers" | "reports" | "users" | "expenses" | "receivables" | "employees" | "payroll" | "physical_inventory" | "audit" | "accounting" | "calendar" | "acerca";

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
  { view: "reports" as View, icon: FileBarChart, label: "Reportes" },
  { view: "backups" as View, icon: HardDrive, label: "Backups" },
  { view: "calendar" as View, icon: Calendar, label: "Calendario" },
  { view: "users" as View, icon: UserCog, label: "Usuarios", adminOnly: true },
  { view: "acerca" as View, icon: Info, label: "Acerca de" },
];

function App() {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [businessName, setBusinessName] = useState("Mi Negocio");
  const [loadingSession, setLoadingSession] = useState(true);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [cashOpen, setCashOpen] = useState<boolean | null>(null);
  const [forceCash, setForceCash] = useState(false);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [implementationStatus, setImplementationStatus] = useState<ImplementationStatus | null>(null);
  const [showLicenseManager, setShowLicenseManager] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  const { theme, toggleTheme, loadTheme } = useThemeStore();

  useEffect(() => { loadTheme(); }, []);

  useEffect(() => {
    const loadNotifications = () => {
      invoke<NotificationItem[]>("get_notifications").then(setNotifications).catch(() => {});
    };
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [currentView]);

  // ═══════════════════════════════════════════
  // INIT: Cargar todo en paralelo
  // ═══════════════════════════════════════════
  useEffect(() => {
    const initApp = async () => {
      try {
        const results = await Promise.allSettled([
          invoke<boolean>("is_setup_complete"),
          invoke<LicenseInfo>("get_license_status"),
          invoke<ImplementationStatus>("get_implementation_status"),
          invoke<string | null>("get_business_logo"),
          invoke<string | null>("get_setting", { key: "nombre_negocio" }),
        ]);

        const [setupResult, licenseResult, implResult, logoResult, nameResult] = results;

        if (setupResult.status === "fulfilled") setSetupComplete(setupResult.value);
        else setSetupComplete(false);

        if (licenseResult.status === "fulfilled" && licenseResult.value) setLicense(licenseResult.value);
        if (implResult.status === "fulfilled" && implResult.value) setImplementationStatus(implResult.value);
        if (logoResult.status === "fulfilled" && logoResult.value) setLogoBase64(logoResult.value);
        if (nameResult.status === "fulfilled" && nameResult.value) setBusinessName(nameResult.value);
      } catch {
        setSetupComplete(false);
      } finally {
        setLoadingSession(false);
      }
    };
    initApp();
  }, []);

  const checkCashStatus = async (user: UserInfo) => {
    if (user.role === "cashier") {
      try {
        const openReg = await invoke<any | null>("get_open_register");
        setCashOpen(openReg !== null);
        setForceCash(true);
      } catch { setCashOpen(false); setForceCash(true); }
    } else { setCashOpen(true); setForceCash(false); }
  };

  const handleSetupComplete = () => {
    setSetupComplete(true);
    invoke<string | null>("get_business_logo").then(b64 => { if (b64) setLogoBase64(b64); }).catch(() => {});
    invoke<string | null>("get_setting", { key: "nombre_negocio" }).then(name => { if (name) setBusinessName(name); }).catch(() => {});
  };

  const handleLogin = (user: UserInfo) => {
    setCurrentUser(user);
    checkCashStatus(user);
    invoke<LicenseInfo>("get_license_status")
      .then(lic => setLicense(lic))
      .catch(() => setLicense(null));
  };

  const handleLogout = () => {
    invoke("logout").then(() => setCurrentUser(null)).catch(() => {});
  };

  const handleLicenseActivated = () => {
    invoke<LicenseInfo>("get_license_status")
      .then(lic => { setLicense(lic); setShowLicenseManager(false); })
      .catch(() => { setLicense(null); setShowLicenseManager(false); });
  };

  // ═══════════════════════════════════════════
  // RENDER GATES — Nuevo flujo
  // ═══════════════════════════════════════════

  // Loading
  if (setupComplete === null || loadingSession) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  // Si está en modo "cambiar plan" desde el dashboard
  if (showLicenseManager) {
    return <LicenseActivationView onActivated={handleLicenseActivated} />;
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
  if (cashOpen === null) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-secondary">Verificando caja...</p>
      </div>
    );
  }

  // ═══════════════════ MAIN LAYOUT ═══════════════════
  const allowed = license?.modules || [];
  const unreadCount = notifications.length;

  return (
    <div className="flex h-screen bg-surface text-primary">
      <PremiumToaster />

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
          <motion.a href="https://wa.me/573244826034?text=Hola%2C%20necesito%20soporte%20con%20GestaERP" target="_blank" rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-secondary hover:bg-surface hover:text-green-500 transition-colors">
            <Headphones size={18} />{!sidebarCollapsed && "Soporte"}
          </motion.a>

          {menuItems.map((item, index) => {
            if (item.adminOnly && currentUser.role !== "admin") return null;
            if (!allowed.includes(item.view) && item.view !== "acerca" && item.view !== "calendar" && item.view !== "services") return null;
            const Icon = item.icon;
            return (
              <motion.button key={item.view} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }}
                whileHover={{ scale: 1.02, x: 4 }} whileTap={{ scale: 0.98 }} onClick={() => setCurrentView(item.view)}
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
              {currentView === "dashboard" && <DashboardView />}
              {currentView === "products" && allowed.includes("products") && <ProductsView role={currentUser.role} />}
              {currentView === "pos" && allowed.includes("pos") && <POSView userId={currentUser.id} />}
              {currentView === "purchases" && allowed.includes("purchases") && <PurchasesView userId={currentUser.id} />}
              {currentView === "services" && <ServicesView />}
              {currentView === "quotations" && <QuotationsView />}
              {currentView === "kardex" && <KardexView />}
              {currentView === "physical_inventory" && allowed.includes("physical_inventory") && currentUser.role === "admin" && <PhysicalInventoryView />}
              {currentView === "audit" && <AuditView />}
              {currentView === "accounting" && <AccountingView />}
              {currentView === "suppliers" && allowed.includes("suppliers") && <SuppliersView />}
              {currentView === "payables" && allowed.includes("payables") && <PayablesView />}
              {currentView === "customers" && allowed.includes("customers") && <CustomersView />}
              {currentView === "employees" && allowed.includes("employees") && <EmployeesView />}
              {currentView === "payroll" && allowed.includes("payroll") && <PayrollView />}
              {currentView === "cash" && allowed.includes("cash") && <CashView userId={currentUser.id} />}
              {currentView === "expenses" && allowed.includes("expenses") && <ExpensesView userId={currentUser.id} />}
              {currentView === "receivables" && allowed.includes("receivables") && <ReceivablesView />}
              {currentView === "reports" && allowed.includes("reports") && <ReportsView />}
              {currentView === "backups" && allowed.includes("backups") && <BackupView />}
              {currentView === "calendar" && <CalendarView />}
              {currentView === "users" && allowed.includes("users") && currentUser.role === "admin" && <UsersView />}
              {currentView === "acerca" && <AcercaView />}
            </motion.div>
          </AnimatePresence>
        </Suspense>

        <a href="https://wa.me/573244826034?text=Hola%2C%20necesito%20soporte%20con%20GestaERP" target="_blank" rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110" title="Soporte por WhatsApp">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </a>
      </main>
      <HelpAssistant />
    </div>
  );
}

export default App;