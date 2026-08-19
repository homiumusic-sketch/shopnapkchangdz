const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

/*
=====================================================
ADMIN LOGIN
=====================================================

Render Environment Variables:

ADMIN_USERNAME = Hoanganh123
ADMIN_PASSWORD = mat_khau_cua_ban
*/

const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME || "admin";

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "";

const SEPAY_API_KEY =
  process.env.SEPAY_API_KEY || "";

const db = new Database("shop.db");

/*
=====================================================
ADMIN TOKEN
=====================================================
*/

const ADMIN_TOKEN_TTL =
  24 * 60 * 60 * 1000; // 24 giờ

/*
=====================================================
DATABASE
=====================================================
*/

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

/*
=====================================================
MIDDLEWARE
=====================================================
*/

app.use(express.json({ limit: "1mb" }));

app.use(express.static(__dirname));

/*
=====================================================
HOME
=====================================================
*/

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

/*
=====================================================
HEALTH
=====================================================
*/

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online"
  });
});

/*
=====================================================
TẠO MÃ ĐƠN
=====================================================
*/

function createOrderCode() {
  const random =
    crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase();

  return (
    `NFF` +
    Date.now().toString().slice(-6) +
    random
  );
}

/*
=====================================================
SO SÁNH CHUỖI AN TOÀN
=====================================================
*/

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));

  if (aa.length !== bb.length) {
    return false;
  }

  return crypto.timingSafeEqual(aa, bb);
}

/*
=====================================================
TẠO ADMIN TOKEN
=====================================================
*/

function createAdminToken() {
  const timestamp =
    Date.now().toString();

  const payload =
    `${ADMIN_USERNAME}:${timestamp}`;

  const secret =
    ADMIN_PASSWORD ||
    "change-this-password";

  const signature =
    crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

  const token =
    Buffer
      .from(
        `${payload}:${signature}`
      )
      .toString("base64url");

  return token;
}

/*
=====================================================
KIỂM TRA ADMIN TOKEN
=====================================================
*/

function verifyAdminToken(token) {
  try {
    if (!token) {
      return false;
    }

    const decoded =
      Buffer
        .from(token, "base64url")
        .toString("utf8");

    const parts =
      decoded.split(":");

    if (parts.length !== 3) {
      return false;
    }

    const username =
      parts[0];

    const timestamp =
      Number(parts[1]);

    const signature =
      parts[2];

    if (
      username !==
      ADMIN_USERNAME
    ) {
      return false;
    }

    if (
      !Number.isFinite(timestamp)
    ) {
      return false;
    }

    if (
      Date.now() - timestamp >
      ADMIN_TOKEN_TTL
    ) {
      return false;
    }

    const payload =
      `${username}:${timestamp}`;

    const secret =
      ADMIN_PASSWORD ||
      "change-this-password";

    const expected =
      crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");

    return safeEqual(
      signature,
      expected
    );

  } catch (error) {
    return false;
  }
}

/*
=====================================================
ADMIN AUTH
=====================================================
*/

function checkAdmin(req, res, next) {

  const header =
    req.headers.authorization || "";

  /*
  -----------------------------------------------
  Bearer TOKEN
  -----------------------------------------------
  */

  if (
    header.startsWith("Bearer ")
  ) {

    const token =
      header.slice(7).trim();

    if (
      verifyAdminToken(token)
    ) {
      return next();
    }

    return res.status(401).json({
      success: false,
      message:
        "Phiên đăng nhập hết hạn."
    });
  }

  /*
  -----------------------------------------------
  BASIC AUTH
  -----------------------------------------------
  */

  if (
    header.startsWith("Basic ")
  ) {

    let decoded;

    try {

      decoded =
        Buffer
          .from(
            header.slice(6),
            "base64"
          )
          .toString("utf8");

    } catch {

      return res.status(401).json({
        success: false,
        message:
          "Unauthorized"
      });
    }

    const separator =
      decoded.indexOf(":");

    const username =
      separator >= 0
        ? decoded.slice(
            0,
            separator
          )
        : "";

    const password =
      separator >= 0
        ? decoded.slice(
            separator + 1
          )
        : "";

    if (
      safeEqual(
        username,
        ADMIN_USERNAME
      ) &&
      safeEqual(
        password,
        ADMIN_PASSWORD
      )
    ) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message:
        "Sai tài khoản hoặc mật khẩu."
    });
  }

  /*
  -----------------------------------------------
  KHÔNG CÓ AUTH
  -----------------------------------------------
  */

  return res.status(401).json({
    success: false,
    message:
      "Chưa đăng nhập admin."
  });
}

/*
=====================================================
ADMIN LOGIN API
=====================================================
*/

app.post(
  "/api/admin/login",
  (req, res) => {

    try {

      const username =
        String(
          req.body?.username || ""
        ).trim();

      const password =
        String(
          req.body?.password || ""
        );

      if (!username) {

        return res.status(400).json({
          success: false,
          message:
            "Vui lòng nhập tài khoản."
        });
      }

      if (!password) {

        return res.status(400).json({
          success: false,
          message:
            "Vui lòng nhập mật khẩu."
        });
      }

      const usernameCorrect =
        safeEqual(
          username,
          ADMIN_USERNAME
        );

      const passwordCorrect =
        safeEqual(
          password,
          ADMIN_PASSWORD
        );

      if (
        !usernameCorrect ||
        !passwordCorrect
      ) {

        return res.status(401).json({
          success: false,
          message:
            "Tài khoản hoặc mật khẩu không đúng."
        });
      }

      const token =
        createAdminToken();

      return res.json({
        success: true,
        message:
          "Đăng nhập thành công.",
        token,
        admin_username:
          ADMIN_USERNAME,
        expires_in:
          ADMIN_TOKEN_TTL
      });

    } catch (error) {

      console.error(
        "ADMIN LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Không thể đăng nhập admin."
      });
    }
  }
);

/*
=====================================================
TẠO ĐƠN HÀNG
=====================================================
*/

app.post(
  "/api/orders",
  (req, res) => {

    try {

      const {
        player_id,
        package_name,
        amount
      } = req.body;

      if (!player_id) {

        return res.status(400).json({
          success: false,
          message:
            "Thiếu ID Free Fire."
        });
      }

      if (!package_name) {

        return res.status(400).json({
          success: false,
          message:
            "Thiếu tên gói."
        });
      }

      const numericAmount =
        Number(amount);

      if (
        !Number.isInteger(
          numericAmount
        ) ||
        numericAmount <= 0
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Số tiền không hợp lệ."
        });
      }

      const cleanPlayerId =
        String(player_id)
          .trim()
          .replace(/[^\d]/g, "");

      if (!cleanPlayerId) {

        return res.status(400).json({
          success: false,
          message:
            "ID Free Fire không hợp lệ."
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
        VALUES (
          ?,
          ?,
          ?,
          ?,
          'PENDING',
          ?
        )
      `).run(
        orderCode,
        cleanPlayerId,
        String(package_name),
        numericAmount,
        createdAt
      );

      return res.json({
        success: true,

        order: {
          order_code:
            orderCode,

          player_id:
            cleanPlayerId,

          package_name:
            String(package_name),

          amount:
            numericAmount,

          status:
            "PENDING",

          transfer_content:
            orderCode
        }
      });

    } catch (error) {

      console.error(
        "CREATE ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Không thể tạo đơn."
      });
    }
  }
);

/*
=====================================================
KHÁCH KIỂM TRA 1 ĐƠN
=====================================================
*/

app.get(
  "/api/orders/:orderCode",
  (req, res) => {

    try {

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
          message:
            "Không tìm thấy đơn."
        });
      }

      return res.json({
        success: true,
        order
      });

    } catch (error) {

      console.error(
        "GET ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Không thể lấy đơn."
      });
    }
  }
);

/*
=====================================================
KHÁCH KIỂM TRA LỊCH SỬ
=====================================================
*/

app.get(
  "/api/orders/player/:playerId",
  (req, res) => {

    try {

      const playerId =
        String(
          req.params.playerId
        )
          .trim()
          .replace(/[^\d]/g, "");

      if (!playerId) {

        return res.status(400).json({
          success: false,
          message:
            "ID Free Fire không hợp lệ."
        });
      }

      const orders =
        db.prepare(`
          SELECT
            id,
            order_code,
            player_id,
            package_name,
            amount,
            status,
            paid_amount,
            paid_at,
            created_at
          FROM orders
          WHERE player_id = ?
          ORDER BY id DESC
        `).all(playerId);

      return res.json({
        success: true,
        player_id:
          playerId,
        orders
      });

    } catch (error) {

      console.error(
        "PLAYER HISTORY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Không thể lấy lịch sử nạp."
      });
    }
  }
);

/*
=====================================================
ADMIN - DANH SÁCH ĐƠN
=====================================================

admin.html hiện tại gọi:

GET /api/orders

nên route này được bảo vệ bằng admin token.
*/

app.get(
  "/api/orders",
  checkAdmin,
  (req, res) => {

    try {

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

      return res.json({
        success: true,
        orders
      });

    } catch (error) {

      console.error(
        "ADMIN ORDERS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Không thể tải đơn hàng."
      });
    }
  }
);

/*
=====================================================
ADMIN - XEM 1 ĐƠN
=====================================================
*/

app.get(
  "/api/admin/orders/:orderCode",
  checkAdmin,
  (req, res) => {

    try {

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
          message:
            "Không tìm thấy đơn."
        });
      }

      return res.json({
        success: true,
        order
      });

    } catch (error) {

      console.error(
        "ADMIN GET ORDER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Không thể lấy đơn."
      });
    }
  }
);

/*
=====================================================
ADMIN - ĐỔI TRẠNG THÁI
=====================================================

admin.html gọi:

PATCH /api/orders/:orderCode/status

status:
PROCESSING
PAID
*/

app.patch(
  "/api/orders/:orderCode/status",
  checkAdmin,
  (req, res) => {

    try {

      const orderCode =
        String(
          req.params.orderCode || ""
        )
          .trim()
          .toUpperCase();

      const newStatus =
        String(
          req.body?.status || ""
        )
          .trim()
          .toUpperCase();

      if (!orderCode) {

        return res.status(400).json({
          success: false,
          message:
            "Thiếu mã đơn."
        });
      }

      if (
        newStatus !==
          "PROCESSING" &&
        newStatus !==
          "PAID"
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Trạng thái không hợp lệ."
        });
      }

      const order =
        db.prepare(`
          SELECT *
          FROM orders
          WHERE order_code = ?
        `).get(orderCode);

      if (!order) {

        return res.status(404).json({
          success: false,
          message:
            "Không tìm thấy đơn."
        });
      }

      if (
        order.status === "PAID" &&
        newStatus !== "PAID"
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Đơn đã hoàn tất, không thể chuyển ngược trạng thái."
        });
      }

      let paidAt =
        order.paid_at;

      if (
        newStatus === "PAID" &&
        !paidAt
      ) {

        paidAt =
          new Date().toISOString();
      }

      db.prepare(`
        UPDATE orders
        SET
          status = ?,
          paid_at = ?
        WHERE order_code = ?
      `).run(
        newStatus,
        paidAt || null,
        orderCode
      );

      const updatedOrder =
        db.prepare(`
          SELECT *
          FROM orders
          WHERE order_code = ?
        `).get(orderCode);

      return res.json({
        success: true,
        message:
          newStatus === "PAID"
            ? "Đã xác nhận đã nạp kim cương."
            : "Đã chuyển sang đang nạp.",
        order:
          updatedOrder
      });

    } catch (error) {

      console.error(
        "UPDATE STATUS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Không thể cập nhật trạng thái."
      });
    }
  }
);

/*
=====================================================
ADMIN - XÁC NHẬN THÀNH CÔNG
=====================================================
*/

app.post(
  "/api/admin/orders/:orderCode/success",
  checkAdmin,
  (req, res) => {

    try {

      const orderCode =
        String(
          req.params.orderCode
        )
          .trim()
          .toUpperCase();

      const order =
        db.prepare(`
          SELECT *
          FROM orders
          WHERE order_code = ?
        `).get(orderCode);

      if (!order) {

        return res.status(404).json({
          success: false,
          message:
            "Không tìm thấy đơn."
        });
      }

      const now =
        new Date().toISOString();

      db.prepare(`
        UPDATE orders
        SET
          status = 'PAID',
          paid_at =
            COALESCE(
              paid_at,
              ?
            )
        WHERE order_code = ?
      `).run(
        now,
        orderCode
      );

      return res.json({
        success: true,
        message:
          "Đã xác nhận thành công.",
        order_code:
          orderCode
      });

    } catch (error) {

      console.error(
        "ADMIN SUCCESS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Không thể xác nhận đơn."
      });
    }
  }
);

/*
=====================================================
SEPAY WEBHOOK
=====================================================
*/

app.post(
  "/webhook/sepay",
  (req, res) => {

    try {

      if (SEPAY_API_KEY) {

        const authorization =
          req.headers.authorization || "";

        const expected =
          `Apikey ${SEPAY_API_KEY}`;

        if (
          authorization !==
          expected
        ) {

          return res.status(401).json({
            success: false,
            message:
              "Unauthorized"
          });
        }
      }

      const data =
        req.body || {};

      console.log(
        "SEPAY WEBHOOK:",
        JSON.stringify(data)
      );

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
          message:
            "Ignored: invalid amount"
        });
      }

      const codeMatch =
        content.match(
          /NFF\d+[A-Z0-9]*/i
        );

      if (!codeMatch) {

        return res.status(200).json({
          success: true,
          message:
            "Ignored: no order code"
        });
      }

      const orderCode =
        codeMatch[0]
          .toUpperCase();

      const order =
        db.prepare(`
          SELECT *
          FROM orders
          WHERE order_code = ?
        `).get(orderCode);

      if (!order) {

        return res.status(200).json({
          success: true,
          message:
            "Ignored: order not found"
        });
      }

      if (
        paymentId &&
        order.payment_id ===
          paymentId
      ) {

        return res.status(200).json({
          success: true,
          message:
            "Already processed"
        });
      }

      if (
        order.status ===
        "PAID"
      ) {

        return res.status(200).json({
          success: true,
          message:
            "Order already paid"
        });
      }

      /*
      -----------------------------------------------
      SAI SỐ TIỀN
      -----------------------------------------------
      */

      if (
        transferAmount !==
        Number(order.amount)
      ) {

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
          message:
            "Amount mismatch"
        });
      }

      /*
      -----------------------------------------------
      THANH TOÁN ĐÚNG
      -----------------------------------------------
      */

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

      return res.status(200).json({
        success: true,
        message:
          "Payment received",
        order_code:
          orderCode
      });

    } catch (error) {

      console.error(
        "SEPAY WEBHOOK ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Webhook error"
      });
    }
  }
);

/*
=====================================================
SERVER
=====================================================
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Server running on port ${PORT}`
    );

    console.log(
      `Admin username: ${ADMIN_USERNAME}`
    );

  }
);
