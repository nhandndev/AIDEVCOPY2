# STEP 1: SURVEY AGENT (KHẢO SÁT & THU THẬP DỮ LIỆU CHUẨN HÓA)

## 1. Ý tưởng (Idea)
Đóng vai trò là một "Lễ tân" ảo (Receptor). Trước khi bất kỳ một hệ thống AI nào có thể hoạt động, nó cần có "Context" (Ngữ cảnh). Màn hình này được sinh ra để lấy các siêu tham số (Hyper-parameters) làm hệ quy chiếu cho tất cả các quyết định của Agent ở các bước sau.

---

## 2. Tính năng cốt lõi (Features)
- **Giao diện Glassmorphism:** Thiết kế mờ ảo sang trọng mang lại cảm giác công nghệ tương lai.
- **Trợ Lý AI Tự Động Điền (AI Auto-Fill Assistant):** Nhận diện mô tả ngôn ngữ tự nhiên từ người dùng (ví dụ: *"Tôi muốn đi từ sáng 15/08 đến chiều 18/08, đi ô tô, budget 8 triệu, lặn san hô Kỳ Co và ngắm hoàng hôn Eo Gió"*), tự động trích xuất các thông số và điền vào form.
- **Form thu thập động:** Yêu cầu người dùng cung cấp các thông số bắt buộc:
  - `Days`: Số ngày đi du lịch.
  - `Budget`: Tổng ngân sách (Tối thiểu phải đủ sống).
  - `Transport`: Phương tiện di chuyển (Tự túc, Xe máy, Taxi).
  - `Vibe`: Sở thích du lịch (Chill, Khám phá, Văn hóa...).
- **Validation:** Ràng buộc chặt chẽ các trường, không cho phép ngân sách trống hoặc bằng 0, bắt buộc điền đủ thông tin mới được kích hoạt bước tiếp theo.

---

## 3. Các Agent Hoạt Động & Luồng Chạy Chi Tiết (Active Agents & Detailed Flow)

### 🤖 Survey Agent (Receptor & Auto-Fill Agent)
*   **Mô tả:** Agent tiếp nhận thông tin đầu vào hoặc phân tích đoạn text mô tả tự do của người dùng. Nó gọi API phân tích NLP để trích xuất các siêu tham số và tự động đối chiếu ngữ nghĩa (Semantic Matching) để chọn trước các địa danh phù hợp (tối đa 4 địa điểm) từ cơ sở tri thức RAG.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [Đoạn văn mô tả của User]
         │
         ▼ (Sự kiện Click Điền Tự Động)
    [Survey Agent (NLP Extraction & RAG Matching)]
         │
         ├──► 1. Trích xuất: budget (VND), transport, startDate, endDate.
         ├──► 2. Đối chiếu ngữ nghĩa (Semantic Matching) để khớp sở thích với 6 địa điểm trong RAG.
         │        Ví dụ: "lặn san hô Kỳ Co, ngắm hoàng hôn Eo Gió, tìm hiểu lịch sử" 
         │               -> ["ky_co", "eo_gio", "bao_tang_quang_trung"]
         ├──► 3. Ghi nhận danh sách địa điểm pre-selected (destinations).
         │
         ▼ (Tự động điền Form & Chuẩn bị chuyển Step 2)
    [surveyData & destinations State trong App.tsx]
    ```

---

## 4. Cơ Chế Phối Hợp Đa Tác Nhân (Multi-Agent Interaction)

Dữ liệu `SurveyDTO` do **Survey Agent** tạo ra là **Context nền tảng** cho toàn bộ hệ thống Multi-Agent ở các bước tiếp theo. Luồng truyền dữ liệu diễn ra như sau:
1.  **Survey Agent ──► Data Retrieval & Context Manager (Step 2):** Truyền trực tiếp danh sách địa danh đã chọn trước (`destinations`) sang Step 2. Khi chuyển bước, các địa danh này đã được tự động tick chọn sẵn trên danh sách RAG và định tuyến trên Map.
2.  **Survey Agent ──► Budget Auditor (Step 3 & Step 5):** Khóa thông số `budget` (Tổng ngân sách) làm điểm tựa để Budget Auditor kiểm toán chi tiêu khách sạn và các dịch vụ đi kèm.
3.  **Survey Agent ──► Prompt Engineer Agent (Step 4):** Cung cấp thông số `Days`, `Transport` để Prompt Engineer compile thành System Prompt định dạng JSON Schema gửi lên Gemini API.

---

## 5. Giá trị Kỹ thuật
- Lưu trữ toàn bộ State (`surveyData`) ở cấp cao nhất (`App.tsx`) để luân chuyển xuống tất cả các component con, giúp đồng bộ hóa dữ liệu.
- Tự động hóa quá trình tiền lọc (pre-selection) địa danh thông qua xử lý NLP ngữ nghĩa, mang đến trải nghiệm người dùng liền mạch (Seamless UX).
- Ràng buộc dữ liệu nghiêm ngặt ở lớp Receptor giúp giảm thiểu lỗi phát sinh (garbage in, garbage out) cho các Agent xử lý ngôn ngữ tự nhiên phía sau.

---

## 6. 💡 Feature Thực Tế (User Context)
**Khi người dùng nhập:** *"Tôi muốn đi từ sáng 15/08 đến chiều 18/08, đi cùng người già, kinh phí dư dả khoảng 10 triệu, thích tắm biển"*
- **Kết quả hiển thị:**
  - Form tự động điền: Ngân sách `10,000,000`, Ngày đi `15/08`, Ngày về `18/08`.
  - **Budget Auditor Agent** hiện thông báo: *"Ngân sách dư dả (10,000,000đ). Đã kích hoạt bộ lọc Resort 4-5 sao và nhà hàng view biển."*
  - **Receptor Agent** tự động map "tắm biển" vào điểm du lịch `Ky Co Beach` và chọn sẵn trên bản đồ.

---

## 7. Các Cập Nhật & Fix Gần Đây (Recent Updates)
- **UI & Layout Cockpit:** Khóa cứng toàn bộ vùng chứa (Container) của Bước 1 với `h-screen overflow-hidden min-h-0`. Sửa hoàn toàn lỗi giao diện bị giãn dài và vỡ khung trình duyệt khi nội dung lịch sử chat sinh ra quá nhiều. Toàn bộ các cột (Chat AI, Agent Logs, Cấu hình) giờ đã có thanh cuộn (Scroll) nội bộ độc lập mượt mà.
