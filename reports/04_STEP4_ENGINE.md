# STEP 4: LLM ENGINE (LÕI SINH LỊCH TRÌNH)

## 1. Ý tưởng (Idea)
Đây là giai đoạn "Đóng gói JSON Schema Payload" và bắn lên cho Gemini LLM xử lý. Màn hình này không phải là màn hình thao tác, mà là màn hình Loading (Chờ) mang đậm chất công nghệ để "khoe" độ phức tạp của hệ thống dưới nền.

---

## 2. Tính năng cốt lõi (Features)
- **Transparent Logging (Log Tường Minh):** Hệ thống in trực tiếp các tham số thực tế (Ngân sách, Số ngày, Danh sách tọa độ...) lên màn hình Terminal giả lập để người dùng theo dõi.
- **Quá trình Compile Context:** Mô phỏng lại việc Agent chuyển đổi dữ liệu RAG và Survey thành chuỗi Prompt cực dài.
- **Cơ chế Exponential Backoff & Retry:** Hệ thống gọi Gemini LLM và chờ trả về mảng dữ liệu JSON nguyên chuẩn.

---

## 3. Các Agent Hoạt Động & Luồng Chạy Chi Tiết (Active Agents & Detailed Flow)

### 🤖 Prompt Engineer Agent
*   **Mô tả:** Chịu trách nhiệm tổng hợp toàn bộ dữ liệu từ các bước trước (Số ngày, Ngân sách, Khách sạn đã chọn, Các điểm tham quan) thành một System Prompt định dạng JSON Schema tối ưu.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [SurveyData + Selected Locations + Selected Hotel]
                           │
                           ▼ (Prompt Engineer Agent)
    1. Đọc tệp cấu trúc JSON mong muốn (Schema).
    2. Chuyển đổi thông tin địa lý và chi phí sang định dạng văn bản thô (Stringified Context).
    3. Đóng gói vào System Prompt yêu cầu LLM giữ nguyên cấu trúc trả về, không giải thích dông dài.
                           │
                           ▼
                 [JSON Payload hoàn chỉnh]
    ```

### 🤖 LLM Communicator Agent
*   **Mô tả:** Đảm nhận việc gửi API giao tiếp với Model (Google Gemini). Xử lý timeout, lỗi mạng và thực hiện kịch bản Retry/Fallback.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [JSON Payload từ Prompt Engineer]
                   │
                   ▼ (LLM Communicator Agent)
    Gửi HTTP POST request lên API Gemini.
    Chờ phản hồi bất đồng bộ (Await Promise).
                   │
                   ├──► [THÀNH CÔNG]: Parse chuỗi JSON trả về thành Object.
                   │
                   └──► [THẤT BẠI (429 Rate Limit / 5xx Server Error)]:
                            - Đợi t1 = 1000ms. Gọi lại lần 1.
                            - Nếu vẫn lỗi, đợi t2 = 2000ms. Gọi lại lần 2.
                            - Lặp lại tối đa 5 lần (Exponential Backoff).
                            - Nếu sập hoàn toàn, kích hoạt lỗi an toàn (Fallback).
    ```

---

## 4. Cơ Chế Phối Hợp Đa Tác Nhân (Multi-Agent Interaction)

Quy trình nạp dữ liệu và phản hồi diễn ra theo dây chuyền tuần tự:
1.  **Prompt Engineer Agent** thu thập toàn bộ đầu ra từ:
    *   *Survey Agent (Step 1)*: Lấy số ngày, ngân sách, phương tiện.
    *   *Context Manager (Step 2)*: Lấy danh sách điểm đến.
    *   *Negotiation Council (Step 3)*: Lấy Khách sạn đã chọn.
2.  **Prompt Engineer Agent** biên dịch chúng thành prompt -> gửi sang **LLM Communicator Agent**.
3.  **LLM Communicator Agent** thực hiện giao tiếp mạng. Khi nhận được kết quả thành công, nó gửi dữ liệu lịch trình (`ItineraryDTO`) lên cho **Orchestrator Agent** tại Step 5 (Control HQ) để hiển thị và bắt đầu tương tác.

---

## 5. Giá trị Kỹ thuật
- Quản lý trạng thái Asynchronous (Bất đồng bộ) khi gọi external API.
- Tạo hiệu ứng Terminal Typewriter text chuyên nghiệp để lấp liếm thời gian chờ API (Latency 3-5 giây).
- Xử lý lỗi nâng cao với thuật toán Exponential Backoff, giúp ứng dụng có độ bền cao khi gặp tải lớn hoặc giới hạn API key.

---

## 6. 💡 Feature Thực Tế (User Context)
**Khi hệ thống sinh lịch trình:** 
- **Kết quả hiển thị:**
  - Màn hình đen Terminal với dòng chữ "Booting AI Engine...".
  - **Prompt Engineer Agent** tập hợp: Ngân sách 3 triệu, Đi xe máy, Khách sạn FLC, 4 Điểm đến -> Gom thành 1 Prompt cực kỳ lớn.
  - Sau vài giây chờ đợi LLM trả lời, màn hình tự động chuyển sang Giao diện Điều khiển (Step 5) với lịch trình 3 ngày được xếp ngăn nắp, có đầy đủ Giờ bắt đầu/kết thúc và lý do chọn điểm đến theo định dạng JSON Schema.
