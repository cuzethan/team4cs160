import { useEffect, useState } from "react";
import { fetchProducts } from "./api";
import type { InventoryProduct } from "./types";

// Loads the product catalog from the API.
export function useProducts() {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setProducts(await fetchProducts());
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return { products, isLoading, error, reload };
}
