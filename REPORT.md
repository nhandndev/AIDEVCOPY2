# BÁO CÁO CHI TIẾT HỆ THỐNG MULTI-AGENT "VI VU AGENT"

Hệ thống Vi Vu Agent là một ứng dụng lập kế hoạch du lịch dựa trên kiến trúc Đa tác nhân (Multi-Agent System) kết hợp hệ thống RAG. Dưới đây là phân tích chuyên sâu về cấu trúc bên trong từng Agent và chi tiết luồng xử lý từ Step 1 đến Step 5.

---

## PHẦN I: KIẾN TRÚC VÀ CƠ CHẾ HOẠT ĐỘNG CỦA TỪNG AGENT

Hệ thống bao gồm 6 Agent chính, mỗi Agent có một vùng trách nhiệm (Domain) và tệp Prompt riêng biệt:

### 1. Survey Agent (Receptor Agent)
- **Nhiệm vụ:** Trò chuyện tự nhiên với người dùng ở Step 1, "mồi" để người dùng cung cấp thông tin và trích xuất dữ liệu thô thành định dạng JSON có cấu trúc.
- **Đầu vào (Input):** Lịch sử chat của người dùng (User chat history).
- **Cơ chế xử lý:**
  - Sử dụng tệp lệnh Prompt được trang bị **Guardrail** (Hàng rào bảo vệ): Từ chối mọi câu hỏi ngoài lề (toán học, code...) và chỉ tập trung vào Du lịch Quy Nhơn.
  - Phân tích và điền dần các biến vào state `extractedData` gồm: `budget`, `transport`, `startDate`, `endDate`, `who` (số lượng người lớn/trẻ em), `tags` (sở thích).
  - Nếu người dùng yêu cầu "tự động lên lịch", Agent sẽ tự điền các giá trị phổ thông (ví dụ: 3 ngày 2 đêm, 10 triệu) mà không cần hỏi thêm.
- **Đầu ra (Output):** JSON chứa câu trả lời cho người dùng (`reply`) và đối tượng dữ liệu `extractedData` chứa các thông số chuyến đi.

### 2. Language Agent / NLP Agent
- **Nhiệm vụ:** Chuyển đổi ngữ nghĩa (Semantic mapping) từ câu nói của người dùng thành các `id` địa điểm có thật trong cơ sở dữ liệu RAG.
- **Cơ chế xử lý:**
  - Nhận input là câu mô tả sở thích (VD: "đi lặn biển, ăn hải sản").
  - Đọc lướt danh sách RAG (chỉ lấy Tên và Tags để tiết kiệm token).
  - Trích xuất ra mảng `destinations` chứa danh sách ID địa danh phù hợp (VD: `["ky_co", "eo_gio", "nh_hai_san"]`).
- **Đầu ra:** Mảng string chứa các ID địa điểm.

### 3. Budget Auditor Agent
- **Nhiệm vụ:** Kiểm toán viên ngân sách. Tính toán, cảnh báo khi chi tiêu vượt mức.
- **Cơ chế xử lý:**
  - **Giám sát toàn trình:** Hoạt động mạnh ở Step 3 và Step 5. Nó lấy `budget` (Tổng ngân sách) trừ đi tiền Khách sạn (`hotelCost`), tiền vé tham quan của các điểm (`ticketPrice` + `avgCost`), và tiền di chuyển (Dựa trên số km tính bằng công thức Haversine nhân với giá xăng/giá Grab).
  - **Tối ưu hóa (Cắt giảm):** Khi ngân sách âm (< 0), Agent quét danh sách địa điểm, tìm các điểm có chi phí cao nhất và đề xuất "Gạch bỏ" (Cancel) để cân bằng thu chi, hoặc tự động tìm kiếm khách sạn khác có giá rẻ hơn.
- **Đầu ra:** Cảnh báo UI, Trigger thay đổi danh sách Khách sạn, Cập nhật tổng chi phí Real-time.

### 4. Logistics Agent / Scheduler Agent
- **Nhiệm vụ:** Kỹ sư quy hoạch tuyến đường và thời gian (Routing & Scheduling).
- **Cơ chế xử lý:**
  - **Tính toán thời gian (Cascade Time):** Dựa trên `recommendedHours` (số giờ tham quan đề xuất từ RAG), tính toán Start Time và End Time cho từng địa điểm trong 1 ngày (từ 8h đến 23h).
  - **Tối ưu hóa quãng đường:** Tích hợp thuật toán:
    - *Brute-force TSP (Traveling Salesperson Problem):* Nếu số điểm trong ngày <= 8, tạo hoán vị (Permutations) để tìm đường đi ngắn nhất.
    - *Nearest Neighbor:* Nếu > 8 điểm, dùng thuật toán tham lam (Greedy) tìm điểm gần nhất kế tiếp.
    - *K-Means Heuristic:* Gom cụm các điểm gần nhau vứt vào chung 1 ngày để tránh đi vòng vèo.
- **Đầu ra:** Mảng JSON lịch trình mới đã được sắp xếp lại thứ tự và thời gian.

### 5. Weather Agent
- **Nhiệm vụ:** Giám sát môi trường và đánh giá rủi ro an toàn.
- **Cơ chế xử lý:**
  - Lưu trạng thái thời tiết (`Sunny`, `Rainy`, `Storm`).
  - Khi bão ập đến (Giả lập ở Step 5), quét qua toàn bộ RAG của các điểm đang nằm trong lịch trình. Những điểm có `isIndoor: false` hoặc tên chứa chữ "Đảo", "Biển", "Bãi" sẽ bị gắn cờ đỏ rủi ro.
- **Đầu ra:** Gửi lệnh cho Scheduler Agent hủy (Cancel) lập tức các điểm ngoài trời khỏi lịch trình.

### 6. Prompt Engineer Agent (Orchestrator)
- **Nhiệm vụ:** Biên dịch toàn bộ trạng thái hệ thống thành System Prompt phức tạp để gửi cho LLM tạo Lịch trình gốc ở Step 4.
- **Cơ chế xử lý:**
  - Thu thập danh sách ID địa điểm, số ngày đi (`startDate`, `endDate`), Khách sạn đã chốt.
  - Áp đặt ràng buộc JSON Schema cho LLM: Buộc AI phải trả về cấu trúc `ItineraryDay` chứa `activities`.
  - Có cơ chế Fallback (Exponential Backoff): Nếu model hiện tại quá tải (Rate limit), Orchestrator lập tức đổi sang Model dự phòng (Ví dụ: từ gpt-4o-mini sang gpt-4.1-nano) để hệ thống không bao giờ bị sập.

---

## PHẦN II: CHI TIẾT LUỒNG XỬ LÝ (PROCESSING FLOW) TỪ STEP 1 ĐẾN 5

### 1. STEP 1: SURVEY (Khởi tạo Context & Trích xuất ý định)
**Mục tiêu:** Tạo ra `surveyData` gốc để mớm cho các Step sau.
- **Luồng chạy:**
  1. User nhắn tin vào khung chat: "Tôi có 10 triệu, muốn đi 3 ngày 2 đêm cùng bạn gái, thích tắm biển".
  2. `chatWithSurveyAgent` (thuộc Survey Agent) nhận tin nhắn, phân tích, trả về lời chào và cập nhật ngầm `extractedData`.
  3. Form điền tự động nhảy số: Ngân sách = 10,000,000, Start/End Date tự tính (Ví dụ tự cộng thêm 3 ngày).
  4. Nếu user nói "tắm biển", `analyzeSurveyPrompt` (NLP Agent) đọc ngữ nghĩa và tìm trong RAG các điểm phù hợp (vd: Kỳ Co, Eo Gió). Gắn danh sách ID này vào biến state `destinations`.
  5. User bấm "Bắt đầu", toàn bộ Context được truyền xuống Step 2.

### 2. STEP 2: PICKER (Định tuyến bản đồ & Lọc RAG)
**Mục tiêu:** Chốt danh sách các điểm tham quan (`locations`).
- **Luồng chạy:**
  1. Nhận `destinations` từ Step 1, hệ thống hiển thị bản đồ Google Maps và đánh dấu sẵn các điểm này.
  2. Hiển thị UI Chatbot bên trái: Gọi hàm `chatWithStep2Agent`. Agent này đọc `budget` (10tr) và áp dụng chiến thuật trừ hao 30% cho khách sạn, còn lại 7tr. 
  3. AI sẽ tư vấn: "Với 7 triệu, tôi đề xuất bạn đi thêm Tháp Đôi (vé 20k), Bảo tàng...". AI trả về mảng `suggestedLocationIds`.
  4. Nếu user chọn thời tiết là "Rainy", Weather Agent ép AI không được trả về ID của các bãi biển.
  5. User gạt toggle chọn/bỏ chọn địa điểm. Cuối cùng bấm "Tiếp tục".

### 3. STEP 3: NEGOTIATION (Thương lượng Lưu trú)
**Mục tiêu:** Chọn 1 Khách sạn (Hotel) làm tâm điểm (Hotel-centric).
- **Luồng chạy:**
  1. Hiển thị danh sách Khách sạn lấy từ RAG (`type === 'hotel'`).
  2. Dùng công thức Haversine tính khoảng cách từ mỗi khách sạn đến các điểm tham quan đã chọn ở Step 2. 
  3. Budget Auditor kiểm tra: `Ngân sách - (Giá KS x Số ngày) - Tổng vé tham quan`. Nếu con số này < 0, thanh Budget bar chuyển sang màu Đỏ báo động.
  4. User chốt 1 khách sạn. Hệ thống nối Khách sạn này vào mảng `currentLocations`.

### 4. STEP 4: ENGINE (Lên lịch trình bằng Trí Tuệ Nhân Tạo)
**Mục tiêu:** Khớp toàn bộ địa điểm vào từng ngày.
- **Luồng chạy:**
  1. Gọi hàm `generateItinerary()` của Prompt Engineer Agent.
  2. Đẩy toàn bộ cấu hình: `destinations`, `hotelId`, `days`, `budget`, `transport` và 1 phiên bản RAG rút gọn lên API.
  3. LLM phân tích và sinh ra mảng JSON theo từng ngày (`ItineraryDay`). Mỗi ngày có 1 mảng `activities`.
  4. Hệ thống parse JSON. Nếu lỗi, thử lại bằng Fallback Model.
  5. Chuyển kết quả thô sang dạng `ItineraryDTO` và push sang Step 5.

### 5. STEP 5: HEADQUARTER (Điều phối trung tâm - The Dashboard)
**Mục tiêu:** Nơi hiển thị Dashboard tổng hợp, cho phép tương tác Real-time đa tác nhân. Đây là lõi kỹ thuật phức tạp nhất.
- **Luồng chạy tương tác:**
  - **Tương tác Chat Dẫn Hướng (Dynamic Chat):**
    1. User nhập: "100k thì nên đi đâu?".
    2. Hàm `analyzeStep5Intent` nhận câu nói, phân loại Intent = `explore`.
    3. Đẩy query vào `searchPlacesByAgent()`. Trong prompt, AI đọc biến `100k`, chuyển thành `100000`, quét RAG để ưu tiên trả về các điểm có `cost <= 100000`.
    4. Trả về giao diện, hiển thị thẻ địa điểm rẻ tiền để User bấm thêm vào lịch trình.
  - **Tương tác Tối ưu Lộ trình (Optimize Full):**
    1. User gõ "Sắp xếp lại đường đi". Intent = `optimize_full`.
    2. Logistics Agent bóc tách tất cả các điểm trong toàn bộ chuyến đi.
    3. Gom cụm (Clustering): Lấy 1 điểm làm hạt giống (Seed), tìm các điểm gần nhất (Nearest) nhét chung vào Ngày 1. Tiếp tục với Ngày 2, Ngày 3... Đảm bảo số lượng điểm mỗi ngày đồng đều.
    4. Tối ưu thứ tự (TSP): Bên trong Ngày 1, tính hoán vị để đường đi ngắn nhất (Từ Khách sạn -> Điểm 1 -> Điểm 2 -> Khách sạn).
    5. Cập nhật UI bản đồ và Timeline, thông báo số KM tiết kiệm được.
  - **Kéo thả Timeline (Drag & Drop):**
    1. User kéo 1 điểm từ 14h chiều lên 8h sáng.
    2. Hàm `recalculateTimes()` chạy: Lấy số giờ khuyên dùng từ RAG (`recommendedHours`), cộng dồn từ 8h sáng. Nếu tổng giờ vượt quá 23h đêm, tính tỷ lệ nén (Compression Ratio) để thu hẹp thời gian chơi của mỗi điểm xuống một chút sao cho vừa khít ngày.
  - **Kiểm toán Real-time (Budget Cut):**
    1. User đổi phương tiện sang "Thuê ô tô". Budget Agent tính: (Quãng đường x Tiền xăng) + Tiền thuê xe theo ngày. 
    2. Ngân sách bị lố (Âm tiền). Budget Agent popup: "Bạn có muốn bỏ bớt địa điểm không?". 
    3. Trích xuất các điểm tốn nhiều tiền nhất (Giá vé + ăn uống cao) đề xuất gạch bỏ.
  - **Mô phỏng Thời tiết (Bão):**
    1. Bấm nút "Giả lập bão".
    2. Weather Agent duyệt lịch trình, thấy điểm `Eo Gió` có `isIndoor: false` -> Gạch ngang tên (Canceled: true), đổi `reason` thành "Hủy do Siêu bão".
    3. Trigger Logistics Agent tính lại đường đi (bỏ qua Eo Gió).

---
*Báo cáo cung cấp cái nhìn chi tiết nhất về cách các Agent không chỉ hoạt động độc lập mà còn giao tiếp và phản ứng dây chuyền (Chain Reaction) để liên tục giữ cho chuyến đi tối ưu, an toàn và nằm trong ngân sách.*

---

## PHẦN III: CÁC THUẬT TOÁN CỐT LÕI (CORE ALGORITHMS) VÀ CÁCH TÍNH TOÁN
Hệ thống không chỉ dựa vào AI sinh văn bản mà còn áp dụng các thuật toán khoa học máy tính nghiêm ngặt để tối ưu hóa và tính toán logic:

### 1. Thuật toán đo lường khoảng cách địa lý (Haversine Formula)
- **Mục đích:** Tính toán chính xác khoảng cách (số KM) giữa 2 tọa độ (Vĩ độ - Latitude, Kinh độ - Longitude) trên mặt cầu Trái Đất.
- **Cách tính toán:**
  - `a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)`
  - `c = 2 * atan2(√a, √(1−a))`
  - `Distance (km) = R * c` (Với R = 6371km là bán kính Trái Đất).
- **Ứng dụng:** Dùng để tính tổng quãng đường di chuyển trong ngày, từ đó làm cơ sở nhân với giá xăng/giá Grab để ra tổng chi phí đi lại.

### 2. Thuật toán tối ưu hóa đường đi (Traveling Salesperson Problem - TSP)
- **Mục đích:** Tìm đường đi ngắn nhất đi qua một tập hợp các điểm và quay về điểm xuất phát (Khách sạn).
- **Cách tính toán:**
  - **Với số lượng điểm ít (<= 8 điểm/ngày):** Áp dụng **Brute-force Permutations (Sinh hoán vị)**. Hệ thống sẽ sinh ra tất cả các trường hợp sắp xếp đường đi có thể có `O(n!)`, cộng dồn khoảng cách Haversine của từng trường hợp, sau đó chọn ra trường hợp có tổng KM nhỏ nhất. Đảm bảo tính tối ưu tuyệt đối.
  - **Với số lượng điểm lớn (> 8 điểm/ngày):** Để tránh tràn bộ nhớ, hệ thống chuyển sang dùng **Greedy Nearest Neighbor (Thuật toán tham lam láng giềng gần nhất)**. Bắt đầu từ Khách sạn, nó sẽ quét tìm điểm chưa đi gần nhất, di chuyển đến đó, rồi lặp lại cho đến khi đi hết và quay về.

### 3. Thuật toán gom cụm (K-Means Clustering Heuristic)
- **Mục đích:** Khi người dùng muốn sắp xếp lại TOÀN BỘ chuyến đi (nhiều ngày), cần gom các điểm gần nhau về chung 1 ngày.
- **Cách tính toán:**
  - **Chia số lượng:** Tính số lượng điểm trung bình mỗi ngày (Ví dụ: 15 điểm / 3 ngày = 5 điểm/ngày).
  - **Chọn Seed (Hạt giống):** Lấy điểm chưa được phân bổ đầu tiên làm tâm của Ngày 1.
  - **Hút các điểm gần:** Dùng Haversine tìm 4 điểm gần cái "tâm" đó nhất để nhét vào Ngày 1. Lặp lại quá trình này cho Ngày 2, Ngày 3. Kết quả là mỗi ngày sẽ cụm lại ở một khu vực địa lý nhất định (Bắc, Nam, Trung tâm) tránh đi lại đan chéo.

### 4. Thuật toán nội suy thời gian (Cascade Time Calculation)
- **Mục đích:** Tính toán lại giờ Start Time và End Time cho mọi điểm khi có sự thay đổi (kéo thả, xóa điểm).
- **Cách tính toán:**
  - Lấy `recommendedHours` (số giờ khuyên dùng) của từng điểm từ RAG. Tổng hợp lại thành `Total Needed Hours`.
  - Giới hạn khung giờ chơi là từ `8:00` sáng đến `23:00` đêm (`Max Available Hours` = 15 tiếng).
  - **Compression Ratio (Tỷ lệ nén):** Nếu `Total Needed Hours` > `Max Available Hours` (Đi quá nhiều điểm), hệ thống sẽ tính `Tỷ lệ = Max / Total`. Sau đó nhân số giờ của mỗi điểm với tỷ lệ này để "ép" tất cả các điểm vừa khít vào khung thời gian trong ngày mà không bị tràn sang ngày hôm sau.
  - **Cascade Forward/Backward:** Khi User đổi giờ của Điểm A làm trùng lấn sang Điểm B, thuật toán sẽ lấy độ lệch thời gian (Delta) và đẩy tịnh tiến toàn bộ giờ của Điểm B, C, D... về phía trước.

---

## PHẦN IV: LỢI THẾ CẠNH TRANH & GIÁ TRỊ TỐI ƯU ĐỘC QUYỀN (USP)
**"Tại sao người dùng nên chọn Vi Vu Agent thay vì tự lên kế hoạch hoặc dùng các tool du lịch khác?"**

Dưới đây là những điểm tối ưu vượt trội và độc quyền mà Vi Vu Agent mang lại:

### 1. Tối ưu hóa Hành trình & Chi phí (Routing & Budget Optimization)
- **Tiết kiệm tiền bạc & sức lực:** Khác với các app chỉ ghim điểm lên bản đồ một cách ngẫu nhiên, hệ thống tích hợp thuật toán **K-Means Clustering** và **TSP (Traveling Salesperson Problem)** để gom các điểm gần nhau vào chung một ngày và vẽ ra lộ trình ngắn nhất. Điều này giúp giảm thiểu quãng đường di chuyển vòng vèo, tránh gây mệt mỏi.
- **Cơ chế tính toán & Tối ưu chi phí cực kỳ chi tiết:** Hệ thống không ước lượng bừa mà tính toán dựa trên công thức toán học và dữ liệu thực tế:
  - **Đo lường quãng đường (Haversine Formula):** Cộng dồn chính xác từng KM di chuyển giữa các điểm liên tiếp trong lộ trình từng ngày.
  - **Tính chi phí di chuyển linh hoạt (Dynamic Transport Cost):** Dựa vào loại xe (xe máy, ô tô, xe thuê, Grab) và số người để phân bổ xe (Ví dụ: 5 người sẽ tự động tính là 1 xe 7 chỗ thay vì 2 xe 4 chỗ). Sau đó, lấy Tổng quãng đường (KM) nhân với Định mức tiêu hao nhiên liệu (KM/Lít) và Giá xăng Real-time, hoặc nhân với Đơn giá Grab/KM.
  - **Thuật toán Hybrid Walk (Kết hợp đi bộ):** Nếu người dùng chọn tối ưu "Hết cỡ", hệ thống sẽ quét khoảng cách giữa các điểm. Nếu 2 điểm cách nhau dưới 1.5km, hệ thống **tự động cắt bỏ tiền xe đoạn đó** và chuyển sang "Đi bộ", giúp tiết kiệm tối đa.
  - **Kiểm toán & Cắt giảm ngân sách (Budget Cut Algorithm):** **Budget Auditor Agent** theo dõi trực tiếp từng đồng. Phương trình: `Tổng Ngân sách - (Giá KS x Số đêm) - (Giá vé tham quan + Ăn uống) - Tiền di chuyển = Ngân sách khả dụng`.
    - **Nếu Ngân sách < 0 (Âm tiền):** Thuật toán lập tức chẩn đoán. Nó sắp xếp mảng các địa điểm theo tổng chi phí giảm dần (Cost Descending). Nó sẽ "nhặt" ra 2 điểm tốn kém nhất (giá vé cao, ăn uống mắc) để đưa ra popup đề xuất User gạch bỏ nhằm tiết kiệm tiền.
    - **Gợi ý hạ cấp Khách sạn:** Đồng thời, AI sẽ lọc RAG tìm các khách sạn rẻ hơn khách sạn hiện tại, sắp xếp theo công thức `(Giá tiền + Điểm phạt khoảng cách tới trung tâm)` để tìm ra các lựa chọn thay thế vừa rẻ vừa tiện đường, giúp kéo Ngân sách về mức Dương (> 0).

### 2. Tự động hóa Thời gian linh hoạt (Cascade Time Calculation)
- **Không bao giờ bị "cháy giáo án":** Khi tự lên lịch, người dùng thường tính sai thời gian tham quan dẫn đến trễ giờ. Vi Vu Agent sở hữu thuật toán **Nén/Giãn thời gian động (Cascade)**: Khi người dùng kéo thả (Drag & Drop) dời lịch một điểm, toàn bộ các điểm phía sau sẽ tự động tính toán lại giờ giấc để lấp đầy khoảng trống, đồng thời dùng `recommendedHours` (thời gian khuyên dùng) để ép khớp mọi hoạt động vào khung 8h - 23h. 

### 3. Khả năng Chống rủi ro (Risk Mitigation & Weather Awareness)
- **Bảo vệ trải nghiệm người dùng:** Rất ít ứng dụng du lịch tự động phản ứng với thời tiết. Với **Weather Agent**, nếu hệ thống nhận diện có "Mưa Bão", nó lập tức lọc bỏ các địa điểm ngoài trời (Biển, Đảo) ra khỏi lịch trình và tính toán lại một lộ trình hoàn toàn mới chuyên đi trong nhà (Bảo tàng, Cafe...). Người dùng sẽ không bao giờ bị động khi thời tiết xấu.

### 4. Tương tác Ngôn ngữ Tự nhiên & Đa Agent (Seamless AI Interaction)
- **Dễ dùng như nhắn tin với con người:** Người dùng không cần bấm hàng chục nút filter phức tạp. Chỉ cần chat *"Tôi có 100k thì nên đi đâu?"*, hệ thống kết hợp **NLP Agent** và **RAG** để bóc tách con số, lục tìm cơ sở dữ liệu và ngay lập tức trả về các địa điểm có giá <= 100k. 
- **Cơ chế Fallback thông minh:** Khi API của một model AI bị quá tải, **Orchestrator Agent** tự động đổi sang một model khác (Exponential Backoff), đảm bảo ứng dụng luôn chạy mượt mà, không bao giờ báo lỗi đứt gãy.

**Tóm lại:** Vi Vu Agent không chỉ là một công cụ "vẽ bản đồ". Nó thực sự là một **Trợ lý cá nhân + Kế toán viên + Kỹ sư điều phối**, giúp người dùng tiết kiệm tối đa tiền bạc, thời gian di chuyển, và luôn có sẵn phương án dự phòng cho mọi rủi ro thời tiết.
