# STEP 2: RAG POOL & EXPLORATION (KHÁM PHÁ ĐỊA DANH)

## 1. Ý tưởng (Idea)
Mô phỏng lại quá trình RAG (Retrieval-Augmented Generation). Người dùng sẽ chọn các địa danh yêu thích vào một "Pool". Dữ liệu từ Pool này sẽ là những Vector cốt lõi để bơm vào LLM, ép LLM lên lịch trình xoay quanh những địa điểm này thay vì sinh ảo (Hallucination).

---

## 2. Tính năng cốt lõi (Features)
- **Kiến trúc Layout 3 Cột:**
  - `Cột Trái (Chi tiết):` Hiển thị thông tin mô tả chi tiết, Pros/Cons, chi phí và đặc biệt là tích hợp Video TikTok nhúng để tăng tính sinh động.
  - `Cột Giữa (Bản đồ):` Hiển thị bản đồ tổng quan Quy Nhơn. Khi ấn vào địa danh bên phải, bản đồ sẽ tự động Fly/Zoom (bay và phóng to) trực tiếp vào tọa độ đó.
  - `Cột Phải (Danh sách):` Danh sách các điểm đến lấy từ `rag_database.json`.
- **Giới hạn Context Window:** AI ép buộc người dùng chỉ được chọn tối đa 4 địa điểm để tránh việc LLM bị quá tải ngữ cảnh hoặc nhồi nhét quá nhiều vào 1 ngày du lịch.
- **Weather API Mock (Giả lập thời tiết):** Cung cấp các nút để xem trước tình hình thời tiết (Nắng, Mưa, Bão), giúp người dùng ra quyết định chọn bãi biển hay chọn điểm trong nhà.

---

## 3. Các Agent Hoạt Động & Luồng Chạy Chi Tiết (Active Agents & Detailed Flow)

### 🤖 ViVu Agent (Interactive Consultant Agent)
*   **Mô tả:** Đóng vai trò làm trợ lý tư vấn tương tác trực tiếp với người dùng tại cột trái. Sử dụng LLM (`gpt-4o-mini`) thông qua Function Calling (ShopAIKey) để đánh giá yêu cầu và phân tích ngân sách.
*   **Luồng chạy của Agent:**
    ```
    [User Chat: "Mình đi tự túc, ngân sách 500k muốn đi chỗ thiên nhiên"]
         │
         ▼ (ViVu Agent)
    [Nhận Đầu vào: Weather = Sunny, Budget = 5tr, Days = 3, Text = User Chat]
         │
         ├──► Phân bổ ngân sách: Tự động khóa lại 20-30% cho KS/Di chuyển.
         ├──► Quét RAG Pool: Tìm các điểm "miễn phí" hoặc giá rẻ phù hợp với Text.
         ├──► Kiểm tra Weather: Loại bỏ các điểm Outdoor nếu thời tiết Rainy/Storm.
         │
         ▼ (Render lên UI)
    [Trả lời Chat & Đề xuất danh sách Location IDs (Tự động bật Map & Add vào Pool)]
    ```

### 🤖 Data Retrieval Agent (RAG Agent)
*   **Mô tả:** Đóng vai trò như thủ thư, truy xuất các tài liệu/vector về địa danh từ Cơ sở dữ liệu nội bộ (`rag_database.json`) để hiển thị cho người dùng xem xét.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [rag_database.json] 
         │
         ▼ (Data Retrieval Agent)
    [Đọc CSDL & Lọc theo Vibe từ Step 1]
         │
         ├──► Trả về danh sách địa danh có thuộc tính khớp với 'vibe' của người dùng.
         ├──► Trích xuất tọa độ địa lý (Lat/Lng) và ID video TikTok từ các bản ghi.
         │
         ▼ (Render lên UI)
    [Map Marker & Cột danh sách bên phải]
    ```

### 🤖 Context Manager Agent
*   **Mô tả:** Giám sát và giới hạn số lượng địa danh được chọn để đảm bảo Context Window gửi cho LLM ở Step 4 không bị tràn token.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [User Click Chọn Địa Danh]
         │
         ▼ (Context Manager Agent)
    [Kiểm tra độ dài danh sách hiện tại]
         │
         ├──► Nếu số lượng chọn < 4:
         │        - Đồng ý thêm vào Pool.
         │        - Cập nhật state `currentLocations`.
         │
         └──► Nếu số lượng chọn >= 4:
                  - Từ chối thêm mới.
                  - Kích hoạt thông báo cảnh báo vượt ngưỡng Context Window (Tối đa 4).
    ```

---

## 4. Cơ Chế Phối Hợp Đa Tác Nhân (Multi-Agent Interaction)

1.  **Survey Agent (Auto-Fill) ──► Context Manager Agent:** Lấy mảng địa danh `destinations` được trích xuất tự động qua NLP ở Bước 1 để điền làm dữ liệu khởi trị (`initialData`), giúp chọn trước các địa điểm trên Timeline và Bản Đồ.
2.  **Survey Agent ──► Data Retrieval Agent:** Tự động lọc danh sách địa danh hiển thị ban đầu dựa trên `vibe` (Chill, Khám phá, Văn hóa) được nạp từ Bước 1.
3.  **Context Manager Agent ──► Map System:** Đồng bộ hóa danh sách Pool đã chọn với Map Marker. Khi địa danh được thêm hoặc bớt, Context Manager gửi tín hiệu tọa độ đến Map System để vẽ lại các điểm đánh dấu trên bản đồ.
4.  **Data Retrieval Agent ──► Logistics & Budget Auditor (Step 3):** Truyền mảng các địa điểm đã chọn (`currentLocations`) sang Step 3 để làm tham chiếu tính khoảng cách và kiểm toán chi tiêu khách sạn.

---

## 5. Giá trị Kỹ thuật
- Đồng bộ hóa State giữa Google Map Markers và Danh sách được chọn.
- Xử lý mượt mà việc Extract ID video Tiktok từ URL để hiển thị Iframe.
- Thiết lập cơ chế Context Capping (Giới hạn ngữ cảnh) thông minh để giảm tải cho LLM.

---

## 6. 💡 Feature Thực Tế (User Context)
**Khi người dùng chọn địa điểm:** *"Tôi đã chọn 4 địa điểm là Eo Gió, Hòn Khô, Kỳ Co và Chùa Ông Núi. Bây giờ tôi bấm thêm Tháp Đôi."*
- **Kết quả hiển thị:**
  - Ngay khi click vào "Tháp Đôi", **Context Manager Agent** chặn lại hành động này.
  - Hệ thống bật popup đỏ: *"Vượt quá số lượng địa điểm tối đa! (Max 4)"*
  - Trên Map, marker "Tháp Đôi" sẽ không được hiện ra. User buộc phải bỏ bớt 1 điểm cũ nếu muốn chèn điểm mới để tránh "quá tải nhồi nhét lịch trình".
