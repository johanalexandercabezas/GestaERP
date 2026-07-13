import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumButton from "../components/ui/PremiumButton";
import { showToast } from "../components/ui/PremiumToast";
import Skeleton from "../components/ui/Skeleton";
import { formatCOP } from "../utils/formatCurrency";
import { Search, Plus, Trash2, ShoppingCart } from "lucide-react";

interface Service {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  iva_percent: number;
  active: boolean;
}

interface BillingItem {
  serviceId: number;
  sku: string;
  name: string;
  price: number;
  quantity: number;
}

export default function BillingView() {
  const [services, setServices] = useState<Service[]>([]);
  const [filtered, setFiltered] = useState<Service[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<BillingItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    setFiltered(
      services.filter((s) =>
        s.active &&
        (s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.sku.toLowerCase().includes(search.toLowerCase()))
      )
    );
  }, [search, services]);

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

  const addToCart = (service: Service) => {
    setCart((prev) => {
      const exists = prev.find((item) => item.serviceId === service.id);
      if (exists) {
        return prev.map((item) =>
          item.serviceId === service.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          serviceId: service.id,
          sku: service.sku,
          name: service.name,
          price: service.price,
          quantity: 1,
        },
      ];
    });
    showToast(`"${service.name}" agregado al carrito`, "success");
  };

  const updateQuantity = (serviceId: number, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.serviceId !== serviceId));
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.serviceId === serviceId ? { ...item, quantity } : item
      )
    );
  };

  const removeFromCart = (serviceId: number) => {
    setCart((prev) => prev.filter((item) => item.serviceId !== serviceId));
  };

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const discountAmount = subtotal * (parseFloat(discountPercent) || 0) / 100;
  const total = subtotal - discountAmount;

  const confirmBilling = async () => {
    if (cart.length === 0) {
      showToast("El carrito está vacío", "error");
      return;
    }
    setShowPaymentModal(true);
  };

  const processSale = async () => {
    setSaving(true);
    try {
      const items = cart.map((item) => ({
        product_id: item.serviceId,
        quantity: item.quantity,
      }));

      await invoke("create_sale_v2", {
        payment_method: paymentMethod.toLowerCase(),
        items,
        customer_id: null,
        customer_name: null,
        discount_percent: parseFloat(discountPercent) || 0,
      });

      showToast("Factura de servicios generada exitosamente", "success");
      setCart([]);
      setDiscountPercent("0");
      setShowPaymentModal(false);
    } catch (e) {
      showToast("Error al facturar: " + String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <motion.h2
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-2xl font-bold text-primary flex items-center gap-2 mb-6"
      >
        <ShoppingCart className="text-accent" size={24} />
        Facturación de Servicios
      </motion.h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel izquierdo: Catálogo de servicios */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
            />
            <input
              type="text"
              placeholder="Buscar servicio por nombre o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="table-row" />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-theme rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-input text-primary">
                    <tr>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Servicio</th>
                      <th className="p-3 text-right">Precio</th>
                      <th className="p-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {filtered.map((s, index) => (
                        <motion.tr
                          key={s.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ delay: index * 0.02 }}
                          className="border-t border-theme hover:bg-input/30 transition-colors"
                        >
                          <td className="p-3 font-mono text-accent">{s.sku}</td>
                          <td className="p-3">
                            <span className="text-primary font-medium">{s.name}</span>
                            {s.description && (
                              <p className="text-xs text-secondary mt-0.5 truncate max-w-xs">
                                {s.description}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatCOP(s.price)}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => addToCart(s)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent/80 text-white rounded-lg text-xs transition-colors"
                            >
                              <Plus size={14} />
                              Agregar
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-8 text-center text-secondary"
                        >
                          No se encontraron servicios activos
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho: Carrito y facturación */}
        <div className="space-y-4">
          <div className="bg-card border border-theme rounded-xl p-4 sticky top-6">
            <h3 className="text-lg font-bold text-primary flex items-center gap-2 mb-4">
              <ShoppingCart size={18} className="text-accent" />
              Carrito de Servicios
            </h3>

            {cart.length === 0 ? (
              <p className="text-sm text-secondary text-center py-6">
                Sin servicios agregados
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                <AnimatePresence mode="popLayout">
                  {cart.map((item) => (
                    <motion.div
                      key={item.serviceId}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-start justify-between gap-2 p-3 bg-input rounded-lg border border-theme"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-secondary">
                          {formatCOP(item.price)} c/u
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(
                              item.serviceId,
                              parseInt(e.target.value) || 0
                            )
                          }
                          className="w-14 px-2 py-1 bg-surface border border-theme rounded text-primary text-sm text-center"
                        />
                        <button
                          onClick={() => removeFromCart(item.serviceId)}
                          className="p-1 text-danger hover:bg-danger/10 rounded"
                          title="Quitar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {cart.length > 0 && (
              <div className="mt-4 space-y-3 border-t border-theme pt-4">
                <div className="flex justify-between text-sm text-secondary">
                  <span>Subtotal:</span>
                  <span className="tabular-nums">{formatCOP(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-secondary">Descuento (%):</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    className="w-20 px-2 py-1 bg-surface border border-theme rounded text-primary text-sm text-right"
                  />
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-danger">
                    <span>Descuento aplicado:</span>
                    <span className="tabular-nums">
                      -{formatCOP(discountAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-primary">
                  <span>Total:</span>
                  <span className="tabular-nums">{formatCOP(total)}</span>
                </div>

                <div className="pt-2">
                  <label className="block text-sm text-secondary mb-1">
                    Forma de pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary text-sm"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Crédito">Crédito</option>
                  </select>
                </div>

                <PremiumButton
                  onClick={confirmBilling}
                  className="w-full"
                  disabled={cart.length === 0}
                >
                  Facturar
                </PremiumButton>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de confirmación de facturación */}
      <PremiumModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Confirmar facturación de servicios"
        size="md"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-secondary">Detalles</h4>
            {cart.map((item) => (
              <div
                key={item.serviceId}
                className="flex justify-between text-sm"
              >
                <span className="text-primary">
                  {item.name} x{item.quantity}
                </span>
                <span className="tabular-nums text-primary">
                  {formatCOP(item.price * item.quantity)}
                </span>
              </div>
            ))}
            <div className="border-t border-theme pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatCOP(total)}</span>
            </div>
          </div>
          <div className="text-sm text-secondary">
            Método de pago: <span className="text-primary font-medium">{paymentMethod}</span>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton
              variant="ghost"
              onClick={() => setShowPaymentModal(false)}
              disabled={saving}
            >
              Cancelar
            </PremiumButton>
            <PremiumButton onClick={processSale} loading={saving}>
              {saving ? "Procesando..." : "Confirmar factura"}
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}