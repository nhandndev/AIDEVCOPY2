const fs = require('fs');
const hotelPath = './src/data/rag_hotel.json';
const dbPath = './src/data/rag_database.json';

const hotels = JSON.parse(fs.readFileSync(hotelPath, 'utf8'));
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// The last 10 are the new ones
const newHotels = hotels.slice(0, hotels.length - 10);
const newDb = db.slice(0, db.length - 10);

fs.writeFileSync(hotelPath, JSON.stringify(newHotels, null, 2));
fs.writeFileSync(dbPath, JSON.stringify(newDb, null, 2));

console.log("Removed the last 10 hotels and 10 cafes!");
