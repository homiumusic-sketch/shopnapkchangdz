const form = document.getElementById("form");
const result = document.getElementById("result");
const lookup = document.getElementById("lookup");
const statusBox = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  result.textContent = "Đang tạo đơn...";

  const res = await fetch("/api/orders", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      playerId: document.getElementById("playerId").value.trim(),
      amount: Number(document.getElementById("amount").value)
    })
  });

  const data = await res.json();
  if (!res.ok) {
    result.textContent = data.error || "Có lỗi.";
    return;
  }

  result.innerHTML = `
    <div class="success">
      Đã tạo đơn <b>${data.orderCode}</b><br>
      <span>${data.payment.message}</span>
      <button id="sandboxPay">Thanh toán DEMO</button>
    </div>`;

  document.getElementById("sandboxPay").onclick = async () => {
    const r = await fetch("/api/sandbox/pay", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({orderCode:data.orderCode})
    });
    const p = await r.json();
    result.innerHTML += `<p class="success">Trạng thái: ${p.status}</p>`;
  };
});

document.getElementById("check").onclick = async () => {
  const code = lookup.value.trim();
  const res = await fetch("/api/orders/" + encodeURIComponent(code));
  const data = await res.json();
  statusBox.textContent = res.ok
    ? `Đơn ${data.order_code}: ${data.status} — UID ${data.player_id}`
    : (data.error || "Không tìm thấy đơn.");
};