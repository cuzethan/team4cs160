import type { CartItem } from "./types";

type CartItemCardProps = {
  item: CartItem;
  onIncrease: (cartItemId: string) => void;
  onDecrease: (cartItemId: string) => void;
  onRemove: (cartItemId: string) => void;
};

export function CartItemCard({ item, onIncrease, onDecrease, onRemove }: CartItemCardProps) {
  const handleIncreaseClick = () => onIncrease(item.cartItemId);
  const handleDecreaseClick = () => onDecrease(item.cartItemId);
  const handleRemoveClick = () => onRemove(item.cartItemId);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.06)] sm:flex-row sm:items-center">
      <span aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-canvas text-4xl">
        {item.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-bold">{item.name}</h2>
        <p className="mt-1 text-sm text-muted">${item.price.toFixed(2)} / {item.unit}</p>
        <p className="mt-1 text-sm text-muted">{(item.weightLbs * item.quantity).toFixed(1)} lb total</p>
        {!item.available && (
          <p className="mt-2 w-fit rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
            No longer available. Remove it to check out.
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleDecreaseClick}
          aria-label={`Decrease ${item.name} quantity`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border font-bold hover:bg-canvas"
        >
          −
        </button>
        <span aria-label={`Quantity ${item.quantity}`} className="min-w-6 text-center font-bold">
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={handleIncreaseClick}
          disabled={!item.available || item.quantity >= item.quantityInStock}
          aria-label={`Increase ${item.name} quantity`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border font-bold hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
      <p className="min-w-20 text-right font-extrabold">${(item.price * item.quantity).toFixed(2)}</p>
      <button
        type="button"
        onClick={handleRemoveClick}
        className="text-left text-sm font-bold text-red-700 underline sm:text-center"
      >
        Remove
      </button>
    </article>
  );
}
