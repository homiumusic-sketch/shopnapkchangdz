const express = require("express");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const DB = "orders.json";

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(DB, "utf8"));
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(
    DB,
    JSON.stringify(orders, null, 2)
  );
}

function createOrderCode() {
  return "NFF" + crypto.randomInt(100000, 999999);
}


/* =========================
   TẠO ĐƠN
========================= */

app.post("/api/orders", (req, res) => {

  const {
    playerId,
    packageName,
    amount
  } = req.body || {};

  if (
    !playerId ||
    !packageName ||
    !Number(amount)
  ) {
    return res.status(400).json({
      error: "Thiếu thông tin"
    });
  }

  const order = {
    orderId: createOrderCode(),
    playerId: String(playerId),
    packageName: String(packageName),
    amount: Number(amount),

    // pending = chờ thanh toán
    // paid = khách đã chuyển khoản
    // processing = admin đang nạp
    // recharged = admin đã nạp thành công
    status: "pending",

    createdAt: new Date().toISOString()
  };

  const orders = readOrders();

  orders.push(order);

  writeOrders(orders);

  res.json(order);
});


/* =========================
   KHÁCH KIỂM TRA ĐƠN
========================= */

app.get("/api/orders/:id", (req, res) => {

  const order = readOrders().find(
    x => x.orderId === req.params.id
  );

  if (!order) {
    return res.status(404).json({
      error: "Không tìm thấy đơn"
    });
  }

  res.json({
    orderId: order.orderId,
    playerId: order.playerId,
    packageName: order.packageName,
    amount: order.amount,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    rechargedAt: order.rechargedAt || null
  });
});


/* =========================
   ADMIN - LẤY ĐƠN
========================= */

app.get("/api/admin/orders", (req, res) => {

  const adminToken =
    req.get("x-admin-token");

  if (
    adminToken !==
    (process.env.ADMIN_TOKEN || "doi-token-nay")
  ) {
    return res.status(401).json({
      error: "Không có quyền admin"
    });
  }

  res.json(readOrders());
});


/* =========================
   ADMIN - ĐỔI TRẠNG THÁI
========================= */

app.patch(
  "/api/orders/:id/status",
  (req, res) => {

    const adminToken =
      req.get("x-admin-token");

    if (
      adminToken !==
      (process.env.ADMIN_TOKEN || "doi-token-nay")
    ) {
      return res.status(401).json({
        error: "Không có quyền admin"
      });
    }

    const newStatus =
      String(
        req.body?.status || ""
      ).toLowerCase();

    const allowedStatuses = [
      "processing",
      "recharged"
    ];

    if (
      !allowedStatuses.includes(
        newStatus
      )
    ) {
      return res.status(400).json({
        error: "Trạng thái không hợp lệ"
      });
    }

    const orders = readOrders();

    const order = orders.find(
      x =>
        x.orderId ===
        String(req.params.id)
    );

    if (!order) {
      return res.status(404).json({
        error: "Không tìm thấy đơn"
      });
    }


    /*
      ĐANG NẠP:
      Chỉ cho phép khi khách đã thanh toán.
    */

    if (
      newStatus === "processing"
    ) {

      if (
        order.status !== "paid" &&
        order.status !== "processing"
      ) {
        return res.status(400).json({
          error:
            "Đơn chưa được xác nhận thanh toán."
        });
      }

      order.status = "processing";

      order.processingAt =
        new Date().toISOString();
    }


    /*
      THÀNH CÔNG:
      Admin tự tay bấm nút sau khi
      đã nạp kim cương cho khách.
    */

    if (
      newStatus === "recharged"
    ) {

      if (
        order.status !== "paid" &&
        order.status !== "processing"
      ) {
        return res.status(400).json({
          error:
            "Đơn chưa ở trạng thái đang nạp."
        });
      }

      order.status = "recharged";

      order.rechargedAt =
        new Date().toISOString();
    }


    writeOrders(orders);

    res.json({
      success: true,
      order
    });
  }
);


/* =========================
   WEBHOOK THANH TOÁN
========================= */

app.post(
  "/api/payment-webhook",
  (req, res) => {

    if (
      req.get("x-webhook-token") !==
      (process.env.WEBHOOK_TOKEN ||
        "doi-webhook-token")
    ) {
      return res.status(401).json({
        error: "Webhook không hợp lệ"
      });
    }

    const {
      orderId,
      amount,
      transactionId
    } = req.body || {};

    const orders = readOrders();

    const order = orders.find(
      x =>
        x.orderId ===
        String(orderId)
    );

    if (!order) {
      return res.status(404).json({
        error: "Không tìm thấy đơn"
      });
    }

    if (
      Number(amount) !==
      Number(order.amount)
    ) {
      return res.status(400).json({
        error: "Sai số tiền"
      });
    }

    /*
      Webhook CHỈ xác nhận khách đã
      chuyển khoản.

      Không tự chuyển sang recharged.
    */

    if (
      order.status !== "recharged"
    ) {

      order.status = "paid";

      order.transactionId =
        transactionId || null;

      order.paidAt =
        new Date().toISOString();

      writeOrders(orders);
    }

    res.json({
      ok: true
    });
  }
);


/* =========================
   CHẠY SERVER
========================= */

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  () => {
    console.log(
      `Server running on port ${PORT}`
    );
  }
);
