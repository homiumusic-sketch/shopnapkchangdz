<!-- ================= LỊCH SỬ NẠP ================= -->
<section class="history-section">
    <h2>🔄 Lịch sử giao dịch</h2>

    <div class="history-search">
        <input
            type="text"
            id="historyPlayerId"
            placeholder="Nhập ID FF"
            inputmode="numeric"
        >
        <button onclick="timLichSuNap()">🔍</button>
    </div>

    <div id="historyResult"></div>
</section>

<style>
.history-section {
    max-width: 750px;
    margin: 30px auto;
    padding: 25px 20px;
    background: #f3f5f8;
    border-radius: 18px;
}

.history-section h2 {
    text-align: center;
    color: #444;
    margin-bottom: 25px;
    font-size: 28px;
}

.history-search {
    display: flex;
    width: 100%;
    margin-bottom: 25px;
}

.history-search input {
    flex: 1;
    height: 58px;
    padding: 0 20px;
    font-size: 20px;
    border: 1px solid #ddd;
    border-radius: 10px 0 0 10px;
    outline: none;
    box-sizing: border-box;
}

.history-search button {
    width: 90px;
    border: none;
    background: #1677ff;
    color: white;
    font-size: 28px;
    border-radius: 0 10px 10px 0;
    cursor: pointer;
}

.history-card {
    background: white;
    padding: 25px 30px;
    margin-bottom: 18px;
    border-radius: 15px;
    box-shadow: 0 2px 8px rgba(0,0,0,.06);
}

.history-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    margin-bottom: 18px;
}

.history-id {
    font-size: 24px;
    color: #444;
}

.history-id strong {
    color: #1677ff;
}

.history-status {
    background: #20a34a;
    color: white;
    padding: 10px 22px;
    border-radius: 8px;
    font-size: 20px;
    font-weight: bold;
}

.history-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    color: #555;
    font-size: 19px;
}

.history-package {
    color: #429b59;
    font-weight: bold;
}

.history-time {
    color: #888;
}

.history-empty {
    text-align: center;
    padding: 30px;
    background: white;
    border-radius: 15px;
    color: #777;
    font-size: 18px;
}

.history-loading {
    text-align: center;
    padding: 25px;
    color: #777;
}

@media (max-width: 600px) {
    .history-section {
        padding: 18px 12px;
    }

    .history-section h2 {
        font-size: 24px;
    }

    .history-top {
        align-items: flex-start;
        flex-direction: column;
    }

    .history-id {
        font-size: 20px;
    }

    .history-status {
        font-size: 17px;
    }

    .history-info {
        flex-direction: column;
        align-items: flex-start;
    }
}
</style>

<script>
async function timLichSuNap() {
    const playerId = document
        .getElementById("historyPlayerId")
        .value
        .trim();

    const resultBox = document.getElementById("historyResult");

    if (!playerId) {
        alert("Vui lòng nhập ID Free Fire!");
        return;
    }

    resultBox.innerHTML =
        '<div class="history-loading">⏳ Đang tìm lịch sử nạp...</div>';

    try {
        const response = await fetch(
            "/api/orders?player_id=" +
            encodeURIComponent(playerId)
        );

        if (!response.ok) {
            throw new Error("Không thể lấy lịch sử");
        }

        const data = await response.json();

        /*
         * Hỗ trợ cả:
         * { orders: [...] }
         * hoặc trực tiếp [...]
         */
        const orders = Array.isArray(data)
            ? data
            : (data.orders || []);

        if (!orders.length) {
            resultBox.innerHTML = `
                <div class="history-empty">
                    ❌ Không tìm thấy lịch sử nạp cho ID
                    <strong>${escapeHtml(playerId)}</strong>
                </div>
            `;
            return;
        }

        resultBox.innerHTML = orders.map(order => {

            const uid = order.player_id || order.uid || playerId;
            const packageName =
                order.package_name ||
                order.package ||
                "---";

            const amount = Number(
                order.amount || order.price || 0
            ).toLocaleString("vi-VN");

            const status = order.status || "";

            const isSuccess =
                status === "DA_THANH_TOAN" ||
                status === "PAID" ||
                status === "SUCCESS" ||
                status === "ĐÃ THANH TOÁN" ||
                order.paid === true;

            const statusText =
                isSuccess ? "Thành công" : "Đang xử lý";

            const createdAt =
                order.paid_at ||
                order.created_at ||
                order.createdAt ||
                "";

            return `
                <div class="history-card">

                    <div class="history-top">

                        <div class="history-id">
                            <strong>FF ID:</strong>
                            ${maskPlayerId(uid)}
                        </div>

                        <div class="history-status"
                             style="${isSuccess ? '' : 'background:#f39c12;'}">
                            ${statusText}
                        </div>

                    </div>

                    <div class="history-info">

                        <div class="history-package">
                            💎 ${escapeHtml(packageName)}
                        </div>

                        <div>
                            ${amount}đ
                        </div>

                        <div class="history-time">
                            ${formatDate(createdAt)}
                        </div>

                    </div>

                </div>
            `;
        }).join("");

    } catch (error) {
        console.error(error);

        resultBox.innerHTML = `
            <div class="history-empty">
                ⚠️ Không thể tải lịch sử nạp.
                Vui lòng thử lại sau.
            </div>
        `;
    }
}


/* Che ID giống giao diện bạn gửi */
function maskPlayerId(id) {
    id = String(id);

    if (id.length <= 4) {
        return id;
    }

    const first = id.substring(0, 4);
    const last = id.substring(id.length - 4);

    return first + "****" + last;
}


/* Định dạng ngày giờ */
function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (isNaN(date.getTime())) {
        return escapeHtml(String(value));
    }

    return date.toLocaleDateString("vi-VN") +
        " " +
        date.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit"
        });
}


/* Chống HTML lạ được đưa vào giao diện */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* Cho khách bấm Enter để tìm */
document
    .getElementById("historyPlayerId")
    .addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            timLichSuNap();
        }
    });
</script>
