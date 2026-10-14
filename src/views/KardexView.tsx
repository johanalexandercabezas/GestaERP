import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Download, Calendar, ArrowUp, ArrowDown, FileSpreadsheet } from "lucide-react";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumButton from "../components/ui/PremiumButton";
import { showToast } from "../components/ui/PremiumToast";
import { formatCOP } from "../utils/formatCurrency";

interface InventoryMovement {
  id: number;
  product_id: number;
  product_name: string;
  movement_type: string;
  quantity: number;
  unit_price?: number;
  reason?: string;
  created_at: string;
}

interface KardexEntry {
  date: string;
  document: string;
  movement_type: string;
  user: string;
  entry: number;
  output: number;
  balance: number;
  unit_price?: number;
  reason?: string;
}

export default function KardexView() {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [kardex, setKardex] = useState<KardexEntry[]>([]);
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única al montar; loadMovements se recrea en cada render
  }, []);

  const loadMovements = async () => {
    try {
      const data = await invoke<InventoryMovement[]>("get_inventory_movements", {
        product_id: productId ? parseInt(productId) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setMovements(data);
    } catch (e) {
      showToast("Error al cargar movimientos: " + String(e), "error");
    }
  };

  const loadKardex = async () => {
    if (!productId) {
      showToast("Seleccione un producto", "error");
      return;
    }
    try {
      const data = await invoke<KardexEntry[]>("get_product_kardex", {
        product_id: parseInt(productId),
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setKardex(data);
      const product = movements.find(m => m.product_id === parseInt(productId));
      if (product) setProductName(product.product_name);
    } catch (e) {
      showToast("Error al cargar kardex: " + String(e), "error");
    }
  };

  const handleExportCSV = async () => {
    try {
      const [csv, filename] = await invoke<[string, string]>("export_kardex_csv", {
        product_id: productId ? parseInt(productId) : undefined,
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
      setShowExportModal(false);
    } catch (e) {
      showToast("Error al exportar: " + String(e), "error");
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("es-CO");
  };

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "Compra": return <ArrowUp className="text-green-500" size={16} />;
      case "Venta": return <ArrowDown className="text-red-500" size={16} />;
      default: return <FileSpreadsheet className="text-blue-500" size={16} />;
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-primary">Kardex de Inventario</h2>
        <PremiumButton onClick={() => setShowExportModal(true)}>
          <Download size={18} className="mr-2" />
          Exportar CSV
        </PremiumButton>
      </div>

      {/* Filters */}
      <div className="bg-card border border-theme rounded-xl p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-secondary mb-1">Producto</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary">
              <option value="">Todos los productos</option>
              {movements.length > 0 && Array.from(new Set(movements.map(m => m.product_id))).map(pid => {
                const prod = movements.find(m => m.product_id === pid);
                return (
                  <option key={pid} value={pid}>{prod?.product_name || `Producto ${pid}`}</option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Fecha Inicio</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Fecha Fin</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
          </div>
          <div className="flex items-end gap-2">
            <PremiumButton onClick={loadKardex} disabled={!productId}>
              <Search size={18} className="mr-2" />
              Ver Kardex
            </PremiumButton>
            <PremiumButton variant="ghost" onClick={loadMovements}>
              <Calendar size={18} className="mr-2" />
              Todos
            </PremiumButton>
          </div>
        </div>
      </div>

      {/* Kardex Table */}
      {kardex.length > 0 ? (
        <div className="bg-card border border-theme rounded-xl overflow-hidden">
          <div className="p-4 bg-input border-b border-theme">
            <h3 className="text-lg font-semibold text-primary">
              Kardex: {productName || `Producto ${productId}`}
            </h3>
            <p className="text-sm text-secondary">Saldo inicial: <span className="font-bold text-primary">{kardex[0]?.balance.toFixed(2)}</span></p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-input text-primary text-xs uppercase">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Documento</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Usuario</th>
                <th className="p-3 text-right">Entrada</th>
                <th className="p-3 text-right">Salida</th>
                <th className="p-3 text-right">Saldo</th>
                <th className="p-3">Precio Unit.</th>
                <th className="p-3">Motivo</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <AnimatePresence mode="popLayout">
                {kardex.map((entry, index) => (
                  <motion.tr
                    key={index}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: index * 0.02 }}
                    className="border-t border-theme hover:bg-input/30"
                  >
                    <td className="p-3">{formatDate(entry.date)}</td>
                    <td className="p-3 font-mono text-xs">{entry.document}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {getMovementIcon(entry.movement_type)}
                        <span className="text-xs">{entry.movement_type}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs">{entry.user}</td>
                    <td className="p-3 text-right text-green-600 font-medium tabular-nums">
                      {entry.entry > 0 ? entry.entry.toFixed(2) : "—"}
                    </td>
                    <td className="p-3 text-right text-red-600 font-medium tabular-nums">
                      {entry.output > 0 ? entry.output.toFixed(2) : "—"}
                    </td>
                    <td className="p-3 text-right font-bold tabular-nums">{entry.balance.toFixed(2)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {entry.unit_price ? formatCOP(entry.unit_price) : "—"}
                    </td>
                    <td className="p-3 text-xs text-secondary">{entry.reason || "—"}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-card border border-theme rounded-xl p-8 text-center">
          <FileSpreadsheet size={48} className="mx-auto mb-3 opacity-20 text-secondary" />
          <p className="text-secondary">Selecciona un producto para ver el kardex</p>
        </div>
      )}

      {/* Recent Movements */}
      {kardex.length === 0 && movements.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Movimientos Recientes</h3>
          <div className="bg-card border border-theme rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-input text-primary text-xs uppercase">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3 text-right">Cantidad</th>
                  <th className="p-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 20).map((m, index) => (
                  <motion.tr
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="border-t border-theme hover:bg-input/30"
                  >
                    <td className="p-3">{formatDate(m.created_at)}</td>
                    <td className="p-3 font-medium">{m.product_name}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {getMovementIcon(m.movement_type)}
                        <span className="text-xs">{m.movement_type}</span>
                      </div>
                    </td>
                    <td className={`p-3 text-right font-medium tabular-nums ${m.movement_type === 'Venta' ? 'text-red-600' : 'text-green-600'}`}>
                      {m.movement_type === 'Venta' ? '-' : ''}{m.quantity.toFixed(2)}
                    </td>
                    <td className="p-3 text-xs text-secondary">{m.reason || "—"}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export Modal */}
      <PremiumModal open={showExportModal} onClose={() => setShowExportModal(false)} title="Exportar Kardex a CSV" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-secondary mb-1">Producto (opcional)</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary">
              <option value="">Todos los productos</option>
              {movements.length > 0 && Array.from(new Set(movements.map(m => m.product_id))).map(pid => {
                const prod = movements.find(m => m.product_id === pid);
                return (
                  <option key={pid} value={pid}>{prod?.product_name || `Producto ${pid}`}</option>
                );
              })}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary mb-1">Fecha Inicio</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Fecha Fin</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
            </div>
          </div>
          <div className="bg-input rounded-lg p-3">
            <p className="text-sm text-secondary">Se exportarán los movimientos de inventario en formato CSV con:</p>
            <ul className="text-xs text-secondary mt-1 space-y-0.5">
              <li>• Fecha, Producto, Tipo de movimiento</li>
              <li>• Cantidad, Precio unitario, Motivo</li>
            </ul>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowExportModal(false)}>Cancelar</PremiumButton>
            <PremiumButton onClick={handleExportCSV}>
              <Download size={16} className="mr-2" />
              Exportar CSV
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}