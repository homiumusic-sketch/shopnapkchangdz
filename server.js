const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "DOI_MAT_KHAU_NGAY";

const SEPAY_API_KEY =
  process.env.SEPAY_API_KEY || "";

const db = new Database("shop.db");

// =====================================================
// DATABASE
// =====================================================

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  order_code TEXT UNIQUE NOT NULL,

  player_id TEXT NOT NULL,

  package_name TEXT NOT NULL,

  amount INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'PENDING',

  payment_id TEXT,

  payment_content TEXT,

  paid_amount INTEGER,

  paid_at TEXT,

  created_at TEXT NOT NULL
);
`);


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({
  limit: "1mb"
}));

app.use(express.static(__dirname));


// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});


// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online"
  });
});


// =====================================================
// TẠO MÃ ĐƠN
// =====================================================

function createOrderCode() {

  const random =
    crypto.randomBytes(4).toString("hex").toUpperCase();

  return `NFF${Date.now().toString().slice(-6)}${random}`;
}


// =====================================================
// KIỂM TRA ADMIN
// =====================================================

function checkAdmin(req, res, next) {

  const header =
    req.headers.authorization || "";

  if (!header.startsWith("Basic ")) {

    res.set(
      "WWW-Authenticate",
      'Basic realm="Admin"'
    );

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

  const separator =
    decoded.indexOf(":");

  const username =
    separator >= 0
      ? decoded.slice(0, separator)
      : "";

  const password =
    separator >= 0
      ? decoded.slice(separator + 1)
      : "";

  if (
    username !== "admin" ||
    password !== ADMIN_PASSWORD
  ) {

    return res.status(403).json({
      error:
        "Sai mật khẩu hoặc không được phép."
    });
  }

  next();
}


// =====================================================
// TẠO ĐƠN HÀNG
// =====================================================

app.post("/api/orders", (req, res) => {

  try {

    const {
      player_id,
      package_name,
      amount
    } = req.body;

    if (!player_id) {

      return res.status(400).json({
        success: false,
        message: "Thiếu ID Free Fire."
      });
    }

    if (!package_name) {

      return res.status(400).json({
        success: false,
        message: "Thiếu tên gói."
      });
    }

    const numericAmount =
      Number(amount);

    if (
      !Number.isInteger(numericAmount) ||
      numericAmount <= 0
    ) {

      return res.status(400).json({
        success: false,
        message: "Số tiền không hợp lệ."
      });
    }

    const cleanPlayerId =
      String(player_id)
        .trim()
        .replace(/[^\d]/g, "");

    if (!cleanPlayerId) {

      return res.status(400).json({
        success: false,
        message: "ID Free Fire không hợp lệ."
      });
    }

    const orderCode =
      createOrderCode();

    const createdAt =
      new Date().toISOString();

    db.prepare(`
      INSERT INTO orders (
        order_code,
        player_id,
        package_name,
        amount,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, 'PENDING', ?)
    `).run(
      orderCode,
      cleanPlayerId,
      String(package_name),
      numericAmount,
      createdAt
    );

    res.json({

      success: true,

      order: {
        order_code: orderCode,

        player_id: cleanPlayerId,

        package_name:
          String(package_name),

        amount:
          numericAmount,

        status: "PENDING",

        transfer_content:
          orderCode
      }

    });

  } catch (error) {

    console.error(
      "CREATE ORDER ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Không thể tạo đơn."
    });
  }
});


// =====================================================
// XEM TRẠNG THÁI ĐƠN
// =====================================================

app.get(
  "/api/orders/:orderCode",
  (req, res) => {

    const order =
      db.prepare(`
        SELECT
          id,
          order_code,
          player_id,
          package_name,
          amount,
          status,
          payment_id,
          paid_amount,
          paid_at,
          created_at
        FROM orders
        WHERE order_code = ?
      `).get(
        req.params.orderCode
      );

    if (!order) {

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn."
      });
    }

    res.json({
      success: true,
      order
    });
  }
);


// =====================================================
// SEPAY WEBHOOK
// =====================================================

app.post(
  "/webhook/sepay",
  (req, res) => {

    try {

      // -----------------------------------------------
      // XÁC THỰC SEPAY
      // -----------------------------------------------

      if (SEPAY_API_KEY) {

        const authorization =
          req.headers.authorization || "";

        const expected =
          `Apikey ${SEPAY_API_KEY}`;

        if (authorization !== expected) {

          console.warn(
            "SEPAY WEBHOOK: Unauthorized"
          );

          return res.status(401).json({
            success: false,
            message: "Unauthorized"
          });
        }
      }


      const data = req.body || {};

      console.log(
        "SEPAY WEBHOOK:",
        JSON.stringify(data)
      );


      // -----------------------------------------------
      // LẤY THÔNG TIN GIAO DỊCH
      // -----------------------------------------------

      const paymentId =
        String(
          data.id ??
          data.transactionId ??
          data.referenceCode ??
          ""
        );

      const transferAmount =
        Number(
          data.transferAmount ??
          data.amount ??
          0
        );

      const content =
        String(
          data.content ??
          data.description ??
          data.transferDescription ??
          ""
        ).trim();


      if (
        !transferAmount ||
        transferAmount <= 0
      ) {

        return res.status(200).json({
          success: true,
          message: "Ignored: invalid amount"
        });
      }


      // -----------------------------------------------
      // TÌM MÃ ĐƠN NFF...
      // -----------------------------------------------

      const codeMatch =
        content.match(
          /NFF\d+[A-Z0-9]*/i
        );

      if (!codeMatch) {

        console.log(
          "Không tìm thấy mã đơn trong:",
          content
        );

        return res.status(200).json({
          success: true,
          message: "Ignored: no order code"
        });
      }


      const orderCode =
        codeMatch[0].toUpperCase();


      // -----------------------------------------------
      // TÌM ĐƠN
      // -----------------------------------------------

      const order =
        db.prepare(`
          SELECT *
          FROM orders
          WHERE order_code = ?
        `).get(orderCode);


      if (!order) {

        console.log(
          "Không tìm thấy đơn:",
          orderCode
        );

        return res.status(200).json({
          success: true,
          message: "Ignored: order not found"
        });
      }


      // -----------------------------------------------
      // CHỐNG GHI NHẬN TRÙNG
      // -----------------------------------------------

      if (
        paymentId &&
        order.payment_id === paymentId
      ) {

        return res.status(200).json({
          success: true,
          message: "Already processed"
        });
      }


      // -----------------------------------------------
      // ĐƠN ĐÃ THANH TOÁN
      // -----------------------------------------------

      if (order.status === "PAID") {

        return res.status(200).json({
          success: true,
          message: "Order already paid"
        });
      }


      // -----------------------------------------------
      // KIỂM TRA SỐ TIỀN
      // -----------------------------------------------

      if (
        transferAmount !==
        Number(order.amount)
      ) {

        console.warn(
          `Sai số tiền ${orderCode}: ` +
          `cần ${order.amount}, ` +
          `nhận ${transferAmount}`
        );

        db.prepare(`
          UPDATE orders
          SET
            payment_id = ?,
            payment_content = ?,
            paid_amount = ?
          WHERE order_code = ?
        `).run(
          paymentId || null,
          content,
          transferAmount,
          orderCode
        );

        return res.status(200).json({
          success: true,
          message: "Amount mismatch"
        });
      }


      // -----------------------------------------------
      // THANH TOÁN THÀNH CÔNG
      // -----------------------------------------------

      const paidAt =
        new Date().toISOString();

      db.prepare(`
        UPDATE orders
        SET
          status = 'PAID',
          payment_id = ?,
          payment_content = ?,
          paid_amount = ?,
          paid_at = ?
        WHERE order_code = ?
      `).run(
        paymentId || null,
        content,
        transferAmount,
        paidAt,
        orderCode
      );


      console.log(
        `ĐÃ THANH TOÁN: ${orderCode}`
      );


      res.status(200).json({
        success: true,
        message: "Payment received",
        order_code: orderCode
      });

    } catch (error) {

      console.error(
        "SEPAY WEBHOOK ERROR:",
        error
      );

      res.status(500).json({
        success: false
      });
    }
  }
);


// =====================================================
// ADMIN - DANH SÁCH ĐƠN
// =====================================================

app.get(
  "/api/admin/orders",
  checkAdmin,
  (req, res) => {

    const orders =
      db.prepare(`
        SELECT
          id,
          order_code,
          player_id,
          package_name,
          amount,
          status,
          payment_id,
          payment_content,
          paid_amount,
          paid_at,
          created_at
        FROM orders
        ORDER BY id DESC
      `).all();

    res.json({
      success: true,
      orders
    });
  }
);


// =====================================================
// ADMIN - XEM 1 ĐƠN
// =====================================================

app.get(
  "/api/admin/orders/:orderCode",
  checkAdmin,
  (req, res) => {

    const order =
      db.prepare(`
        SELECT *
        FROM orders
        WHERE order_code = ?
      `).get(
        req.params.orderCode
      );

    if (!order) {

      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn."
      });
    }

    res.json({
      success: true,
      order
    });
  }
);


// =====================================================
// SERVER
// =====================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Server running on port ${PORT}`
    );

  }
);
