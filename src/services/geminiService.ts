import type { SurveyDTO, LocationKnowledgeDTO } from '../types/dto';
import ragDatabase from '../data';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'sk-hlY7GTxBZZooeSqYFXOmJzpaaFgteLOWR6WWpUdYuK3hFBz1';
const API_URL = 'https://api.shopaikey.com/v1/chat/completions';

// Fast Model Fallback wrapper
async function fetchWithExponentialBackoff(url: string, options: RequestInit): Promise<Response> {
  const fallbackModels = [
    'gpt-4o-mini',
    'o4-mini',
    'gpt-4.1-nano',
    'gpt-4o-mini-2024-07-18',
    'gpt-5-minimal',
    'gpt-5-medium',
    'gpt-4o-2024-05-13',
    'gpt-4.1-2025-04-14',
    'gpt-4o-all',
    'gpt-3.5-turbo-16k',
    'gpt-5.5'
  ];
  
  let attempts = 0;
  const maxAttempts = fallbackModels.length;

  while (attempts < maxAttempts) {
    const currentModel = fallbackModels[attempts];
    try {
      // Inject the current fallback model into the payload
      let currentOptions = { ...options };
      if (options.body && typeof options.body === 'string') {
        try {
          const payload = JSON.parse(options.body);
          payload.model = currentModel;
          currentOptions.body = JSON.stringify(payload);
        } catch (e) {
          // ignore parse error
        }
      }

      const response = await fetch(url, currentOptions);
      if (response.ok) {
        return response;
      }
      
      console.warn(`Model ${currentModel} returned ${response.status}.`);
      if (response.status !== 429 && response.status < 500) {
        // If it's a 400 Bad Request, 401 Unauthorized, etc. Stop retrying.
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`Fetch error with model ${currentModel}: ${error}`);
    }

    attempts++;
    if (attempts < maxAttempts) {
      console.log(`Switching immediately to next model: ${fallbackModels[attempts]}`);
      // Wait a tiny bit to not spam
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  throw new Error('API_RATE_LIMIT');
}

export async function generateItinerary(survey: SurveyDTO): Promise<any> {
  const prompt = `
Bạn là một AI lên lịch trình du lịch chuyên nghiệp (Scheduler Agent).
Yêu cầu:
- Điểm muốn đến (IDs): ${survey.destinations.join(', ')}
- Thời gian đi: Từ ${survey.startDate} đến ${survey.endDate}
- Ngân sách: ${survey.budget} VNĐ
- Phương tiện: ${survey.transport}
- Thành phần: ${survey.who?.adults || 0} người lớn, ${survey.who?.children || 0} trẻ em.

Dữ liệu RAG (Cơ sở tri thức) về các địa điểm:
${JSON.stringify(ragDatabase)}

Nhiệm vụ:
Lập lịch trình CHÍNH XÁC trong khoảng thời gian từ startDate đến endDate. Trả về đúng định dạng JSON Array của \`ItineraryDay\`.
Mỗi ngày (\`ItineraryDay\`) gồm:
- date: (string) VD: "2026-08-15"
- hotelId: (string) Khách sạn đã chọn (từ RAG).
- activities: Mảng các \`ItineraryActivity\`. KHÔNG TRÙNG LẶP ĐỊA ĐIỂM (Mỗi điểm chỉ đi 1 lần).
Mỗi \`ItineraryActivity\` gồm:
- id: (string) ID của địa điểm trong RAG.
- startTime: (string) Giờ bắt đầu, VD: "08:00"
- endTime: (string) Giờ kết thúc, VD: "10:30"
- reason: (string) Giải thích ngắn gọn tại sao lại đi điểm này vào giờ này (VD: "Tránh nắng gắt ban trưa", "Tiện đường từ khách sạn").

Lưu ý: "Hotel-Centric", các ngày phải xuất phát từ khách sạn và về lại khách sạn. 
Chỉ trả về JSON, không có Markdown hay text khác.
`;

  const payload = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2
  };

  const response = await fetchWithExponentialBackoff(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  const textContent = data.choices[0].message.content;
  
  const jsonMatch = textContent.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch && jsonMatch[1]) {
    return JSON.parse(jsonMatch[1]);
  }
  return JSON.parse(textContent);
}



const locationListStr = ragDatabase
  .filter(l => l.type === 'attraction' || l.type === 'food') // Focus on attractions and food
  .map(l => `- ID: "${l.id}" (${l.name}): ${l.tags ? l.tags.join(', ') : 'Không có thẻ'}`)
  .join('\n');

export async function analyzeSurveyPrompt(prompt: string): Promise<{
  budget?: number,
  transport?: 'personal_motorbike' | 'personal_car' | 'rent_motorbike' | 'rent_car' | 'grab_motorbike' | 'grab_car',
  startDate?: string,
  endDate?: string,
  destinations?: string[]
}> {
  const systemPrompt = `
Bạn là AI trích xuất thông tin du lịch cho Quy Nhơn, Bình Định. Nhiệm vụ của bạn là đọc mô tả chuyến đi của người dùng và trích xuất ra các trường dữ liệu sau thành định dạng JSON CHÍNH XÁC.

Các trường cần trích xuất:
- budget (number): Ngân sách VND (VD: "8 triệu" -> 8000000, "5 triệu" -> 5000000). Nếu không có thông tin, trả về null.
- transport ("personal_motorbike" | "personal_car" | "rent_motorbike" | "rent_car" | "grab_motorbike" | "grab_car"): Phương tiện di chuyển. VD: "xe máy của tôi" -> "personal_motorbike", "thuê ô tô" -> "rent_car", "grab xe máy" -> "grab_motorbike". Nếu không thấy, trả về null.
- startDate (string): Thời gian bắt đầu đi, định dạng YYYY-MM-DDTHH:mm. Tự suy luận ngày gần nhất nếu chỉ nói thứ/ngày. Mặc định năm nay. VD: "Sáng thứ 6" -> "2026-06-20T08:00". Nếu không thấy, tự động tạo ngày mai lúc 08:00.
- endDate (string): Thời gian kết thúc, định dạng YYYY-MM-DDTHH:mm. Bạn PHẢI đọc kỹ số ngày/đêm người dùng yêu cầu. Nếu họ nói "đi 10 ngày" hoặc "10 đêm", hãy tính endDate = startDate + 10 ngày. VD: startDate là 2026-06-20, đi 10 ngày -> endDate là 2026-06-30T17:00. Nếu không nói số ngày cụ thể, mặc định là đi 3 ngày.
- who (object): Số lượng người đi, bao gồm "adults" (người lớn) và "children" (trẻ em). VD: "2 người lớn 1 trẻ em" -> {"adults": 2, "children": 1}. Mặc định là {"adults": 2, "children": 0} nếu không nói rõ.
- tags (array of strings): Sở thích du lịch rút ra từ yêu cầu của người dùng. Hãy chọn từ danh sách: ["Nghỉ dưỡng", "Khám phá", "Sống ảo", "Văn hóa", "Ẩm thực", "Biển đảo", "Thiên nhiên"]. VD: "đi ăn hải sản và checkin sống ảo" -> ["Ẩm thực", "Sống ảo"].
- numLocations (number): Số lượng nơi muốn đi. Nếu người dùng nói rõ "muốn đi 5 nơi", trả về con số đó. Nếu KHÔNG nói rõ, bạn PHẢI TỰ TÍNH TOÁN dựa trên tổng số ngày đi (trung bình 2-3 địa điểm 1 ngày). Ví dụ: đi 3 ngày -> đề xuất 5-6 nơi; đi 10 ngày -> ĐỀ XUẤT 15-20 nơi. Hãy rất logic ở bước này! Mặc định tối thiểu là 3.
- destinations (array of strings): Nếu AI TRONG LÚC CHAT đã gợi ý cho người dùng một danh sách các địa điểm cụ thể để đi, thì bạn PHẢI ĐỐI CHIẾU tên các địa điểm đó với danh sách RAG bên dưới, và trả về mảng chứa các ID khớp. Nếu người dùng nói "muốn tham quan nhiều nơi", "đi biển", hãy tự động chọn các ID phù hợp với mô tả đó (tối đa bằng numLocations).

Danh sách toàn bộ địa danh và quán ăn tại Quy Nhơn (hãy map đúng ID):
${locationListStr}

Nếu người dùng nói "muốn tham quan nhiều nơi", "đi ăn", "chill biển", hãy phân tích ngữ nghĩa và tự động chọn 2-4 ID phù hợp nhất. Ví dụ:
- "đi biển, lặn san hô, ngắm hoàng hôn" -> ["ky_co", "eo_gio"]
- "tham quan lịch sử cổ kính" -> ["bao_tang_quang_trung", "thap_doi"]
- "muốn đi dã ngoại cắm trại hoặc ra đảo hoang sơ" -> ["kdn_trung_luong", "cu_lao_xanh"]

Chỉ trả về chuỗi JSON, không có định dạng markdown hay bất cứ văn bản nào khác. Ví dụ:
{ "budget": 8000000, "transport": "personal_car", "startDate": "2026-08-15T08:00", "endDate": "2026-08-18T17:00", "who": {"adults": 2, "children": 0}, "tags": ["Biển đảo", "Khám phá"], "numLocations": 4, "destinations": ["ky_co", "eo_gio", "bao_tang_quang_trung"] }

Câu mô tả của người dùng: "${prompt}"
`;

  const payload = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: systemPrompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  };

  const response = await fetchWithExponentialBackoff(API_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  const textContent = data.choices[0].message.content;
  
  try {
    const jsonMatch = textContent.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }
    const fallbackMatch = textContent.match(/\{[\s\S]*\}/);
    if (fallbackMatch && fallbackMatch[0]) {
      return JSON.parse(fallbackMatch[0]);
    }
    return JSON.parse(textContent);
  } catch (e) {
    console.error("JSON parse error from Survey Agent:", e);
    return {};
  }
}

export async function chatWithSurveyAgent(
  chatHistory: { role: 'user' | 'agent'; text: string }[],
  currentState?: { budget: number, transport: string, who: {adults: number, children: number}, startDate: string, endDate: string, tags: string[], numLocations: number }
): Promise<{
  reply: string;
  extractedData: {
    budget?: number | null;
    transport?: 'personal_motorbike' | 'personal_car' | 'rent_motorbike' | 'rent_car' | 'grab_motorbike' | 'grab_car' | null;
    startDate?: string | null;
    endDate?: string | null;
    destinations?: string[] | null;
    who?: { adults: number; children: number } | null;
    tags?: string[] | null;
    numLocations?: number | null;
  };
}> {
  const currentStateStr = currentState ? `
⚠️ QUAN TRỌNG: Dưới đây là các thông tin HIỆN TẠI đã được điền sẵn trên giao diện. Bạn KHÔNG ĐƯỢC HỎI LẠI những thông tin này trừ khi người dùng chủ động muốn thay đổi. Nếu họ đã nói "đi 10 ngày", bạn hãy coi như đã có đủ thông tin và chuyển sang hỏi cái khác hoặc xác nhận chốt cấu hình.
- Ngân sách: ${currentState.budget}
- Phương tiện: ${currentState.transport}
- Số người: ${currentState.who.adults} người lớn, ${currentState.who.children} trẻ em
- Ngày bắt đầu: ${currentState.startDate}
- Ngày kết thúc: ${currentState.endDate}
- Sở thích: ${currentState.tags.length > 0 ? currentState.tags.join(', ') : 'Chưa chọn'}
- Số địa điểm: ${currentState.numLocations}
` : '';

  const systemPrompt = `
${currentStateStr}

Bạn là Trợ lý AI Du Lịch (Survey Agent). Nhiệm vụ của bạn là trò chuyện thân thiện với người dùng để lấy đủ thông tin khởi tạo chuyến đi.
Thông tin cần lấy:
- Ngân sách (budget)
- Thời gian đi (số ngày hoặc startDate/endDate)
- Số lượng người đi (người lớn, trẻ em)
- Sở thích du lịch (chọn trong: Nghỉ dưỡng, Khám phá, Sống ảo, Văn hóa, Ẩm thực, Biển đảo, Thiên nhiên)
- Phương tiện (chọn 1 trong: personal_motorbike, personal_car, rent_motorbike, rent_car, grab_motorbike, grab_car)
- Tùy chọn: số lượng địa điểm muốn đi (nếu không, tự tính tỷ lệ 2-3 nơi / 1 ngày).

QUY TẮC TRẢ LỜI:
- CHẶN MỌI CÂU HỎI NGOÀI LỀ (GUARDRAIL): Nếu người dùng yêu cầu viết code (HTML, JS, Python...), hỏi toán học, lịch sử thế giới, hoặc bất cứ chủ đề nào KHÔNG liên quan đến Du lịch Quy Nhơn/Bình Định, BẠN PHẢI TỪ CHỐI NGAY LẬP TỨC một cách lịch sự. Ví dụ: "Xin lỗi, tôi là Cố vấn Du Lịch Quy Nhơn nên chỉ có thể giúp bạn lên kế hoạch chuyến đi. Bạn muốn đi Quy Nhơn mấy ngày?"
- Nếu người dùng yêu cầu "gợi ý toàn bộ", "bạn tự lên lịch trình đi", "cho tôi 1 lịch trình tự động" mà không cung cấp thông tin gì, bạn KHÔNG CẦN HỎI LẠI. Hãy TỰ ĐỘNG khởi tạo một cấu hình phổ thông nhất (VD: đi 3 ngày 2 đêm, 2 người lớn, ngân sách 5-10 triệu, xe cá nhân, sở thích khám phá/nghỉ dưỡng) và trả lời luôn lịch trình gợi ý. Đặc biệt, bạn PHẢI điền các thông số tự chế đó vào \`extractedData\` để giao diện tự động cập nhật!
- Nếu người dùng chỉ nói "chào bạn", "gợi ý cho tôi đi Quy Nhơn" (nhưng chưa rõ là muốn tự động hoàn toàn), bạn có thể chào hỏi và hỏi lại họ các thông tin còn thiếu.
- Luôn giữ thái độ nhiệt tình, ngắn gọn.
- BẮT BUỘC TRẢ VỀ ĐÚNG ĐỊNH DẠNG JSON sau (không chứa văn bản nào ngoài JSON này, hãy chắc chắn escape đúng JSON):

{
  "reply": "Câu trả lời của bạn sẽ hiển thị cho người dùng",
  "extractedData": {
    "budget": null,
    "transport": null,
    "startDate": null,
    "endDate": null,
    "who": null,
    "tags": null,
    "numLocations": null
  }
}

Lưu ý cho extractedData:
- Chỉ điền giá trị cho những gì bạn đã thu thập được từ BẤT KỲ ĐÂU trong lịch sử chat. Nếu chưa có thông tin nào, cứ để null.
- Các quy tắc parse dữ liệu tương tự: budget là số (VNĐ), startDate/endDate là chuỗi (YYYY-MM-DDTHH:mm), who là {"adults": X, "children": Y}, tags là mảng chuỗi.
- destinations (array of strings): Nếu AI TRONG LÚC CHAT đã gợi ý cho người dùng một danh sách các địa điểm cụ thể để đi, thì bạn PHẢI ĐỐI CHIẾU tên các địa điểm đó với danh sách RAG bên dưới, và trả về mảng chứa các ID khớp.
- numLocations (number): SỐ LƯỢNG NƠI MUỐN ĐI. QUAN TRỌNG: Nếu bạn đã trích xuất mảng 'destinations', thì 'numLocations' PHẢI BẰNG CHÍNH XÁC chiều dài của mảng 'destinations' đó. Nếu không có 'destinations', tự tính toán dựa trên số ngày (2-3 điểm/ngày).

QUY TẮC VỀ GỢI Ý ĐỊA ĐIỂM:
- Khi gợi ý điểm đến, TUYỆT ĐỐI KHÔNG lên lịch trình chi tiết (không phân chia Ngày 1, Ngày 2, không ghi giờ giấc). CHỈ Liệt kê tóm tắt các địa điểm nổi bật phù hợp với yêu cầu của họ và giải thích ngắn gọn vì sao chọn. Việc lên lịch trình chi tiết từng ngày sẽ do hệ thống AI khác lo liệu ở bước cuối cùng.

DANH SÁCH ĐỊA ĐIỂM TỪ RAG (Dùng để tham khảo ID cho mảng destinations):
${locationListStr}
`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.map(msg => ({
      role: msg.role === 'agent' ? 'assistant' : 'user',
      content: msg.text
    }))
  ];

  const payload = {
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  };

  const response = await fetchWithExponentialBackoff(API_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  const textContent = data.choices[0].message.content;
  
  try {
    const jsonMatch = textContent.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Fallback: match the outermost JSON object
    const fallbackMatch = textContent.match(/\{[\s\S]*\}/);
    if (fallbackMatch && fallbackMatch[0]) {
      return JSON.parse(fallbackMatch[0]);
    }
    
    return JSON.parse(textContent);
  } catch (e: any) {
    console.error("Agent Error:", e);
    if (e.message?.includes('API_RATE_LIMIT') || e.message?.includes('API error')) {
      return {
        reply: "Hệ thống AI hiện đang bị quá tải (Quá nhiều yêu cầu). Bạn vui lòng chờ vài giây rồi thử gửi lại nhé!",
        extractedData: {}
      };
    }
    return {
      reply: "Xin lỗi, tôi chưa hiểu rõ ý bạn. Bạn có thể nói cụ thể hơn không?",
      extractedData: {}
    };
  }
}

export async function parseTimeIntent(prompt: string, maxDays: number): Promise<{ dayIndex: number, timeStr: string }> {
  const systemPrompt = `
Bạn là AI phân tích ngôn ngữ tự nhiên (NLP) cho một ứng dụng du lịch.
Lịch trình hiện tại có tối đa ${maxDays} ngày (Từ Ngày 1 đến Ngày ${maxDays}).
Người dùng vừa nhập một câu yêu cầu thêm hoạt động vào lịch trình. Hãy phân tích xem họ muốn thêm vào "Ngày thứ mấy" và "Lúc mấy giờ".

Luật:
- Nếu họ nói "ngày mai", "hôm sau", "ngày 2", "ngay 2" -> dayIndex = 1
- Nếu họ nói "ngày mốt", "ngày 3" -> dayIndex = 2
- Nếu họ nói "ngày cuối", "hôm về" -> dayIndex = ${maxDays - 1}
- Nếu họ nói "tùy ý", "ngày nào rảnh", "sắp xếp sao cũng được", "ngày nào cũng được" -> dayIndex = -1
- Mặc định nếu hoàn toàn không có manh mối -> dayIndex = 0
- Phân tích giờ (thời gian): Nếu họ nói "sáng" -> "08:00", "trưa" -> "12:00", "chiều" -> "14:00", "tối" -> "19:00". Nếu có giờ cụ thể (vd "14h", "2 giờ chiều") -> chuyển sang định dạng "HH:00". Mặc định nếu không rõ -> "19:00".

Chỉ trả về JSON hợp lệ, không có markdown. Ví dụ:
{"dayIndex": 1, "timeStr": "14:00"}

Câu của người dùng: "${prompt}"
`;

  const payload = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: systemPrompt }],
    temperature: 0.1
  };

  const response = await fetchWithExponentialBackoff(API_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  const textContent = data.choices[0].message.content;
  
  const jsonMatch = textContent.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch && jsonMatch[1]) {
    return JSON.parse(jsonMatch[1]);
  }
  return JSON.parse(textContent);
}

export async function chatWithStep2Agent(prompt: string, weather: string, budget: number, days: number, currentSelected: string[]): Promise<{ reply: string, suggestedLocationIds: string[] }> {
  // Lọc lấy 1 số trường quan trọng từ RAG để tránh vượt giới hạn token
  const simplifiedRag = ragDatabase.filter(d => d.type !== 'hotel').map(l => ({
    id: l.id,
    name: l.name,
    type: l.type,
    isIndoor: l.isIndoor,
    ticketPrice: l.ticketPrice,
    avgCost: l.avgCost,
    pros: l.pros,
    cons: l.cons,
    socialBuzz: l.socialBuzz
  }));

  const systemPrompt = `
Bạn là một AI Travel Agent thông minh của ứng dụng ViVuAgent. 
Nhiệm vụ của bạn là quản lý danh sách địa điểm du lịch (destinations) dựa trên ngân sách và yêu cầu.
Ngân sách của User cho chuyến đi ${days} ngày là: ${budget.toLocaleString()} VNĐ.
Danh sách các ID địa điểm User ĐANG CHỌN HIỆN TẠI (Current List): [${currentSelected.join(', ')}]

Yêu cầu chiến thuật: 
1. LẮNG NGHE LỆNH THÊM/BỚT: Người dùng có thể yêu cầu "Thêm chỗ ăn", "Bớt 3 chỗ". Bạn hãy phân tích:
   - NẾU YÊU CẦU LÀ "THÊM": Bạn BẮT BUỘC PHẢI GIỮ NGUYÊN toàn bộ ID đang có trong [Current List], và CHỈ CỘNG THÊM các ID mới vào. (Ví dụ đang có 20, thêm 10 -> Final List phải có đủ 30 ID). Tuyệt đối không tự ý xóa điểm cũ nếu User không yêu cầu.
   - NẾU YÊU CẦU LÀ "XÓA/BỚT": Hãy loại bỏ các ID không phù hợp ra khỏi [Current List].
2. RÀNG BUỘC SỐ LƯỢNG & NGÂN SÁCH: 
   - Nếu User đòi thêm 30 chỗ ăn nhưng trong dữ liệu RAG chỉ có 17 chỗ, hãy thêm TỐI ĐA số chỗ ăn hiện có và giải thích rõ cho User biết.
   - Hãy trừ hao 20%-30% ngân sách cho khách sạn. Cân đối phần tiền còn lại cho các điểm trong Final List.
3. AN TOÀN THỜI TIẾT: Thời tiết đang là: ${weather}. Nếu thời tiết xấu (Rainy, Storm), TUYỆT ĐỐI không giữ/thêm các địa điểm ngoài trời (isIndoor=false).
4. CHẶN NGOÀI LỀ: Nếu hỏi code, toán học, lịch sử, v.v... hãy từ chối.

Trích xuất kết quả dưới định dạng JSON CHÍNH XÁC gồm 3 trường:
1. "reply": (string) Câu trả lời giao tiếp tự nhiên với người dùng. Giải thích ngắn gọn bạn vừa xóa điểm nào, thêm điểm nào và tại sao. (TUYỆT ĐỐI TỰ SÁNG TẠO TEXT).
2. "addLocationIds": (array of strings) DANH SÁCH ID CÁC ĐỊA ĐIỂM BẠN QUYẾT ĐỊNH THÊM VÀO dựa theo yêu cầu. Nếu không thêm gì, trả về mảng rỗng [].
3. "removeLocationIds": (array of strings) DANH SÁCH ID CÁC ĐỊA ĐIỂM BẠN QUYẾT ĐỊNH XÓA ĐI. Nếu không xóa gì, trả về mảng rỗng [].
Hãy sử dụng CHÍNH XÁC giá trị của trường id trong dữ liệu RAG, không dùng tên địa điểm!

Dữ liệu RAG thu gọn:
${JSON.stringify(simplifiedRag)}

Yêu cầu của người dùng: "${prompt}"

Trả về CHỈ một chuỗi JSON hợp lệ, không có markdown text. Dưới đây là CẤU TRÚC JSON MẪU:
{
  "reply": "[Nội dung câu trả lời tự nhiên của bạn...]",
  "addLocationIds": ["id_1", "id_2"],
  "removeLocationIds": []
}
`;

  const payload = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: systemPrompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  };

  try {
    const response = await fetchWithExponentialBackoff(API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const textContent = data.choices[0].message.content;
    
    const jsonMatch = textContent.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }
    const fallbackMatch = textContent.match(/\{[\s\S]*\}/);
    if (fallbackMatch && fallbackMatch[0]) {
      return JSON.parse(fallbackMatch[0]);
    }
    return JSON.parse(textContent);
  } catch (e: any) {
    if (e.message?.includes('API_RATE_LIMIT')) {
      return { reply: "Hệ thống AI gợi ý địa điểm đang quá tải. Vui lòng chờ vài giây rồi thử lại.", suggestedLocationIds: [] };
    }
    return { reply: "Đã xảy ra lỗi khi gọi AI. Vui lòng thử lại sau.", suggestedLocationIds: [] };
  }
}

export async function analyzeStep5Intent(prompt: string): Promise<{ intent: string, level?: string, newBudget?: number }> {
  const systemPrompt = `
Bạn là AI phân tích Intent (Ý định) cho ứng dụng lập lịch trình du lịch.
Người dùng nhập câu: "${prompt}"

Hãy phân tích và trả về ĐÚNG 1 trong các "intent" sau:
- "cut_budget": Cắt giảm chi phí, tối ưu chi phí bằng cách bỏ bớt các địa điểm hoặc hoạt động do vượt ngân sách.
- "opt_transport_cost": Tối ưu chi phí đi lại. (Nếu có mức độ, trả thêm "level": "max" (hết cỡ/rất tiết kiệm), "normal" (vừa phải), "light" (nhẹ nhàng)).
- "update_budget": Thay đổi ngân sách. (Trả thêm "newBudget" là số tiền VND, VD: "5 triệu" -> 5000000).
- "suggest_budget": Hỏi ý kiến gợi ý ngân sách, nên chuẩn bị bao nhiêu tiền.
- "transport_cost": Thay đổi phương tiện (VD: đi bộ, đi grab, xe máy, thuê ô tô).
- "optimize_full": Sắp xếp/tối ưu lại toàn bộ lộ trình các ngày.
- "optimize_day": Sắp xếp/tối ưu lại lộ trình (nhưng không nói rõ là tất cả).
- "change_hotel": Yêu cầu đổi khách sạn, tìm chỗ ở khác.
- "food": Muốn đi ăn, nhà hàng, ăn hải sản, đói.
- "cafe": Muốn uống cafe, trà sữa, bar, chill.
- "shopping": Mua sắm, đi chợ, mua đặc sản.
- "free": Tìm điểm miễn phí, hết tiền.
- "explore": Muốn thêm điểm vui chơi, tham quan, gợi ý địa điểm, tư vấn chỗ đi chơi phù hợp với số tiền/ngân sách (VD: 100k, 50k, hỏi "nên đi đâu").
- "unknown": Nếu không thuộc các nhóm trên.

Chỉ trả về chuỗi JSON hợp lệ. Ví dụ:
{"intent": "opt_transport_cost", "level": "max"}
hoặc
{"intent": "unknown"}
`;

  const payload = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: systemPrompt }],
    temperature: 0.1
  };

  const response = await fetchWithExponentialBackoff(API_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  const textContent = data.choices[0].message.content;
  
  const jsonMatch = textContent.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch && jsonMatch[1]) {
    return JSON.parse(jsonMatch[1]);
  }
  return JSON.parse(textContent);
}

export async function searchPlacesByAgent(prompt: string, excludeIds: string[]): Promise<string[]> {
  const simplifiedRag = ragDatabase.filter(d => d.type !== 'hotel').map(l => ({
    id: l.id,
    name: l.name,
    type: l.type,
    tags: l.tags || [],
    cost: l.avgCost || l.ticketPrice || 0
  }));

  const systemPrompt = `
Bạn là AI tìm kiếm địa điểm du lịch chuyên nghiệp.
Người dùng yêu cầu tìm: "${prompt}"

Dưới đây là danh sách các địa điểm trong cơ sở dữ liệu của bạn:
${JSON.stringify(simplifiedRag)}

Các địa điểm đã có trong lịch trình (KHÔNG ĐƯỢC CHỌN LẠI):
${JSON.stringify(excludeIds)}

QUY TẮC LỰA CHỌN QUAN TRỌNG:
1. Đọc kỹ yêu cầu của người dùng để xác định đúng loại địa điểm (Type) và Ngân sách:
   - Nếu người dùng hỏi theo NGÂN SÁCH cụ thể (ví dụ: "100k", "50k", "có 100k thì đi đâu"), bạn PHẢI quy đổi ra số (ví dụ 100k = 100000) và TÌM ƯU TIÊN các địa điểm có \`cost\` <= mức ngân sách đó.
   - Nếu tìm quán cafe, bar, quán nước, đồ uống, chill: Chỉ chọn các địa điểm có type="food_beverage" VÀ tags có chứa các từ khóa liên quan đến cafe/thức uống/sống ảo. KHÔNG CHỌN quán ăn mặn, nhà hàng hải sản.
   - Nếu tìm quán ăn, hải sản, nhà hàng, đói bụng: Chỉ chọn type="food_beverage" phục vụ ăn uống (nhà hàng, quán ăn). KHÔNG CHỌN điểm tham quan (attraction) hay quán cafe.
   - Nếu tìm điểm đi chơi, tham quan, di tích, chụp ảnh: Chỉ chọn type="attraction".
   - Nếu tìm nơi mua sắm, chợ: Phải có chữ "chợ" hoặc tags mua sắm.
2. Kiểm tra sự phù hợp của Tags, Tên (Name) và Chi phí (Cost).
3. Đảm bảo chọn ra tối đa 4 địa điểm PHÙ HỢP NHẤT.

Trả về JSON định dạng:
{ "suggestedLocationIds": ["id1", "id2", ...] }
Nếu không tìm thấy địa điểm nào Tương Ứng Chính Xác, trả về mảng rỗng [].
`;

  const payload = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: systemPrompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  };

  try {
    const response = await fetchWithExponentialBackoff(API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const textContent = data.choices[0].message.content;
    
    const jsonMatch = textContent.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]).suggestedLocationIds || [];
    }
    const fallbackMatch = textContent.match(/\{[\s\S]*\}/);
    if (fallbackMatch && fallbackMatch[0]) {
      return JSON.parse(fallbackMatch[0]).suggestedLocationIds || [];
    }
    return JSON.parse(textContent).suggestedLocationIds || [];
  } catch (e: any) {
    console.error('searchPlacesByAgent Error', e);
    return [];
  }
}
