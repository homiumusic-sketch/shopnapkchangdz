const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

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
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function checkAdmin(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  let decoded;

  try {
    decoded = Buffer.from(
      header.slice(6),
      "base64"
    ).toString("utf8");
  } catch {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const separator = decoded.indexOf(":");

  const username =
    separator >= 0 ? decoded.slice(0, separator) : "";

  const password =
    separator >= 0 ? decoded.slice(separator + 1) : "";

  if (
    username !== "admin" ||
    password !== ADMIN_PASSWORD
  ) {
    return res.status(403).json({
      error: "Sai mật khẩu hoặc không được phép."
    });
  }

  next();
}

app.get("/api/admin/orders", checkAdmin, (req, res) => {
  const orders = db.prepare(`
    SELECT
      id,
      order_code,
      player_id,
      amount,
      status,
      created_at
    FROM orders
    ORDER BY id DESC
  `).all();

  res.json(orders);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
