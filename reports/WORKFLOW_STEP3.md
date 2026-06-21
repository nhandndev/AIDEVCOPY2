# WORKFLOW STEP 3: NEGOTIATION (THƯƠNG LƯỢNG LƯU TRÚ & KIỂM TOÁN)

## 1. Luồng chạy (Flow: User ➔ Backend Agent ➔ User)

**[USER]** 
Người dùng vào màn hình chọn Khách sạn. Màn hình hiển thị danh sách các khách sạn cùng khoảng cách tới trung tâm và số lượng phòng cần thiết.
       │
**[FRONTEND UI]**
Tính toán "Khoảng cách" (Distance) từ mỗi khách sạn tới các điểm tham quan đã chọn ở Step 2 bằng công thức toán học.
Khởi chạy ngầm **Budget Auditor Agent** để tính toán tổng thu chi.
       │
**[BACKEND / LOGIC PROCESSING]**
- Tính `hotelRooms`: Thuật toán `Math.ceil(Số người / 4)` (Giả định mỗi phòng chứa tối đa 4 người).
- Tính `hotelCost`: `Giá trung bình KS * Số đêm * Số phòng`.
- Tính `attractionCost`: Tổng `(ticketPrice + avgCost) * Số người` của các điểm tham quan.
       │
**[FRONTEND UI - Budget Bar]**
Hiển thị thanh Ngân sách (Progress Bar). 
- Nếu `Tổng chi phí > Ngân sách`, thanh Progress chuyển sang ĐỎ.
- Cảnh báo người dùng cần chọn Khách sạn rẻ hơn hoặc có nguy cơ "âm tiền".
       │
**[USER]**
Chốt chọn 1 khách sạn và bấm "Khởi tạo Lịch trình" để qua Step 4.

---

## 2. Các Thuật Toán & Kỹ Thuật Được Sử Dụng

### A. Haversine Formula (Đo lường Khoảng cách Không gian)
- **Công thức:** 
  `a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)`
  `c = 2 * atan2(√a, √(1−a))`
  `Distance (km) = R * c`
- **Cách hoạt động:** Tính độ dài cung tròn trên mặt cầu Trái Đất giữa Tọa độ của Khách sạn (lat, lng) và Tọa độ của các Điểm tham quan.
- **Ứng dụng:** Giúp người dùng biết khách sạn này nằm xa hay gần các điểm họ muốn đi, làm cơ sở ra quyết định.

### B. Thuật toán Kiểm toán (Budget Accounting Algorithm)
- **Cách hoạt động:** Thuật toán cộng dồn chi phí cố định (Fixed Costs). 
  `Total Cost = (Hotel_AvgCost * Days * Rooms) + SUM((TicketPrice + FoodCost) * People)`
  So sánh `Total Cost` với `Survey.Budget`. Nếu Vượt, UI lập tức đổi trạng thái sang `Danger` báo động cho User. Kỹ thuật này ngăn chặn "Garbage In" (Dữ liệu rác) trước khi đẩy sang LLM để xếp lịch.
