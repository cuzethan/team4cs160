export type OrderItem = {
  order_item_id: string;
  order_id: string;
  product_id: string;
  productName: string;
  quantity: number;
  price_at_purchase: number;
  weight_at_purchase: number;
};

export type CustomerOrder = {
  id: string;
  date: string;
  items: OrderItem[];
  grandTotal: number;
  status: string;
  deliveryStatus: string | null;
};
