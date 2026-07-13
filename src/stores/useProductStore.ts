import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ProductListItem, SimilarProduct, CreateProductData, UpdateProductData } from "../types/product";

interface ProductState {
  products: ProductListItem[];
  categories: string[];
  loading: boolean;
  error: string | null;
  fetchProducts: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  createProduct: (data: CreateProductData) => Promise<boolean>;
  updateProduct: (data: UpdateProductData) => Promise<boolean>;
  deactivateProduct: (id: number) => Promise<boolean>;
  findSimilar: (name: string, excludeId?: number) => Promise<SimilarProduct[]>;
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  categories: [],
  loading: false,
  error: null,

  fetchProducts: async () => {
    set({ loading: true, error: null });
    try {
      const products = await invoke<ProductListItem[]>("list_products");
      set({ products, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  fetchCategories: async () => {
    try {
      const categories = await invoke<string[]>("list_categories");
      set({ categories });
    } catch (err) {
      console.error("Error cargando categorías:", err);
    }
  },

  createProduct: async (data) => {
    set({ loading: true, error: null });
    try {
      await invoke("create_product", { input: data });
      await get().fetchProducts();
      return true;
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  updateProduct: async (data) => {
    set({ loading: true, error: null });
    try {
      await invoke("update_product", { input: data });
      await get().fetchProducts();
      return true;
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  deactivateProduct: async (id) => {
    set({ loading: true, error: null });
    try {
      await invoke("deactivate_product", { id });
      await get().fetchProducts();
      return true;
    } catch (err) {
      set({ error: String(err), loading: false });
      return false;
    }
  },

  findSimilar: async (name, excludeId) => {
    try {
      return await invoke<SimilarProduct[]>("find_similar_products", {
        name,
        excludeId: excludeId ?? null,
      });
    } catch {
      return [];
    }
  },
}));