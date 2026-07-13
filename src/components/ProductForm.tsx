import { useState, useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useProductStore } from "../stores/useProductStore";
import type { ProductListItem, SimilarProduct } from "../types/product";

const productSchema = z.object({
  sku: z.string().min(1, "SKU es obligatorio"),
  name: z.string().min(1, "Nombre es obligatorio"),
  description: z.string().optional(),
  price: z.preprocess(
    (val) => (val === "" || val === undefined ? 0 : Number(val)),
    z.coerce.number().min(0, "Precio debe ser mayor o igual a 0")
  ),
  cost: z.preprocess(
    (val) => (val === "" || val === undefined ? 0 : Number(val)),
    z.coerce.number().min(0)
  ),
  min_stock: z.preprocess(
    (val) => (val === "" || val === undefined ? 0 : Number(val)),
    z.coerce.number().min(0)
  ),
  max_stock: z.preprocess(
    (val) => (val === "" || val === undefined ? 0 : Number(val)),
    z.coerce.number().min(0)
  ),
  iva_percent: z.preprocess(
    (val) => (val === "" || val === undefined ? 0 : Number(val)),
    z.coerce.number().min(0).max(100)
  ),
  category: z.string().optional(),
  unit: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  product?: ProductListItem | null;
  onClose: () => void;
}

export default function ProductForm({ product, onClose }: ProductFormProps) {
  const { createProduct, updateProduct, findSimilar, categories } = useProductStore();
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [similarProducts, setSimilarProducts] = useState<SimilarProduct[]>([]);
  const [showSimilarWarning, setShowSimilarWarning] = useState(false);

  const isEditing = !!product;

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema) as Resolver<ProductFormData, any>,
    defaultValues: product
      ? {
          sku: product.sku,
          name: product.name,
          description: product.description || "",
          price: product.price,
          cost: product.cost,
          min_stock: product.min_stock,
          max_stock: product.max_stock,
          iva_percent: product.iva_percent,
          category: product.category || "",
          unit: product.unit || "unidad",
        }
      : {
          sku: "",
          name: "",
          description: "",
          price: 0,
          cost: 0,
          min_stock: 0,
          max_stock: 0,
          iva_percent: 0,
          category: "",
          unit: "unidad",
        },
  });

  const nameValue = watch("name");

  // Detectar productos similares cuando el usuario escribe el nombre
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (nameValue && nameValue.trim().length >= 3) {
        const similar = await findSimilar(nameValue, product?.id);
        if (similar.length > 0) {
          setSimilarProducts(similar);
          setShowSimilarWarning(true);
        } else {
          setSimilarProducts([]);
          setShowSimilarWarning(false);
        }
      } else {
        setSimilarProducts([]);
        setShowSimilarWarning(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [nameValue, findSimilar, product?.id]);

  const onSubmit = async (data: ProductFormData) => {
    setSaving(true);
    setServerError(null);

    try {
      if (isEditing && product) {
        const success = await updateProduct({
          id: product.id,
          sku: data.sku,
          name: data.name,
          description: data.description,
          price: data.price,
          cost: data.cost,
          min_stock: data.min_stock,
          max_stock: data.max_stock,
          iva_percent: data.iva_percent,
          category: data.category,
          unit: data.unit || "unidad",
        });
        if (success) onClose();
      } else {
        const success = await createProduct({
          sku: data.sku,
          name: data.name,
          description: data.description,
          price: data.price,
          cost: data.cost,
          min_stock: data.min_stock,
          max_stock: data.max_stock,
          iva_percent: data.iva_percent,
          category: data.category,
          unit: data.unit,
        });
        if (success) onClose();
      }
    } catch (err) {
      setServerError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const storeError = useProductStore((s) => s.error);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {isEditing ? "Editar producto" : "Nuevo producto"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-2xl leading-none"
          >
            x
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Error del servidor */}
          {(serverError || storeError) && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {serverError || storeError}
            </div>
          )}

          {/* Advertencia de duplicados */}
          {showSimilarWarning && similarProducts.length > 0 && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">
                Posibles productos duplicados encontrados:
              </p>
              {similarProducts.map((sp) => (
                <div key={sp.id} className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
                  <span className="font-medium">{sp.name}</span>
                  <span className="text-yellow-500">(SKU: {sp.sku} - Similitud: {Math.round(sp.similarity * 100)}%)</span>
                </div>
              ))}
              <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-2">
                Verifica si el producto que estas creando ya existe.
              </p>
            </div>
          )}

          {/* SKU y Nombre */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register("sku")}
                placeholder="Ej: PROD-001"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
              {errors.sku && <p className="text-red-500 text-xs mt-1">{errors.sku.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register("name")}
                placeholder="Ej: Cuaderno 50 hojas"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
          </div>

          {/* Descripcion */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Descripcion
            </label>
            <input
              type="text"
              {...register("description")}
              placeholder="Descripcion breve del producto"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
            />
          </div>

          {/* Precio y Costo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Precio de venta <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                {...register("price")}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
              {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Costo
              </label>
              <input
                type="number"
                step="any"
                {...register("cost")}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
          </div>

          {/* IVA, Categoria y Unidad */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                IVA (%)
              </label>
              <select
                {...register("iva_percent")}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              >
                <option value="0">0% - Exento</option>
                <option value="5">5%</option>
                <option value="19">19% - General</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Categoria
              </label>
              <select
                {...register("category")}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              >
                <option value="">Sin categoria</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Unidad
              </label>
              <select
                {...register("unit")}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              >
                <option value="unidad">Unidad</option>
                <option value="kilo">Kilo</option>
                <option value="litro">Litro</option>
                <option value="metro">Metro</option>
                <option value="caja">Caja</option>
                <option value="paquete">Paquete</option>
              </select>
            </div>
          </div>

          {/* Stock minimo y maximo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Stock minimo (alerta)
              </label>
              <input
                type="number"
                step="any"
                {...register("min_stock")}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Stock maximo
              </label>
              <input
                type="number"
                step="any"
                {...register("max_stock")}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {saving ? "Guardando..." : isEditing ? "Actualizar producto" : "Crear producto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}