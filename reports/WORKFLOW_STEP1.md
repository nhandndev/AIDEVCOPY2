# WORKFLOW STEP 1: SURVEY (KHỞI TẠO NGỮ CẢNH & TRÍCH XUẤT Ý ĐỊNH)

## 1. Luồng chạy (Flow: User ➔ Backend Agent ➔ User)

**[USER]** 
Người dùng nhập tin nhắn vào khung chat ở Step 1. (Ví dụ: *"Tôi có 10 củ đi 3 ngày 2 đêm cùng bạn gái, thích tắm biển"*).
       │
**[FRONTEND UI]**
Ghi nhận tin nhắn, hiển thị lên giao diện chat và gọi hàm `chatWithSurveyAgent`.
       │
**[BACKEND / AI SERVICE - Survey Agent]**
Gói toàn bộ lịch sử chat (`chatHistory`) và trạng thái hiện tại (`currentState`) vào một System Prompt cực kỳ chi tiết.
Áp dụng **Guardrail** để chặn mọi câu hỏi không liên quan đến du lịch.
Gửi payload lên **Gemini API (LLM)** với `response_format: json_object`.
       │
**[AI / LLM Processing]**
AI phân tích ngữ nghĩa (Semantic Analysis). Nó nhận ra:
- "10 củ" = `budget: 10000000`
- "3 ngày 2 đêm" = `startDate`, `endDate`
- "bạn gái" = `who: { adults: 2, children: 0 }`
- "tắm biển" = Gọi thuật toán Semantic Matching để đối chiếu với RAG nội bộ (vd: Kỳ Co, Eo Gió).
       │
**[BACKEND / AI SERVICE - Trả về]**
Nhận JSON từ API, parse chuỗi JSON thành object `extractedData`.
       │
**[FRONTEND UI]**
Cập nhật React State (`setSurveyData`). Form nhập liệu tự động "nhảy số" các trường Ngân sách, Ngày tháng, Số người. Nếu AI tìm thấy điểm du lịch, biến `destinations` được gán các ID.
       │
**[USER]**
Nhìn thấy Form tự động điền mà không cần bấm nút, có thể xác nhận và đi tiếp.

---

## 2. Các Thuật Toán & Kỹ Thuật Được Sử Dụng

### A. NLP Intent Extraction (Trích xuất Ý định bằng Ngôn ngữ Tự nhiên)
- **Cách hoạt động:** Thay vì dùng Regex khô khan (rất dễ trượt nếu người dùng dùng từ lóng như "củ", "lít", "tùy ý"), hệ thống dùng LLM (GPT/Gemini) đóng vai trò là một bộ trích xuất thông minh. LLM được mớm trước định dạng JSON cần thiết và cấu trúc của dữ liệu (schema), từ đó nó tự động convert văn bản tự do thành các con số và ngày tháng chuẩn ISO.

### B. Semantic Matching (Đối chiếu Ngữ nghĩa)
- **Cách hoạt động:** Khi người dùng nói "thích tắm biển" hoặc "ăn hải sản", hệ thống (thông qua hàm `analyzeSurveyPrompt`) sẽ đọc lướt qua danh sách RAG (chỉ chứa ID, Name và Tags). Nó sẽ tính toán độ tương đồng (ngữ nghĩa) giữa câu nói của user và thẻ Tags của địa điểm. Nếu khớp cao, nó lập tức gắp ID đó (vd: `ky_co`) đưa vào mảng `destinations` để chuẩn bị cho Step 2.
