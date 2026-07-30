-- Global checkout-link-open counter used by functions/checkout.js.
-- Single row (id = 1) updated atomically via `UPDATE ... SET value = value + 1 RETURNING value`.
CREATE TABLE IF NOT EXISTS checkout_counter (
  id INTEGER PRIMARY KEY,
  value INTEGER NOT NULL
);

INSERT OR IGNORE INTO checkout_counter (id, value) VALUES (1, 0);
