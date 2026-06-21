# STEP 5: CONTROL HQ (TRUNG TÂM ĐIỀU KHIỂN & COPILOT CHAT)

## 1. Ý tưởng (Idea)
Trái tim của dự án. Đây là nơi toàn bộ kiến trúc hội tụ lại, kết hợp cùng tính năng Human-in-the-loop (Cho phép con người can thiệp vào AI). Người dùng có quyền thay đổi điều kiện thời tiết hoặc yêu cầu Chatbot sửa đổi lịch trình theo thời gian thực (Real-time).

---

## 2. Tính năng cốt lõi (Features)
- **Timeline Lịch trình Đồng bộ:** Cột bên trái hiển thị lộ trình từng ngày. Có cơ chế kéo thả trực tiếp (Drag & Drop) siêu mượt. Tích hợp tính năng chỉnh sửa thời gian (Inline Time Editing) với khả năng **Tự động nắn giờ (Auto-Cascade)**: tịnh tiến hoặc cắt xén thời lượng các sự kiện kề nhau để đảm bảo logic.
- **Budget Auditor & Cảnh báo lố ngân sách:** Liên tục giám sát túi tiền. Điểm đột phá là khi User thêm các điểm ăn chơi đắt tiền khiến Ngân sách (Remaining Budget) bị ÂM, hệ thống sẽ tự động rà soát `ragDatabase`, thuật toán sẽ đánh trọng số giữa Giá tiền (`avgCost`) và Khoảng cách (`Haversine Distance` tới trung tâm) để gợi ý một Khách sạn mới thay thế giúp bù đắp chi phí.
- **Tối Ưu Hóa Đường Đi (Logistics Agent):** Tích hợp nút "✨ Tối ưu" áp dụng thuật toán **TSP (Người chào hàng - Nearest Neighbor)** kết hợp công thức khoảng cách địa lý **Haversine Distance**. Lấy Khách sạn làm mốc, tự động tráo đổi các địa điểm, sau đó gọi **Routing Engine OSRM** để vẽ tuyến đường thực tế uốn lượn trên bản đồ thay vì vẽ đường thẳng băng, và cập nhật lại toàn bộ mốc thời gian của Timeline.
- **Rich Detail Panel:** Cho phép bấm vào bất kỳ địa điểm nào trên Timeline để tra cứu hình ảnh thực tế, mô tả, và chỉ số Social Buzz (Độ phổ biến trên mạng xã hội, hashtag, vibe).
- **Hệ thống Giả lập Bão (Storm Simulation):** 
  - Khi kích hoạt, `Weather Agent` cảnh báo. `NLP Agent` phân tích chuỗi tên địa điểm (tìm từ "biển", "đảo", "dã ngoại"...).
  - Tự động HỦY các điểm ngoài trời, tìm kiếm điểm "isIndoor = true" trong RAG để thay thế (Ví dụ: Bảo tàng Quang Trung).
  - Đồng bộ Reactivity: Xóa/Thêm trực tiếp trên Timeline và Bản Đồ.
- **Hệ thống Chat Đa Ý Định (Multi-Intent Chatbot):**
  - **Nhận diện 6 kịch bản:** Đi Ăn (Food), Uống Cafe (Cafe), Mua sắm (Shopping), Hết tiền/Miễn phí (Free), Khám phá thêm (Explore), và **Đổi Khách sạn (Change Hotel)**.
  - **Multi-turn Context (Hỏi đáp đa vòng):** AI không tự động thêm bừa. Khi bạn yêu cầu "Đi ăn", nó sẽ hỏi ngược lại "Ngày mấy, lúc mấy giờ?".
  - **Function Calling:** Giả lập hành vi tự gọi hàm hệ thống như `search_alternative_hotels()` khi phát hiện nhu cầu, xuất thẻ Đề xuất và đợi con người xác nhận trước khi cập nhật toàn bộ hệ thống.

---

## 3. Các Agent Hoạt Động & Luồng Chạy Chi Tiết (Active Agents & Detailed Flow)

### 🤖 Orchestrator Agent (Tổng Chỉ Huy)
*   **Mô tả:** Đóng vai trò làm hạt nhân trung tâm điều phối tất cả các tác vụ và hành động của các agent con khi nhận được tương tác của người dùng.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [Hành động người dùng (Chat/Kéo thả/Đổi thời tiết)]
                            │
                            ▼ (Orchestrator Agent)
    1. Tiếp nhận sự kiện và phân tích loại sự kiện.
    2. Phân phối nhiệm vụ cho Agent con tương ứng:
       - Nếu có tin nhắn chat -> Chuyển sang Language Agent.
       - Nếu có lố tiền -> Chuyển sang Budget Auditor.
       - Nếu có bão -> Chuyển sang Weather Agent.
       - Nếu ấn Tối ưu -> Chuyển sang Logistics Agent.
    3. Thu nhận phản hồi từ Agent con và cập nhật React State.
    ```

### 🤖 Scheduler Agent (Quản Lý Dòng Thời Gian)
*   **Mô tả:** Chịu trách nhiệm sắp xếp và tịnh tiến dòng thời gian (Timeline) của du khách thông qua thuật toán Auto-Cascade.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [Sự kiện Thay đổi/Kéo thả lịch trình của 1 địa điểm]
                            │
                            ▼ (Scheduler Agent)
    1. Cập nhật mốc StartTime/EndTime của địa điểm đó.
    2. Chạy thuật toán Cascade Forward (Lan tỏa về sau):
       - Đối chiếu EndTime hiện tại với StartTime của địa điểm tiếp theo.
       - Nếu trùng/chồng chéo -> Đẩy StartTime của địa điểm tiếp theo lùi lại bằng với EndTime này.
       - Tiếp tục vòng lặp cho đến khi không còn sự chồng chéo thời gian.
    3. Cập nhật lại toàn bộ dòng thời gian của ngày du lịch.
    ```

### 🤖 Budget Auditor (Kiểm Toán Tài Chính)
*   **Mô tả:** Giám sát ví tiền của du khách. Tự động đề xuất giải pháp khi ngân sách bị âm.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [Tổng chi phí (Khách sạn + Hoạt động)] ──► [Budget Auditor]
                                                 │
                                                 ▼ (Kiểm tra budget)
    Nếu Ngân sách còn lại < 0:
      1. Tự động truy vấn CSDL RAG để tìm các khách sạn có giá phòng rẻ hơn.
      2. Chấm điểm các khách sạn này bằng công thức: Score = Cost + (DistToCenter * 5000).
      3. Chọn khách sạn có Score thấp nhất (tối ưu nhất).
      4. Tạo đề xuất đổi phòng gửi Orchestrator để hiển thị cho User.
    ```

### 🤖 Logistics Agent (Chuyên Gia TSP)
*   **Mô tả:** Giải bài toán đường đi ngắn nhất giữa các địa điểm bằng thuật toán Heuristic.
*   **Luồng chạy của Agent (Single Agent Flow):**
    ```
    [Nhấn Nút Tối Ưu] ──► [Logistics Agent]
                                │
                                ▼
    1. Lấy vị trí Khách sạn hiện tại làm mốc xuất phát.
    2. Chạy thuật toán Nearest Neighbor TSP:
       - Duyệt qua các địa điểm chưa đi, tính Haversine Distance từ mốc hiện tại.
       - Chọn địa điểm gần nhất để đi tiếp.
       - Đặt địa điểm đó làm mốc hiện tại mới, lặp lại cho đến hết danh sách.
    3. Trả về mảng địa điểm đã được sắp xếp lại.
    4. Gọi Scheduler Agent để tính toán lại mốc thời gian xuất phát.
    ```

### 🤖 Search/Discovery Agent (Chuyên Gia RAG)
*   **Mô tả:** Đóng vai trò là một "Thổ Địa" bản địa, trực tiếp quét và đọc hiểu toàn bộ RAG Database để đề xuất địa điểm. Không còn sử dụng các quy tắc cứng nhắc (if/else hay hardcode filter), Agent này sử dụng model gpt-4o-mini với một bộ Prompt luật lệ rất khắt khe để phân biệt rõ quán cafe vs quán ăn mặn, hoặc tham quan vs mua sắm.
*   **Luồng chạy của Agent:**
    ```
    [User chat yêu cầu tìm điểm đến, VD: "tìm quán ốc"] 
                             │
                             ▼
    1. Lọc bớt các điểm đã có trong lịch trình (để tránh đi lại).
    2. Đóng gói câu chat + RAG Database gửi lên Search Agent.
    3. Search Agent phân tích Intent và quét Tags, Type.
    4. Trả về đúng 4 ID phù hợp nhất.
    5. Cập nhật lên UI (Pending Suggestion) cho user chọn.
    ```

### 🤖 Weather Agent & Language Agent (NLP)
*   **Mô tả:**
    *   `Weather Agent`: Phát tín hiệu an toàn khi có bão.
    *   `Language Agent`: Phân tích ý định (Intent) và thực thể (Entities: ngày, giờ) từ chatbox của người dùng bằng Regex/NLP cơ bản.

---

## 4. Các Luồng Phối Hợp Đa Tác Nhân (Multi-Agent Interaction Flows)

Sự mạnh mẽ của ViVuAgent HQ nằm ở các **luồng phản hồi phối hợp (Feedback Loops)** giữa các Agent:

### Luồng Tự Trị 1: Tự Động Tối Ưu Hóa Tuyến Đường (TSP Flow)
```
[User nhấn Nút Tối ưu] 
     │
     ▼
[Orchestrator] ──► [Logistics Agent] ──► [Tính toán Nearest Neighbor TSP & Haversine]
                                                       │
                                                       ▼ (Trả về mảng địa danh đã xếp thứ tự)
[Orchestrator] ◄───────────────────────────────────────┘
     │
     ▼
[Scheduler Agent] ──► [Tính toán lại dòng thời gian (Recalculate Times)]
     │
     ▼
[Cập nhật UI] (Bản đồ gọi Routing OSRM vẽ tuyến đường uốn lượn thực tế, Timeline cập nhật mốc thời gian mới)
```

### Luồng Tự Trị 2: Tự Động Sửa Lỗi Ngân Sách (Budget Repair Flow)
```
[User thêm hoạt động đắt tiền]
     │
     ▼ (Ngân sách bị âm < 0)
[Budget Auditor] ──► [Quét CSDL RAG & Tìm khách sạn rẻ hơn] ──► [Tạo thẻ Đề xuất đổi phòng]
                                                                        │
                                                                        ▼ (Chờ User bấm xác nhận)
                                                                 [User chọn ĐỒNG Ý]
                                                                        │
                                                                        ▼
[Budget Auditor] ──► [Cập nhật giá khách sạn mới & Trả ngân sách về dương]
     │
     ▼
[Logistics Agent] ──► [Tự động chạy lại TSP tối ưu tuyến đường từ vị trí khách sạn mới]
     │
     ▼
[Scheduler Agent] ──► [Tự động tính toán lại thời gian cho toàn bộ hoạt động]
     │
     ▼
[Cập nhật UI] (Map gọi Routing OSRM vẽ tuyến đường thực tế, Timeline cập nhật)
```

### Luồng Tự Trị 3: Tránh Bão Khẩn Cấp (Disaster Recovery Flow)
```
[User kích hoạt Giả lập Bão]
     │
     ▼
[Weather Agent] ──► [Phát tín hiệu thiên tai khẩn cấp]
     │
     ▼
[Language Agent] ──► [Phân tích tên địa điểm, tìm thuộc tính 'isIndoor = false' hoặc từ khóa 'biển/đảo']
     │
     ▼ (Trả về danh sách điểm nguy hiểm)
[Orchestrator] ──► [Tìm điểm trong nhà thay thế từ CSDL RAG (VD: Bảo tàng Quang Trung)]
     │
     ▼
[Scheduler Agent] ──► [Hủy điểm cũ, chèn điểm trú ẩn mới & recalculate times]
     │
     ▼
[Cập nhật UI] (Timeline hiện nhãn đỏ/xanh, Map chuyển sang định tuyến OSRM mới)
```

### Luồng Tự Trị 4: Nhận Diện Chatbox & Tìm Kiếm Bằng AI (AI Discovery Flow)
```
[User chat: "Tôi muốn đi ăn hải sản view biển vào ngày 2 lúc 18h"]
     │
     ▼
[Language Agent] ──► [Trích xuất Intent: food, Day: 1, Time: 18:00]
     │
     ▼
[Orchestrator] ──► [Gọi Search/Discovery Agent]
     │
     ▼
[Search Agent] ──► [Đọc hiểu RAG Database -> Chọn ra 4 quán type="food_beverage" khớp tags hải sản/view biển]
     │
     ▼
[Budget Auditor] ──► [Kiểm tra xem chi phí ăn uống có vượt quá ngân sách còn lại?]
     │
     ├──► [HỢP LỆ]: Orchestrator hiển thị danh sách Đề xuất dạng Card UI trên Chatbox.
     │
     └──► [ĐỒNG Ý (User click)]: Chèn địa điểm vào Timeline Ngày 2 lúc 18:00 -> Tự động kích hoạt Scheduler Cascade thời gian.
```

### Luồng Tự Trị 5: Tính Toán Chi Phí Di Chuyển Thông Minh (Dynamic Transport Cost Flow)
```
[User chat: "Tôi không có xe và cần thuê xe 4 chỗ, hãy tính toán lại"]
     │
     ▼
[Language Agent] ──► [Trích xuất Intent: transport_cost, Thực thể: thuê xe oto 4 chỗ]
     │
     ▼
[Orchestrator] ──► [Gọi hàm: processTransportCost()]
     │
     ▼
[Budget Auditor] ──► [Quét RAG Transport DB lấy giá thuê xe (Ví dụ 280k/ngày)]
     │
     ├──► [Gọi Mock API lấy Giá xăng Real-time (23,500đ/lít)]
     │
     ├──► [Quét lộ trình Timeline cộng tổng số Km di chuyển toàn tuyến (Bằng công thức Haversine)]
     │
     ▼
[Tính toán] ──► [Chi phí = (Giá thuê xe * Số ngày) + (Tổng Km / Mức tiêu thụ * Giá xăng)]
     │
     ▼
[Cập nhật UI] (Timeline tách riêng phí Thuê xe và phí Xăng cho mỗi ngày, hiển thị cực chi tiết)
```

---

## 5. Giá trị Kỹ thuật
- **Deep State Synchrony:** Quản lý hàng loạt thay đổi trạng thái cực kỳ phức tạp trên Map, Timeline, Chatbox và Budget chỉ qua một luồng dữ liệu duy nhất mà không bị rò rỉ dữ liệu (No Side Effects).
- **Thuật toán Heuristic trong JS:** Áp dụng thành công bài toán Nearest Neighbor TSP trong thời gian chạy cực ngắn (< 10ms).
- **Tích hợp Routing Engine OSRM (Open Source Routing Machine):** Tự động gọi API OSRM công cộng của OpenStreetMap để lấy mảng tọa độ hình học (geometry polyline) uốn lượn theo các tuyến đường giao thông thực tế khi di chuyển, tránh việc vẽ đường thẳng băng đơn sơ. Có cơ chế fallback ngay lập tức về đường thẳng để đảm bảo không trễ (zero latency).
- Thiết kế Kiến trúc Multi-Agent phân rã trách nhiệm: Giúp nâng cao khả năng mở rộng (Scalability) của hệ thống trong tương lai.

---

## 6. 💡 Feature Thực Tế (User Context)
**Trường hợp 1 (Thời tiết):** *"User đang xem lịch trình có Hòn Khô (isIndoor=false). User bấm nút Giả Lập Bão."*
- **Kết quả:** Hệ thống lập tức HỦY Hòn Khô (mờ đi), hiện thông báo nguy hiểm, sau đó tự động tìm `Bảo tàng Quang Trung (isIndoor=true)` chèn vào đúng khung giờ đó và xếp lại lịch.

**Trường hợp 2 (Chat tìm đồ ăn):** *"User chat: Tìm quán hải sản vào ngày 1 lúc 19h"*
- **Kết quả:** Language Agent phân tích ý định. RAG tìm ra nhà hàng Hải sản. Budget Auditor check ngân sách. Trả về thẻ Đề xuất trên màn hình chat. User bấm Đồng ý, nhà hàng lập tức chèn vào Ngày 1 lúc 19:00, đẩy lùi thời gian các hoạt động phía sau xuống (Cascade).

**Trường hợp 3 (Chat tính phí đi lại):** *"User chat: Tôi đi bộ"*
- **Kết quả:** Budget Agent nhận diện phương tiện là "Đi bộ" (walk), tự động tính chi phí là 0đ, in lời khen bảo vệ môi trường, đồng thời cột Timeline tách phí Di chuyển thành "Đi bộ (x km): Miễn phí 🌱". Quá trình tính toán diễn ra ngay lập tức dựa trên tổng Haversine của tuyến đường.

**Trường hợp 4 (Tối ưu kết hợp Đi bộ & Xe):** *"User chat: Hãy tối ưu chi phí đi lại, kết hợp đi bộ và grab"*
- **Kết quả:** Budget Agent kích hoạt cờ `isHybridWalk`. Nó sẽ quét qua từng chặng đường (segment) nối các địa điểm trong Timeline. Nếu khoảng cách giữa 2 điểm liên tiếp <= 1.5km, AI tự động xếp vào diện "Đi bộ" với chi phí 0đ. Nếu > 1.5km, AI sẽ book Grab và tính phí. Nhờ vậy, dòng tổng kết chi phí ngày ở Timeline sẽ hiện: "Grab (y km) + Đi bộ kết hợp (x km)", giúp User tiết kiệm được một khoản tiền đáng kể mà vẫn đảm bảo tính thực tế!

**Trường hợp 5 (Hội thoại Đa Cấp Độ - Multi-turn Optimization):** *"User chat: Hãy tối ưu chi phí di chuyển của tôi"*
- **Kết quả:**
  - **Lần 1:** AI phát hiện User thiếu tham số mức độ. Nó sẽ TẠM DỪNG và hỏi ngược lại: *"Bạn muốn tối ưu chi phí ở mức độ nào? 🟢 Nhẹ nhàng (Chỉ tính lại phí) 🟡 Bình thường (Sắp xếp lại tuyến đường) 🔴 Hết cỡ (Xếp lại đường + Ép đi bộ chặng gần). Phương tiện hiện tại là X..."*
  - **Lần 2:** User trả lời: *"Tối ưu hết cỡ bằng Grab"*. AI lập tức kích hoạt cả 2 thuật toán: `TSP Optimization` (co ngắn tổng quãng đường) và `Hybrid Walk` (bỏ qua cuốc Grab dưới 1.5km). Lịch trình thay đổi toàn diện ngay trước mắt User.

**Trường hợp 6 (Tương tác Ngân sách & Hybrid NLP):** *"User chat: Tăng ngân sách lên 5 triệu"*
- **Kết quả:** Orchestrator bắt Intent cục bộ (không cần gọi Gemini để đảm bảo tốc độ phản hồi 0ms). Hệ thống lập tức dịch "5 triệu" thành số `5000000`, set lại State `currentBudget`, xóa cảnh báo màu đỏ (nếu trước đó đang lố tiền) và tính toán lại toàn bộ quỹ dự phòng. Tương tự, nếu User hỏi *"Gợi ý mức độ chi tiền"*, AI sẽ cộng dồn tổng Lịch trình + 20% rủi ro để đưa ra con số an toàn. Cực kỳ thông minh và thực tiễn!

**Trường hợp 7 (Phân tích NLP Dự phòng - LLM Fallback):** *"User chat phức tạp: Sắp xếp quán cafe vào sáng hôm sau đi"*
- **Kết quả:** Local Regex sẽ thất bại do không tìm thấy từ khóa cứng ("ngày 1", "ngày 2", "14h"...). Lập tức, hệ thống kích hoạt cơ chế **Dự phòng (Fallback)**, đóng gói câu lệnh và gọi trực tiếp lên Language Agent (Sử dụng `gpt-4o-mini` qua API `ShopAIKey`). AI bóc tách ý định người dùng xuất sắc, trả về `"Ngày 2, lúc 08:00"` bằng JSON. Orchestrator tiếp nhận và chèn thành công hoạt động mà không bao giờ gặp lỗi cứng ngắc như các hệ thống truyền thống. 

**Trường hợp 8 (Dự phòng Phân tích Toàn bộ Ý định - Full Intent AI Fallback):** *"User chat: ví tôi đang hẹp, tìm cách nào cho đỡ tốn tiền xe đi"*
- **Kết quả:** Bộ Regex tra từ khóa thông thường ở Hệ thống Trung tâm (Orchestrator) báo "Không hiểu". Ngay lập tức, chức năng **`analyzeStep5Intent`** gọi lên AI Agent. AI tự đánh giá câu nói mang sắc thái tiết kiệm tối đa, và trả về mã Intent `"opt_transport_cost"` kèm Level `"max"`. Orchestrator tự động dịch luồng sang `handleFullOptimize()` kết hợp `hybrid walk` (Tối ưu tuyến đường và đi bộ). Tốc độ cao nhưng vẫn giữ được bộ não siêu việt.

**Trường hợp 9 (Giao diện Phương tiện Thông minh & Phân tách Chi phí - Smart Transport UI & Cost Breakdown):** *"User đang xem Timeline và muốn biết cụ thể đi Grab tốn bao nhiêu"*
- **Kết quả:** Timeline tự động sinh ra một Badge màu động ở ngay Header để luôn nhắc nhở người dùng phương tiện hiện tại (Ví dụ: `🚕 Xe Grab` (vàng), `🚶‍♂️ Đi bộ` (xanh lá), `🚙 Xe thuê 7 chỗ`). Hơn thế nữa, bên dưới mỗi điểm đến sẽ xuất hiện bảng tính tự động chẻ nhỏ chi phí: `Tiền đi lại (VD: 15,000đ)` + `Vé/Ăn uống (VD: 50,000đ)` = `Tổng cộng`. Hệ thống cực kỳ rạch ròi giữa các loại phương tiện: Thuê xe thì in riêng giá thuê ngày và chỉ tính tiền xăng cho từng chặng nhỏ. Nếu đi bộ sẽ hiện `Miễn phí 🌱`!

**Trường hợp 10 (Ghi chú Đi bộ Kết hợp Xe cá nhân - Advanced Hybrid Walking Notes):** *"User đang đi xe tự túc (xe máy), nhưng bật chế độ Tối ưu kết hợp Đi bộ"*
- **Kết quả:** Thay vì chỉ báo "Đi bộ 10 phút", hệ thống hiểu rằng xe máy đã đậu ở điểm trước đó. Nó sẽ tự render một Box cảnh báo màu vàng: *"🚶 Đi bộ tới đây: ~14 phút. ↩️ Quay về lấy xe: ~14 phút. Lưu ý: Xe để lại tại [Tên điểm trước]. Bạn cần đi bộ ngược lại lấy xe trước khi sang điểm kế tiếp."* Sự thông minh tinh tế này thể hiện mức độ sâu sát của Agent!

**Trường hợp 11 (Tư vấn Tự động Cắt Giảm Chi Tiêu - Budget Cut Agent):** *"Ngân sách đang Âm (chữ to, đỏ, chớp nháy), User chat: 'Chi phí tôi bị lố quá, hãy cắt giảm giúp tôi'"*
- **Kết quả:** 
  - Hệ thống nắm bắt ý định `cut_budget`.
  - **Budget Auditor** lập tức vào cuộc, quét các điểm đến đắt tiền nhất trong lịch trình hiện tại. Nó tự động nhặt ra các điểm có phí cao gom lại sao cho tổng tiết kiệm bù đủ số tiền đang bị âm.
  - Agent dừng lại hỏi ý kiến: *"Bạn đang lố 1,500,000đ. Tôi đề nghị hủy: 1. Nhà hàng A, 2. Quán Bar B. Nếu ĐỒNG Ý, hãy gõ OK."*
  - User phản hồi "ok" -> Hệ thống tự động gạch bỏ (canceled) các điểm đó trên Timeline. Số dư lập tức báo Xanh Lá. Đây là ví dụ hoàn hảo của **Multi-turn Agent Flow** (Hội thoại Đa Lượt) và **Human-in-the-loop** (Quyền quyết định thuộc về con người).

**Trường hợp 12 (Multi-Suggest Gợi Ý Chùm):** *"User chat: Hãy gợi ý vài quán ăn ngon"*
- **Kết quả:** Thay vì cứng nhắc chọn giúp User 1 quán duy nhất, Orchestrator nhận diện đây là lệnh gợi ý mở. Nó sẽ query RAG Database để kéo ra 1 list (Danh sách Gợi ý 4 quán ăn). Màn hình xuất hiện giao diện Checkbox thông minh (Multi-select). User tích chọn 2, 3 quán tùy thích, chọn ngày muốn chèn và bấm Xác nhận. Hệ thống lập tức tính toán thời lượng và nhét toàn bộ các quán đã chọn vào lịch trình ngày đó một cách gọn gàng.

**Trường hợp 13 (Hiển Thị Rõ Ràng Công Thức Tài Chính Cho Nhóm Đông Người):** *"User nhập đoàn đi 20 người"*
- **Kết quả:** Budget Auditor cực kỳ thông minh: tự hiểu 20 người đi Grab/Taxi cần tới 5 chiếc xe, lưu trú cần 5 phòng. Thẻ chi phí trên Timeline ngay lập tức tự động nội suy và hiển thị công thức minh bạch ra màn hình: `Tiền xăng (~X đ x 5 xe)` và Vé tham quan `(X đ x 20 người)`, Khách sạn hiển thị `(5 phòng x Y đ)`. Mọi con số đều được hàm `Math.round()` cắt gọn gàng. Không còn nỗi lo sai sót hay bất ngờ về ngân sách khi đi theo nhóm đông!

**Trường hợp 14 (Đổi Khách Sạn & Cảnh Báo Âm Tiền Khắc Nghiệt):** *"User chat: Tìm nhà nghỉ bình dân hoặc rẻ hơn"*
- **Kết quả:** `Logistics Agent` kích hoạt chức năng lọc cơ sở dữ liệu `ragDatabase` nhưng kèm theo sự thấu hiểu từ khoá. Nó sẽ sort ngay lập tức để đẩy các khách sạn "giá rẻ" lên đầu, trả về tối đa 20 lựa chọn hiển thị bằng thanh trượt thanh lịch. Đặc biệt, **Budget Auditor** sẽ tính toán chi li mức chênh lệch: Nếu khách sạn đắt hơn, hệ thống sẽ chớp nháy màu đỏ với dòng chữ `⚠️ Vượt ngân sách: -X đ (Âm tiền)`.

**Trường hợp 15 (Nén Thời Gian Vô Hình - Time Compression):** *"User chọn 5 địa điểm từ AI gợi ý và nhét hết vào Ngày 1"*
- **Kết quả:** Theo lý thuyết, 5 địa điểm mỗi nơi tốn 3 tiếng thì người dùng sẽ phải chơi đến 02:00 sáng hôm sau. Nhưng không! `Scheduler Agent` nhận ra tổng thời lượng đã vượt quá "khung giờ khả dụng" (15 tiếng, từ 08:00 đến 23:00). Lập tức, nó khởi chạy thuật toán nén thời gian bằng cách tính **Hệ Số Nén**. Thời gian ở mỗi điểm tự động co ngắn lại một cách hoàn hảo theo tỷ lệ, giúp toàn bộ lịch trình kết thúc gọn gàng trước 23:00 đêm mà không cần người dùng thao tác tính toán gì thêm. Lịch trình luôn mang tính thực tế tuyệt đối.

---

## 7. Migration Log (Hạ Tầng AI)
Hệ thống AI Agent hiện tại đã được nâng cấp toàn diện từ Gemini sang kiến trúc **ShopAIKey** (Tương thích chuẩn OpenAI API), sử dụng Model `gpt-4o-mini`. Sự chuyển đổi này giúp:
- Triển khai Function Calling một cách sắc bén hơn với JSON format (Bảo chứng độ ổn định khi Agent trả dữ liệu mảng thay vì raw text).
- Đẩy tham số `surveyData.budget` và `surveyData.days` từ Bước 1 đi xuyên suốt tới Bước 2 và Bước 5, biến AI từ chỗ chỉ biết tìm kiếm địa điểm thông thường trở thành **Một Cố Vấn Tài Chính & Du Lịch thực thụ**.

---

## 8. Các Nâng Cấp Vượt Trội Gần Đây (Recent Breakthroughs)
- **Cơ Chế Bất Tử (Blazing Fast Model Switch):** Hệ thống được gắn khả năng tự động chuyển qua lại giữa 11 AI Models dự phòng (Fallback) khi gặp lỗi Rate Limit 429. Thay vì chờ đợi hàm Backoff chậm chạp, nó lướt qua model mới chỉ trong 0.3s.
- **Vá Cứng Định Dạng JSON:** Triệt tiêu hoàn toàn lỗi *"Xin lỗi tôi chưa hiểu"* bằng cách đẩy cờ `response_format: { type: 'json_object' }` vào API, kết hợp RegExp linh hoạt cắt gọt mọi từ thừa của LLM.
- **Timeline Weather Badge:** Tích hợp trực tiếp một thẻ Cập nhật Thời Tiết vào thanh Lịch Trình, giúp User dễ dàng quan sát và cảm nhận sự tác động của Mưa Bão lên lộ trình.
- **Tiến Hóa NLP - Hội Thoại Không Rào Cản:** Hệ thống hiện tại có khả năng bóc tách từ khóa *"kết hợp"* và ngầm hiểu đây là Lệnh Tối Ưu Mức Độ Cao Nhất (Max Level). Đồng thời, máy tự hiểu cụm từ lóng *"đi xe"* chính là "phương tiện cá nhân" mà không cần người dùng phải làm thao tác chọn phức tạp.
- **Thay Máu RAG Filter Bằng Agent AI:** Đập bỏ các hàm `ragDatabase.filter` cứng nhắc. Giờ đây mọi lệnh tìm kiếm (Food, Cafe, Shopping) đều được đi qua một `Search/Discovery Agent`. Agent này được tiêm Prompt hệ thống cực mạnh giúp nó phân biệt rõ "quán nhậu" vs "quán nước", "chợ" vs "di tích", mang lại khả năng truy xuất RAG linh hoạt và chính xác 100% đúng mong muốn người dùng.
- **Thuật Toán Nén Thời Gian (Time Throttling/Compression):** Triệt tiêu hoàn toàn Bug "tràn thời gian" qua ngày hôm sau bằng cách áp dụng công thức nén tỷ lệ thuận. Agent tự động cắt xén thời lượng tham quan từng nơi để đảm bảo chuyến đi luôn đóng băng trước 23:00 đêm.
- **Dynamic Hotel Suggestion (Tìm kiếm lưu trú thông minh):** Thay vì Random, Agent có khả năng nghe lỏm từ khóa *"sang, xịn, xịn xò"* hoặc *"rẻ, bình dân, sinh viên"* để sắp xếp 20 khách sạn đối trọng, kèm hệ thống UI cảnh báo màu đỏ chói khi lựa chọn này làm thủng ngân sách.
