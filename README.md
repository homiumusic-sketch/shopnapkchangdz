# Free Fire Shop Demo

Đây là bộ mã nguồn mẫu cho shop nạp Free Fire:
- Frontend: HTML/CSS/JS
- Backend: Node.js + Express
- SQLite lưu đơn hàng
- Admin xem đơn hàng
- Luồng thanh toán sandbox/demo

Lưu ý: bộ này KHÔNG kết nối hệ thống Garena và KHÔNG tự cộng Kim Cương thật.
Muốn production cần tích hợp cổng thanh toán hợp lệ và hệ thống phân phối được ủy quyền.

## Chạy
1. Cài Node.js 18+
2. `npm install`
3. `npm start`
4. Mở `http://localhost:3000`

Admin demo: `admin` / `change-me`
Hãy đổi mật khẩu trong biến môi trường `ADMIN_PASSWORD`.
