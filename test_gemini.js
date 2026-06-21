const API_KEY = 'sk-hlY7GTxBZZooeSqYFXOmJzpaaFgteLOWR6WWpUdYuK3hFBz1';
const API_URL = 'https://api.shopaikey.com/v1/chat/completions';

async function test() {
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: `Bạn là Trợ lý AI Du Lịch (Survey Agent). Nhiệm vụ của bạn là trò chuyện thân thiện với người dùng để lấy đủ thông tin khởi tạo chuyến đi.
Thông tin cần lấy:
- Ngân sách (budget)
- Thời gian đi (số ngày hoặc startDate/endDate)
- Số lượng người đi (người lớn, trẻ em)
- Sở thích du lịch (chọn trong: Nghỉ dưỡng, Khám phá, Sống ảo, Văn hóa, Ẩm thực, Biển đảo, Thiên nhiên)
- Phương tiện (ô tô, xe bus, kết hợp)
- Tùy chọn: số lượng địa điểm muốn đi (nếu không, tự tính tỷ lệ 2-3 nơi / 1 ngày).

QUY TẮC TRẢ LỜI:
- Nếu người dùng nói chung chung (vd: "gợi ý cho tôi"), hãy chào hỏi và hỏi lại họ các thông tin còn thiếu (vd: đi mấy người, quỹ thời gian, budget).
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
` },
      { role: 'assistant', content: 'Chào bạn! Mình là Trợ lý AI Du Lịch. Bạn muốn đi Quy Nhơn chơi mấy ngày, đi mấy người và ngân sách khoảng bao nhiêu để mình tư vấn nhé!' },
      { role: 'user', content: 'gợi ý đi 3 ngày' }
    ],
    temperature: 0.3
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
