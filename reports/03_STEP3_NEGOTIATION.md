# STEP 3: MULTI-AGENT NEGOTIATION (HỘI ĐỒNG CỐ VẤN)

## 1. Ý tưởng (Idea)
Thay vì để một con AI tự quyết định một cách mờ ám, Bước 3 là sân khấu phơi bày quy trình "Đàm phán đa tác nhân" (Multi-Agent Negotiation). `Logistics Agent` và `Budget Auditor` sẽ cùng tham gia chấm điểm các Khách sạn dựa trên Ngân sách người dùng nhập ở Bước 1 và khoảng cách tới các Địa danh chọn ở Bước 2 để đưa ra đề xuất tối ưu.

---

## 2. Tính năng cốt lõi (Features)
- **Bảng xếp hạng (Ranked List) AI:** Cột bên trái tự động tính toán tổng khoảng cách (Distance) từ từng khách sạn tới các tụ điểm, sau đó so sánh với ngân sách để xếp hạng 12 khách sạn (từ bình dân đến cao cấp) từ Tối ưu nhất (Top 1) trở xuống. Bảng xếp hạng hỗ trợ cuộn (`overflow-y-auto`) mượt mà giúp giao diện không bị vỡ.
- **Bảng Chi Phí Mini (Mini Cost Breakdown):** Bên trong mỗi thẻ khách sạn hiển thị rõ cấu thành chi phí: (Tiền phòng x Số ngày) + (Tổng quãng đường x Giá phương tiện). Nếu tổng vượt ngân sách sẽ báo đỏ (⚠️), nếu nằm trong ngân sách báo xanh (✅).
- **Connection Map (Bản đồ kết nối):** Cột giữa tự động vẽ các đường nối (Polyline) từ Khách sạn đang được trỏ chuột tới 4 tụ điểm mà người dùng đã chọn.
- **Console Log (Mô phỏng Real-time):** Nằm ở cạnh dưới màn hình, hiển thị dòng lệnh kiểu Hacker xanh lá cây, mô phỏng quá trình System nạp tọa độ, tính toán Vector khoảng cách, và Budget Auditor kiểm soát tài chính.
- **Tính năng Khóa (Lock):** Nút "Tiến hành" bị khóa cho đến khi người dùng tự tay chọn Khách sạn họ ưng ý từ danh sách đã được đề xuất.

---

## 3. Các Agent Hoạt Động & Luồng Chạy Chi Tiết (Active Agents & Detailed Flow)

### 🤖 Logistics Agent (Chuyên Gia Địa Lý)
*   **Mô tả:** Đo đạc khoảng cách và tối ưu hóa tuyến đường di chuyển địa lý.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```text
    [SYS] Khởi tạo ma trận không gian. Tọa độ mục tiêu: 6 điểm.
    [LOGISTICS] Tâm hình học hướng về cụm điểm đến. Đang quét bán kính...
    [CALC] Phân tích Fleur de Lys Hotel Quy Nhơn:
       ├─ Tiền phòng (3 đêm x 1,500,000đ): 4,500,000đ
       ├─ Phí di chuyển (Tổng 94.7km x 15,000đ/km): 1,420,500đ
       └─ TỔNG CHI PHÍ THỰC TẾ: 5,920,500đ
    [AUDIT] ✅ Tối ưu & Đạt chuẩn ngân sách

    [CALC] Phân tích Anya Premier Hotel:
       ├─ Tiền phòng (3 đêm x 1,800,000đ): 5,400,000đ
       ├─ Phí di chuyển (Tổng 96.5km x 15,000đ/km): 1,447,500đ
       └─ TỔNG CHI PHÍ THỰC TẾ: 6,847,500đ
    [AUDIT] ✅ Tối ưu & Đạt chuẩn ngân sách
    [SYS] Hoàn tất quét dữ liệu. Lập Bảng Xếp Hạng Đề Xuất.
    ```

### 🤖 Budget Auditor (Kiểm Toán Viên)
*   **Mô tả:** Giám sát ngân sách còn lại, tính toán chi phí lưu trú của du khách.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [Giá phòng khách sạn] ──► [Budget Auditor] ◄── [Tổng ngân sách ở Step 1]
                                    │
                                    ▼ (Kiểm tra ngân sách)
    Tính toán chi phí khách sạn dự kiến: HotelCost = Giá phòng * Số ngày đi.
    Kiểm tra điều kiện: HotelCost <= Tổng ngân sách?
                                    │
                                    ├──► [ĐẠT]: Ghi nhận trạng thái ngân sách hợp lệ.
                                    └──► [LỐ]: Gắn cờ cảnh báo vượt ngân sách.
    ```

---

## 4. Quy Trình Đàm Phán & Phối Hợp Đa Tác Nhân (Negotiation Loop Flow)

Quá trình xếp hạng và đàm phán diễn ra hoàn toàn tự động theo cơ chế **Chấm điểm đồng bộ (Joint Scoring)**:

```
                  [Logistics Agent]             [Budget Auditor]
                          │                            │
             (Tính khoảng cách: Dist)         (Tính chi phí: Cost)
                          │                            │
                          ▼                            ▼
                      [HỆ THỐNG ĐÁNH GIÁ CHUNG (Orchestrator)]
                                         │
    Tính điểm tối ưu: Score = (Cost * Số ngày) + (Dist * Hệ số khoảng cách)
                                         │
                                         ▼
            Sắp xếp danh sách Khách sạn có Score từ thấp đến cao (Tối ưu nhất).
                                         │
                                         ▼
           In log đàm phán chi tiết lên Console Terminal giả lập:
           - "System: Nạp vĩ độ/kinh độ khách sạn..."
           - "Logistics Agent: Tính toán khoảng cách kết nối..."
           - "Budget Auditor: So khớp chi phí lưu trú..."
                                         │
                                         ▼
                 [Đợi người dùng tự tay chọn để khóa lựa chọn]
```

---

## 5. Giá trị Kỹ thuật
- Tính toán tọa độ và vẽ `Polyline` nhiều điểm cùng lúc trên Google Maps.
- Layout Flex phức tạp với tỷ lệ màn hình động (Upper layer và Bottom Logs).
- Triển khai thành công cơ chế Đàm phán Đa Tác Nhân dựa trên việc tối ưu hóa đa mục tiêu (Multi-objective optimization: vừa rẻ vừa gần).

---

## 6. 💡 Feature Thực Tế (User Context)
**Khi người dùng chọn Khách sạn:** *"Tôi có ngân sách 3 triệu, đã chọn tham quan nhiều nơi, giờ tôi chọn khách sạn FLC Grand Hotel (Giá khá cao)."*
- **Kết quả hiển thị:**
  - Ngay lập tức **Logistics Agent** vẽ các đường nối khoảng cách trên Map.
  - Cùng lúc, **Budget Auditor** tính ra giá FLC x Số ngày > 3 triệu, nó lập tức gắn cờ báo đỏ (Alert) kế bên thẻ của FLC Grand Hotel: *"Cảnh báo: Vượt ngân sách! Khách sạn này tiêu tốn hơn 100% chi phí dự kiến."*
  - Nếu người dùng vẫn ngoan cố bấm nút "Xác Nhận", hệ thống vẫn cho qua để bước sau xử lý lố tiền tự động.

---

## 7. Các Cập Nhật & Fix Gần Đây (Recent Updates)
- **Chuẩn Hóa Tiền Tệ (UX/UI):** Tích hợp thuật toán làm tròn tuyệt đối `Math.round()` vào khâu tính toán chi phí di chuyển (vốn dĩ sinh ra số float do nhân với số thập phân km). Giao diện nay hiển thị VND không còn các số lẻ lố bịch (như `.255đ`), mang lại cảm giác cực kỳ thực tế, chuyên nghiệp và sạch sẽ cho bản Demo Hackathon.
- **Động Cơ Tính Toán Tỉ Lệ Nhóm (Group Proportional Engine):** Bảng Xếp Hạng Khách sạn không còn tính một cách máy móc "Khoảng cách x Giá", mà nó đã đọc toàn bộ dữ liệu Cơ cấu Đoàn khách từ Bước 1 (Ví dụ: 10 người lớn, 2 trẻ em). AI tự nội suy cấu hình: 12 người -> Cần thuê 3 phòng (chuẩn 4 người/phòng) và cần 3 chiếc xe 4 chỗ hoặc 2 chiếc 7 chỗ tùy vào phương tiện chọn. Toàn bộ công thức tính tự động nhân lên và minh bạch ngay trên UI của Card Khách sạn: `Tiền phòng (3 phòng x 3 đêm x Giá)` giúp quá trình Hội đồng Cố vấn chọn lọc trở nên tuyệt đối chính xác với thực tế.
