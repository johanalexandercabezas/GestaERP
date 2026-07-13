import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

interface Customer {
  id: number;
  name: string;
  doc_type: string | null;
  doc_number: string | null;
  phone: string | null;
  email: string | null;
}

export default function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [docType, setDocType] = useState("CC");
  const [docNumber, setDocNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadCustomers = async () => {
    try {
      const data = await invoke<Customer[]>("list_customers");
      setCustomers(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadCustomers().finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setName("");
    setDocType("CC");
    setDocNumber("");
    setPhone("");
    setEmail("");
    setError("");
    setEditing(null);
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setName(c.name);
    setDocType(c.doc_type || "CC");
    setDocNumber(c.doc_number || "");
    setPhone(c.phone || "");
    setEmail(c.email || "");
    setError("");
    setShowForm(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setError("");
    try {
      if (editing) {
        await invoke("update_customer", {
          id: editing.id,
          name,
          docType,
          docNumber: docNumber || null,
          phone: phone || null,
          email: email || null,
        });
      } else {
        await invoke("create_customer", {
          name,
          docType,
          docNumber: docNumber || null,
          phone: phone || null,
          email: email || null,
        });
      }
      setShowForm(false);
      resetForm();
      loadCustomers();
    } catch (e) {
      setError(String(e));
    }
  };

  const deleteCustomer = async (id: number) => {
    if (confirm("¿Eliminar este cliente?")) {
      await invoke("delete_customer", { id });
      loadCustomers();
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Clientes</h2>
        <button
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-primary px-4 py-2 rounded-lg transition"
        >
          + Nuevo cliente
        </button>
      </div>

      <div className="bg-card border border-theme rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-input text-primary text-sm">
            <tr>
              <th className="p-3">Nombre</th>
              <th className="p-3">Documento</th>
              <th className="p-3">Teléfono</th>
              <th className="p-3">Email</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {customers.map((c, index) => (
              <motion.tr
                key={c.id}
                className="border-t border-theme hover:bg-input/50"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <td className="p-3">{c.name}</td>
                <td className="p-3">
                  {c.doc_type} {c.doc_number}
                </td>
                <td className="p-3">{c.phone || "-"}</td>
                <td className="p-3">{c.email || "-"}</td>
                <td className="p-3 space-x-2">
                  <button
                    onClick={() => openEdit(c)}
                    className="text-accent hover:underline text-sm"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deleteCustomer(c.id)}
                    className="text-danger hover:underline text-sm"
                  >
                    Eliminar
                  </button>
                </td>
              </motion.tr>
            ))}
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-secondary">
                  Cargando clientes...
                </td>
              </tr>
            ) : customers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-secondary">
                  No hay clientes registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-theme rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              {editing ? "Editar cliente" : "Nuevo cliente"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-secondary">Nombre *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
                />
              </div>
              <div className="flex gap-3">
                <div className="w-1/3">
                  <label className="block text-sm text-secondary">Tipo Doc.</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
                  >
                    <option value="CC">CC</option>
                    <option value="NIT">NIT</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-secondary">Número Doc.</label>
                  <input
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-secondary">Teléfono</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
                />
              </div>
              {error && (
                <div className="p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm">
                  {error}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-muted hover:bg-gray-600 rounded-lg text-primary"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-primary"
              >
                {editing ? "Actualizar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}