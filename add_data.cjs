const fs = require('fs');

const hotelPath = './src/data/rag_hotel.json';
const dbPath = './src/data/rag_database.json';

const hotels = JSON.parse(fs.readFileSync(hotelPath, 'utf8'));
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Center coords of Quy Nhon roughly: lat: 13.77, lng: 109.22
const getLoc = (index, baseLat, baseLng, offset) => {
  return { lat: baseLat + offset * Math.random() * (Math.random() > 0.5 ? 1 : -1), lng: baseLng + offset * Math.random() * (Math.random() > 0.5 ? 1 : -1) };
}

const newHotels = [];
for(let i=1; i<=10; i++) {
  const {lat, lng} = getLoc(i, 13.77, 109.22, 0.05);
  const cost = 250000 + Math.floor(Math.random()*5)*10000;
  newHotels.push({
    "id": "cheap_hotel_" + i,
    "name": "Nhà Nghỉ/Khách Sạn Giá Rẻ " + i,
    "type": "hotel",
    "lat": lat,
    "lng": lng,
    "geoAddress": {
      "placeId": "cheap_hotel_" + i,
      "formattedAddress": "Trung tâm Quy Nhơn, Bình Định",
      "administrativeLevels": {
        "level1": "Bình Định",
        "level2": "Thành phố Quy Nhơn"
      },
      "searchKeywords": ["giá rẻ", "hotel", "bình dân"]
    },
    "isIndoor": true,
    "ticketPrice": 0,
    "recommendedHours": 0,
    "avgCost": cost,
    "pros": "Giá cực kỳ rẻ, phù hợp tiết kiệm",
    "cons": "Tiện nghi cơ bản",
    "description": "Chỗ lưu trú bình dân cho dân phượt",
    "socialBuzz": {
      "hashtag": "#phuot",
      "viewsCount": "100K",
      "vibeDescription": "Tiết kiệm",
      "imageUrl": "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80"
    }
  });
}

const newCafes = [];
for(let i=1; i<=10; i++) {
  const {lat, lng} = getLoc(i, 13.77, 109.22, 0.03);
  newCafes.push({
    "id": "cafe_chill_" + i,
    "name": "Quán Cafe / Ăn Vặt Chill " + i,
    "type": "food_beverage",
    "tags": ["Sống ảo", "Cafe", "Ăn uống"],
    "lat": lat,
    "lng": lng,
    "geoAddress": {
      "placeId": "cafe_chill_" + i,
      "formattedAddress": "Quy Nhơn, Bình Định",
      "administrativeLevels": {
        "level1": "Bình Định",
        "level2": "Thành phố Quy Nhơn"
      },
      "searchKeywords": ["cafe", "uống", "chill", "sống ảo"]
    },
    "isIndoor": true,
    "ticketPrice": 0,
    "recommendedHours": 2,
    "avgCost": 40000,
    "pros": "Nhiều góc sống ảo, đồ uống rẻ",
    "cons": "Đông đúc cuối tuần",
    "description": "Quán cafe phong cách hiện đại thích hợp để check-in.",
    "socialBuzz": {
      "hashtag": "#cafeQuyNhon",
      "viewsCount": "1M",
      "vibeDescription": "Chill, sống ảo",
      "imageUrl": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80"
    }
  });
}

fs.writeFileSync(hotelPath, JSON.stringify([...hotels, ...newHotels], null, 2));
fs.writeFileSync(dbPath, JSON.stringify([...db, ...newCafes], null, 2));

console.log("Added 10 hotels and 10 cafes!");
