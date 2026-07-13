export interface Product {
  id: number;
  sku: string;
  name: string;
  description?: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  max_stock: number;
  iva_percent: number;
  category?: string;
  unit?: string;
  active: boolean;
}

export interface ProductListItem {
  id: number;
  sku: string;
  name: string;
  description?: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  max_stock: number;
  iva_percent: number;
  category?: string;
  unit?: string;
  active: boolean;
}

export interface SimilarProduct {
  id: number;
  sku: string;
  name: string;
  similarity: number;
}

export interface CreateProductData {
  sku: string;
  name: string;
  description?: string;
  price: number;
  cost?: number;
  min_stock?: number;
  max_stock?: number;
  iva_percent?: number;
  category?: string;
  unit?: string;
}

export interface UpdateProductData {
  id: number;
  sku: string;
  name: string;
  description?: string;
  price: number;
  cost: number;
  min_stock: number;
  max_stock: number;
  iva_percent: number;
  category?: string;
  unit: string;
}