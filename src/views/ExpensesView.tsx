import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import PremiumSelect from "../components/ui/PremiumSelect";

interface Expense {
  id: number;
  user_id: number;
  description: string;
  amount: number;
  category: string;
  payment_method: string;
  supplier_id: number | null;
  supplier_name: string | null;
  created_at: string;
}

interface Supplier {
  id: number;
  name: string;
}

const categories = [
  "Arriendo", "Servicios", "Nómina", "Suministros", "Transporte", "Varios",
];

const CATEGORY_OPTIONS = categories.map(cat => ({ value: cat, label: cat }));

const PAYMENT_METHOD_OPTIONS = [
  { value: "Efectivo", label: "Efectivo" },
  { value: "Transferencia", label: "Transferencia" },
  { value: "Tarjeta", label: "Tarjeta" },
];

export default function ExpensesView({ userId }: { userId: number }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Varios");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState<number | null>(null);

  const loadExpenses = async () => {
    try {
      const data = await invoke<Expense[]>("list_expenses", { supplierId: filterSupplier });
      setExpenses(data);
    } catch (e) { console.error(e); }
  };

  const loadSuppliers = async () => {
    try {
      const data = await invoke<Supplier[]>("list_suppliers");
      setSuppliers(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadExpenses(); loadSuppliers(); }, [filterSupplier]);

  const handleSupplierChange = (id: number | null) => {
    setSelectedSupplierId(id);
    if (id) {
      const supplier = suppliers.find(s => s.id === id);
      setSupplierName(supplier ? supplier.name : "");
    } else {
      setSupplierName("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !amount.trim()) {
      setError("Descripción y monto son obligatorios");
      return;
    }
    setError(""); setSaving(true);
    try {
      await invoke("create_expense", {
        userId,
        description: description.trim(),
        amount,
        category,
        paymentMethod,
        supplierId: selectedSupplierId,
        supplierName: supplierName || null,
      });
      setDescription(""); setAmount(""); setSelectedSupplierId(null); setSupplierName("");
      loadExpenses();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h2 className="text-2xl font-bold mb-6">Gastos</h2>

      {/* Filtro por proveedor */}
      <div className="mb-4 flex gap-4">
        <select
          value={filterSupplier ?? ""}
          onChange={(e) => setFilterSupplier(e.target.value ? Number(e.target.value) : null)}
          className="px-4 py-2 bg-input border border-theme rounded-lg text-primary"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={() => setFilterSupplier(null)}
          className="px-4 py-2 bg-muted hover:bg-gray-600 rounded-lg text-primary"
        >
          Limpiar filtro
        </button>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="bg-card border border-theme rounded-xl p-6 max-w-2xl mb-8">
        <h3 className="text-lg font-semibold mb-4">Registrar nuevo gasto</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm text-secondary mb-1">Descripción *</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="Ej: Pago de arriendo" />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Monto *</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Proveedor / Beneficiario</label>
            <select
              value={selectedSupplierId ?? ""}
              onChange={(e) => handleSupplierChange(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
            >
              <option value="">Seleccionar...</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Nombre (si no está en lista)</label>
            <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="Proveedor X" />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Categoría</label>
            <PremiumSelect
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              placeholder="Seleccionar categoría..."
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Método de pago</label>
            <PremiumSelect
              options={PAYMENT_METHOD_OPTIONS}
              value={paymentMethod}
              onChange={setPaymentMethod}
              placeholder="Seleccionar método..."
              className="w-full"
            />
          </div>
        </div>
        {error && <div className="mt-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm">{error}</div>}
        <button type="submit" disabled={saving} className={`mt-4 px-4 py-2 rounded-lg text-primary transition ${saving ? "bg-gray-600 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"}`}>
          {saving ? "Registrando..." : "Registrar gasto"}
        </button>
      </form>

      {/* Tabla de gastos */}
      <div className="bg-card border border-theme rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-input text-primary text-sm">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Descripción</th>
              <th className="p-3">Proveedor / Beneficiario</th>
              <th className="p-3">Categoría</th>
              <th className="p-3">Método</th>
              <th className="p-3">Monto</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {expenses.map((exp, index) => (
              <motion.tr
                key={exp.id}
                className="border-t border-theme hover:bg-input/50"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <td className="p-3">{exp.created_at}</td>
                <td className="p-3">{exp.description}</td>
                <td className="p-3">{exp.supplier_name || "—"}</td>
                <td className="p-3">{exp.category}</td>
                <td className="p-3">{exp.payment_method}</td>
                <td className="p-3 text-red-400">-${exp.amount.toFixed(2)}</td>
              </motion.tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-secondary">No hay gastos registrados</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}