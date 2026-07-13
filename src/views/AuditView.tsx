import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Search, Shield, Activity, FileSpreadsheet } from "lucide-react";
import PremiumButton from "../components/ui/PremiumButton";
import { showToast } from "../components/ui/PremiumToast";

interface AuditLog {
  id: number;
  user_id: number | null;
  username: string | null;
  action_type: string;
  entity_type: string;
  entity_id: number | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

interface AuditSummary {
  total_events: number;
  today_events: number;
  events_by_type: { action_type: string; count: number }[];
}

export default function AuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [userId, setUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      const data = await invoke<AuditSummary>("get_audit_summary");
      setSummary(data);
    } catch (e) {
      console.error("Error loading audit summary:", e);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await invoke<AuditLog[]>("get_audit_logs", {
        user_id: userId ? parseInt(userId) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        action_type: actionFilter || undefined,
        limit: 200,
      });
      setLogs(data);
    } catch (e) {
      showToast("Error al cargar auditoría: " + String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const [csv, filename] = await invoke<[string, string]>("export_audit_logs_csv", {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast("CSV exportado", "success");
    } catch (e) {
      showToast("Error al exportar: " + String(e), "error");
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("es-CO");
  };

  const getActionColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "login":
      case "logout":
        return "bg-blue-100 text-blue-800";
      case "create":
        return "bg-green-100 text-green-800";
      case "update":
        return "bg-yellow-100 text-yellow-800";
      case "delete":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-primary">Auditoría del Sistema</h2>
        <PremiumButton onClick={handleExportCSV} disabled={exporting}>
          <Download size={18} className="mr-2" />
          {exporting ? "Exportando..." : "Exportar CSV"}
        </PremiumButton>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-theme rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Activity className="text-accent" size={24} />
              </div>
              <div>
                <p className="text-xs text-secondary">Total Eventos</p>
                <p className="text-2xl font-bold text-primary tabular-nums">{summary.total_events.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-theme rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Shield className="text-green-500" size={24} />
              </div>
              <div>
                <p className="text-xs text-secondary">Eventos Hoy</p>
                <p className="text-2xl font-bold text-primary tabular-nums">{summary.today_events.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-theme rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <FileSpreadsheet className="text-orange-500" size={24} />
              </div>
              <div>
                <p className="text-xs text-secondary">Por Tipo</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {summary.events_by_type.slice(0, 4).map((et, i) => (
                    <span key={i} className="text-xs bg-input px-2 py-0.5 rounded-full text-primary">
                      {et.action_type}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-theme rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm text-secondary mb-1">Usuario ID</label>
            <input
              type="number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="ID usuario"
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Fecha Inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Fecha Fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Acción</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
            >
              <option value="">Todas</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="create">Crear</option>
              <option value="update">Actualizar</option>
              <option value="delete">Eliminar</option>
            </select>
          </div>
          <div className="flex items-end">
            <PremiumButton onClick={loadLogs} loading={loading}>
              <Search size={18} className="mr-2" />
              Buscar
            </PremiumButton>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-card border border-theme rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-secondary">Cargando logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-secondary">
            <Shield size={32} className="mx-auto mb-2 opacity-30" />
            No hay registros de auditoría
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-input text-primary text-xs uppercase">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Usuario</th>
                  <th className="p-3">Acción</th>
                  <th className="p-3">Entidad</th>
                  <th className="p-3">Detalle</th>
                  <th className="p-3">IP</th>
                  <th className="p-3">Fecha</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {logs.map((log, index) => (
                    <motion.tr
                      key={log.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-t border-theme hover:bg-input/30"
                    >
                      <td className="p-3 font-mono text-xs">{log.id}</td>
                      <td className="p-3">
                        <span className="text-primary font-medium">{log.username || `Usuario ${log.user_id}`}</span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getActionColor(log.action_type)}`}>
                          {log.action_type}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-xs bg-input px-2 py-1 rounded">{log.entity_type}</span>
                      </td>
                      <td className="p-3 text-xs text-secondary max-w-xs truncate" title={log.details || ""}>
                        {log.details || "—"}
                      </td>
                      <td className="p-3 font-mono text-xs text-secondary">{log.ip_address || "—"}</td>
                      <td className="p-3 text-xs">{formatDate(log.created_at)}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}