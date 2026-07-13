import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import PremiumSelect from "../components/ui/PremiumSelect";
import { showToast } from "../components/ui/PremiumToast";


interface Supplier {
  id: number;
  name: string;
  nit: string | null;
  doc_type: string | null;
}

interface CartItem {
  productId: number | null;
  productName: string;
  description: string;
  quantity: number;
  unitCost: string;
  ivaPercent: string;
  unit: string;
}

interface PurchasesViewProps {
  userId: number;
}

export default function PurchasesView({ userId }: PurchasesViewProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceWarning, setInvoiceWarning] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [productQuantity, setProductQuantity] = useState("1");
  const [productCost, setProductCost] = useState("0");
  const [productIva, setProductIva] = useState("0");
  const [productUnit, setProductUnit] = useState("UNIDAD");

  useEffect(() => {
    invoke<Supplier[]>("list_suppliers").then(setSuppliers).catch(console.error);
  }, []);

  // Verificar factura duplicada cada vez que cambie el número o proveedor
  useEffect(() => {
    if (selectedSupplierId && invoiceNumber.trim()) {
      invoke<boolean>("check_invoice_duplicate", { supplierId: selectedSupplierId, invoiceNumber: invoiceNumber.trim() })
        .then((duplicated) => {
          setInvoiceWarning(duplicated ? "Esta factura ya fue registrada para este proveedor" : "");
        });
    } else {
      setInvoiceWarning("");
    }
  }, [invoiceNumber, selectedSupplierId]);

  const addToCart = () => {
    if (!productName.trim()) { setError("Ingrese el nombre del producto"); return; }
    setError("");
    setCart([...cart, { productId: null, productName: productName.trim(), description: productDesc.trim(), quantity: parseInt(productQuantity) || 1, unitCost: productCost, ivaPercent: productIva, unit: productUnit }]);
    setProductName(""); setProductDesc(""); setProductQuantity("1"); setProductCost("0"); setProductIva("0"); setProductUnit("UNIDAD");
  };

  const removeItem = (index: number) => setCart(cart.filter((_, i) => i !== index));
  const total = cart.reduce((sum, item) => sum + (parseFloat(item.unitCost) || 0) * item.quantity, 0);

  const confirmPurchase = async () => {
    if (!selectedSupplierId) { setError("Seleccione un proveedor"); return; }
    if (cart.length === 0) { setError("Agregue al menos un producto"); return; }
    if (invoiceWarning) { setError("Corrija el número de factura"); return; }
    setError("");
    const supplierName = suppliers.find(s => s.id === selectedSupplierId)?.name || "Proveedor";
    const items = cart.map(item => ({
      product_id: item.productId, product_name: item.productName, description: item.description,
      quantity: item.quantity, unit_cost: parseFloat(item.unitCost) || 0,
      iva_percent: parseFloat(item.ivaPercent) || 0, unit: item.unit,
    }));

    try {
      await invoke("create_purchase", { userId, supplierId: selectedSupplierId, supplier: supplierName, invoiceNumber: invoiceNumber.trim(), items });
      setCart([]); setInvoiceNumber(""); setShowConfirm(false); setError("");
      showToast("Compra registrada. Productos actualizados/creados exitosamente.", "success");
    } catch (e) { setError(String(e)); }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h2 className="text-2xl font-bold mb-4">Registrar Compra</h2>
      <div className="mb-4"><label className="block text-sm text-secondary mb-1">Proveedor</label><PremiumSelect options={suppliers.map(s => ({ value: String(s.id), label: `${s.name} (${s.doc_type} ${s.nit})` }))} value={selectedSupplierId ? String(selectedSupplierId) : ""} onChange={(v) => setSelectedSupplierId(v ? Number(v) : null)} placeholder="Seleccione un proveedor" searchable className="w-full max-w-md" /></div>
      <div className="mb-4"><label className="block text-sm text-secondary mb-1">Número de Factura</label><input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="w-full max-w-md px-3 py-2 bg-input border border-theme rounded-lg text-primary" placeholder="FAC-001" />{invoiceWarning && <p className="text-red-400 text-xs mt-1">{invoiceWarning}</p>}</div>
      {/* Agregar producto (sin cambios) */}
      <div className="bg-card border border-theme rounded-xl p-4 mb-6"><h3 className="text-sm font-semibold text-primary mb-3">Agregar producto</h3><div className="grid grid-cols-1 md:grid-cols-5 gap-3"><div><label className="block text-xs text-secondary mb-1">Nombre *</label><input type="text" placeholder="Nombre del producto" value={productName} onChange={(e) => setProductName(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /></div><div><label className="block text-xs text-secondary mb-1">Descripción</label><input type="text" placeholder="Descripción" value={productDesc} onChange={(e) => setProductDesc(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /></div><div><label className="block text-xs text-secondary mb-1">Cantidad</label><div className="flex gap-2"><input type="number" placeholder="Cant." value={productQuantity} onChange={(e) => setProductQuantity(e.target.value)} className="w-20 px-3 py-2 bg-input border border-theme rounded-lg text-primary" /><select value={productUnit} onChange={(e) => setProductUnit(e.target.value)} className="px-3 py-2 bg-input border border-theme rounded-lg text-primary"><option value="UNIDAD">UNIDAD</option><option value="KG">KG</option><option value="LITRO">LITRO</option><option value="METRO">METRO</option><option value="CAJA">CAJA</option></select></div></div><div><label className="block text-xs text-secondary mb-1">Costo unit.</label><input type="number" placeholder="Costo unit." value={productCost} onChange={(e) => setProductCost(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /></div><div className="flex items-end gap-2"><div className="flex-1"><label className="block text-xs text-secondary mb-1">IVA %</label><input type="number" placeholder="IVA %" value={productIva} onChange={(e) => setProductIva(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /></div><button onClick={addToCart} className="bg-blue-600 hover:bg-blue-700 text-primary px-4 py-2 rounded-lg h-10.5">Agregar</button></div></div></div>
      {error && <div className="p-3 mb-4 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm">{error}</div>}
      {/* Tabla items (sin cambios) */}
      <div className="bg-card border border-theme rounded-xl p-4 mb-6">
        <table className="w-full text-left text-sm"><thead className="text-secondary"><tr><th className="pb-2">Producto</th><th className="pb-2">Desc.</th><th className="pb-2">Cant.</th><th className="pb-2">Unidad</th><th className="pb-2">Costo unit.</th><th className="pb-2">IVA</th><th className="pb-2">Subtotal</th><th className="pb-2"></th></tr></thead><tbody>{cart.map((item, idx) => (<tr key={idx} className="border-t border-theme"><td className="py-2">{item.productName}</td><td className="py-2">{item.description}</td><td className="py-2">{item.quantity}</td><td className="py-2">{item.unit}</td><td className="py-2">${parseFloat(item.unitCost).toFixed(2)}</td><td className="py-2">{item.ivaPercent}%</td><td className="py-2">${(parseFloat(item.unitCost) * item.quantity).toFixed(2)}</td><td className="py-2"><button onClick={() => removeItem(idx)} className="text-red-400">✕</button></td></tr>))}{cart.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-secondary">Sin productos</td></tr>}</tbody></table>
      </div>
      <div className="flex justify-between items-center mb-6"><span className="text-xl font-bold">Total: ${total.toFixed(2)}</span><button onClick={() => setShowConfirm(true)} disabled={cart.length === 0 || !selectedSupplierId || !!invoiceWarning} className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:bg-muted text-primary rounded-lg text-lg transition">Registrar compra</button></div>
      {showConfirm && (<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"><div className="bg-card border border-theme rounded-2xl p-6 w-full max-w-md"><h3 className="text-xl font-bold mb-4">Confirmar compra</h3><p className="text-primary mb-2">Proveedor: {suppliers.find(s => s.id === selectedSupplierId)?.name}</p><p className="text-primary mb-4">Total: ${total.toFixed(2)}</p>{error && <div className="p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm mb-4">{error}</div>}<div className="flex justify-end gap-3"><button onClick={() => setShowConfirm(false)} className="px-4 py-2 bg-muted hover:bg-gray-600 rounded-lg text-primary">Cancelar</button><button onClick={confirmPurchase} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-primary">Confirmar</button></div></div></div>)}
    </div>
  );
}
showToast("Compra registrada exitosamente", "success");