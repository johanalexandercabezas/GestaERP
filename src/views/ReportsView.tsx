import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { showToast } from "../components/ui/PremiumToast";
import { FileBarChart, Download, Search } from "lucide-react";

interface Sale { id: number; user_id: number; total: number; payment_method: string; created_at: string; }
interface SaleItem { id: number; sale_id: number; product_id: number; product_name: string; quantity: number; unit_price: number; total_price: number; }
interface SaleWithItems { sale: Sale; items: SaleItem[]; }
interface Purchase { id: number; user_id: number; supplier_name: string; invoice_number: string; total: number; created_at: string; }
interface PurchaseItem { id: number; purchase_id: number; product_id: number | null; product_name: string; description: string; quantity: number; unit_cost: number; total_cost: number; }
interface PurchaseWithItems { purchase: Purchase; items: PurchaseItem[]; }
interface Product { id: number; sku: string; name: string; price: number; cost: number; stock: number; }

type ReportType = "sales" | "purchases" | "products";

export default function ReportsView() {
  const [reportType, setReportType] = useState<ReportType>("sales");
  const [sales, setSales] = useState<SaleWithItems[]>([]);
  const [purchases, setPurchases] = useState<PurchaseWithItems[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const period = new Date().toISOString().slice(0, 7);

  const loadData = async (type: ReportType) => {
    setLoading(true); setError("");
    try {
      if (type === "sales") setSales(await invoke<SaleWithItems[]>("get_recent_sales"));
      else if (type === "purchases") setPurchases(await invoke<PurchaseWithItems[]>("get_recent_purchases"));
      else setProducts(await invoke<Product[]>("list_products"));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(reportType); }, [reportType]);

  const handleExport = async () => {
    try {
      const msg = await invoke<string>("export_report_to_csv", { reportType, period });
      setExportMsg(msg);
      showToast("Reporte exportado a CSV", "success");
    } catch (e) { setExportMsg(`Error: ${e}`); }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center gap-3 mb-6">
        <FileBarChart size={24} className="text-accent" />
        <h2 className="text-2xl font-bold text-primary">Reportes</h2>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-card border border-theme rounded-xl">
        <div className="flex items-center gap-2">
          <Search size={16} className="text-secondary" />
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="px-4 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent min-w-[200px]"
          >
            <option value="sales">📊 Ventas</option>
            <option value="purchases">📦 Compras</option>
            <option value="products">📋 Inventario (Productos)</option>
          </select>
        </div>
        <button onClick={handleExport}
          className="px-4 py-2 bg-success hover:bg-emerald-600 text-white rounded-lg transition flex items-center gap-2">
          <Download size={16} /> Exportar CSV
        </button>
        <span className="text-xs text-secondary ml-auto">Período: {period}</span>
      </div>

      {exportMsg && !exportMsg.startsWith("Error") && (
        <div className="p-3 mb-4 bg-success/10 border border-success/30 rounded-lg text-success text-sm">{exportMsg}</div>
      )}
      {error && <div className="p-3 mb-4 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm">{error}</div>}
      {loading && <div className="flex items-center justify-center p-12"><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full" /></div>}

      {!loading && reportType === "sales" && (
        <div className="bg-card border border-theme rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-input text-primary uppercase tracking-wider text-xs">
                <tr>
                  <th className="p-3">Venta #</th><th className="p-3">Fecha</th><th className="p-3">Método</th>
                  <th className="p-3">Producto</th><th className="p-3 text-right">Cant.</th><th className="p-3 text-right">Precio</th><th className="p-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-secondary">No hay ventas registradas</td></tr>
                ) : sales.map((s) =>
                  s.items.length === 0 ? (
                    <tr key={s.sale.id} className="border-t border-theme">
                      <td className="p-3">{s.sale.id}</td><td className="p-3">{s.sale.created_at}</td><td className="p-3">{s.sale.payment_method}</td>
                      <td colSpan={4} className="p-3 text-secondary italic">Sin ítems</td>
                    </tr>
                  ) : s.items.map((item, idx) => (
                    <tr key={`${s.sale.id}-${idx}`} className="border-t border-theme hover:bg-input/20">
                      {idx === 0 && (
                        <>
                          <td className="p-3 font-medium" rowSpan={s.items.length}>#{s.sale.id}</td>
                          <td className="p-3 text-secondary" rowSpan={s.items.length}>{s.sale.created_at}</td>
                          <td className="p-3" rowSpan={s.items.length}>{s.sale.payment_method}</td>
                        </>
                      )}
                      <td className="p-3">{item.product_name}</td>
                      <td className="p-3 text-right tabular-nums">{item.quantity}</td>
                      <td className="p-3 text-right tabular-nums">${item.unit_price.toFixed(2)}</td>
                      <td className="p-3 text-right tabular-nums font-medium">${item.total_price.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {sales.length > 0 && (
            <div className="p-3 bg-input border-t border-theme text-right text-sm font-bold">
              Total ventas: ${sales.reduce((sum, s) => sum + s.sale.total, 0).toFixed(2)}
            </div>
          )}
        </div>
      )}

      {!loading && reportType === "purchases" && (
        <div className="bg-card border border-theme rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-input text-primary uppercase tracking-wider text-xs">
                <tr>
                  <th className="p-3">Compra #</th><th className="p-3">Fecha</th><th className="p-3">Proveedor</th><th className="p-3">Factura</th>
                  <th className="p-3">Producto</th><th className="p-3 text-right">Cant.</th><th className="p-3 text-right">Costo U.</th><th className="p-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-secondary">No hay compras registradas</td></tr>
                ) : purchases.map((p) =>
                  p.items.length === 0 ? (
                    <tr key={p.purchase.id} className="border-t border-theme">
                      <td className="p-3">{p.purchase.id}</td><td className="p-3">{p.purchase.created_at}</td>
                      <td className="p-3">{p.purchase.supplier_name}</td><td className="p-3">{p.purchase.invoice_number}</td>
                      <td colSpan={4} className="p-3 text-secondary italic">Sin ítems</td>
                    </tr>
                  ) : p.items.map((item, idx) => (
                    <tr key={`${p.purchase.id}-${idx}`} className="border-t border-theme hover:bg-input/20">
                      {idx === 0 && (
                        <>
                          <td className="p-3 font-medium" rowSpan={p.items.length}>#{p.purchase.id}</td>
                          <td className="p-3 text-secondary" rowSpan={p.items.length}>{p.purchase.created_at}</td>
                          <td className="p-3" rowSpan={p.items.length}>{p.purchase.supplier_name}</td>
                          <td className="p-3" rowSpan={p.items.length}>{p.purchase.invoice_number}</td>
                        </>
                      )}
                      <td className="p-3">{item.product_name}</td>
                      <td className="p-3 text-right tabular-nums">{item.quantity}</td>
                      <td className="p-3 text-right tabular-nums">${item.unit_cost.toFixed(2)}</td>
                      <td className="p-3 text-right tabular-nums font-medium">${item.total_cost.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {purchases.length > 0 && (
            <div className="p-3 bg-input border-t border-theme text-right text-sm font-bold">
              Total compras: ${purchases.reduce((sum, p) => sum + p.purchase.total, 0).toFixed(2)}
            </div>
          )}
        </div>
      )}

      {!loading && reportType === "products" && (
        <div className="bg-card border border-theme rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-input text-primary uppercase tracking-wider text-xs">
                <tr>
                  <th className="p-3">SKU</th><th className="p-3">Nombre</th>
                  <th className="p-3 text-right">Precio</th><th className="p-3 text-right">Costo</th>
                  <th className="p-3 text-right">Stock</th><th className="p-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-secondary">No hay productos registrados</td></tr>
                ) : products.map((p) => (
                  <tr key={p.id} className="border-t border-theme hover:bg-input/20">
                    <td className="p-3 font-mono text-accent">{p.sku}</td>
                    <td className="p-3">{p.name}</td>
                    <td className="p-3 text-right tabular-nums">${p.price.toFixed(2)}</td>
                    <td className="p-3 text-right tabular-nums">${p.cost.toFixed(2)}</td>
                    <td className="p-3 text-right tabular-nums">{p.stock}</td>
                    <td className={`p-3 text-right tabular-nums font-medium ${p.price > p.cost ? "text-success" : "text-danger"}`}>
                      {p.cost > 0 ? ((p.price - p.cost) / p.cost * 100).toFixed(1) + "%" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}