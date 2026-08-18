<script>
document.getElementById("load").onclick = async () => {
  const pass = document.getElementById("password").value.trim();
  const box = document.getElementById("orders");

  if (!pass) {
    box.textContent = "Vui lòng nhập mật khẩu admin.";
    return;
  }

  try {
    const auth = "Basic " + btoa("admin:" + pass);

    const res = await fetch("/api/admin/orders", {
      method: "GET",
      headers: {
        "Authorization": auth,
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      box.textContent = "Sai mật khẩu hoặc không được phép.";
      return;
    }

    const result = await res.json();

    // Server có thể trả { success: true, orders: [...] }
    // hoặc trả trực tiếp [...]
    const orders = Array.isArray(result)
      ? result
      : (Array.isArray(result.orders) ? result.orders : []);

    if (orders.length === 0) {
      box.textContent = "Chưa có đơn.";
      return;
    }

    box.innerHTML = orders.map(o => `
      <div class="order">
        <b>${o.order_code || "Không có mã đơn"}</b><br>
        UID: ${o.player_id || "N/A"} •
        ${Number(o.amount || 0).toLocaleString("vi-VN")}đ<br>
        Trạng thái:
        <strong>${o.status || "unknown"}</strong>
      </div>
    `).join("");

  } catch (error) {
    console.error(error);
    box.textContent = "Không thể kết nối máy chủ.";
  }
};
</script>
