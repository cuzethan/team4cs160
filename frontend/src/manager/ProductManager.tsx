import { useState, type FormEvent } from "react";
import { adjustProductStock, emojiFor } from "../inventory/api";
import { parseStockAmount } from "../inventory/ProductCard";
import { createProduct, updateProduct, type ManagedProduct, type ProductCategory, type ProductInput } from "./api";

const inputClassName =
  "mt-1 w-full rounded-xl border border-[#dedfd5] bg-white px-4 py-2.5 text-sm text-[#253b2d] outline-none focus:border-[#416449]";
const labelClassName = "block text-sm font-semibold text-[#536459]";

type ProductTableProps = {
  products: ManagedProduct[];
  busyIds: Set<string>;
  onEdit: (product: ManagedProduct) => void;
  onToggleActive: (product: ManagedProduct) => void;
};

// Every product, active or not, with buttons to edit it or take it off the store.
export function ProductTable({ products, busyIds, onEdit, onToggleActive }: ProductTableProps) {
  if (products.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-[#667269] sm:px-7">No products match your search.</p>;
  }

  return (
    // `relative` keeps the screen-reader-only "Actions" label inside this scroll box;
    // otherwise its absolute position widens the whole page on phones.
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left">
        <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
          <tr>
            <th scope="col" className="px-5 py-3 font-bold sm:px-7">Product</th>
            <th scope="col" className="px-4 py-3 font-bold">Category</th>
            <th scope="col" className="px-4 py-3 text-right font-bold">Price</th>
            <th scope="col" className="px-4 py-3 text-right font-bold">Weight</th>
            <th scope="col" className="px-4 py-3 text-right font-bold">Stock</th>
            <th scope="col" className="px-5 py-3 text-right font-bold sm:px-7"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#ecebe2]">
          {products.map((product) => (
            <tr key={product.id} className={product.active ? undefined : "bg-[#fafaf6] text-[#899188]"}>
              <th scope="row" className="px-5 py-4 font-semibold sm:px-7">
                <span aria-hidden="true" className="mr-2">{emojiFor(product.name, product.category)}</span>
                <span className={product.active ? "text-[#253b2d]" : undefined}>{product.name}</span>
                {!product.active && (
                  <span className="ml-2 rounded-full bg-[#ecebe2] px-2 py-0.5 text-xs font-bold text-[#667269]">Inactive</span>
                )}
              </th>
              <td className="px-4 py-4 text-sm">{product.category}</td>
              <td className="px-4 py-4 text-right text-sm tabular-nums">
                ${product.price.toFixed(2)} <span className="text-[#899188]">/ {product.unit}</span>
              </td>
              <td className="px-4 py-4 text-right text-sm tabular-nums">{product.weightLbs} lb</td>
              <td className="px-4 py-4 text-right font-bold tabular-nums">
                {product.quantityInStock === 0 ? <span className="text-[#8b5145]">Out of stock</span> : product.quantityInStock}
              </td>
              <td className="px-5 py-4 sm:px-7">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(product)}
                    className="rounded-full border border-[#d9e2d2] px-3 py-1.5 text-xs font-bold text-[#416449] hover:bg-[#f1f5eb]"
                    aria-label={`Edit ${product.name}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleActive(product)}
                    disabled={busyIds.has(product.id)}
                    className="rounded-full border border-[#d9e2d2] px-3 py-1.5 text-xs font-bold text-[#667269] hover:bg-[#f6f7f1] disabled:cursor-wait disabled:opacity-50"
                    aria-label={`${product.active ? "Deactivate" : "Reactivate"} ${product.name}`}
                  >
                    {product.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ProductFormDialogProps = {
  // Leave out to add a new product.
  product?: ManagedProduct;
  categories: ProductCategory[];
  onClose: () => void;
  onSaved: (product: ManagedProduct) => void;
};

// Adds a product, or edits one: its details, and its stock with a reason.
export function ProductFormDialog({ product, categories, onClose, onSaved }: ProductFormDialogProps) {
  const isNew = !product;
  const [fields, setFields] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product ? String(product.price) : "",
    weightLbs: product ? String(product.weightLbs) : "",
    unit: product?.unit ?? "each",
    categoryId: product?.categoryId ?? categories[0]?.id ?? "",
    quantityInStock: "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const setField = (field: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    const input: ProductInput = {
      name: fields.name,
      description: fields.description,
      price: Number(fields.price),
      weightLbs: Number(fields.weightLbs),
      unit: fields.unit,
      categoryId: fields.categoryId,
    };
    try {
      const saved = product
        ? await updateProduct(product.id, input)
        : await createProduct({ ...input, quantityInStock: Number(fields.quantityInStock) });
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError((saveError as Error).message);
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1c2c20]/55 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="relative w-full max-w-xl rounded-3xl bg-[#fffefa] p-6 shadow-2xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-xl text-[#536459] hover:bg-[#f1f4e6]"
          aria-label="Close"
        >
          ×
        </button>
        <h2 id="product-form-title" className="text-2xl font-extrabold text-[#294332]">
          {isNew ? "Add product" : `Edit ${product.name}`}
        </h2>

        <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={`${labelClassName} sm:col-span-2`}>
            Name
            <input required maxLength={100} value={fields.name} onChange={(event) => setField("name")(event.target.value)} className={inputClassName} />
          </label>
          <label className={`${labelClassName} sm:col-span-2`}>
            Description <span className="font-normal text-[#899188]">(optional)</span>
            <textarea rows={2} maxLength={1000} value={fields.description} onChange={(event) => setField("description")(event.target.value)} className={inputClassName} />
          </label>
          <label className={labelClassName}>
            Category
            <select required value={fields.categoryId} onChange={(event) => setField("categoryId")(event.target.value)} className={inputClassName}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            Unit
            <input required maxLength={20} placeholder="lb, each, bag…" value={fields.unit} onChange={(event) => setField("unit")(event.target.value)} className={inputClassName} />
          </label>
          <label className={labelClassName}>
            Price ($)
            <input required type="number" min="0" max="99999.99" step="0.01" value={fields.price} onChange={(event) => setField("price")(event.target.value)} className={inputClassName} />
          </label>
          <label className={labelClassName}>
            Weight (lb)
            <input required type="number" min="0.01" max="1000" step="0.01" value={fields.weightLbs} onChange={(event) => setField("weightLbs")(event.target.value)} className={inputClassName} />
          </label>
          {isNew && (
            <label className={labelClassName}>
              Starting stock
              <input required type="number" min="0" step="1" value={fields.quantityInStock} onChange={(event) => setField("quantityInStock")(event.target.value)} className={inputClassName} />
            </label>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 px-4 py-3 text-sm text-red-800 sm:col-span-2">{error}</p>
          )}
          <div className="flex justify-end gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 font-bold text-[#536459] hover:bg-[#f1f4e6]">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="rounded-xl bg-[#416449] px-5 py-2.5 font-bold text-white hover:bg-[#35563c] disabled:cursor-wait disabled:opacity-60">
              {isSaving ? "Saving…" : isNew ? "Add product" : "Save changes"}
            </button>
          </div>
        </form>

        {product && <StockAdjuster product={product} onSaved={onSaved} />}
      </section>
    </div>
  );
}

// Adds or removes stock in bulk and records why (a delivery came in, items spoiled…).
function StockAdjuster({ product, onSaved }: { product: ManagedProduct; onSaved: (product: ManagedProduct) => void }) {
  const [quantityInStock, setQuantityInStock] = useState(product.quantityInStock);
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const amount = parseStockAmount(amountText);

  const adjust = async (direction: 1 | -1) => {
    if (!amount) return;
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const updated = await adjustProductStock(product.id, direction * amount, reason.trim() || undefined);
      setQuantityInStock(updated);
      onSaved({ ...product, quantityInStock: updated });
      setNotice(`${direction > 0 ? "Added" : "Removed"} ${amount}. Stock is now ${updated}.`);
      setAmountText("");
      setReason("");
    } catch (adjustError) {
      setError((adjustError as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section aria-labelledby="stock-adjust-heading" className="mt-6 border-t border-[#ecebe2] pt-5">
      <h3 id="stock-adjust-heading" className="font-extrabold text-[#294332]">
        Stock{" "}
        {quantityInStock === 0 ? (
          <span className="font-semibold text-[#8b5145]">· Out of stock</span>
        ) : (
          <span className="font-semibold text-[#667269]">· {quantityInStock} in stock</span>
        )}
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <label className={labelClassName}>
          Amount
          <input type="number" inputMode="numeric" min="1" step="1" value={amountText} onChange={(event) => setAmountText(event.target.value)} className={inputClassName} />
        </label>
        <label className={labelClassName}>
          Reason <span className="font-normal text-[#899188]">(optional)</span>
          <input maxLength={200} placeholder="Weekly delivery, spoiled, recount…" value={reason} onChange={(event) => setReason(event.target.value)} className={inputClassName} />
        </label>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-[#416449]">{notice}</p>}
      <div className="mt-4 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => void adjust(-1)}
          disabled={isSaving || !amount || amount > quantityInStock}
          className="rounded-xl border border-[#d9e2d2] px-5 py-2.5 font-bold text-[#416449] hover:bg-[#f1f5eb] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Remove stock
        </button>
        <button
          type="button"
          onClick={() => void adjust(1)}
          disabled={isSaving || !amount}
          className="rounded-xl border border-[#d9e2d2] px-5 py-2.5 font-bold text-[#416449] hover:bg-[#f1f5eb] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add stock
        </button>
      </div>
    </section>
  );
}
