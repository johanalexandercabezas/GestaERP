import { useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import {
  Package, ShoppingCart, Building2, UserCheck, Loader2,
  DollarSign, TrendingUp, TrendingDown, Users, AlertTriangle,
  Wallet, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

// ──────────── Tipos ────────────
interface DashboardStats {
  caja_actual: number;
  productos_bajos: number;
  ventas_hoy: number;
  gastos_hoy: number;
  ventas_ultimos_7_dias: number[];
  ventas_ultimos_30_dias: number[];
  ventas_por_mes_6: [string, number][];
  total_clientes: number;
  total_proveedores: number;
  cantidad_ventas_hoy: number;
  producto_mas_vendido_mes: { name: string; total_vendido: number } | null;
  compras_mes: number;
  producto_mas_comprado_mes: { name: string; total_vendido: number } | null;
  ventas_mes: number;
  gastos_mes: number;
  metodos_pago: [string, number][];
  top_productos_mes: [string, number][];
  productos_activos: number;
  servicios_activos: number;
  compras_realizadas: number;
  proveedores_activos: number;
  empleados_activos: number;
}

const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const RADIAN = Math.PI / 180;

// ──────────── Utilidades ────────────
const formatCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(v);

const translatePayment = (m: string) => {
  const map: Record<string, string> = {
    cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", credit: "Crédito",
  };
  return map[m] || m;
};

// ──────────── KPI Card ────────────
function KpiCard({ titulo, valor, color, subtitulo, icon, trend, delay }: {
  titulo: string; valor: string; color: string; subtitulo?: string;
  icon: React.ReactNode; trend?: "up" | "down"; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      whileHover={{ y: -4, boxShadow: "0 12px 32px rgba(0,0,0,0.12)" }}
      className="bg-card border border-theme rounded-2xl p-5 transition-all duration-200 relative overflow-hidden group"
    >
      {/* Gradiente decorativo */}
      <div className={`absolute top-0 left-0 w-full h-1 ${color.replace("text-", "bg-")}`} />
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-1">{titulo}</p>
          <p className={`text-2xl font-bold tabular-nums ${color} truncate`}>{valor}</p>
          {subtitulo && <p className="text-xs text-secondary mt-1">{subtitulo}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl bg-${color.replace("text-", "")}/10 flex items-center justify-center ml-3 shrink-0 group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1">
          {trend === "up" ? <ArrowUpRight size={12} className="text-success" /> : <ArrowDownRight size={12} className="text-danger" />}
          <span className={`text-xs font-medium ${trend === "up" ? "text-success" : "text-danger"}`}>
            {trend === "up" ? "Al alza" : "A la baja"}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ──────────── Custom Pie Label ────────────
function renderPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx?: unknown;
  cy?: unknown;
  midAngle?: unknown;
  innerRadius?: unknown;
  outerRadius?: unknown;
  percent?: unknown;
}) {
  const inner = Number(innerRadius);
  const outer = Number(outerRadius);
  const radius = inner + (outer - inner) * 0.5;
  const x = Number(cx) + radius * Math.cos(-Number(midAngle) * RADIAN);
  const y = Number(cy) + radius * Math.sin(-Number(midAngle) * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(Number(percent) * 100).toFixed(0)}%`}
    </text>
  );
}

// ──────────── Componente principal ────────────
export default function DashboardView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodoGrafico, setPeriodoGrafico] = useState<"7d" | "30d">("7d");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await invoke<DashboardStats>("get_dashboard_data");
        setStats(data);
        setError(null);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ──── Datos calculados ────
  const chartData7d = useMemo(() => {
    if (!stats) return [];
    return stats.ventas_ultimos_7_dias.map((valor, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return { dia: dayNames[date.getDay()], ventas: valor, fecha: date.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) };
    });
  }, [stats]);

  const chartData30d = useMemo(() => {
    if (!stats) return [];
    return stats.ventas_ultimos_30_dias.map((valor, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return { dia: date.getDate(), ventas: valor };
    });
  }, [stats]);

  const ventasMesChart = useMemo(() => {
    if (!stats) return [];
    return stats.ventas_por_mes_6
      .map(([mes, total]) => {
        const [y, m] = mes.split("-");
        return { mes: `${monthNames[parseInt(m) - 1]} ${y.slice(2)}`, ventas: total };
      })
      .reverse();
  }, [stats]);

  const metodosPagoChart = useMemo(() => {
    if (!stats) return [];
    return stats.metodos_pago.map(([metodo, count]) => ({
      name: translatePayment(metodo),
      value: count,
    }));
  }, [stats]);

  const topProductosChart = useMemo(() => {
    if (!stats) return [];
    return stats.top_productos_mes.map(([name, qty]) => ({
      name: name.length > 18 ? name.slice(0, 17) + "…" : name,
      cantidad: qty,
    }));
  }, [stats]);

  const utilidadHoy = stats ? stats.ventas_hoy - stats.gastos_hoy : 0;
  const utilidadMes = stats ? stats.ventas_mes - stats.gastos_mes : 0;

  // ──── Loading / Error ────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-3 text-accent" size={36} />
          <p className="text-secondary text-sm">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6">
        <div className="bg-danger/10 border border-danger rounded-2xl p-8 text-center max-w-lg mx-auto">
          <AlertTriangle className="mx-auto mb-3 text-danger" size={36} />
          <p className="text-danger font-semibold">Error al cargar el dashboard</p>
          <p className="text-sm text-secondary mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // ──── Render ────
  return (
    <div className="flex-1 p-6 overflow-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
          <p className="text-sm text-secondary mt-0.5">
            {new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary">Resumen general del negocio</span>
        </div>
      </motion.div>

      {/* ──── KPI Grid (máximo 4 tarjetas por fila) ──── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiCard titulo="Caja actual" valor={formatCOP(stats.caja_actual)} color="text-success" icon={<Wallet size={18} className="text-success" />} delay={0} />
        <KpiCard titulo="Ventas hoy" valor={formatCOP(stats.ventas_hoy)} color="text-accent" subtitulo={`${stats.cantidad_ventas_hoy} transacciones`} icon={<DollarSign size={18} className="text-accent" />} delay={0.03} trend={stats.ventas_hoy > 0 ? "up" : undefined} />
        <KpiCard titulo="Gastos hoy" valor={formatCOP(stats.gastos_hoy)} color="text-danger" icon={<TrendingDown size={18} className="text-danger" />} delay={0.06} />
        <KpiCard titulo="Utilidad hoy" valor={formatCOP(utilidadHoy)} color={utilidadHoy >= 0 ? "text-success" : "text-danger"} icon={<TrendingUp size={18} className={utilidadHoy >= 0 ? "text-success" : "text-danger"} />} delay={0.09} />
        <KpiCard titulo="Ventas mes" valor={formatCOP(stats.ventas_mes)} color="text-accent" icon={<DollarSign size={18} className="text-accent" />} delay={0.12} />
        <KpiCard titulo="Gastos mes" valor={formatCOP(stats.gastos_mes)} color="text-danger" icon={<TrendingDown size={18} className="text-danger" />} delay={0.15} />
        <KpiCard titulo="Utilidad mes" valor={formatCOP(utilidadMes)} color={utilidadMes >= 0 ? "text-success" : "text-danger"} icon={<TrendingUp size={18} className={utilidadMes >= 0 ? "text-success" : "text-danger"} />} delay={0.18} />
        <KpiCard titulo="Compras mes" valor={formatCOP(stats.compras_mes)} color="text-warning" icon={<ShoppingCart size={18} className="text-warning" />} delay={0.21} />
        <KpiCard titulo="Productos" valor={String(stats.productos_activos)} color="text-info" subtitulo={`${stats.servicios_activos} servicios`} icon={<Package size={18} className="text-info" />} delay={0.24} />
        <KpiCard titulo="Clientes" valor={String(stats.total_clientes)} color="text-info" icon={<Users size={18} className="text-info" />} delay={0.27} />
        <KpiCard titulo="Proveedores" valor={String(stats.proveedores_activos)} color="text-warning" icon={<Building2 size={18} className="text-warning" />} delay={0.30} />
        <KpiCard titulo="Empleados" valor={String(stats.empleados_activos)} color="text-success" icon={<UserCheck size={18} className="text-success" />} delay={0.33} />
        {stats.productos_bajos > 0 && (
          <KpiCard titulo="Stock bajo" valor={String(stats.productos_bajos)} color="text-danger" subtitulo="Requieren atención" icon={<AlertTriangle size={18} className="text-danger" />} delay={0.36} />
        )}
      </div>

      {/* ──── Gráficos ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ventas (7d / 30d) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-theme rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-primary">Ventas diarias</h3>
              <p className="text-xs text-secondary mt-0.5">Evolución de ingresos</p>
            </div>
            <div className="flex bg-input rounded-lg p-0.5">
              <button
                onClick={() => setPeriodoGrafico("7d")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${periodoGrafico === "7d" ? "bg-accent text-white shadow-sm" : "text-secondary hover:text-primary"}`}
              >
                7 días
              </button>
              <button
                onClick={() => setPeriodoGrafico("30d")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${periodoGrafico === "30d" ? "bg-accent text-white shadow-sm" : "text-secondary hover:text-primary"}`}
              >
                30 días
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            {periodoGrafico === "7d" ? (
              <BarChart data={chartData7d}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-theme" strokeOpacity={0.3} />
                <XAxis dataKey="dia" className="text-xs fill-secondary" tickLine={false} />
                <YAxis className="text-xs fill-secondary" tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => [formatCOP(Number(value)), "Ventas"]}
                  labelFormatter={(label) => `Día: ${label}`}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border-color)", background: "var(--card-bg)" }}
                />
                <Bar dataKey="ventas" fill="url(#barGradient)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            ) : (
              <AreaChart data={chartData30d}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-theme" strokeOpacity={0.3} />
                <XAxis dataKey="dia" className="text-xs fill-secondary" tickLine={false} interval={4} />
                <YAxis className="text-xs fill-secondary" tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => [formatCOP(Number(value)), "Ventas"]} />
                <Area type="monotone" dataKey="ventas" stroke="#6366f1" strokeWidth={2} fill="url(#areaGradient)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </motion.div>

        {/* Métodos de pago + Top productos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-card border border-theme rounded-2xl p-6"
        >
          <div>
            <h3 className="text-lg font-semibold text-primary mb-1">Distribución de pagos</h3>
            <p className="text-xs text-secondary mb-4">Métodos de pago este mes</p>
          </div>
          {metodosPagoChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={metodosPagoChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  labelLine={false}
                  label={renderPieLabel}
                >
                  {metodosPagoChart.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [String(value), "Transacciones"]} />
                <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-secondary">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-secondary text-sm">
              Sin datos de pagos este mes
            </div>
          )}
        </motion.div>

        {/* Top 5 productos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-theme rounded-2xl p-6"
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-primary">Top productos del mes</h3>
            <p className="text-xs text-secondary mt-0.5">Más vendidos por cantidad</p>
          </div>
          {topProductosChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topProductosChart} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-theme" strokeOpacity={0.3} horizontal={false} />
                <XAxis type="number" className="text-xs fill-secondary" tickLine={false} />
                <YAxis type="category" dataKey="name" className="text-xs fill-secondary" tickLine={false} width={110} />
                <Tooltip formatter={(value) => [String(value), "Unidades"]} />
                <Bar dataKey="cantidad" fill="#10b981" radius={[0, 6, 6, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-secondary text-sm">
              Sin ventas registradas este mes
            </div>
          )}
        </motion.div>

        {/* Ventas por mes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-card border border-theme rounded-2xl p-6"
        >
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-primary">Ventas últimos 6 meses</h3>
            <p className="text-xs text-secondary mt-0.5">Tendencia de ingresos mensuales</p>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={ventasMesChart}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-theme" strokeOpacity={0.3} />
              <XAxis dataKey="mes" className="text-xs fill-secondary" tickLine={false} />
              <YAxis className="text-xs fill-secondary" tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => [formatCOP(Number(value)), "Ventas"]} />
              <Line
                type="monotone"
                dataKey="ventas"
                stroke="#8b5cf6"
                strokeWidth={3}
                dot={{ r: 5, fill: "#8b5cf6", strokeWidth: 0 }}
                activeDot={{ r: 7, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* ──── Footer resumen ──── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center"
      >
        <div className="bg-card border border-theme rounded-xl p-4">
          <p className="text-xs text-secondary uppercase tracking-wide">Compras realizadas</p>
          <p className="text-xl font-bold text-warning mt-1">{stats.compras_realizadas}</p>
        </div>
        <div className="bg-card border border-theme rounded-xl p-4">
          <p className="text-xs text-secondary uppercase tracking-wide">Servicios activos</p>
          <p className="text-xl font-bold text-info mt-1">{stats.servicios_activos}</p>
        </div>
        <div className="bg-card border border-theme rounded-xl p-4">
          <p className="text-xs text-secondary uppercase tracking-wide">Prod. más vendido</p>
          <p className="text-sm font-semibold text-accent mt-1 truncate">
            {stats.producto_mas_vendido_mes?.name || "N/A"}
          </p>
          {stats.producto_mas_vendido_mes && (
            <p className="text-xs text-secondary">{stats.producto_mas_vendido_mes.total_vendido} unid.</p>
          )}
        </div>
        <div className="bg-card border border-theme rounded-xl p-4">
          <p className="text-xs text-secondary uppercase tracking-wide">Prod. más comprado</p>
          <p className="text-sm font-semibold text-success mt-1 truncate">
            {stats.producto_mas_comprado_mes?.name || "N/A"}
          </p>
          {stats.producto_mas_comprado_mes && (
            <p className="text-xs text-secondary">{stats.producto_mas_comprado_mes.total_vendido} unid.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}