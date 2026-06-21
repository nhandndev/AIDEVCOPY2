# WORKFLOW STEP 4: ENGINE (KHỞI TẠO LỊCH TRÌNH BẰNG AI)

## 1. Luồng chạy (Flow: User ➔ Backend Agent ➔ User)

**[FRONTEND UI]** 
Ngay khi load Step 4, tự động thu thập toàn bộ dữ liệu: Khách sạn đã chọn (HotelId), Mảng địa điểm tham quan (Destinations), Budget, Phương tiện (Transport), Ngày đi, Ngày về.
       │
**[BACKEND / AI SERVICE - Prompt Engineer Agent]**
Gọi hàm `generateItinerary()`.
Dịch toàn bộ trạng thái vào một System Prompt quy chuẩn cao.
Yêu cầu AI áp dụng ràng buộc: Xếp lịch trình **Hotel-Centric** (Xuất phát từ KS, về lại KS) và chia thời gian hợp lý, không được lặp lại địa điểm.
       │
**[AI / LLM Processing]**
LLM sinh ra chuỗi JSON.
Sử dụng hàm **Exponential Backoff Fallback** trong quá trình gọi API (nếu Model A quá tải 429, tự động retry sang Model B, C... trong danh sách mảng fallbackModels).
       │
**[BACKEND / AI SERVICE]**
Dùng Regex bóc tách chuỗi JSON ra khỏi block markdown (nếu có).
Parse chuỗi thành mảng `ItineraryDay` chứa `activities` (mỗi activity có `id`, `startTime`, `endTime`, `reason`).
       │
**[FRONTEND UI]**
Lưu trữ kết quả thô, chuyển tiếp (Navigate) ngay lập tức sang Step 5 để vẽ Timeline.

---

## 2. Các Thuật Toán & Kỹ Thuật Được Sử Dụng

### A. Hotel-Centric TSP Constraint (Ràng buộc Lịch trình Tâm Khách sạn)
- **Cách hoạt động:** Đây là kỹ thuật Prompt Engineering bậc cao. AI được cấp "chỉ thị cứng" phải tuân theo chu trình: Bắt đầu ngày tại Khách sạn -> Điểm A -> Điểm B -> Kết thúc ngày tại Khách sạn. Mặc dù ở Step 4 AI chưa tính toán khoảng cách chi tiết bằng Haversine, nhưng nhờ kiến thức không gian của LLM, nó sẽ cố gắng xếp các điểm gần nhau vào chung 1 ngày theo trực giác.

### B. Exponential Backoff & Model Fallback (Thuật toán lùi mạng & Dự phòng)
- **Cách hoạt động:** 
  Khi gọi API, nếu gặp lỗi `429 Too Many Requests` (Giới hạn tốc độ), thuật toán không ném lỗi ngay mà sẽ chuyển sang vòng lặp:
  1. Thử gọi Model 1 (`gpt-4o-mini`).
  2. Nếu lỗi, chờ 300ms, tự động đổi payload sang Model 2 (`gpt-4.1-nano`).
  3. Lặp lại cho đến khi thành công hoặc cạn danh sách Fallback.
- **Ứng dụng:** Đảm bảo hệ thống có độ tin cậy cực cao, trải nghiệm User không bị gián đoạn vì lỗi server.
