import { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import { useProductStore } from "../stores/useProductStore";
import { formatCOP } from "../utils/format";
import ProductForm from "../components/ProductForm";
import type { ProductListItem } from "../types/product";

export default function Products() {
  const { products, loading, fetchProducts, fetchCategories, deactivateProduct } = useProductStore();
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [fetchProducts, fetchCategories]);

  const columns = useMemo<ColumnDef<ProductListItem>[]>(
    () => [
      {
        accessorKey: "sku",
        header: "SKU",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "name",
        header: "Producto",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{row.original.name}</p>
            {row.original.category && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.category}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "stock",
        header: "Stock",
        cell: ({ row }) => {
          const stock = row.original.stock;
          const minStock = row.original.min_stock;
          const isLow = minStock > 0 && stock <= minStock;
          return (
            <span className={`font-medium ${isLow ? "text-red-500" : stock > 0 ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
              {stock} {row.original.unit || "ud"}
              {isLow && " !"}
            </span>
          );
        },
      },
      {
        accessorKey: "price",
        header: "Precio",
        cell: ({ getValue }) => (
          <span className="font-medium text-gray-900 dark:text-white">
            {formatCOP(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "cost",
        header: "Costo",
        cell: ({ getValue }) => (
          <span className="text-gray-500 dark:text-gray-400">
            {formatCOP(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "iva_percent",
        header: "IVA",
        cell: ({ getValue }) => {
          const val = getValue() as number;
          return val > 0 ? (
            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
              {val}%
            </span>
          ) : (
            <span className="text-xs text-gray-400">0%</span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setEditingProduct(row.original);
                setShowForm(true);
              }}
              className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Editar
            </button>
            <button
              onClick={async () => {
                if (confirm("Desactivar \"" + row.original.name + "\"?")) {
                  await deactivateProduct(row.original.id);
                }
              }}
              className="text-xs px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              Eliminar
            </button>
          </div>
        ),
      },
    ],
    [deactivateProduct]
  );

  const table = useReactTable({
    data: products,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Productos</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {products.length} producto{products.length !== 1 ? "s" : ""} registrado{products.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setShowForm(true);
          }}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Nuevo producto
        </button>
      </div>

      {/* Barra de busqueda */}
      <div className="mb-4">
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Buscar por nombre, SKU o categoria..."
          className="w-full max-w-md px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">Cargando productos...</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <span className="text-6xl">📦</span>
            <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Sin productos</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Haz clic en "Nuevo producto" para agregar tu primer articulo al inventario.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-gray-200 dark:border-gray-700">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 text-sm">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginacion */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Mostrando {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
                {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, products.length)} de {products.length}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal del formulario */}
      {showForm && (
        <ProductForm
          product={editingProduct}
          onClose={() => {
            setShowForm(false);
            setEditingProduct(null);
          }}
        />
      )}
    </div>
  );
}