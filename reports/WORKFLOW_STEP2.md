# WORKFLOW STEP 2: PICKER (BỘ LỌC ĐỊA ĐIỂM & ĐÁNH GIÁ RỦI RO THỜI TIẾT)

## 1. Luồng chạy (Flow: User ➔ Backend Agent ➔ User)

**[USER]** 
Người dùng nhìn thấy danh sách các địa điểm và bản đồ. Họ có thể bật/tắt (toggle) các địa điểm muốn đi, chọn trạng thái Thời tiết (Sunny/Rainy), hoặc chat để nhờ AI tư vấn.
       │
**[FRONTEND UI]**
Đẩy Budget, số ngày đi và trạng thái Thời tiết vào hàm `chatWithStep2Agent`.
       │
**[BACKEND / AI SERVICE - Agent Gợi Ý]**
Lấy RAG Database (chỉ trích xuất các trường cần thiết để giảm token: Tên, Phân loại, Giá vé, Thuộc tính Trong nhà/Ngoài trời `isIndoor`).
Gộp chung với Ngân sách và Thời tiết để tạo System Prompt gửi lên LLM.
       │
**[AI / LLM Processing]**
- **Trừ hao ngân sách:** AI tự động trừ 30% ngân sách cho chi phí Khách sạn và Di chuyển. Số tiền còn lại dùng để nhặt các địa điểm.
- **Đánh giá rủi ro (Weather Awareness):** Nếu nhận cờ `Rainy/Storm`, AI quét cờ `isIndoor`. Mọi điểm `isIndoor: false` sẽ bị AI bỏ qua không gợi ý.
Trích xuất trả về JSON gồm 1 câu tư vấn (`reply`) và mảng ID các điểm gợi ý (`suggestedLocationIds`).
       │
**[FRONTEND UI]**
Cập nhật danh sách điểm đến. Các điểm AI gợi ý sẽ tự động được chọn (checked), bản đồ tự động Focus vào các điểm đó.

---

## 2. Các Thuật Toán & Kỹ Thuật Được Sử Dụng

### A. Budget Pre-Allocation (Phân bổ Ngân sách Dự kiến)
- **Cách hoạt động:** Đây là thuật toán logic nội bộ của AI Agent. Khi nhận được 10.000.000 VNĐ, AI không dùng cả 10 triệu để tư vấn mua vé tham quan. Nó được huấn luyện (Prompt Engineering) để cứng rắn cắt đi 30% làm "Quỹ dự phòng lưu trú và di chuyển", chỉ dùng 70% còn lại cộng dồn `ticketPrice + avgCost` của các điểm trong RAG để nhặt ra số lượng điểm tối đa mà không bị lố ngân sách.

### B. Environmental Filtering (Lọc dữ liệu theo Môi trường)
- **Cách hoạt động:** Đơn thuần là bài toán rẽ nhánh có điều kiện (Conditional Branching). Dựa vào State Thời tiết do User chọn, Agent tạo ra ràng buộc (Constraint). 
`If Weather == 'Rainy' AND Location.isIndoor == false => Reject`. Thuật toán này bảo vệ người dùng khỏi việc đi ra đảo (Kỳ Co, Cù Lao Xanh) khi có bão.
