# SƠ ĐỒ KIẾN TRÚC HỆ THỐNG VI VU AGENT (BẢN CHI TIẾT - COMPREHENSIVE ARCHITECTURE)

Bản đồ kiến trúc dưới đây được thiết kế siêu chi tiết, lột tả toàn bộ cấu trúc thư mục, các file code thực tế, trạng thái state, và luồng hoạt động của tất cả các Agent (bao gồm cả Voice Agent) trong hệ thống Vi Vu Agent.

## 1. Sơ Đồ Kiến Trúc Hệ Thống (Mermaid Diagram)

Bạn có thể copy đoạn mã dưới đây vào [Mermaid Live Editor](https://mermaid.live/), Notion hoặc đưa cho ChatGPT/Claude để tự động vẽ ra bản vẽ đồ họa chuyên nghiệp.

```mermaid
graph TD
    %% ==========================================
    %% 1. USER & DEVICE INTERACTION LAYER
    %% ==========================================
    User([Người dùng])
    Browser[Trình duyệt Web]
    Speaker[Loa / Âm thanh]
    
    User <-->|Click, Drag&Drop, Chat| Browser
    Browser -->|Phát âm thanh| Speaker

    %% ==========================================
    %% 2. PRESENTATION & UI COMPONENTS LAYER (React)
    %% ==========================================
    subgraph UI_Layer [Lớp Giao Diện (src/components)]
        direction TB
        AppTSX(App.tsx - Main Container)
        
        subgraph Steps [Các Màn Hình Chính (src/components/Steps)]
            S1[Step1Survey.tsx]
            S2[Step2Picker.tsx]
            S3[Step3Negotiation.tsx]
            S4[Step4Engine.tsx]
            S5[Step5HQ.tsx]
        end
        
        subgraph Sub_Components [Thành Phần Phụ (src/components)]
            MapUI[Map/GoogleMapViewer]
            DashboardUI[Dashboard Components]
            SurveyUI[Survey Chat UI]
        end

        AppTSX --> S1 & S2 & S3 & S4 & S5
        S2 & S5 --> MapUI
        S5 --> DashboardUI
        S1 --> SurveyUI
    end

    Browser <--> UI_Layer

    %% ==========================================
    %% 3. STATE MANAGEMENT LAYER (Trung tâm Dữ liệu Cục bộ)
    %% ==========================================
    subgraph State_Layer [Lớp Quản Lý Trạng Thái (Global React States)]
        SurveyState[(surveyData\n- budget, startDate, endDate, transport)]
        DestState[(destinations\n- ID các điểm đã chọn)]
        LocState[(currentLocations\n- Chi tiết các điểm RAG)]
        ItiState[(itinerary\n- Lịch trình mảng các ngày)]
        WeatherState[(weatherState\n- Sunny / Storm)]
    end

    UI_Layer <--> State_Layer

    %% ==========================================
    %% 4. SERVICE & API ABSTRACTION LAYER (src/services)
    %% ==========================================
    subgraph Service_Layer [Lớp Dịch Vụ - Cầu nối API]
        direction TB
        GeminiSVC[geminiService.ts]
        VoiceSVC[voiceAgent.ts]
        
        %% Functions in geminiService
        fn_chat1(chatWithSurveyAgent)
        fn_parse1(analyzeSurveyPrompt)
        fn_chat2(chatWithStep2Agent)
        fn_gen(generateItinerary)
        fn_intent(analyzeStep5Intent)
        fn_search(searchPlacesByAgent)
        
        GeminiSVC --- fn_chat1 & fn_parse1 & fn_chat2 & fn_gen & fn_intent & fn_search
        
        %% Functions in voiceAgent
        fn_speak(speak)
        fn_stop(stop)
        VoiceSVC --- fn_speak & fn_stop
    end

    UI_Layer <-->|Gọi hàm xử lý logic| Service_Layer

    %% ==========================================
    %% 5. MULTI-AGENT LOGIC & ALGORITHM LAYER (Não Bộ)
    %% ==========================================
    subgraph Agent_Layer [Lớp Đa Tác Nhân & Lõi Thuật Toán]
        direction TB
        
        Orchestrator{Orchestrator Agent\n(Điều phối chung)}
        
        subgraph NLP_Agents [Nhóm Tác Nhân Ngôn Ngữ]
            SurveyA[Survey Agent\n- Lấy Context]
            LangA[Language/NLP Agent\n- Semantic Matching\n- Intent Classification]
        end
        
        subgraph Math_Agents [Nhóm Tác Nhân Toán Học]
            LogisticsA[Logistics/Scheduler Agent\n- Haversine Distance\n- TSP Brute-force/Greedy\n- K-Means Clustering\n- Cascade Time]
            BudgetA[Budget Auditor Agent\n- Real-time Cost Calculation\n- Dynamic Transport Cost\n- Cost Descending Cut]
        end
        
        subgraph Env_Agents [Nhóm Tác Nhân Môi Trường]
            WeatherA[Weather Agent\n- Lọc isIndoor\n- Cảnh báo bão]
            VoiceA[Voice Agent\n- Text-To-Speech (TTS)]
        end

        Orchestrator <--> NLP_Agents & Math_Agents & Env_Agents
    end

    Service_Layer <-->|Cung cấp Prompt & Thuật toán| Agent_Layer

    %% ==========================================
    %% 6. DATA & INFRASTRUCTURE LAYER
    %% ==========================================
    subgraph Data_Layer [Lớp Dữ Liệu & API Ngoại Vi]
        direction LR
        RAG_DB[(ragDatabase.json\nĐịa điểm, Giá vé, Tọa độ, Tags)]
        RAG_Trans[(rag_transport.json\nĐịnh mức Xăng, Giá Thuê/Grab)]
        LLM_API[Google Gemini API\n(Có Exponential Backoff Fallback)]
        TTS_API[Web Speech API\n(Trình duyệt vi-VN)]
    end

    Math_Agents -->|Đọc bảng giá| RAG_Trans
    NLP_Agents & Math_Agents -->|Query thông tin| RAG_DB
    GeminiSVC -->|Gọi API| LLM_API
    VoiceSVC -->|Gọi Audio| TTS_API

    %% ==========================================
    %% STYLING
    %% ==========================================
    classDef ui fill:#0ea5e9,stroke:#0284c7,stroke-width:2px,color:#fff;
    classDef state fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff;
    classDef service fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff;
    classDef agent fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff;
    classDef data fill:#64748b,stroke:#475569,stroke-width:2px,color:#fff;
    classDef master fill:#e11d48,stroke:#be123c,stroke-width:3px,color:#fff;

    class UI_Layer,S1,S2,S3,S4,S5,AppTSX ui;
    class SurveyState,DestState,LocState,ItiState,WeatherState state;
    class Service_Layer,GeminiSVC,VoiceSVC service;
    class Agent_Layer,SurveyA,LangA,LogisticsA,BudgetA,WeatherA,VoiceA agent;
    class Data_Layer,RAG_DB,RAG_Trans,LLM_API,TTS_API data;
    class Orchestrator master;
```

---

## 2. Diễn Giải Kiến Trúc Chi Tiết Lớp (Detailed Layer Description)

Kiến trúc dự án được phân tách nghiêm ngặt theo mô hình **6 Lớp (6-Tier Architecture)**, đảm bảo nguyên tắc Separation of Concerns (Tách biệt mối quan tâm), giúp code dễ bảo trì, dễ scale và không bị dính chặt (tight-coupling).

### LỚP 1: USER & DEVICE INTERACTION (Tương Tác Thiết Bị)
- Gồm **Trình duyệt Web** nhận các thao tác cơ học của người dùng (Click chuột, Kéo thả Timeline, Nhập Chat) và **Thiết bị âm thanh (Loa)** để phát ra giọng nói phản hồi.

### LỚP 2: PRESENTATION & UI COMPONENTS (Giao Diện React)
Nằm trong thư mục `src/components`. Đây là nơi chứa các View của ứng dụng.
- **`App.tsx`**: Là component gốc (Root), chứa toàn bộ state tổng và có nhiệm vụ Render có điều kiện (Conditional Rendering) chuyển qua lại giữa 5 Steps.
- **`Step1Survey` đến `Step5HQ`**: Là 5 màn hình tương ứng với 5 quy trình (Survey -> Picker -> Negotiation -> Engine -> Headquarter).
- Các component phụ trợ được chia nhỏ vào thư mục con như `Map/`, `Dashboard/`, `Survey/` để tái sử dụng.

### LỚP 3: STATE MANAGEMENT (Trạng Thái Cục Bộ)
Trái tim lưu trữ dữ liệu RAM của React (Hooks `useState`, `useMemo`). 
- Gồm 5 state trụ cột truyền từ `App.tsx` xuống các Step con dưới dạng Props:
  1. `surveyData`: Chứa Ngân sách, Số người, Phương tiện, Ngày đi/về.
  2. `destinations`: Mảng chuỗi ID các điểm người dùng muốn đi.
  3. `currentLocations`: Mảng object chi tiết (Tọa độ, Giá tiền) của các điểm đã chốt (Từ `ragDatabase`).
  4. `itinerary`: Object khổng lồ chứa lịch trình xếp theo từng ngày (`ItineraryDay`) và từng giờ (`ItineraryActivity`).
  5. `weatherState`: Cờ báo thời tiết (`Sunny` hoặc `Storm`).

### LỚP 4: SERVICE & API ABSTRACTION (Dịch Vụ & Cầu Nối)
Nằm trong thư mục `src/services`. Nhiệm vụ là ẩn đi sự phức tạp của việc gọi API ngoài, cung cấp cho UI các hàm gọn gàng.
- **`geminiService.ts`**: Chứa toàn bộ Prompt hệ thống, cấu hình tham số Temperature, model, và quan trọng nhất là cơ chế **Exponential Backoff Fallback** (tự động đổi model từ `gpt-4o-mini` sang các model dự phòng khi lỗi mạng hoặc Rate Limit `429`). Gồm các hàm phục vụ UI: `chatWithSurveyAgent`, `analyzeSurveyPrompt`, `chatWithStep2Agent`, `generateItinerary`, `analyzeStep5Intent`, `searchPlacesByAgent`.
- **`voiceAgent.ts`**: Đóng gói API `window.speechSynthesis` của trình duyệt. Cung cấp hàm `.speak()` và `.stop()` để đọc văn bản tiếng Việt (`vi-VN`) giúp hệ thống có khả năng tương tác bằng giọng nói (Voice Agent).

### LỚP 5: MULTI-AGENT LOGIC & ALGORITHM (Não Bộ Đa Tác Nhân)
Đây là tầng khái niệm (Conceptual Layer) xử lý các nghiệp vụ (Business Logic) phức tạp nhất. Nó được lồng ghép bên trong các Service và UI File (như `Step5HQ.tsx`).
- **Nhóm NLP (Ngôn ngữ):** Trích xuất Intent, map ngữ nghĩa.
- **Nhóm Toán học:** (Mạnh nhất) Gồm **Logistics Agent** xử lý thuật toán tối ưu lộ trình (TSP, K-Means Clustering, Haversine, nội suy thời gian Cascade) và **Budget Auditor Agent** xử lý tính toán dòng tiền âm/dương, chi phí vận tải động (Dynamic Transport Cost) dựa trên số người, khoảng cách, loại xe.
- **Nhóm Môi trường:** Gồm **Weather Agent** lọc rủi ro bão lũ bằng cờ `isIndoor` và **Voice Agent** chuyển đổi văn bản của AI thành âm thanh cảnh báo/trò chuyện trực tiếp với User.
- **Orchestrator Agent:** "Bộ trưởng bộ điều phối", đóng vai trò nhận lệnh từ UI, ra quyết định gọi Agent nào để giải quyết vấn đề.

### LỚP 6: DATA & INFRASTRUCTURE (Hạ Tầng Ngoại Vi)
Tầng thấp nhất cung cấp Dữ liệu thô và Năng lực tính toán:
- **`ragDatabase` (trong `src/data/index.ts`):** RAG nội bộ chứa tọa độ thực, giá vé thực, tag của các điểm du lịch Quy Nhơn.
- **`rag_transport.json`:** Database chứa cấu trúc giá cước (Định mức tiêu hao km/lít xăng, bảng giá Grab/Taxi, đơn giá thuê xe máy/ô tô theo ngày).
- **Google Gemini API / LLM:** Nền tảng điện toán đám mây AI phục vụ tính toán NLP.
- **Web Speech API:** Engine phát âm thanh có sẵn của Trình duyệt.
