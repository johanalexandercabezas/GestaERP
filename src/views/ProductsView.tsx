import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumButton from "../components/ui/PremiumButton";
import { showToast } from "../components/ui/PremiumToast";
import Skeleton from "../components/ui/Skeleton";
import NumericInput from "../components/ui/NumericInput";
import { formatCOP } from "../utils/formatCurrency";
import { Package, Search, Edit3, EyeOff, ToggleRight } from "lucide-react";
import { ROLES } from "../types/auth";

interface Product {
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

interface ProductPage {
  rows: Product[];
  total: number;
}

interface ProductsViewProps {
  role: string;
}

const ITEMS_PER_PAGE = 15;

function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  if (stock <= 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-danger/10 text-danger">Agotado</span>;
  if (stock <= minStock) return <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">Bajo ({stock})</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success">{stock}</span>;
}

export default function ProductsView({ role }: ProductsViewProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [cost, setCost] = useState("0");
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [maxStock, setMaxStock] = useState("0");
  const [ivaPercent, setIvaPercent] = useState("0");

  const isAdmin = role === ROLES.ADMIN;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      invoke<ProductPage>("list_products_page", {
        search: search.trim(),
        page: currentPage,
        pageSize: ITEMS_PER_PAGE,
      }).then((result) => {
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(result.total / ITEMS_PER_PAGE));
        if (currentPage > lastPage) {
          setCurrentPage(lastPage);
          return;
        }
        setProducts(result.rows);
        setTotalCount(result.total);
      }).catch((error: unknown) => {
        if (!cancelled) {
          showToast("Error al cargar productos: " + String(error), "error");
        }
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, search.trim() ? 200 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [search, currentPage, refreshToken]);

  const resetForm = () => {
    setSku(""); setName(""); setDescription(""); setPrice("0"); setCost("0");
    setStock("0"); setMinStock("0"); setMaxStock("0"); setIvaPercent("0");
    setErrorMessage(""); setSaving(false);
  };

  const openEdit = (p: Product) => {
    if (!isAdmin) return;
    setEditing(p); setSku(p.sku); setName(p.name); setDescription(p.description || "");
    setPrice(p.price.toString()); setCost(p.cost.toString()); setStock(p.stock.toString());
    setMinStock(p.min_stock.toString()); setMaxStock(p.max_stock.toString());
    setIvaPercent(p.iva_percent.toString());
    setErrorMessage(""); setSaving(false); setShowForm(true);
  };

  const performSave = async () => {
    if (!sku.trim() || !name.trim()) { setErrorMessage("SKU y Nombre son obligatorios"); return; }
    setErrorMessage(""); setSaving(true);
    try {
      await invoke("update_product", {
        id: editing!.id, sku, name, description: description || null,
        price: String(parseFloat(price) || 0), cost: String(parseFloat(cost) || 0),
        stock: String(parseFloat(stock) || 0), minStock: String(parseFloat(minStock) || 0),
        maxStock: String(parseFloat(maxStock) || 0), ivaPercent: String(parseFloat(ivaPercent) || 0),
        active: editing!.active,
        unit: "UNIDAD",
      });
      showToast("Producto actualizado", "success");
      setShowForm(false);
      resetForm();
      setRefreshToken((value) => value + 1);
    } catch (e) { setErrorMessage(String(e)); showToast("Error al actualizar", "error"); setSaving(false); }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      await invoke("update_product", {
        id: product.id, sku: product.sku, name: product.name, description: product.description,
        price: String(product.price), cost: String(product.cost), stock: String(product.stock),
        minStock: String(product.min_stock), maxStock: String(product.max_stock), unit: product.unit,
        ivaPercent: String(product.iva_percent), active: !product.active,
      });
      showToast(product.active ? "Producto inhabilitado" : "Producto habilitado", "success");
      setRefreshToken((value) => value + 1);
    } catch (e) { showToast("Error: " + String(e), "error"); }
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <motion.h2 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold text-primary flex items-center gap-2">
          <Package className="text-accent" size={24} />
          Productos
          <span className="text-sm font-normal text-secondary ml-2">({totalCount} registros)</span>
        </motion.h2>
        {/* Botón "+ Nuevo producto" eliminado */}
      </div>

      <div className="relative max-w-md mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
        <input type="text" placeholder="Buscar por nombre o SKU..." value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="table-row" />)}</div>
      ) : (
        <div className="bg-card border border-theme rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-input text-primary text-sm">
                <tr>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Nombre</th>
                  <th className="p-3 text-right">Precio</th>
                  <th className="p-3 text-right">Costo</th>
                  <th className="p-3 text-center">Stock</th>
                  <th className="p-3 text-center">Estado</th>
                  {isAdmin && <th className="p-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="text-sm">
                <AnimatePresence mode="popLayout">
                  {products.map((p, index) => (
                    <motion.tr key={p.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }} transition={{ delay: index * 0.02 }}
                      className={`border-t border-theme hover:bg-input/30 transition-colors ${!p.active ? "opacity-50" : ""}`}>
                      <td className="p-3 font-mono text-accent">{p.sku}</td>
                      <td className="p-3">
                        <span className={p.active ? "text-primary" : "text-secondary line-through"}>{p.name}</span>
                        {p.description && <p className="text-xs text-secondary mt-0.5 truncate max-w-xs">{p.description}</p>}
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatCOP(p.price)}</td>
                      <td className="p-3 text-right text-secondary tabular-nums">{formatCOP(p.cost)}</td>
                      <td className="p-3 text-center">{p.active ? <StockBadge stock={p.stock} minStock={p.min_stock} /> : <span className="text-xs text-secondary">—</span>}</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.active ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                          {p.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {p.active && (
                              <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-secondary hover:text-accent hover:bg-accent/10 transition-all" title="Editar">
                                <Edit3 size={14} />
                              </button>
                            )}
                            <button onClick={() => handleToggleActive(p)}
                              className={`p-1.5 rounded-lg transition-all ${p.active ? "text-secondary hover:text-danger hover:bg-danger/10" : "text-success hover:bg-success/10"}`}
                              title={p.active ? "Inhabilitar" : "Habilitar"}>
                              {p.active ? <EyeOff size={14} /> : <ToggleRight size={14} />}
                            </button>
                          </div>
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </AnimatePresence>
                {!loading && products.length === 0 && (
                  <tr><td colSpan={isAdmin ? 7 : 6} className="p-8 text-center text-secondary">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    No se encontraron productos
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
              className="px-3 py-1 rounded-lg border border-theme hover:bg-input disabled:opacity-30 transition-colors">Anterior</button>
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
              className="px-3 py-1 rounded-lg border border-theme hover:bg-input disabled:opacity-30 transition-colors">Siguiente</button>
          </div>
        </div>
      )}

      {showForm && isAdmin && (
        <PremiumModal open={showForm} onClose={() => setShowForm(false)} title="Editar producto" size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm text-secondary mb-1">SKU</label>
                <input value={sku} disabled className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-secondary cursor-not-allowed" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-secondary mb-1">Nombre</label>
                <input value={name} disabled className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-secondary cursor-not-allowed" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-secondary mb-1">Descripción</label>
                <textarea value={description} disabled className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-secondary cursor-not-allowed" rows={2} />
              </div>
              <NumericInput label="Precio de venta *" value={price} onChange={v => setPrice(v)} prefix="$" min={0} disabled={saving} />
              <NumericInput label="Costo" value={cost} onChange={v => setCost(v)} prefix="$" min={0} disabled={true} />
              <NumericInput label="Stock mínimo" value={minStock} onChange={v => setMinStock(v)} min={0} decimals={0} disabled={saving} />
              <NumericInput label="IVA %" value={ivaPercent} onChange={v => setIvaPercent(v)} suffix="%" min={0} max={100} decimals={0} disabled={true} />
            </div>
            {errorMessage && <div className="p-3 bg-danger-theme border border-danger-theme rounded-lg text-danger-theme text-sm">{errorMessage}</div>}
            <div className="flex justify-end gap-3 pt-2 border-t border-theme">
              <PremiumButton variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</PremiumButton>
              <PremiumButton onClick={performSave} loading={saving}>{saving ? "Guardando..." : "Guardar cambios"}</PremiumButton>
            </div>
          </div>
        </PremiumModal>
      )}
    </div>
  );
}