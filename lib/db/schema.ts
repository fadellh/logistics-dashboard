import { pgTable, text, date, integer, numeric, boolean } from "drizzle-orm/pg-core";

export const orders = pgTable("orders", {
  orderId: text("order_id").primaryKey(),
  clientId: text("client_id").notNull(),
  orderDate: date("order_date", { mode: "string" }).notNull(),
  deliveryDate: date("delivery_date", { mode: "string" }),
  carrier: text("carrier").notNull(),
  originCity: text("origin_city").notNull(),
  destinationCity: text("destination_city").notNull(),
  status: text("status").notNull(),
  sku: text("sku").notNull(),
  productCategory: text("product_category").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceUsd: numeric("unit_price_usd", { precision: 10, scale: 2 }).notNull(),
  orderValueUsd: numeric("order_value_usd", { precision: 10, scale: 2 }).notNull(),
  isPromo: boolean("is_promo").notNull(),
  promoDiscountPct: numeric("promo_discount_pct", { precision: 5, scale: 2 }).notNull(),
  region: text("region").notNull(),
  warehouse: text("warehouse").notNull(),
});
