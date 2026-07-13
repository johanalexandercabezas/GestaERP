import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

interface Receivable {
  id: number;
  customer_id: number;
  customer_name: string;
  sale_id: number;
  total: number;
  paid: number;
  status: string;
  created_at: string;
}

export default function ReceivablesView() {
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [selected, setSelected] = useState<Receivable | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await invoke<Receivable[]>("list_receivables");
      setReceivables(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { load(); }, []);

  const handlePayment = async () => {
    if (!selected || !amount.trim()) {
      setError("Seleccione una cuenta y un monto");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await invoke("register_payment", {
        receivableId: selected.id,
        amount: amount,
        paymentMethod: paymentMethod,
      });
      setAmount("");
      setSelected(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h2 className="text-2xl font-bold mb-6">Cuentas por Cobrar</h2>

      <div className="bg-card border border-theme rounded-xl overflow-hidden mb-8">
        <table className="w-full text-left">
          <thead className="bg-input text-primary text-sm">
            <tr>
              <th className="p-3">Cliente</th>
              <th className="p-3">Venta #</th>
              <th className="p-3">Total</th>
              <th className="p-3">Pagado</th>
              <th className="p-3">Saldo</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Acción</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {receivables.map((r, index) => (
              <motion.tr
                key={r.id}
                className="border-t border-theme hover:bg-input/50"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <td className="p-3">{r.customer_name}</td>
                <td className="p-3">#{r.sale_id}</td>
                <td className="p-3">${r.total.toFixed(2)}</td>
                <td className="p-3 text-green-400">${r.paid.toFixed(2)}</td>
                <td className={`p-3 font-bold ${r.total - r.paid > 0 ? "text-red-400" : "text-green-400"}`}>
                  ${(r.total - r.paid).toFixed(2)}
                </td>
                <td className="p-3">
                  {r.status === "paid" ? "✅ Pagada" : "⏳ Pendiente"}
                </td>
                <td className="p-3">{r.created_at}</td>
                <td className="p-3">
                  {r.status === "pending" && (
                    <button
                      onClick={() => setSelected(r)}
                      className="text-accent hover:underline text-sm"
                    >
                      Abonar
                    </button>
                  )}
                </td>
              </motion.tr>
            ))}
            {receivables.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-secondary">
                  No hay cuentas por cobrar
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-theme rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              Abonar a {selected.customer_name}
            </h3>
            <p className="text-secondary mb-2">
              Venta #{selected.sale_id} · Total: ${selected.total.toFixed(2)} · Saldo pendiente:{" "}
              <span className="text-red-400 font-bold">
                ${(selected.total - selected.paid).toFixed(2)}
              </span>
            </p>
            <div className="space-y-3 mt-4">
              <div>
                <label className="block text-sm text-secondary mb-1">Monto *</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">Método de pago</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Tarjeta">Tarjeta</option>
                </select>
              </div>
              {error && (
                <div className="p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm">
                  {error}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setSelected(null); setError(""); }}
                className="px-4 py-2 bg-muted hover:bg-gray-600 rounded-lg text-primary"
              >
                Cancelar
              </button>
              <button
                onClick={handlePayment}
                disabled={saving}
                className={`px-4 py-2 rounded-lg text-primary transition ${
                  saving ? "bg-gray-600 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {saving ? "Registrando..." : "Registrar abono"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}