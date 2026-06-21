# WORKFLOW STEP 5: HEADQUARTER (ĐIỀU PHỐI ĐA TÁC NHÂN REAL-TIME)

Đây là Step có Workflow phức tạp nhất, nơi các Agent hoạt động ngầm liên tục và thay đổi trạng thái của nhau (Chain Reaction).

## 1. Luồng Tương tác: Kéo thả Lịch trình (Drag & Drop)
**[USER]** Kéo 1 địa điểm từ Ngày 1 sang Ngày 2.
**[FRONTEND UI]** Ghi nhận vị trí mới, splice (cắt) phần tử ở mảng gốc và chèn vào mảng đích.
**[SCHEDULER AGENT]** Chạy thuật toán **Cascade Time Calculation**. Ép các khoảng thời gian lại sao cho vừa khít với `recommendedHours` và không vượt quá 23h đêm.
**[UI]** Cập nhật lại giao diện Timeline.

## 2. Luồng Tương tác: Chat "Tôi có 100k thì nên đi đâu?"
**[USER]** Gõ "có 100k nên đi đâu".
**[ORCHESTRATOR]** Gọi `analyzeStep5Intent()`. AI phân tích trả về Intent = `explore`.
**[LANGUAGE AGENT]** Gửi query "100k" vào hàm `searchPlacesByAgent()`. AI đọc RAG, tìm các điểm có `cost <= 100000`.
**[FRONTEND UI]** Hiển thị thẻ địa điểm rẻ tiền, chờ User bấm xác nhận chèn vào Ngày/Giờ.

## 3. Luồng Tương tác: Tối ưu Toàn bộ (Optimize Full)
**[USER]** Chat "Sắp xếp lại đường đi ngắn nhất".
**[LOGISTICS AGENT]**
- Tháo tung toàn bộ các điểm tham quan khỏi các ngày.
- Gọi thuật toán **K-Means Clustering Heuristic**: Lấy 1 điểm Seed, dùng Haversine hút các điểm gần nhất nhét chung 1 ngày.
- Gọi thuật toán **TSP (Brute-force / Nearest Neighbor)**: Sắp xếp lại thứ tự từng điểm trong ngày để vẽ ra đường đi ngắn nhất.
**[BUDGET AGENT]** Đo chiều dài quãng đường mới (Tổng số KM), nhân với giá xăng/Grab để cập nhật lại ngân sách đi lại. Nếu rớt xuống < 0, nổ popup cảnh báo.
**[UI]** Timeline thay đổi thứ tự, Map vẽ lại Polyline ngắn hơn, báo tiết kiệm được X km.

## 4. Luồng Tương tác: Giả lập Bão (Weather Simulation)
**[USER]** Bấm nút "Giả lập bão".
**[WEATHER AGENT]** Set State = `Storm`. Duyệt qua lịch trình hiện tại. Nếu điểm tham quan có cờ `isIndoor: false` (VD: Bãi biển) -> Gắn cờ `Canceled`.
**[LOGISTICS AGENT]** Tự động sắp xếp lại lộ trình (Bỏ qua các điểm bị bão). Lịch trình mới chỉ toàn các điểm an toàn.

---

## CÁC THUẬT TOÁN ĐƯỢC SỬ DỤNG VÀ CÁCH GIẢI THÍCH

### 1. Thuật toán Cascade Time Calculation (Nội suy thời gian)
Khi có thay đổi trên Timeline, tổng số giờ chơi (Total Needed Hours) có thể vượt qua 15 tiếng (từ 8h đến 23h).
Hệ thống tính `Compression Ratio = 15 / Total Needed Hours`. 
Sau đó, mỗi địa điểm sẽ bị "nén" thời gian tham quan lại theo đúng tỷ lệ này, và nối đuôi nhau tịnh tiến (Cascading) để đảm bảo lịch trình không bao giờ bị tràn sang ngày hôm sau.

### 2. Thuật toán TSP & Greedy Nearest Neighbor (Tối ưu Lộ trình)
- Trạng thái 1: Khi mảng có `<= 8` điểm. Hệ thống dùng đệ quy sinh ra mọi Hoán Vị `O(n!)`, tính tổng khoảng cách Haversine của từng hoán vị và chắt lọc hoán vị ngắn nhất. (Đảm bảo tuyệt đối).
- Trạng thái 2: Khi mảng có `> 8` điểm. Hệ thống dùng Tham Lam (Greedy), từ vị trí hiện tại cứ chọn điểm gần nhất tiếp theo để đi tới. (Đảm bảo hiệu năng không giật lag).

### 3. Thuật toán Budget Cut & Dynamic Transport Cost
- Dựa vào việc User đi bao nhiêu người, thuật toán tự chia `Math.floor(Num/7)` và `Math.ceil(Rem/4)` để ra số lượng và loại xe cần thuê/Grab. 
- Tổng quãng đường (KM) * Giá xăng / Định mức hao nhiên liệu = Tiền Xăng.
- Khi tiền bị ÂM, hệ thống tính tổng `ticketPrice + avgCost` của từng địa điểm, **Sort Descending** (Sắp xếp giảm dần). Nó bốc ra phần tử mắc nhất mảng để đề xuất User hủy bỏ, giúp giảm chi tiêu nhanh nhất.

### 4. Thuật toán Hybrid Walk (Tối ưu kết hợp đi bộ)
Quét toàn bộ khoảng cách giữa 2 điểm liên tiếp. Nếu `Distance <= 1.5km`, thuật toán cắt chuỗi tính tiền xe, gán đoạn đó là "Walk" (Chi phí 0đ, 0 phát thải CO2). Thích hợp cho người dùng muốn đi du lịch siêu tiết kiệm.
