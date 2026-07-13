import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, FileText, Send, CheckCircle, XCircle, Clock, Printer, Trash2, ArrowRight } from "lucide-react";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumButton from "../components/ui/PremiumButton";
import { showToast } from "../components/ui/PremiumToast";
import { formatCOP } from "../utils/formatCurrency";

interface QuotationItem {
  product_id?: number;
  product_name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  iva_percent: number;
  discount_percent: number;
}

interface Quotation {
  id: number;
  consecutive: string;
  date: string;
  due_date?: string;
  customer_id: number;
  customer_name: string;
  customer_doc?: string;
  items: string;
  subtotal: number;
  iva_percent: number;
  iva_amount: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
  observations?: string;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  Borrador: { label: "Borrador", color: "bg-gray-100 text-gray-800", icon: FileText },
  Enviada: { label: "Enviada", color: "bg-blue-100 text-blue-800", icon: Send },
  Aprobada: { label: "Aprobada", color: "bg-green-100 text-green-800", icon: CheckCircle },
  Rechazada: { label: "Rechazada", color: "bg-red-100 text-red-800", icon: XCircle },
  Vencida: { label: "Vencida", color: "bg-orange-100 text-orange-800", icon: Clock },
  Convertida: { label: "Convertida", color: "bg-purple-100 text-purple-800", icon: ArrowRight },
};

export default function QuotationsView() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Quotation | null>(null);

  // Form states
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerDoc, setCustomerDoc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [observations, setObservations] = useState("");
  const [items, setItems] = useState<QuotationItem[]>([
    { product_name: "", quantity: 1, unit_price: 0, iva_percent: 19, discount_percent: 0 },
  ]);
  const [subtotal, setSubtotal] = useState(0);
  const [ivaAmount, setIvaAmount] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadQuotations();
  }, [statusFilter]);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const data = await invoke<Quotation[]>("list_quotations", { status_filter: statusFilter || undefined });
      setQuotations(data);
    } catch (e) {
      showToast("Error al cargar cotizaciones: " + String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = (newItems: QuotationItem[]) => {
    const sub = newItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const disc = sub * (newItems[0]?.discount_percent || 0) / 100;
    const iva = (sub - disc) * (newItems[0]?.iva_percent || 0) / 100;
    const tot = sub - disc + iva;
    setSubtotal(sub);
    setDiscountAmount(disc);
    setIvaAmount(iva);
    setTotal(tot);
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
    calculateTotals(newItems);
  };

  const addItem = () => {
    const newItems = [...items, { product_name: "", quantity: 1, unit_price: 0, iva_percent: 19, discount_percent: 0 }];
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    calculateTotals(newItems);
  };

  const openCreate = () => {
    setEditing(null);
    setCustomerId("");
    setCustomerName("");
    setCustomerDoc("");
    setDueDate("");
    setObservations("");
    setItems([{ product_name: "", quantity: 1, unit_price: 0, iva_percent: 19, discount_percent: 0 }]);
    setSubtotal(0);
    setIvaAmount(0);
    setDiscountAmount(0);
    setTotal(0);
    setError("");
    setShowForm(true);
  };

  const openView = (q: Quotation) => {
    setEditing(q);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!customerName.trim() || items.length === 0 || !items[0].product_name.trim()) {
      setError("Cliente y al menos un producto son obligatorios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await invoke("update_quotation_status", { id: editing.id, new_status: editing.status });
        showToast("Cotización actualizada", "success");
      } else {
        await invoke("create_quotation", {
          date: new Date().toISOString(),
          due_date: dueDate || undefined,
          customer_id: parseInt(customerId) || 0,
          customer_name: customerName,
          customer_doc: customerDoc || undefined,
          items,
          subtotal,
          iva_percent: items[0].iva_percent,
          iva_amount: ivaAmount,
          discount_percent: items[0].discount_percent,
          discount_amount: discountAmount,
          total,
          observations: observations || undefined,
          created_by: 1, // TODO: obtener del currentUser
        });
        showToast("Cotización creada", "success");
      }
      setShowForm(false);
      loadQuotations();
    } catch (e) {
      setError(String(e));
      showToast("Error: " + String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeStatus = async (id: number, newStatus: string) => {
    try {
      await invoke("update_quotation_status", { id, new_status: newStatus });
      showToast(`Cotización ${newStatus.toLowerCase()}`, "success");
      loadQuotations();
    } catch (e) {
      showToast("Error: " + String(e), "error");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar cotización?")) return;
    try {
      await invoke("delete_quotation", { id });
      showToast("Cotización eliminada", "success");
      loadQuotations();
    } catch (e) {
      showToast("Error: " + String(e), "error");
    }
  };

  const handleConvertToSale = async (id: number) => {
    try {
      const saleId = await invoke<number>("convert_quotation_to_sale", {
        quotation_id: id,
        payment_method: "cash",
      });
      showToast(`Venta creada (ID: ${saleId})`, "success");
      loadQuotations();
    } catch (e) {
      showToast("Error: " + String(e), "error");
    }
  };

  const filteredQuotations = quotations.filter((q) => {
    if (!search) return true;
    return q.consecutive.toLowerCase().includes(search.toLowerCase()) || q.customer_name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-primary">Cotizaciones</h2>
        <PremiumButton onClick={openCreate}>
          <Plus size={18} className="mr-2" />
          Nueva Cotización
        </PremiumButton>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Buscar por consecutivo o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Todos los estados</option>
          {Object.keys(STATUS_CONFIG).map((status) => (
            <option key={status} value={status}>{STATUS_CONFIG[status].label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-theme rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-secondary">Cargando...</div>
        ) : filteredQuotations.length === 0 ? (
          <div className="p-8 text-center text-secondary">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            No hay cotizaciones
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-input text-primary text-xs uppercase">
              <tr>
                <th className="p-3">Consecutivo</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Cliente</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <AnimatePresence mode="popLayout">
                {filteredQuotations.map((q, index) => {
                  const statusInfo = STATUS_CONFIG[q.status] || STATUS_CONFIG.Borrador;
                  const StatusIcon = statusInfo.icon;
                  return (
                    <motion.tr
                      key={q.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-t border-theme hover:bg-input/30"
                    >
                      <td className="p-3 font-mono text-accent">{q.consecutive}</td>
                      <td className="p-3">{q.date}</td>
                      <td className="p-3">
                        <span className="text-primary font-medium">{q.customer_name}</span>
                        {q.customer_doc && <p className="text-xs text-secondary">{q.customer_doc}</p>}
                      </td>
                      <td className="p-3 text-right font-medium tabular-nums">{formatCOP(q.total)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          <StatusIcon size={12} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openView(q)} className="p-1.5 rounded text-secondary hover:text-accent hover:bg-accent/10">
                            <FileText size={14} />
                          </button>
                          {(q.status === "Borrador" || q.status === "Aprobada") && (
                            <button onClick={() => handleConvertToSale(q.id)} className="p-1.5 rounded text-secondary hover:text-green-500 hover:bg-green-500/10" title="Convertir a Venta">
                              <Printer size={14} />
                            </button>
                          )}
                          {(q.status === "Borrador" || q.status === "Enviada") && (
                            <>
                              <button onClick={() => handleChangeStatus(q.id, "Aprobada")} className="p-1.5 rounded text-secondary hover:text-green-500 hover:bg-green-500/10" title="Aprobar">
                                <CheckCircle size={14} />
                              </button>
                              <button onClick={() => handleChangeStatus(q.id, "Rechazada")} className="p-1.5 rounded text-secondary hover:text-red-500 hover:bg-red-500/10" title="Rechazar">
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                          <button onClick={() => handleDelete(q.id)} className="p-1.5 rounded text-secondary hover:text-danger hover:bg-danger/10" title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Form Modal */}
      <PremiumModal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Ver Cotización" : "Nueva Cotización"} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary mb-1">Cliente *</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={!!editing}
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary disabled:opacity-50" placeholder="Nombre cliente" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Documento</label>
              <input value={customerDoc} onChange={(e) => setCustomerDoc(e.target.value)} disabled={!!editing}
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary disabled:opacity-50" placeholder="CC/NIT" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Vencimiento</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!!editing}
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Estado</label>
              <select value={editing?.status || "Borrador"} onChange={(e) => editing && setEditing({ ...editing, status: e.target.value })}
                disabled={!editing} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary disabled:opacity-50">
                {Object.keys(STATUS_CONFIG).map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="block text-sm text-secondary mb-2">Productos / Servicios</label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <input value={item.product_name} onChange={(e) => updateItem(idx, "product_name", e.target.value)}
                      className="w-full px-2 py-1.5 bg-input border border-theme rounded text-primary text-sm" placeholder="Nombre producto" disabled={!!editing} />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-input border border-theme rounded text-primary text-sm" disabled={!!editing} />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-input border border-theme rounded text-primary text-sm" disabled={!!editing} />
                  </div>
                  <div className="col-span-2">
                    <input type="number" value={item.iva_percent} onChange={(e) => updateItem(idx, "iva_percent", parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-input border border-theme rounded text-primary text-sm" disabled={!!editing} />
                  </div>
                  <div className="col-span-1">
                    <button onClick={() => removeItem(idx)} disabled={!!editing} className="p-1.5 rounded text-secondary hover:text-danger disabled:opacity-30">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!editing && (
                <button onClick={addItem} className="text-sm text-accent hover:underline flex items-center gap-1">
                  <Plus size={14} /> Agregar item
                </button>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-input rounded-lg p-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-secondary">Subtotal</span>
              <span className="text-primary font-medium tabular-nums">{formatCOP(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-secondary">Descuento</span>
                <span className="text-danger font-medium tabular-nums">-{formatCOP(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-secondary">IVA</span>
              <span className="text-primary font-medium tabular-nums">{formatCOP(ivaAmount)}</span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t border-theme">
              <span className="font-bold text-primary">Total</span>
              <span className="font-bold text-primary tabular-nums">{formatCOP(total)}</span>
            </div>
          </div>

          {error && <div className="p-3 bg-danger/10 border border-danger rounded-lg text-danger text-sm">{error}</div>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>Cerrar</PremiumButton>
            {!editing && (
              <PremiumButton onClick={handleSave} loading={saving}>{saving ? "Guardando..." : "Guardar"}</PremiumButton>
            )}
            {editing?.status === "Borrador" && (
              <PremiumButton onClick={() => handleChangeStatus(editing.id, "Enviada")}>
                <Send size={16} className="mr-2" /> Enviar
              </PremiumButton>
            )}
            {editing?.status === "Aprobada" && (
              <PremiumButton onClick={() => handleConvertToSale(editing.id)}>
                <ArrowRight size={16} className="mr-2" /> Convertir a Venta
              </PremiumButton>
            )}
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}