const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
const BANK_CODE = "TPB";
const BANK_ACCOUNT = "26112071111";
const ACCOUNT_NAME = "NGUYEN HOANG ANH";

const DATA_FILE = path.join(__dirname, "orders.json");
const PUBLIC_DIR = __dirname;

if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");

function readOrders() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveOrders(orders) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), "utf8");
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "same-origin",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request quá lớn"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error("JSON không hợp lệ")); }
    });
    req.on("error", reject);
  });
}

function makeOrderCode() {
  const t = Date.now().toString(36).toUpperCase();
  const r = crypto.randomBytes(3).toString("hex").toUpperCase();
  return "FF" + t + r;
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

const adminTokens = new Set();

function getToken(req) {
  const auth = String(req.headers.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return "";
}

function requireAdmin(req, res) {
  const token = getToken(req);
  if (!token || !adminTokens.has(token)) {
    json(res, 401, { success: false, message: "Phiên admin không hợp lệ hoặc đã hết hạn." });
    return false;
  }
  return true;
}

function sanitizeOrder(order) {
  return {
    order_code: order.order_code,
    player_id: order.player_id,
    package_name: order.package_name,
    amount: order.amount,
    transfer_content: order.transfer_content,
    status: order.status,
    created_at: order.created_at,
    paid_at: order.paid_at || null,
    recharged_at: order.recharged_at || null
  };
}

function serveFile(res, filename, contentType) {
  const file = path.join(PUBLIC_DIR, filename);
  if (!fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache"
  });
  res.end(fs.readFileSync(file));
}

function validateStatusTransition(oldStatus, newStatus) {
  // KHÔNG có webhook/ngân hàng tự động đổi trạng thái.
  // Chỉ admin gọi PATCH /api/orders/:code/status mới được đổi.
  const allowed = {
    PENDING: ["PROCESSING", "RECHARGED"],
    PROCESSING: ["RECHARGED"],
    PAID: ["PROCESSING", "RECHARGED"],
    RECHARGED: []
  };
  return (allowed[oldStatus] || []).includes(newStatus);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "same-origin",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
      });
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/") {
      return serveFile(res, "index.html", "text/html; charset=utf-8");
    }

    if (req.method === "GET" && pathname === "/admin.html") {
      return serveFile(res, "admin.html", "text/html; charset=utf-8");
    }

    if (req.method === "POST" && pathname === "/api/admin/login") {
      const body = await readBody(req);
      if (body.username !== ADMIN_USER || body.password !== ADMIN_PASSWORD) {
        return json(res, 401, { success: false, message: "Sai tài khoản hoặc mật khẩu." });
      }
      const token = makeToken();
      adminTokens.add(token);
      return json(res, 200, { success: true, token });
    }

    if (req.method === "GET" && pathname === "/api/orders") {
      if (!requireAdmin(req, res)) return;
      const orders = readOrders()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(sanitizeOrder);
      return json(res, 200, { success: true, orders });
    }

    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (req.method === "GET" && orderMatch) {
      const code = decodeURIComponent(orderMatch[1]).toUpperCase();
      const order = readOrders().find(o => o.order_code === code);
      if (!order) return json(res, 404, { success: false, message: "Không tìm thấy đơn hàng." });
      return json(res, 200, { success: true, order: sanitizeOrder(order) });
    }

    if (req.method === "POST" && pathname === "/api/orders") {
      const body = await readBody(req);
      const playerId = String(body.player_id || "").replace(/\D/g, "");
      const packageName = String(body.package_name || "").trim();
      const amount = Number(body.amount);

      if (!playerId) return json(res, 400, { success: false, message: "ID Free Fire không hợp lệ." });
      if (!packageName) return json(res, 400, { success: false, message: "Chưa chọn gói." });
      if (!Number.isFinite(amount) || amount <= 0) {
        return json(res, 400, { success: false, message: "Số tiền không hợp lệ." });
      }

      const orderCode = makeOrderCode();
      const order = {
        order_code: orderCode,
        player_id: playerId,
        package_name: packageName,
        amount: Math.round(amount),
        transfer_content: orderCode,
        status: "PENDING",
        created_at: new Date().toISOString(),
        paid_at: null,
        recharged_at: null
      };

      const orders = readOrders();
      orders.push(order);
      saveOrders(orders);

      return json(res, 201, {
        success: true,
        order: {
          ...sanitizeOrder(order),
          bank_code: BANK_CODE,
          bank_account: BANK_ACCOUNT,
          account_name: ACCOUNT_NAME
        }
      });
    }

    const statusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
    if (req.method === "PATCH" && statusMatch) {
      if (!requireAdmin(req, res)) return;

      const code = decodeURIComponent(statusMatch[1]).toUpperCase();
      const body = await readBody(req);
      const newStatus = String(body.status || "").toUpperCase();

      if (!["PROCESSING", "RECHARGED"].includes(newStatus)) {
        return json(res, 400, { success: false, message: "Trạng thái không hợp lệ." });
      }

      const orders = readOrders();
      const index = orders.findIndex(o => o.order_code === code);

      if (index < 0) {
        return json(res, 404, { success: false, message: "Không tìm thấy đơn hàng." });
      }

      const order = orders[index];

      if (!validateStatusTransition(order.status, newStatus)) {
        return json(res, 409, {
          success: false,
          message: `Không thể chuyển từ ${order.status} sang ${newStatus}.`
        });
      }

      order.status = newStatus;

      if (newStatus === "PROCESSING" && !order.paid_at) {
        // Đây là thao tác admin thủ công; không phải tự động theo ngân hàng.
        order.paid_at = new Date().toISOString();
      }

      if (newStatus === "RECHARGED") {
        order.recharged_at = new Date().toISOString();
      }

      saveOrders(orders);

      return json(res, 200, { success: true, order: sanitizeOrder(order) });
    }

    return json(res, 404, { success: false, message: "API không tồn tại." });
  } catch (error) {
    console.error(error);
    return json(res, 500, { success: false, message: error.message || "Lỗi máy chủ." });
  }
});

server.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin.html`);
  console.log(`Tài khoản mặc định: ${ADMIN_USER}`);
  console.log(`Mật khẩu mặc định: ${ADMIN_PASSWORD}`);
});
