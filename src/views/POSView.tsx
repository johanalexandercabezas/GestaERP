import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import PremiumSelect from "../components/ui/PremiumSelect";
import { showToast } from "../components/ui/PremiumToast";
import { formatCOP } from "../utils/formatCurrency";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Search, Plus, Minus, Trash2, CreditCard, Printer, X, DollarSign, AlertTriangle, Percent, UserPlus } from "lucide-react";

interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  stock: number;
  min_stock: number;
  active?: boolean;
  unit?: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface POSViewProps {
  userId: number;
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "credit", label: "Crédito" },
];

export default function POSView({ userId: _userId }: POSViewProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [skuInput, setSkuInput] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [showPayment, setShowPayment] = useState(false);
  const [change, setChange] = useState<number | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [businessName, setBusinessName] = useState("Mi Negocio");
  const [processing, setProcessing] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // P2-03 FIX: Debounce para evitar llamar search_products en cada keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estados para nuevo cliente rápido
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerDocType, setNewCustomerDocType] = useState("CC");
  const [newCustomerDocNumber, setNewCustomerDocNumber] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerError, setNewCustomerError] = useState("");

  useEffect(() => {
    invoke<{ id: number; name: string }[]>("list_customers")
      .then(setCustomers)
      .catch((err) => showToast("Error cargando clientes: " + String(err), "error"));
    invoke<string | null>("get_setting", { key: "nombre_negocio" })
      .then((name) => { if (name) setBusinessName(name); })
      .catch(() => {});
  }, []);

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const total = subtotal - discountAmount;

  const fetchSuggestions = async (query: string) => {
    if (query.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    try {
      const results = await invoke<Product[]>("search_products", { query });
      // Filtrar SOLO productos físicos (sin servicios)
      const physicalOnly = results.filter(p => !p.unit || p.unit !== "SERVICIO");
      setSuggestions(physicalOnly);
      setShowSuggestions(physicalOnly.length > 0);
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const addToCart = useCallback((product: Product) => {
    if (product.unit === "SERVICIO") {
      setError("Los servicios no se venden por el Punto de Venta.");
      return;
    }
    setError("");
    const existing = cart.find((item) => item.product.id === product.id);
    if (existing) {
      const newQty = existing.quantity + 1;
      if (newQty > product.stock) { setError(`Stock insuficiente para '${product.name}'. Disponible: ${product.stock}`); return; }
      if (product.stock - newQty < product.min_stock) { setError(`Mínimo: ${product.min_stock}.`); return; }
      setCart(cart.map((item) => item.product.id === product.id ? { ...item, quantity: newQty } : item));
    } else {
      if (product.stock <= 0) { setError(`'${product.name}' sin stock.`); return; }
      if (product.stock - 1 < product.min_stock) { setError(`Mín: ${product.min_stock}.`); return; }
      setCart([...cart, { product, quantity: 1 }]);
    }
    setSkuInput(""); setSuggestions([]); setShowSuggestions(false);
    searchInputRef.current?.focus();
  }, [cart]);

  const updateQuantity = (productId: number, newQuantity: number) => {
    const cartItem = cart.find((item) => item.product.id === productId);
    if (!cartItem) return;
    const product = cartItem.product;
    if (newQuantity <= 0) { removeItem(productId); return; }
    if (newQuantity > product.stock) { setError(`Máximo: ${product.stock}`); return; }
    const remaining = product.stock - newQuantity;
    if (remaining < product.min_stock) { setError(`Mín: ${product.min_stock}. Quedaría: ${remaining}`); return; }
    setCart(cart.map((item) => item.product.id === productId ? { ...item, quantity: newQuantity } : item));
    setError("");
  };

  const removeItem = (productId: number) => {
    setCart(cart.filter((item) => item.product.id !== productId));
    setError("");
  };

  const handleInputChange = (value: string) => {
    setSkuInput(value);
    // P2-03 FIX: Debounce de 300ms — solo busca cuando el usuario deja de escribir
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && suggestions.length > 0) { e.preventDefault(); addToCart(suggestions[0]); }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2" && cart.length > 0 && !showPayment) { e.preventDefault(); handleCheckout(); }
      if (e.key === "Escape" && showPayment) { setShowPayment(false); }
      if (e.key === "F1") { e.preventDefault(); searchInputRef.current?.focus(); }
    };
    window.addEventListener("keydown", handler);
    // Limpiar el timer de debounce al desmontar
    return () => {
      window.removeEventListener("keydown", handler);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleCheckout cambia en cada render; el listener se re-registra solo cuando cambian cart/showPayment
  }, [cart, showPayment]);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    if (paymentMethod === "credit" && !customerId) { setError("Seleccione un cliente para venta a crédito"); return; }
    setShowPayment(true); setCashReceived(""); setChange(null); setError("");
  };

  const confirmPayment = async () => {
    if (paymentMethod === "cash") {
      const received = parseFloat(cashReceived);
      if (isNaN(received) || received < total) { setError("Monto insuficiente"); return; }
      setChange(received - total);
    }
    setProcessing(true);
    const items = cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity }));
    try {
      await invoke("create_sale_v2", {
        paymentMethod,
        items,
        customerId: paymentMethod === "credit" ? customerId : null,
        customerName: paymentMethod === "credit" ? customers.find(c => c.id === customerId)?.name : null,
        discountPercent,
      });
      const ticketItems = cart.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        subtotal: item.product.price * item.quantity
      }));
      const cashR = paymentMethod === "cash" ? parseFloat(cashReceived) : null;
      const changeValue = paymentMethod === "cash" ? parseFloat(cashReceived) - total : null;
      await invoke<string>("print_ticket", {
        businessName, items: ticketItems, total,
        paymentMethod, cashReceived: cashR, change: changeValue
      });
      setCart([]); setShowPayment(false); setError(""); setCashReceived(""); setChange(null); setDiscountPercent(0);
      showToast("Venta registrada con éxito", "success");
      searchInputRef.current?.focus();
    } catch (e) {
      setError(String(e));
      showToast("Error: " + String(e), "error");
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateCustomer = async () => {
    setNewCustomerError("");
    if (!newCustomerName.trim() || !newCustomerDocNumber.trim() || !newCustomerPhone.trim() || !newCustomerEmail.trim()) {
      setNewCustomerError("Todos los campos son obligatorios: nombre, tipo doc, número doc, teléfono y email.");
      return;
    }
    if (!/^\d+$/.test(newCustomerDocNumber)) {
      setNewCustomerError("El número de documento debe contener solo números.");
      return;
    }
    if (!/^\d+$/.test(newCustomerPhone)) {
      setNewCustomerError("El teléfono debe contener solo números.");
      return;
    }
    try {
      const newId = await invoke<number>("create_customer", {
        name: newCustomerName,
        docType: newCustomerDocType,
        docNumber: newCustomerDocNumber,
        phone: newCustomerPhone,
        email: newCustomerEmail || null,
      });
      const updatedCustomers = await invoke<{ id: number; name: string }[]>("list_customers");
      setCustomers(updatedCustomers);
      setCustomerId(newId);
      setShowNewCustomer(false);
      setNewCustomerName(""); setNewCustomerDocNumber(""); setNewCustomerPhone(""); setNewCustomerEmail("");
    } catch (e) {
      setNewCustomerError(String(e));
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <motion.h2 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="text-2xl font-bold text-primary flex items-center gap-2">
          <ShoppingCart className="text-accent" size={24} /> Punto de Venta
        </motion.h2>
        <div className="flex items-center gap-2 text-xs text-secondary">
          <kbd className="px-1.5 py-0.5 bg-input border border-theme rounded">F1</kbd> Buscar
          <kbd className="px-1.5 py-0.5 bg-input border border-theme rounded ml-2">Enter</kbd> Agregar
          <kbd className="px-1.5 py-0.5 bg-input border border-theme rounded ml-2">F2</kbd> Cobrar
        </div>
      </div>

      <div className="relative flex gap-2 mb-6">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input ref={searchInputRef} type="text" value={skuInput} onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown} placeholder="Buscar producto... (F1)"
            className="w-full pl-10 pr-4 py-3 bg-input border border-theme rounded-lg text-primary text-lg focus:outline-none focus:ring-2 focus:ring-accent" autoFocus />
          <AnimatePresence>
            {showSuggestions && (
              <motion.ul initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="absolute z-20 mt-1 w-full bg-card border border-theme rounded-lg max-h-60 overflow-y-auto shadow-lg">
                {suggestions.map((product) => (
                  <li key={product.id} onClick={() => addToCart(product)}
                    className="px-4 py-2.5 hover:bg-surface cursor-pointer flex justify-between items-center text-sm border-b border-theme last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-accent text-xs bg-accent/10 px-1.5 py-0.5 rounded">{product.sku}</span>
                      <span className="text-primary font-medium">{product.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-primary font-semibold">{formatCOP(product.price)}</span>
                      <span className={`px-2 py-0.5 rounded-full ${product.stock <= product.min_stock ? "bg-warning-theme text-warning-theme" : "bg-success-theme text-success-theme"}`}>
                        Stock: {product.stock}
                      </span>
                    </div>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
        <button onClick={() => { if (suggestions.length > 0) addToCart(suggestions[0]); }}
          className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg transition flex items-center gap-2"><Plus size={18} /> Agregar</button>
        <button onClick={handleCheckout} disabled={cart.length === 0}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition flex items-center gap-2"><CreditCard size={18} /> Cobrar</button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="p-3 mb-4 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm flex items-center gap-2"><AlertTriangle size={14} /> {error}</motion.div>
        )}
      </AnimatePresence>

      <div className="bg-card border border-theme rounded-xl overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-input text-primary text-xs uppercase tracking-wider">
              <tr><th className="p-3">Producto</th><th className="p-3 text-right">Precio</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-right">Subtotal</th><th className="p-3 text-center">Acción</th></tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {cart.map((item, index) => (
                  <motion.tr key={item.product.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.02 }} className="border-t border-theme hover:bg-input/30">
                    <td className="p-3"><span className="text-primary font-medium">{item.product.name}</span></td>
                    <td className="p-3 text-right tabular-nums">{formatCOP(item.product.price)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="w-7 h-7 bg-input hover:bg-surface rounded flex items-center justify-center"><Minus size={12} /></button>
                        <input type="number" value={item.quantity} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) updateQuantity(item.product.id, v); }}
                          className="w-14 px-1 py-1 bg-input border border-theme rounded text-center text-primary text-sm tabular-nums" min={1} max={item.product.stock} />
                        <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="w-7 h-7 bg-input hover:bg-surface rounded flex items-center justify-center"><Plus size={12} /></button>
                      </div>
                    </td>
                    <td className="p-3 text-right font-medium tabular-nums text-primary">{formatCOP(item.product.price * item.quantity)}</td>
                    <td className="p-3 text-center"><button onClick={() => removeItem(item.product.id)} className="p-1.5 rounded-lg text-secondary hover:text-danger hover:bg-danger/10"><Trash2 size={14} /></button></td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {cart.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-secondary"><ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />Carrito vacío</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <motion.div layout className="flex justify-between items-center p-4 bg-card border border-theme rounded-xl">
        <div>
          <p className="text-xs text-secondary uppercase tracking-wider">Total</p>
          <p className="text-3xl font-bold text-primary tabular-nums">{formatCOP(total)}</p>
          {discountPercent > 0 && <p className="text-xs text-success mt-1">Dto: {discountPercent}% (-{formatCOP(discountAmount)})</p>}
          <p className="text-xs text-secondary mt-1">{cart.length} producto{cart.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Percent size={16} className="text-accent" />
            <input type="number" value={discountPercent} onChange={e => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
              className="w-16 px-2 py-1 bg-input border border-theme rounded text-right text-primary text-sm tabular-nums" min={0} max={100} />
            <span className="text-xs text-secondary">% desc.</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setCart([]); setDiscountPercent(0); }} disabled={cart.length === 0}
              className="px-4 py-2.5 bg-input hover:bg-surface disabled:opacity-30 rounded-lg text-secondary transition-colors flex items-center gap-2"><Trash2 size={16} /> Limpiar</button>
            <button onClick={handleCheckout} disabled={cart.length === 0}
              className="px-8 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition flex items-center gap-2 text-lg font-semibold"><CreditCard size={20} /> Cobrar (F2)</button>
          </div>
        </div>
      </motion.div>

      {/* Modal de pago con cliente rápido */}
      <AnimatePresence>
        {showPayment && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPayment(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()} className="bg-card border border-theme rounded-2xl p-6 w-full max-w-md shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-primary">Confirmar cobro</h3>
                <button onClick={() => setShowPayment(false)} className="p-1 rounded-lg text-secondary hover:text-primary hover:bg-input"><X size={18} /></button>
              </div>
              <div className="text-center mb-6">
                <p className="text-sm text-secondary mb-1">Total a cobrar</p>
                <p className="text-4xl font-bold text-primary tabular-nums">{formatCOP(total)}</p>
                {discountPercent > 0 && <p className="text-xs text-success mt-1">Dto: {discountPercent}%</p>}
              </div>
              <div className="space-y-3">
                {paymentMethod === "credit" && (
                  <div>
                    <label className="block text-sm text-secondary mb-1">Cliente</label>
                    {!showNewCustomer ? (
                      <div className="flex gap-2">
                        <select value={customerId ?? ""} onChange={(e) => setCustomerId(Number(e.target.value) || null)}
                          className="flex-1 px-3 py-2.5 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent">
                          <option value="">Seleccione un cliente</option>
                          {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                        </select>
                        <button onClick={() => setShowNewCustomer(true)}
                          className="px-3 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition flex items-center gap-1">
                          <UserPlus size={16} /> Nuevo
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 p-3 bg-input rounded-lg">
                        <div className="flex gap-2">
                          <div className="w-1/3">
                            <label className="text-xs text-secondary">Tipo Doc.</label>
                            <select value={newCustomerDocType} onChange={(e) => setNewCustomerDocType(e.target.value)}
                              className="w-full px-2 py-1.5 bg-card border border-theme rounded text-primary text-sm">
                              <option value="CC">CC</option>
                              <option value="NIT">NIT</option>
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-secondary">Número Doc. *</label>
                            <input value={newCustomerDocNumber} onChange={(e) => setNewCustomerDocNumber(e.target.value.replace(/\D/g, ''))}
                              className="w-full px-2 py-1.5 bg-card border border-theme rounded text-primary text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-secondary">Nombre completo *</label>
                          <input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)}
                            className="w-full px-2 py-1.5 bg-card border border-theme rounded text-primary text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-xs text-secondary">Teléfono *</label>
                            <input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value.replace(/\D/g, ''))}
                              className="w-full px-2 py-1.5 bg-card border border-theme rounded text-primary text-sm" />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-secondary">Email</label>
                            <input value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)}
                              className="w-full px-2 py-1.5 bg-card border border-theme rounded text-primary text-sm" />
                          </div>
                        </div>
                        {newCustomerError && <div className="text-xs text-danger bg-danger/10 p-2 rounded">{newCustomerError}</div>}
                        <div className="flex gap-2">
                          <button onClick={handleCreateCustomer}
                            className="flex-1 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover">Guardar cliente</button>
                          <button onClick={() => { setShowNewCustomer(false); setNewCustomerError(""); }}
                            className="px-3 py-1.5 bg-muted rounded text-sm">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm text-secondary mb-1">Método de pago</label>
                  <PremiumSelect options={PAYMENT_METHOD_OPTIONS} value={paymentMethod} onChange={setPaymentMethod} placeholder="Método de pago..." />
                </div>
                {paymentMethod === "cash" && (
                  <div>
                    <label className="block text-sm text-secondary mb-1">Monto recibido</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary">$</span>
                      <input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)}
                        className="w-full pl-8 pr-4 py-2.5 bg-input border border-theme rounded-lg text-primary text-lg focus:outline-none focus:ring-2 focus:ring-accent" autoFocus />
                    </div>
                    {change !== null && (
                      <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                        className="mt-2 text-success font-semibold flex items-center gap-1"><DollarSign size={14} /> Cambio: {formatCOP(change)}</motion.p>
                    )}
                  </div>
                )}
                {error && <div className="p-3 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm">{error}</div>}
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-theme">
                <button onClick={() => setShowPayment(false)} disabled={processing}
                  className="px-4 py-2.5 bg-input hover:bg-surface rounded-lg text-primary disabled:opacity-50">Cancelar</button>
                <button onClick={confirmPayment} disabled={processing}
                  className="px-6 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-white flex items-center gap-2 disabled:opacity-50">
                  {processing ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}><Printer size={16} /></motion.div> Procesando...</> : <><Printer size={16} /> Confirmar pago</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}