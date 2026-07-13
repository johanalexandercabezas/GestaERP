import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { showToast } from "../components/ui/PremiumToast";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumModal from "../components/ui/PremiumModal";
import { ClipboardCheck, Plus, Search, CheckCircle, AlertTriangle, FileText, RotateCcw, X, Eye } from "lucide-react";

interface PhysicalCount {
  id: number;
  user_id: number;
  status: string;
  notes: string;
  created_at: string;
}

interface PhysicalCountItem {
  id: number;
  count_id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  theoretical_qty: number;
  counted_qty: number;
  difference: number;
  adjusted: boolean;
}

interface PhysicalCountWithItems {
  count: PhysicalCount;
  items: PhysicalCountItem[];
}

interface AuditSummary {
  total_products: number;
  correct_count: number;
  with_deficit: number;
  with_surplus: number;
  total_deficit_units: number;
  total_surplus_units: number;
  accuracy_percent: number;
  count_id: number;
  count_status: string;
  count_notes: string;
  count_date: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  "borrador": { label: "Borrador", color: "text-secondary bg-input" },
  "en_conteo": { label: "En conteo", color: "text-info bg-info/10" },
  "revisado": { label: "Revisado", color: "text-warning bg-warning/10" },
  "aplicado": { label: "Aplicado", color: "text-success bg-success/10" },
};

export default function PhysicalInventoryView() {
  const [counts, setCounts] = useState<PhysicalCount[]>([]);
  const [selectedCount, setSelectedCount] = useState<PhysicalCountWithItems | null>(null);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const loadCounts = async () => {
    try {
      const data = await invoke<PhysicalCount[]>("list_physical_counts");
      setCounts(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadCounts(); }, []);

  const loadSummary = async (countId: number) => {
    try {
const data = await invoke<AuditSummary>("get_inventory_audit_summary", { countId });
      setSummary(data);
    } catch { setSummary(null); }
  };

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      await invoke("create_physical_count", { notes: title ? `${title}: ${notes}` : notes, productIds: null });
      setShowNewForm(false);
      setNotes("");
      setTitle("");
      showToast("Auditoría creada exitosamente. ¡Inicia el conteo físico!", "success");
      loadCounts();
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  const handleSelect = async (countId: number) => {
    setLoading(true);
    setSummary(null);
    try {
      const data = await invoke<PhysicalCountWithItems>("get_physical_count", { countId });
      setSelectedCount(data);
      loadSummary(countId);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  const handleQtyChange = async (itemId: number, value: string) => {
    try {
      await invoke("update_counted_qty", { itemId, countedQty: value || "0" });
      if (selectedCount && summary) {
        const updatedItems = selectedCount.items.map(item =>
          item.id === itemId ? { ...item, counted_qty: parseFloat(value) || 0, difference: (parseFloat(value) || 0) - item.theoretical_qty } : item
        );
        setSelectedCount({ ...selectedCount, items: updatedItems });
        // Reload summary
        loadSummary(selectedCount.count.id);
      }
    } catch (e) { setError(String(e)); }
  };

  const handleApply = async () => {
    if (!selectedCount) return;
    if (!confirm("¿Aplicar todos los ajustes al inventario? Esta acción modificará el stock real de los productos con diferencias.")) return;
    setLoading(true);
    try {
      await invoke("apply_adjustments", { countId: selectedCount.count.id });
      showToast("Ajustes aplicados al inventario correctamente", "success");
      setSelectedCount(null);
      setSummary(null);
      loadCounts();
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  const handleGenerateReport = async (countId: number) => {
    setGeneratingReport(true);
    try {
      const result = await invoke<string>("generate_stock_validation_report", { countId });
      showToast(result, "success");
    } catch (e) {
      showToast("Error al generar informe: " + String(e), "error");
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleMarkReviewed = async (countId: number) => {
    try {
      await invoke("update_count_status", { countId, status: "revisado" });
      showToast("Auditoría marcada como revisada", "success");
      loadCounts();
      if (selectedCount?.count.id === countId) handleSelect(countId);
    } catch (e) { setError(String(e)); }
  };

  const filteredCounts = counts.filter(c =>
    c.notes.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(c.id).includes(searchTerm)
  );

  const statusBadge = (status: string) => {
    const s = STATUS_MAP[status] || { label: status, color: "text-secondary" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <motion.h2
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold text-primary flex items-center gap-2"
        >
          <ClipboardCheck className="text-accent" size={24} />
          Auditoría de Stock
          <span className="text-sm font-normal text-secondary ml-2">({counts.length} auditorías)</span>
        </motion.h2>
        <PremiumButton onClick={() => setShowNewForm(true)}>
          <Plus size={16} />
          Nueva auditoría
        </PremiumButton>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
        <input
          type="text"
          placeholder="Buscar auditoría..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {error && (
        <div className="p-3 mb-4 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Audit list + Detail side by side */}
      <div className="flex gap-6">
        {/* Left: List */}
        <div className="flex-1 min-w-0">
          <div className="bg-card border border-theme rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-input text-primary text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Fecha / Notas</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {filteredCounts.map((c, index) => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-t border-theme hover:bg-input/30 transition-colors"
                    >
                      <td className="p-3 font-mono text-accent font-medium">{c.id}</td>
                      <td className="p-3">
                        <span className="text-secondary text-xs">{c.created_at}</span>
                        {c.notes && <p className="text-primary text-xs mt-0.5 truncate max-w-xs">{c.notes}</p>}
                      </td>
                      <td className="p-3">{statusBadge(c.status)}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleSelect(c.id)} className="p-1.5 rounded-lg text-secondary hover:text-accent hover:bg-accent/10 transition-all" title="Abrir auditoría">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => handleGenerateReport(c.id)} disabled={generatingReport} className="p-1.5 rounded-lg text-secondary hover:text-info hover:bg-info/10 transition-all disabled:opacity-30" title="Generar informe de validación">
                            <FileText size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                  {filteredCounts.length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-secondary">
                      <ClipboardCheck size={32} className="mx-auto mb-2 opacity-30" />
                      No hay auditorías registradas<br />
                      <span className="text-xs">Crea una nueva auditoría para comenzar la validación de stock</span>
                    </td></tr>
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Detail */}
        {selectedCount && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-125 shrink-0"
          >
            <div className="bg-card border border-theme rounded-xl overflow-hidden">
              {/* Detail header */}
              <div className="p-4 border-b border-theme">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-primary">Auditoría #{selectedCount.count.id}</h3>
                    <p className="text-xs text-secondary">{selectedCount.count.created_at}</p>
                    {selectedCount.count.notes && <p className="text-xs text-secondary mt-1">{selectedCount.count.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    {selectedCount.count.status === "en_conteo" && (
                      <PremiumButton variant="ghost" onClick={() => handleMarkReviewed(selectedCount.count.id)} size="sm">
                        <CheckCircle size={14} /> Revisar
                      </PremiumButton>
                    )}
                    <button onClick={() => { setSelectedCount(null); setSummary(null); }} className="p-1 rounded-lg text-secondary hover:text-primary hover:bg-input transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="mt-2">{statusBadge(selectedCount.count.status)}</div>
              </div>

              {/* Summary cards */}
              {summary && (
                <div className="p-4 border-b border-theme">
                  <p className="text-xs font-semibold text-secondary uppercase mb-2">Resumen ejecutivo</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-input rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-primary">{summary.total_products}</p>
                      <p className="text-[10px] text-secondary">Auditados</p>
                    </div>
                    <div className="bg-input rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-success">{summary.correct_count}</p>
                      <p className="text-[10px] text-secondary">Correctos</p>
                    </div>
                    <div className="bg-input rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-danger">{summary.with_deficit}</p>
                      <p className="text-[10px] text-secondary">Faltantes</p>
                    </div>
                    <div className="bg-input rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-warning">{summary.with_surplus}</p>
                      <p className="text-[10px] text-secondary">Sobrantes</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-secondary">Precisión:</span>
                    <span className={`text-sm font-bold ${summary.accuracy_percent >= 95 ? "text-success" : summary.accuracy_percent >= 80 ? "text-warning" : "text-danger"}`}>
                      {summary.accuracy_percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-secondary">
                    <span>Unid. faltantes:</span>
                    <span className="font-medium text-danger">{summary.total_deficit_units.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-secondary">
                    <span>Unid. sobrantes:</span>
                    <span className="font-medium text-warning">{summary.total_surplus_units.toFixed(0)}</span>
                  </div>
                </div>
              )}

              {/* Items table */}
              <div className="overflow-y-auto max-h-125">
                <table className="w-full text-left text-xs">
                  <thead className="bg-input text-secondary uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="p-2">SKU</th>
                      <th className="p-2">Producto</th>
                      <th className="p-2 text-right">Sistema</th>
                      <th className="p-2 text-right">Físico</th>
                      <th className="p-2 text-right">Dif.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCount.items.map((item) => (
                      <tr key={item.id} className="border-t border-theme hover:bg-input/20 transition-colors">
                        <td className="p-2 font-mono text-accent">{item.product_sku}</td>
                        <td className="p-2 text-primary">{item.product_name}</td>
                        <td className="p-2 text-right tabular-nums">{item.theoretical_qty.toFixed(0)}</td>
                        <td className="p-2 text-right">
                          {selectedCount.count.status !== "aplicado" ? (
                            <input
                              type="number"
                              value={item.counted_qty}
                              onChange={(e) => handleQtyChange(item.id, e.target.value)}
                              className="w-16 px-1 py-0.5 bg-input border border-theme rounded text-right text-primary tabular-nums"
                              min="0"
                              step="1"
                            />
                          ) : (
                            <span className="tabular-nums">{item.counted_qty.toFixed(0)}</span>
                          )}
                        </td>
                        <td className={`p-2 text-right font-bold tabular-nums ${item.difference === 0 ? "text-success" : item.difference < 0 ? "text-danger" : "text-warning"}`}>
                          {item.difference > 0 ? "+" : ""}{item.difference.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              {selectedCount.count.status !== "aplicado" && (
                <div className="p-3 border-t border-theme flex gap-2">
                  <PremiumButton onClick={() => handleGenerateReport(selectedCount.count.id)} variant="secondary" size="sm" loading={generatingReport}>
                    <FileText size={14} />
                    {generatingReport ? "Generando..." : "Informe PDF"}
                  </PremiumButton>
                  <PremiumButton onClick={handleApply} variant="danger" size="sm" loading={loading}>
                    <RotateCcw size={14} />
                    Aplicar ajustes
                  </PremiumButton>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* New audit modal */}
      <PremiumModal open={showNewForm} onClose={() => setShowNewForm(false)} title="Nueva Auditoría de Stock" size="md">
        <div className="space-y-4">
          <div className="bg-info/10 border border-info/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <ClipboardCheck size={16} className="text-info mt-0.5 shrink-0" />
              <p className="text-xs text-secondary">
                Se creará una auditoría con todos los productos activos. 
                El sistema tomará una foto del stock actual como referencia teórica.
                Luego deberás ingresar las cantidades físicas contadas.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm text-secondary mb-1">Título / Área (opcional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Bodega principal, Mostrador..."
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm text-secondary mb-1">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              rows={2}
              placeholder="Ej: Auditoría mensual de inventario..."
            />
          </div>

          {error && (
            <div className="p-3 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowNewForm(false)} disabled={loading}>Cancelar</PremiumButton>
            <PremiumButton onClick={handleCreate} loading={loading}>
              {loading ? "Creando..." : "Iniciar auditoría"}
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}