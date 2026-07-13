import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { ROLE_LABELS, ROLE_COLORS } from "../types/user";

interface SidebarProps {
  businessName?: string;
}

export default function Sidebar({ businessName }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const links = [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/products", label: "Productos", icon: "📦" },
    { path: "/pos", label: "Punto de Venta", icon: "🛒" },
    { path: "/cash", label: "Caja", icon: "💰" },
    { path: "/setup", label: "Configuracion", icon: "⚙️" },
  ];

  // Filtrar modulos segun el rol
  const visibleLinks = links.filter((link) => {
    if (!user) return false;
    if (user.role === "vendedor") return link.path !== "/setup";
    // cajero: solo POS y Dashboard
    return link.path === "/" || link.path === "/pos";
  });

  const initials = user?.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700/50">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-blue-400">Gesta</span>ERP
        </h1>
        <p className="text-xs text-slate-400 mt-1 truncate">
          {businessName || "Sin configurar"}
        </p>
      </div>

      {/* Usuario */}
      {user && (
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.full_name}</p>
              <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${ROLE_COLORS[user.role] || "bg-gray-600 text-gray-200"}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navegacion */}
      <nav className="flex-1 p-3 space-y-1">
        {visibleLinks.map((link) => {
          const isActive = location.pathname === link.path;
          return (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="text-lg">{link.icon}</span>
              <span>{link.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Cerrar sesion */}
      <div className="p-3 border-t border-slate-700/50">
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-red-900/30 hover:text-red-300 transition-all"
        >
          <span>🚪</span>
          <span>Cerrar sesion</span>
        </button>
      </div>

      {/* Version */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full"></span>
          <span>v0.1.0 — Offline</span>
        </div>
      </div>
    </aside>
  );
}