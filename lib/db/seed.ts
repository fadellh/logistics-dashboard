import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { db } from "./client";
import { orders } from "./schema";

type CsvRow = {
  client_id: string; order_id: string; order_date: string; delivery_date: string;
  carrier: string; origin_city: string; destination_city: string; status: string;
  sku: string; product_category: string; quantity: string; unit_price_usd: string;
  order_value_usd: string; is_promo: string; promo_discount_pct: string;
  region: string; warehouse: string;
};

async function seed() {
  const csv = readFileSync("data/mock_logistics_data.csv", "utf-8");
  const records: CsvRow[] = parse(csv, { columns: true, skip_empty_lines: true });

  const rows = records.map((r) => ({
    orderId: r.order_id,
    clientId: r.client_id,
    orderDate: r.order_date,
    deliveryDate: r.delivery_date || null,
    carrier: r.carrier,
    originCity: r.origin_city,
    destinationCity: r.destination_city,
    status: r.status,
    sku: r.sku,
    productCategory: r.product_category,
    quantity: Number(r.quantity),
    unitPriceUsd: r.unit_price_usd,
    orderValueUsd: r.order_value_usd,
    isPromo: r.is_promo === "1",
    promoDiscountPct: r.promo_discount_pct,
    region: r.region,
    warehouse: r.warehouse,
  }));

  await db.delete(orders); // safe to re-run
  await db.insert(orders).values(rows);
  console.log(`Seeded ${rows.length} orders`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
