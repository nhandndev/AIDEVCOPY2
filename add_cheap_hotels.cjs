const fs = require('fs');
const hotelPath = './src/data/rag_hotel.json';

const hotels = JSON.parse(fs.readFileSync(hotelPath, 'utf8'));

const cheapHotels = Array.from({ length: 10 }, (_, i) => {
  // Generate random coords around Quy Nhon mainland (13.76, 109.22 to 13.78, 109.24)
  const lat = 13.76 + Math.random() * 0.02;
  const lng = 109.22 + Math.random() * 0.02;
  
  return {
    "id": `cheap_hotel_test_${i+1}`,
    "name": `Nhà nghỉ bình dân Quy Nhơn ${i+1}`,
    "type": "hotel",
    "lat": lat,
    "lng": lng,
    "geoAddress": {
      "placeId": `cheap_hotel_place_${i+1}`,
      "formattedAddress": `Hẻm ${10 + i} Nguyễn Thái Học, Quy Nhơn, Bình Định`,
      "administrativeLevels": {
        "level1": "Bình Định",
        "level2": "Quy Nhơn"
      },
      "searchKeywords": [
        "nhà nghỉ",
        "giá rẻ",
        "bình dân",
        "Quy Nhơn"
      ]
    },
    "isIndoor": true,
    "ticketPrice": 0,
    "recommendedHours": 0,
    "avgCost": 150000 + Math.floor(Math.random() * 5) * 10000, // 150k - 190k
    "disasterAlternativeId": null,
    "pros": "Giá siêu rẻ, phù hợp sinh viên, dân phượt.",
    "cons": "Phòng nhỏ, không có view đẹp, cơ sở vật chất cũ.",
    "description": "Nhà nghỉ bình dân đáp ứng nhu cầu ngủ nghỉ cơ bản với chi phí tối thiểu.",
    "socialBuzz": {
      "hashtag": "#NhaNghiGiaReQuyNhon",
      "viewsCount": "10K",
      "vibeDescription": "Cơ bản, tiết kiệm.",
      "imageUrl": "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      "tiktokLink": ""
    }
  };
});

const updatedHotels = [...hotels, ...cheapHotels];
fs.writeFileSync(hotelPath, JSON.stringify(updatedHotels, null, 2));

console.log("Added 10 super cheap hotels to rag_hotel.json!");
