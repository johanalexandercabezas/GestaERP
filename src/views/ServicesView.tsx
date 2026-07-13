import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumButton from "../components/ui/PremiumButton";
import { showToast } from "../components/ui/PremiumToast";
import Skeleton from "../components/ui/Skeleton";
import NumericInput from "../components/ui/NumericInput";
import { formatCOP } from "../utils/formatCurrency";
import { Wrench, Search, Plus, Edit3, EyeOff, ToggleRight, ShoppingCart, Trash2, CreditCard, X, User } from "lucide-react";

interface Service {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  max_stock: number;
  iva_percent: number;
  active: boolean;
  unit: string;
}

interface CartItem {
  serviceId: number;
  sku: string;
  name: string;
  price: number;
  iva_percent: number;
  quantity: number;
}

interface Customer {
  id: number;
  name: string;
}

const PAYMENT_METHODS = [
  { value: "Efectivo", label: "Efectivo" },
  { value: "Tarjeta", label: "Tarjeta" },
  { value: "Transferencia", label: "Transferencia" },
  { value: "Crédito", label: "Crédito" },
];

export default function ServicesView() {
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [tab, setTab] = useState<"catalog" | "billing">("catalog");
  const ITEMS_PER_PAGE = 15;

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("0");
  const [price, setPrice] = useState("0");
  const [ivaPercent, setIvaPercent] = useState("0");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Billing state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [billingSearch, setBillingSearch] = useState("");
  const [activeServices, setActiveServices] = useState<Service[]>([]);
  const [discountPercent, setDiscountPercent] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustDoc, setNewCustDoc] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");

  const filtered = services.filter(
    s => s.name.toLowerCase().includes(search.toLowerCase()) ||
         s.sku.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const billingFiltered = activeServices.filter(
    s => s.name.toLowerCase().includes(billingSearch.toLowerCase()) ||
         s.sku.toLowerCase().includes(billingSearch.toLowerCase())
  );

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = subtotal * (parseFloat(discountPercent) || 0) / 100;
  const total = Math.max(0, subtotal - discountAmount);
  const ivaTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity * item.iva_percent / 100), 0);

  useEffect(() => { setCurrentPage(1); }, [search]);

  const loadServices = async () => {
    try {
      const data = await invoke<Service[]>("list_services");
      setServices(data);
    } catch (e) {
      showToast("Error al cargar servicios: " + String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const loadActiveServices = async () => {
    try {
      const data = await invoke<Service[]>("list_active_services");
      setActiveServices(data);
    } catch (e) {
      showToast("Error al cargar servicios activos: " + String(e), "error");
    }
  };

  const loadCustomers = async () => {
    try {
      const data = await invoke<{ id: number; name: string }[]>("list_customers");
      setCustomers(data);
    } catch (e) {
      console.error("Error cargando clientes:", e);
    }
  };

  useEffect(() => {
    loadServices();
    loadActiveServices();
    loadCustomers();
  }, []);

  const resetForm = () => {
    setName(""); setDescription(""); setCost("0"); setPrice("0");
    setIvaPercent("0"); setFormError(""); setEditing(null);
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (s: Service) => {
    setEditing(s);
    setName(s.name); setDescription(s.description || "");
    setCost(s.cost.toString()); setPrice(s.price.toString());
    setIvaPercent(s.iva_percent.toString());
    setShowForm(true);
  };

  const saveService = async () => {
    if (!name.trim()) { setFormError("El nombre del servicio es obligatorio"); return; }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) { setFormError("El precio de venta debe ser mayor a cero"); return; }
    setFormError(""); setSaving(true);
    try {
      if (editing) {
        await invoke("update_service", {
          id: editing.id, sku: editing.sku, name: name.trim().toUpperCase(),
          description: description.trim() || null,
          price: String(parsedPrice), ivaPercent: String(parseFloat(ivaPercent) || 0),
          active: editing.active,
        });
        showToast("Servicio actualizado", "success");
      } else {
        await invoke("create_product", {
          sku: `SERV-${Date.now().toString(36).toUpperCase()}`,
          name: name.trim().toUpperCase(),
          description: description.trim() || null,
          price: String(parsedPrice),
          cost: String(parseFloat(cost) || 0),
          stock: "0", minStock: "0", maxStock: "0",
          ivaPercent: String(parseFloat(ivaPercent) || 0),
          unit: "SERVICIO",
        });
        showToast("Servicio creado correctamente", "success");
      }
      setShowForm(false);
      resetForm();
      loadServices();
      loadActiveServices();
    } catch (e) {
      setFormError(String(e));
      showToast("Error al guardar: " + String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: Service) => {
    try {
      await invoke("update_service", {
        id: s.id, sku: s.sku, name: s.name,
        description: s.description,
        price: String(s.price), ivaPercent: String(s.iva_percent),
        active: !s.active,
      });
      showToast(s.active ? "Servicio inhabilitado" : "Servicio habilitado", "success");
      loadServices();
      loadActiveServices();
    } catch (e) {
      showToast("Error: " + String(e), "error");
    }
  };

  const addToCart = (service: Service) => {
    setCart(prev => {
      const exists = prev.find(item => item.serviceId === service.id);
      if (exists) {
        return prev.map(item =>
          item.serviceId === service.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, {
        serviceId: service.id, sku: service.sku, name: service.name,
        price: service.price, iva_percent: service.iva_percent, quantity: 1,
      }];
    });
  };

  const updateQuantity = (serviceId: number, qty: number) => {
    if (qty <= 0) { setCart(prev => prev.filter(item => item.serviceId !== serviceId)); return; }
    setCart(prev => prev.map(item => item.serviceId === serviceId ? { ...item, quantity: qty } : item));
  };

  const removeFromCart = (serviceId: number) => {
    setCart(prev => prev.filter(item => item.serviceId !== serviceId));
  };

  const quickCreateCustomer = async () => {
    if (!newCustName.trim()) { showToast("Nombre del cliente obligatorio", "error"); return; }
    try {
      const id = await invoke<number>("create_customer", {
        name: newCustName.trim().toUpperCase(), docType: "CC",
        docNumber: newCustDoc.trim() || "000",
        phone: newCustPhone.trim() || null, email: newCustEmail.trim() || null,
        city: null, address: null,
      });
      setCustomerId(id);
      setCustomerName(newCustName.trim().toUpperCase());
      setShowCustomerModal(false);
      setNewCustName(""); setNewCustDoc(""); setNewCustPhone(""); setNewCustEmail("");
      loadCustomers();
      showToast("Cliente creado", "success");
    } catch (e) {
      showToast("Error al crear cliente: " + String(e), "error");
    }
  };

  const handleCheckout = () => {
    if (cart.length === 0) { showToast("Agregue al menos un servicio", "error"); return; }
    if (paymentMethod === "Crédito" && !customerId) { showToast("Seleccione un cliente para crédito", "error"); return; }
    setShowPaymentModal(true);
  };

  const confirmSale = async () => {
    setProcessing(true);
    try {
      const saleId = await invoke<number>("create_sale_v2", {
        paymentMethod,
        items: cart.map(item => ({ product_id: item.serviceId, quantity: item.quantity })),
        customerId: paymentMethod === "Crédito" ? customerId : null,
        customerName: paymentMethod === "Crédito" ? customerName : null,
        discountPercent: parseFloat(discountPercent) || 0,
      });

      const ticketItems = cart.map(item => ({
        name: item.name, quantity: item.quantity,
        unit_price: item.price, subtotal: item.price * item.quantity,
      }));
      await invoke<string>("print_ticket", {
        businessName: "GestaERP", items: ticketItems, total, paymentMethod,
        cashReceived: null, change: null,
      });

      showToast(`Factura #${saleId} generada correctamente`, "success");
      setCart([]); setDiscountPercent("0"); setShowPaymentModal(false);
      setCustomerId(null); setCustomerName("");
      loadServices(); loadActiveServices();
    } catch (e) {
      showToast("Error al facturar: " + String(e), "error");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <motion.h2 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
        className="text-2xl font-bold text-primary flex items-center gap-2 mb-6">
        <Wrench className="text-accent" size={24} />
        Servicios
      </motion.h2>

      <div className="flex gap-1 mb-6 bg-input rounded-lg p-1 w-fit border border-theme">
        <button onClick={() => setTab("catalog")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "catalog" ? "bg-accent text-white shadow-sm" : "text-secondary hover:text-primary"}`}>
          📋 Catálogo
        </button>
        <button onClick={() => { setTab("billing"); loadActiveServices(); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "billing" ? "bg-accent text-white shadow-sm" : "text-secondary hover:text-primary"}`}>
          🧾 Facturar
        </button>
      </div>

      {tab === "catalog" && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative max-w-md flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input type="text" placeholder="Buscar servicio por nombre o SKU..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <button onClick={openNew}
              className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg transition-colors flex items-center gap-2">
              <Plus size={16} /> Nuevo servicio
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="table-row" />)}</div>
          ) : (
            <div className="bg-card border border-theme rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-input text-primary">
                    <tr>
                      <th className="p-3">SKU</th><th className="p-3">Servicio</th>
                      <th className="p-3 text-right">Costo</th><th className="p-3 text-right">Precio</th>
                      <th className="p-3 text-right">IVA</th><th className="p-3 text-center">Estado</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {paginated.map((s, index) => (
                        <motion.tr key={s.id} layout initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          transition={{ delay: index * 0.02 }}
                          className={`border-t border-theme hover:bg-input/30 transition-colors ${!s.active ? "opacity-50" : ""}`}>
                          <td className="p-3 font-mono text-accent">{s.sku}</td>
                          <td className="p-3">
                            <span className={s.active ? "text-primary font-medium" : "text-secondary line-through"}>{s.name}</span>
                            {s.description && <p className="text-xs text-secondary mt-0.5 truncate max-w-[200px]">{s.description}</p>}
                          </td>
                          <td className="p-3 text-right tabular-nums text-secondary">{formatCOP(s.cost)}</td>
                          <td className="p-3 text-right tabular-nums">{formatCOP(s.price)}</td>
                          <td className="p-3 text-right tabular-nums">{s.iva_percent}%</td>
                          <td className="p-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${s.active ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                              {s.active ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {s.active && (
                                <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-secondary hover:text-accent hover:bg-accent/10" title="Editar"><Edit3 size={14} /></button>
                              )}
                              <button onClick={() => toggleActive(s)}
                                className={`p-1.5 rounded-lg ${s.active ? "text-secondary hover:text-danger hover:bg-danger/10" : "text-success hover:bg-success/10"}`}
                                title={s.active ? "Inhabilitar" : "Habilitar"}>
                                {s.active ? <EyeOff size={14} /> : <ToggleRight size={14} />}
                              </button>
                              {s.active && (
                                <button onClick={() => { addToCart(s); setTab("billing"); }}
                                  className="p-1.5 rounded-lg text-secondary hover:text-accent hover:bg-accent/10" title="Facturar"><ShoppingCart size={14} /></button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-secondary">
                        <Wrench size={32} className="mx-auto mb-2 opacity-30" />No hay servicios registrados
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-secondary">
              <span>Página {currentPage} de {totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
                  className="px-3 py-1 rounded-lg border border-theme hover:bg-input disabled:opacity-30">Anterior</button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                  const page = start + i;
                  if (page > totalPages) return null;
                  return (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded-lg border transition-colors ${currentPage === page ? "bg-accent text-white border-accent" : "border-theme hover:bg-input"}`}>{page}</button>
                  );
                })}
                <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}
                  className="px-3 py-1 rounded-lg border border-theme hover:bg-input disabled:opacity-30">Siguiente</button>
              </div>
            </div>
          )}

          <PremiumModal open={showForm} onClose={() => setShowForm(false)}
            title={editing ? "Editar servicio" : "Nuevo servicio"} size="lg">
            <div className="space-y-4">
              {!editing && (
                <div className="p-3 bg-accent/10 border border-accent rounded-lg text-sm text-accent">
                  El SKU se generará automáticamente al guardar.
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm text-secondary mb-1">Nombre del servicio *</label>
                  <input value={name} onChange={e => setName(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary font-bold uppercase focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="NOMBRE DEL SERVICIO" disabled={saving} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-secondary mb-1">Descripción</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value.toUpperCase())}
                    rows={2} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary uppercase focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="DESCRIPCIÓN DEL SERVICIO (OPCIONAL)" disabled={saving} />
                </div>
                <NumericInput label="Costo (interno)" value={cost} onChange={setCost} prefix="$" min={0} disabled={saving} />
                <NumericInput label="Precio de venta *" value={price} onChange={setPrice} prefix="$" min={0} disabled={saving} />
                <NumericInput label="IVA %" value={ivaPercent} onChange={setIvaPercent} suffix="%" min={0} max={100} decimals={0} disabled={saving} />
              </div>
              {formError && (
                <div className="p-3 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm">{formError}</div>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t border-theme">
                <PremiumButton variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</PremiumButton>
                <PremiumButton onClick={saveService} loading={saving}>
                  {saving ? "Guardando..." : editing ? "Actualizar servicio" : "Crear servicio"}
                </PremiumButton>
              </div>
            </div>
          </PremiumModal>
        </>
      )}

      {tab === "billing" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input type="text" placeholder="Buscar servicio por nombre o SKU..." value={billingSearch}
                onChange={e => setBillingSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div className="bg-card border border-theme rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-input text-primary">
                  <tr><th className="p-2">SKU</th><th className="p-2">Servicio</th><th className="p-2 text-right">Precio</th><th className="p-2 text-right">IVA</th><th className="p-2 text-center"></th></tr>
                </thead>
                <tbody>
                  {billingFiltered.map((s, index) => (
                    <motion.tr key={s.id} initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }}
                      className="border-t border-theme hover:bg-input/30 transition-colors">
                      <td className="p-2 font-mono text-accent text-xs">{s.sku}</td>
                      <td className="p-2"><span className="text-primary font-medium">{s.name}</span></td>
                      <td className="p-2 text-right tabular-nums">{formatCOP(s.price)}</td>
                      <td className="p-2 text-right tabular-nums text-xs">{s.iva_percent}%</td>
                      <td className="p-2 text-center">
                        <button onClick={() => addToCart(s)}
                          className="p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors" title="Agregar"><Plus size={16} /></button>
                      </td>
                    </motion.tr>
                  ))}
                  {billingFiltered.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-secondary">No hay servicios activos disponibles</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-card border border-theme rounded-xl p-4 space-y-4 h-fit sticky top-6">
            <h3 className="text-lg font-bold text-primary flex items-center gap-2">
              <ShoppingCart size={18} className="text-accent" /> Carrito ({cart.length})
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {cart.map(item => (
                  <motion.div key={item.serviceId} layout initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="flex items-start justify-between gap-2 p-2 bg-input rounded-lg border border-theme">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{item.name}</p>
                      <p className="text-xs text-secondary">{formatCOP(item.price)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <input type="number" min="1" value={item.quantity}
                        onChange={e => updateQuantity(item.serviceId, parseInt(e.target.value) || 0)}
                        className="w-12 px-1 py-1 bg-surface border border-theme rounded text-primary text-sm text-center" />
                      <button onClick={() => removeFromCart(item.serviceId)}
                        className="p-1 text-danger hover:bg-danger/10 rounded"><Trash2 size={14} /></button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {cart.length === 0 && <p className="text-sm text-secondary text-center py-4">Carrito vacío</p>}
            </div>
            <div className="border-t border-theme pt-3 space-y-2">
              <div className="flex justify-between text-sm text-secondary"><span>Subtotal:</span><span className="tabular-nums">{formatCOP(subtotal)}</span></div>
              {ivaTotal > 0 && <div className="flex justify-between text-sm text-secondary"><span>IVA:</span><span className="tabular-nums">{formatCOP(ivaTotal)}</span></div>}
              <div className="flex justify-between items-center text-sm">
                <span className="text-secondary">Dto. %</span>
                <input type="number" min="0" max="100" value={discountPercent}
                  onChange={e => setDiscountPercent(e.target.value)}
                  className="w-16 px-2 py-1 bg-surface border border-theme rounded text-primary text-sm text-right" />
              </div>
              {discountAmount > 0 && <div className="flex justify-between text-sm text-danger"><span>Descuento:</span><span className="tabular-nums">-{formatCOP(discountAmount)}</span></div>}
              <div className="flex justify-between text-lg font-bold text-primary border-t border-theme pt-2"><span>Total:</span><span className="tabular-nums">{formatCOP(total)}</span></div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-secondary">Cliente</label>
              {customerId ? (
                <div className="flex items-center justify-between px-3 py-2 bg-input border border-theme rounded-lg">
                  <span className="text-sm text-primary">{customerName}</span>
                  <button onClick={() => { setCustomerId(null); setCustomerName(""); }} className="text-danger hover:opacity-80"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select value={customerId ?? ""} onChange={e => {
                    const id = Number(e.target.value);
                    if (id) { setCustomerId(id); setCustomerName(customers.find(c => c.id === id)?.name || ""); }
                  }}
                    className="flex-1 px-3 py-2 bg-input border border-theme rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent">
                    <option value="">Seleccionar cliente...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={() => setShowCustomerModal(true)}
                    className="px-3 py-2 bg-accent hover:bg-accent/80 text-white rounded-lg text-sm"><User size={16} /></button>
                </div>
              )}
              <label className="block text-sm text-secondary">Método de pago</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary text-sm">
                {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
              </select>
              <PremiumButton onClick={handleCheckout} className="w-full" disabled={cart.length === 0}>
                <CreditCard size={16} /> Facturar
              </PremiumButton>
            </div>
          </div>
        </div>
      )}

      <PremiumModal open={showCustomerModal} onClose={() => setShowCustomerModal(false)}
        title="Nuevo cliente rápido" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-secondary mb-1">Nombre *</label>
            <input value={newCustName} onChange={e => setNewCustName(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary uppercase focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Documento</label>
            <input value={newCustDoc} onChange={e => setNewCustDoc(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Teléfono</label>
            <input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Email</label>
            <input value={newCustEmail} onChange={e => setNewCustEmail(e.target.value)}
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <PremiumButton variant="ghost" onClick={() => setShowCustomerModal(false)}>Cancelar</PremiumButton>
            <PremiumButton onClick={quickCreateCustomer}>Crear y seleccionar</PremiumButton>
          </div>
        </div>
      </PremiumModal>

      <PremiumModal open={showPaymentModal} onClose={() => setShowPaymentModal(false)}
        title="Confirmar factura de servicios" size="md">
        <div className="space-y-4">
          {customerName && <div className="text-sm text-secondary">Cliente: <span className="text-primary font-medium">{customerName}</span></div>}
          <div className="space-y-1">
            {cart.map(item => (
              <div key={item.serviceId} className="flex justify-between text-sm">
                <span className="text-primary">{item.name} x{item.quantity}</span>
                <span className="tabular-nums text-primary">{formatCOP(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="border-t border-theme pt-2 space-y-1">
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-danger"><span>Dto. ({discountPercent}%)</span><span>-{formatCOP(discountAmount)}</span></div>
              )}
              <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="tabular-nums">{formatCOP(total)}</span></div>
            </div>
          </div>
          <div className="text-sm text-secondary">Método: <span className="text-primary font-medium">{paymentMethod}</span></div>
          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowPaymentModal(false)} disabled={processing}>Cancelar</PremiumButton>
            <PremiumButton onClick={confirmSale} loading={processing}>
              {processing ? "Procesando..." : "Confirmar y facturar"}
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}