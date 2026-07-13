import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Search, DollarSign, TrendingUp, TrendingDown, FileSpreadsheet } from "lucide-react";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumButton from "../components/ui/PremiumButton";
import { showToast } from "../components/ui/PremiumToast";
import { formatCOP } from "../utils/formatCurrency";

interface Closure {
  id: number;
  user_id: number | null;
  username: string | null;
  closure_date: string;
  cash_sales: number;
  card_sales: number;
  transfer_sales: number;
  total_income: number;
  expenses: number;
  net_result: number;
  observations?: string;
  created_at: string;
}

export default function AccountingView() {
  const [closures, setClosures] = useState<Closure[]>([]);
  const [summary, setSummary] = useState<Closure | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [cashSales, setCashSales] = useState("");
  const [cardSales, setCardSales] = useState("");
  const [transferSales, setTransferSales] = useState("");
  const [expenses, setExpenses] = useState("");
  const [observations, setObservations] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [closuresData, summaryData] = await Promise.all([
        invoke<Closure[]>("list_accounting_closures", {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
        invoke<Closure>("get_accounting_summary", {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
      ]);
      setClosures(closuresData);
      setSummary(summaryData);
    } catch (e) {
      showToast("Error al cargar: " + String(e), "error");
    }
  };

  const handleCreate = async () => {
    if (!cashSales && !cardSales && !transferSales) {
      setError("Ingrese al menos un tipo de ingreso");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await invoke("create_accounting_closure", {
        cash_sales: parseFloat(cashSales) || 0,
        card_sales: parseFloat(cardSales) || 0,
        transfer_sales: parseFloat(transferSales) || 0,
        expenses: parseFloat(expenses) || 0,
        observations: observations || undefined,
        user_id: 1,
      });
      showToast("Cierre contable creado", "success");
      setShowCreate(false);
      setCashSales("");
      setCardSales("");
      setTransferSales("");
      setExpenses("");
      setObservations("");
      loadData();
    } catch (e) {
      setError(String(e));
      showToast("Error: " + String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("es-CO");
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-primary">Cierre Contable</h2>
        <PremiumButton onClick={() => setShowCreate(true)}>
          <DollarSign size={18} className="mr-2" />
          Nuevo Cierre
        </PremiumButton>
      </div>

      {/* Summary Cards */}
      {summary && summary.id !== 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-theme rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp className="text-green-500" size={24} />
              </div>
              <div>
                <p className="text-xs text-secondary">Total Ingresos</p>
                <p className="text-2xl font-bold text-success tabular-nums">{formatCOP(summary.total_income)}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-theme rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <TrendingDown className="text-red-500" size={24} />
              </div>
              <div>
                <p className="text-xs text-secondary">Total Gastos</p>
                <p className="text-2xl font-bold text-danger tabular-nums">{formatCOP(summary.expenses)}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-theme rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <DollarSign className="text-accent" size={24} />
              </div>
              <div>
                <p className="text-xs text-secondary">Resultado Neto</p>
                <p className={`text-2xl font-bold tabular-nums ${summary.net_result >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCOP(summary.net_result)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-theme rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-secondary mb-1">Fecha Inicio</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Fecha Fin</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
          </div>
          <div className="flex items-end">
            <PremiumButton onClick={loadData} variant="ghost">
              <Search size={18} className="mr-2" />
              Buscar
            </PremiumButton>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-theme rounded-xl overflow-hidden">
        {closures.length === 0 ? (
          <div className="p-8 text-center text-secondary">
            <FileSpreadsheet size={32} className="mx-auto mb-2 opacity-30" />
            No hay cierres contables
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-input text-primary text-xs uppercase">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3 text-right">Efectivo</th>
                <th className="p-3 text-right">Tarjeta</th>
                <th className="p-3 text-right">Transferencia</th>
                <th className="p-3 text-right">Total Ingresos</th>
                <th className="p-3 text-right">Gastos</th>
                <th className="p-3 text-right">Neto</th>
                <th className="p-3">Usuario</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {closures.map((c, index) => (
                  <motion.tr
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.02 }}
                    className="border-t border-theme hover:bg-input/30"
                  >
                    <td className="p-3">{formatDate(c.closure_date)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCOP(c.cash_sales)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCOP(c.card_sales)}</td>
                    <td className="p-3 text-right tabular-nums">{formatCOP(c.transfer_sales)}</td>
                    <td className="p-3 text-right font-medium tabular-nums">{formatCOP(c.total_income)}</td>
                    <td className="p-3 text-right text-danger tabular-nums">{formatCOP(c.expenses)}</td>
                    <td className={`p-3 text-right font-bold tabular-nums ${c.net_result >= 0 ? 'text-success' : 'text-danger'}`}>
                      {formatCOP(c.net_result)}
                    </td>
                    <td className="p-3 text-xs">{c.username || `Usuario ${c.user_id}`}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      <PremiumModal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Cierre Contable" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary mb-1">Ventas Efectivo</label>
              <input type="number" value={cashSales} onChange={(e) => setCashSales(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Ventas Tarjeta</label>
              <input type="number" value={cardSales} onChange={(e) => setCardSales(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Transferencias</label>
              <input type="number" value={transferSales} onChange={(e) => setTransferSales(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Gastos</label>
              <input type="number" value={expenses} onChange={(e) => setExpenses(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Observaciones</label>
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
          </div>
          {error && <div className="p-3 bg-danger/10 border border-danger rounded-lg text-danger text-sm">{error}</div>}
          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowCreate(false)} disabled={saving}>Cancelar</PremiumButton>
            <PremiumButton onClick={handleCreate} loading={saving}>{saving ? "Guardando..." : "Crear"}</PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}