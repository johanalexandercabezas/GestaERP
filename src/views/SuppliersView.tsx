import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumSelect from "../components/ui/PremiumSelect";
import PremiumButton from "../components/ui/PremiumButton";
import { showToast } from "../components/ui/PremiumToast";
import Skeleton from "../components/ui/Skeleton";
import NumericInput from "../components/ui/NumericInput";
import { Building2, Edit3, Trash2, Search } from "lucide-react";
import { toUpper, onlyNumbers } from "../utils/uppercase";

interface Supplier {
  id: number;
  name: string;
  nit: string | null;
  phone: string | null;
  email: string | null;
  doc_type: string | null;
  city: string | null;
  address: string | null;
  payment_method: string | null;
  bank_name: string | null;
  bank_account: string | null;
  iva_responsible: boolean;
  offers_credit: boolean;
  credit_days: number;
  credit_limit: number;
}

const DOC_TYPE_OPTIONS = [
  { value: "CC", label: "CÉDULA DE CIUDADANÍA (CC)" },
  { value: "NIT", label: "NIT" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "EFECTIVO", label: "EFECTIVO" },
  { value: "TRANSFERENCIA", label: "TRANSFERENCIA" },
  { value: "CHEQUE", label: "CHEQUE" },
  { value: "TARJETA", label: "TARJETA DÉBITO/CRÉDITO" },
  { value: "PSE", label: "PSE" },
  { value: "OTRO", label: "OTRO" },
];

const BANKS = [
  "BANCO AGRARIO DE COLOMBIA",
  "BANCO AV VILLAS",
  "BANCO BBVA COLOMBIA",
  "BANCO BOGOTÁ",
  "BANCO COLPATRIA (SCOTIABANK COLPATRIA)",
  "BANCO COOPERATIVO COOPCENTRAL",
  "BANCO CREDIFINANCIERA",
  "BANCO DAVIVIENDA",
  "BANCO DEBANK",
  "BANCO DE OCCIDENTE",
  "BANCO FALABELLA",
  "BANCO FINANDINA",
  "BANCO GNB SUDAMERIS",
  "BANCO ITAÚ CORPBANCA COLOMBIA",
  "BANCO ITAÚ",
  "BANCO LULO BANK",
  "BANCO MULTIBANK",
  "BANCO NEQUI",
  "BANCO PICHINCHA",
  "BANCO POPULAR",
  "BANCO RAPPIPAY",
  "BANCO SERFINANZA",
  "BANCO SANTANDER DE NEGOCIOS",
  "BANCO SATHY",
  "BANCO SOLIDARIO",
  "BANCO UNION",
  "BANCO WISE",
  "BANCO YENPY",
  "BANCOLMBIENTE",
  "CITIBANK COLOMBIA",
  "CONFIAR COOPERATIVA FINANCIERA",
  "COTRAFA",
  "DAVIPLATA",
  "FUNDACIÓN DELAMUJER",
  "MOVII",
  "NUBANK",
  "SKANDIA",
  "TARJETA ÉXITO",
  "TARJETA ORO",
  "VALE",
  "VISA COLOMBIA",
].sort();

export default function SuppliersView() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [nit, setNit] = useState("");
  const [docType, setDocType] = useState("NIT");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("TRANSFERENCIA");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [ivaResponsible, setIvaResponsible] = useState(false);
  const [offersCredit, setOffersCredit] = useState(false);
  const [creditDays, setCreditDays] = useState("0");
  const [creditLimit, setCreditLimit] = useState("0");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadSuppliers = async () => {
    try {
      const data = await invoke<Supplier[]>("list_suppliers");
      setSuppliers(data);
    } catch (e) {
      showToast("Error al cargar proveedores: " + String(e), "error");
    }
  };

  useEffect(() => {
    loadSuppliers().finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setName(""); setNit(""); setPhone(""); setEmail("");
    setDocType("NIT"); setCity(""); setAddress("");
    setPaymentMethod("TRANSFERENCIA"); setBankName(""); setBankAccount("");
    setIvaResponsible(false); setOffersCredit(false);
    setCreditDays("0"); setCreditLimit("0");
    setError(""); setEditing(null);
  };

  const openNew = () => { resetForm(); setShowForm(true); };
  
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setName(s.name); setNit(s.nit || ""); setPhone(s.phone || ""); setEmail(s.email || "");
    setDocType(s.doc_type || "NIT"); setCity(s.city || ""); setAddress(s.address || "");
    setPaymentMethod(s.payment_method || "TRANSFERENCIA");
    setBankName(s.bank_name || ""); setBankAccount(s.bank_account || "");
    setIvaResponsible(s.iva_responsible); setOffersCredit(s.offers_credit);
    setCreditDays(s.credit_days.toString()); setCreditLimit(s.credit_limit.toString());
    setError(""); setShowForm(true);
  };

  const validateForm = () => {
    if (!name.trim()) { setError("NOMBRE ES OBLIGATORIO"); return false; }
    if (!nit.trim()) { setError("NIT ES OBLIGATORIO"); return false; }
    if (!phone.trim()) { setError("TELÉFONO ES OBLIGATORIO"); return false; }
    if (!email.includes("@")) { setError("EMAIL NO VÁLIDO"); return false; }
    return true;
  };

  const save = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setError("");
    const nameUpper = toUpper(name);
    const cityUpper = toUpper(city);
    const addressUpper = toUpper(address);
    const emailUpper = toUpper(email);
    const phoneClean = onlyNumbers(phone);
    const bankAccountClean = onlyNumbers(bankAccount);

    try {
      if (editing) {
        await invoke("update_supplier", {
          id: editing.id,
          name: nameUpper, nit, phone: phoneClean, email: emailUpper,
          docType, city: cityUpper, address: addressUpper,
          paymentMethod, bankAccount: bankAccountClean,
          ivaResponsible, offersCredit,
          creditDays: parseInt(creditDays) || 0,
          creditLimit: parseFloat(creditLimit) || 0,
        });
        showToast("PROVEEDOR ACTUALIZADO", "success");
      } else {
        await invoke("create_supplier", {
          name: nameUpper, nit, phone: phoneClean, email: emailUpper,
          docType, city: cityUpper, address: addressUpper,
          paymentMethod, bankAccount: bankAccountClean,
          ivaResponsible, offersCredit,
          creditDays: parseInt(creditDays) || 0,
          creditLimit: parseFloat(creditLimit) || 0,
        });
        showToast("PROVEEDOR CREADO", "success");
      }
      setShowForm(false);
      resetForm();
      loadSuppliers();
    } catch (e) {
      setError(String(e));
      showToast("ERROR: " + String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await invoke("delete_supplier", { id: deleteConfirm.id });
      showToast("PROVEEDOR ELIMINADO", "success");
      setDeleteConfirm(null);
      loadSuppliers();
    } catch (e) {
      showToast("ERROR AL ELIMINAR: " + String(e), "error");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = suppliers.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.nit?.toLowerCase().includes(search.toLowerCase()) ||
    s.city?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <motion.h2
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold text-primary flex items-center gap-2"
        >
          <Building2 className="text-accent" size={24} />
          PROVEEDORES
          <span className="text-sm font-normal text-secondary ml-2">({filtered.length} REGISTROS)</span>
        </motion.h2>
        <button onClick={openNew} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors font-medium">+ NUEVO PROVEEDOR</button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
        <input
          type="text"
          placeholder="BUSCAR POR NOMBRE, NIT O CIUDAD..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="table-row" />
          ))}
        </div>
      ) : (
        <div className="bg-card border border-theme rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-input text-primary text-sm">
                <tr>
                  <th className="p-3 font-semibold">NOMBRE</th>
                  <th className="p-3 font-semibold">DOCUMENTO</th>
                  <th className="p-3 font-semibold">CIUDAD</th>
                  <th className="p-3 font-semibold">TELÉFONO</th>
                  <th className="p-3 font-semibold">EMAIL</th>
                  <th className="p-3 font-semibold">CRÉDITO</th>
                  <th className="p-3 font-semibold text-right">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filtered.map((s, index) => (
                  <motion.tr
                    key={s.id}
                    className="border-t border-theme hover:bg-input/50 transition-colors"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <td className="p-3 font-medium text-primary">{s.name}</td>
                    <td className="p-3 text-secondary">{s.doc_type} {s.nit}</td>
                    <td className="p-3 text-secondary">{s.city}</td>
                    <td className="p-3 text-secondary">{s.phone || "-"}</td>
                    <td className="p-3 text-secondary">{s.email || "-"}</td>
                    <td className="p-3">
                      {s.offers_credit ? (
                        <span className="text-success font-medium">SÍ ({s.credit_days} DÍAS)</span>
                      ) : (
                        <span className="text-secondary">NO</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-secondary hover:text-accent hover:bg-accent/10 transition-all" title="EDITAR">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => setDeleteConfirm(s)} className="p-1.5 rounded-lg text-secondary hover:text-danger hover:bg-danger/10 transition-all" title="ELIMINAR">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-secondary">
                      <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                      NO HAY PROVEEDORES REGISTRADOS
                      <br />
                      <button onClick={openNew} className="text-accent hover:underline mt-2 inline-block">+ CREAR PRIMER PROVEEDOR</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Modal */}
      <PremiumModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "EDITAR PROVEEDOR" : "NUEVO PROVEEDOR"}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Column 1 */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-secondary mb-1">NOMBRE *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary font-bold uppercase focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="NOMBRE DEL PROVEEDOR"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">TIPO DOCUMENTO</label>
                <PremiumSelect options={DOC_TYPE_OPTIONS} value={docType} onChange={setDocType} placeholder="SELECCIONAR..." />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">NIT *</label>
                <input
                  value={nit}
                  onChange={(e) => setNit(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="900.123.456-7"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">CIUDAD *</label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary uppercase focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="BOGOTÁ"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">DIRECCIÓN *</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary uppercase focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="CR 1 # 2-3"
                />
              </div>
            </div>

            {/* Column 2 */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-secondary mb-1">TELÉFONO *</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(onlyNumbers(e.target.value))}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="3001234567"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">EMAIL *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary uppercase focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="CORREO@EMPRESA.COM"
                />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">MÉTODO DE PAGO</label>
                <PremiumSelect options={PAYMENT_METHOD_OPTIONS} value={paymentMethod} onChange={setPaymentMethod} placeholder="SELECCIONAR..." />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">NOMBRE DEL BANCO</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">SELECCIONAR BANCO...</option>
                  {BANKS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">CUENTA BANCARIA</label>
                <input
                  value={bankAccount}
                  onChange={(e) => setBankAccount(onlyNumbers(e.target.value))}
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="SOLO NÚMEROS"
                />
              </div>
            </div>

            {/* Checkboxes - full width */}
            <div className="col-span-2 space-y-3 pt-2 border-t border-theme">
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3 bg-input rounded-lg cursor-pointer hover:bg-surface transition-colors">
                  <input type="checkbox" checked={ivaResponsible} onChange={(e) => setIvaResponsible(e.target.checked)} className="w-4 h-4 accent-accent" />
                  <span className="text-sm text-primary font-medium">RESPONSABLE DE IVA</span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-input rounded-lg cursor-pointer hover:bg-surface transition-colors">
                  <input type="checkbox" checked={offersCredit} onChange={(e) => setOffersCredit(e.target.checked)} className="w-4 h-4 accent-accent" />
                  <span className="text-sm text-primary font-medium">OTORGA CRÉDITO</span>
                </label>
              </div>

              {offersCredit && (
                <div className="grid grid-cols-2 gap-4 pl-2 border-l-2 border-accent">
                  <NumericInput
                    label="PLAZO (DÍAS)"
                    value={creditDays}
                    onChange={(v) => setCreditDays(v)}
                    min={0}
                    decimals={0}
                  />
                  <NumericInput
                    label="MONTO LÍMITE"
                    value={creditLimit}
                    onChange={(v) => setCreditLimit(v)}
                    prefix="$"
                    min={0}
                  />
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>
              CANCELAR
            </PremiumButton>
            <PremiumButton onClick={save} loading={saving}>
              {editing ? "ACTUALIZAR" : "CREAR PROVEEDOR"}
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>

      {/* Delete Confirmation */}
      <PremiumModal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="ELIMINAR PROVEEDOR"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-primary">
            ¿ESTÁS SEGURO DE ELIMINAR "{deleteConfirm?.name}" ({deleteConfirm?.nit})?
          </p>
          <div className="flex justify-end gap-3">
            <PremiumButton variant="ghost" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
              CANCELAR
            </PremiumButton>
            <PremiumButton variant="danger" onClick={handleDeleteConfirm} loading={deleting}>
              {deleting ? "ELIMINANDO..." : "ELIMINAR"}
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}