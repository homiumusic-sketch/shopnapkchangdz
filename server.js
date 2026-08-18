const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";

const db = new Database("shop.db");
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT UNIQUE NOT NULL,
  player_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL
)`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/orders", (req, res) => {
  const { playerId, amount } = req.body;
  if (!/^\d{5,15}$/.test(String(playerId || ""))) {
    return res.status(400).json({ error: "UID không hợp lệ." });
  }

  const allowed = [10000, 20000, 50000, 100000, 200000, 500000];
  const value = Number(amount);
  if (!allowed.includes(value)) {
    return res.status(400).json({ error: "Mệnh giá không hợp lệ." });
  }

  const code = "FF" + Date.now().toString(36).toUpperCase() +
    crypto.randomBytes(3).toString("hex").toUpperCase();

  db.prepare(`
    INSERT INTO orders (order_code, player_id, amount, status, created_at)
    VALUES (?, ?, ?, 'PENDING', ?)
  `).run(code, String(playerId), value, new Date().toISOString());

  res.json({
    orderCode: code,
    status: "PENDING",
    payment: {
      mode: "SANDBOX",
      message: "Đây là thanh toán mô phỏng. Chưa có giao dịch thật."
    }
  });
});

app.post("/api/sandbox/pay", (req, res) => {
  const { orderCode } = req.body;
  const order = db.prepare("SELECT * FROM orders WHERE order_code = ?").get(orderCode);
  if (!order) return res.status(404).json({ error: "Không tìm thấy đơn." });

  db.prepare("UPDATE orders SET status = 'PAID' WHERE order_code = ?")
    .run(orderCode);

  res.json({ ok: true, status: "PAID" });
});

app.get("/api/orders/:code", (req, res) => {
  const order = db.prepare(
    "SELECT order_code, player_id, amount, status, created_at FROM orders WHERE order_code = ?"
  ).get(req.params.code);

  if (!order) return res.status(404).json({ error: "Không tìm thấy đơn." });
  res.json(order);
});

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const expected = "Basic " + Buffer.from("admin:" + ADMIN_PASSWORD).toString("base64");
  if (auth !== expected) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = db.prepare(
    "SELECT * FROM orders ORDER BY id DESC LIMIT 200"
  ).all();
  res.json(orders);
});

app.listen(PORT, () => {
  console.log(`Free Fire Shop running at http://localhost:${PORT}`);
});
