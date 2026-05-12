-- TikTok Shop Orders table
-- Stores real order data fetched from TikTok Shop Open API
-- Order IDs from TikTok start with 57 or 58

CREATE TABLE IF NOT EXISTS tiktok_shop_orders (
  id                TEXT PRIMARY KEY,          -- TikTok order ID (starts with 57 or 58)
  shop_id           TEXT,                       -- Shop ID from tiktok_shop_connections
  open_id           TEXT,                       -- Seller open_id
  order_status      TEXT,                       -- e.g. COMPLETED, CANCELLED, IN_TRANSIT
  create_time       BIGINT,                     -- Unix epoch seconds
  update_time       BIGINT,                     -- Unix epoch seconds
  buyer_uid         TEXT,
  total_amount      TEXT,                       -- Stored as text to avoid precision issues
  currency          TEXT,                       -- e.g. VND, USD
  line_items        JSONB DEFAULT '[]'::jsonb,  -- Array of purchased items
  raw_data          JSONB,                      -- Full raw API response for this order
  synced_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_orders_shop_id     ON tiktok_shop_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_orders_open_id     ON tiktok_shop_orders(open_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_orders_status      ON tiktok_shop_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_tiktok_orders_create_time ON tiktok_shop_orders(create_time DESC);

-- Disable RLS for internal tool usage
ALTER TABLE tiktok_shop_orders DISABLE ROW LEVEL SECURITY;

GRANT ALL ON tiktok_shop_orders TO anon;
GRANT ALL ON tiktok_shop_orders TO authenticated;
