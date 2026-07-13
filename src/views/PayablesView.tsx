import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, DollarSign, AlertTriangle, CheckCircle, Clock, XCircle, Eye } from "lucide-react";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumButton from "../components/ui/PremiumButton";
import { showToast } from "../components/ui/PremiumToast";
import { formatCOP } from "../utils/formatCurrency";

interface Payable {
  id: number;
  supplier_id: number;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: string;
  observations?: string;
  created_at: string;
}

interface PayablePayment {
  id: number;
  payable_id: number;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference?: string;
  observations?: string;
}

interface PayablesSummary {
  total_pending: number;
  total_partial: number;
  total_paid: number;
  total_overdue: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  Pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  Parcial: { label: "Parcial", color: "bg-blue-100 text-blue-800", icon: AlertTriangle },
  Pagada: { label: "Pagada", color: "bg-green-100 text-green-800", icon: CheckCircle },
  Vencida: { label: "Vencida", color: "bg-red-100 text-red-800", icon: XCircle },
};

export default function PayablesView() {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [summary, setSummary] = useState<PayablesSummary | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState<Payable | null>(null);
  const [payments, setPayments] = useState<PayablePayment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form states
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [observations, setObservations] = useState("");

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [paymentReference, setPaymentReference] = useState("");

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const loadData = async () => {
    try {
      const [payablesData, summaryData] = await Promise.all([
        invoke<Payable[]>("list_payables", { status_filter: statusFilter || undefined, supplier_id: undefined }),
        invoke<PayablesSummary>("get_payables_summary").catch(() => null),
      ]);
      setPayables(payablesData);
      if (summaryData) setSummary(summaryData);
    } catch (e) {
      showToast("Error al cargar cuentas por pagar: " + String(e), "error");
    }
  };

  const openCreate = () => {
    setSupplierId("");
    setSupplierName("");
    setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate("");
    setTotalAmount("");
    setObservations("");
    setError("");
    setShowForm(true);
  };

  const handleCreate = async () => {
    if (!supplierName.trim() || !invoiceNumber.trim() || !totalAmount || !dueDate) {
      setError("Proveedor, número factura, monto y fecha vencimiento son obligatorios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await invoke("create_payable", {
        supplier_id: parseInt(supplierId) || 0,
        supplier_name: supplierName,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate,
        total_amount: parseFloat(totalAmount) || 0,
        observations: observations || undefined,
        created_by: 1,
      });
      showToast("Cuenta por pagar creada", "success");
      setShowForm(false);
      loadData();
    } catch (e) {
      setError(String(e));
      showToast("Error: " + String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const openPayModal = (payable: Payable) => {
    setSelectedPayable(payable);
    setPaymentAmount(payable.balance.toFixed(2));
    setPaymentMethod("Efectivo");
    setPaymentReference("");
    setShowPayModal(true);
    loadPayments(payable.id);
  };

  const handleRegisterPayment = async () => {
    if (!selectedPayable || !paymentAmount) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Monto inválido");
      return;
    }
    if (amount > selectedPayable.balance) {
      setError("El monto no puede ser mayor al saldo");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await invoke("register_payable_payment", {
        payable_id: selectedPayable.id,
        amount,
        payment_method: paymentMethod,
        reference: paymentReference || undefined,
        observations: undefined,
        created_by: 1,
      });
      showToast("Pago registrado", "success");
      setPaymentAmount((selectedPayable.balance - amount).toFixed(2));
      loadPayments(selectedPayable.id);
      loadData();
    } catch (e) {
      setError(String(e));
      showToast("Error: " + String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const loadPayments = async (payableId: number) => {
    try {
      const data = await invoke<PayablePayment[]>("list_payable_payments", { payable_id: payableId });
      setPayments(data);
    } catch (e) {
      console.error("Error loading payments:", e);
    }
  };

  const filteredPayables = payables.filter((p) => {
    if (!search) return true;
    return p.invoice_number.toLowerCase().includes(search.toLowerCase()) || p.supplier_name.toLowerCase().includes(search.toLowerCase());
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("es-CO");
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-primary">Cuentas por Pagar</h2>
        <PremiumButton onClick={openCreate}>
          <Plus size={18} className="mr-2" />
          Nueva Cuenta
        </PremiumButton>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-theme rounded-xl p-4">
            <p className="text-xs text-secondary mb-1">Pendiente</p>
            <p className="text-xl font-bold text-warning tabular-nums">{formatCOP(summary.total_pending)}</p>
          </div>
          <div className="bg-card border border-theme rounded-xl p-4">
            <p className="text-xs text-secondary mb-1">Parcial</p>
            <p className="text-xl font-bold text-info tabular-nums">{formatCOP(summary.total_partial)}</p>
          </div>
          <div className="bg-card border border-theme rounded-xl p-4">
            <p className="text-xs text-secondary mb-1">Pagado</p>
            <p className="text-xl font-bold text-success tabular-nums">{formatCOP(summary.total_paid)}</p>
          </div>
          <div className="bg-card border border-theme rounded-xl p-4">
            <p className="text-xs text-secondary mb-1">Vencido</p>
            <p className="text-xl font-bold text-danger tabular-nums">{formatCOP(summary.total_overdue)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Buscar por factura o proveedor..."
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
        {filteredPayables.length === 0 ? (
          <div className="p-8 text-center text-secondary">
            <DollarSign size={32} className="mx-auto mb-2 opacity-30" />
            No hay cuentas por pagar
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-input text-primary text-xs uppercase">
              <tr>
                <th className="p-3">Factura</th>
                <th className="p-3">Proveedor</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Vencimiento</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <AnimatePresence mode="popLayout">
                {filteredPayables.map((p, index) => {
                  const statusInfo = STATUS_CONFIG[p.status] || STATUS_CONFIG.Pendiente;
                  const StatusIcon = statusInfo.icon;
                  return (
                    <motion.tr
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-t border-theme hover:bg-input/30"
                    >
                      <td className="p-3 font-mono text-accent">{p.invoice_number}</td>
                      <td className="p-3">
                        <span className="text-primary font-medium">{p.supplier_name}</span>
                      </td>
                      <td className="p-3">{formatDate(p.invoice_date)}</td>
                      <td className="p-3">{formatDate(p.due_date)}</td>
                      <td className="p-3 text-right tabular-nums">{formatCOP(p.total_amount)}</td>
                      <td className="p-3 text-right font-medium tabular-nums">{formatCOP(p.balance)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          <StatusIcon size={12} />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setSelectedPayable(p); loadPayments(p.id); setShowPayModal(true); }} className="p-1.5 rounded text-secondary hover:text-accent hover:bg-accent/10">
                            <Eye size={14} />
                          </button>
                          {p.status !== "Pagada" && (
                            <button onClick={() => openPayModal(p)} className="p-1.5 rounded text-secondary hover:text-green-500 hover:bg-green-500/10" title="Registrar pago">
                              <DollarSign size={14} />
                            </button>
                          )}
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

      {/* Create Modal */}
      <PremiumModal open={showForm} onClose={() => setShowForm(false)} title="Nueva Cuenta por Pagar" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary mb-1">Proveedor *</label>
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="Nombre proveedor" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Número Factura *</label>
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="FAC-001" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Fecha Factura *</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Fecha Vencimiento *</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Monto Total *</label>
              <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Observaciones</label>
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={2} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
          </div>
          {error && <div className="p-3 bg-danger/10 border border-danger rounded-lg text-danger text-sm">{error}</div>}
          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</PremiumButton>
            <PremiumButton onClick={handleCreate} loading={saving}>{saving ? "Guardando..." : "Crear"}</PremiumButton>
          </div>
        </div>
      </PremiumModal>

      {/* Payment Modal */}
      <PremiumModal open={showPayModal} onClose={() => setShowPayModal(false)} title="Registrar Pago" size="sm">
        <div className="space-y-4">
          {selectedPayable && (
            <>
              <div className="bg-input rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Factura:</span>
                  <span className="text-primary font-medium">{selectedPayable.invoice_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Proveedor:</span>
                  <span className="text-primary font-medium">{selectedPayable.supplier_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Total:</span>
                  <span className="text-primary font-medium tabular-nums">{formatCOP(selectedPayable.total_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Saldo:</span>
                  <span className="text-danger font-bold tabular-nums">{formatCOP(selectedPayable.balance)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-secondary mb-1">Monto *</label>
                  <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
                </div>
                <div>
                  <label className="block text-sm text-secondary mb-1">Método</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary">
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Tarjeta">Tarjeta</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">Referencia</label>
                <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="Nº transferencia, etc." />
              </div>
              {payments.length > 0 && (
                <div>
                  <label className="block text-sm text-secondary mb-2">Historial de pagos</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {payments.map((pmt) => (
                      <div key={pmt.id} className="bg-input rounded-lg p-3 flex justify-between items-center text-sm">
                        <div>
                          <span className="text-primary font-medium">{formatCOP(pmt.amount)}</span>
                          <span className="text-xs text-secondary ml-2">{pmt.payment_method}</span>
                        </div>
                        <span className="text-xs text-secondary">{new Date(pmt.payment_date).toLocaleDateString("es-CO")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {error && <div className="p-3 bg-danger/10 border border-danger rounded-lg text-danger text-sm">{error}</div>}
              <div className="flex justify-end gap-3 pt-2 border-t border-theme">
                <PremiumButton variant="ghost" onClick={() => setShowPayModal(false)} disabled={saving}>Cancelar</PremiumButton>
                <PremiumButton onClick={handleRegisterPayment} loading={saving}>{saving ? "Registrando..." : "Registrar Pago"}</PremiumButton>
              </div>
            </>
          )}
        </div>
      </PremiumModal>
    </div>
  );
}