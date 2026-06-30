import { useState, useEffect, useMemo } from 'react';
import type { LocationKnowledgeDTO, SurveyDTO } from '../../types/dto';
import ragDatabase from '../../data';
import ragHotel from '../../data/rag_hotel.json';
import ragTransport from '../../data/rag_transport.json';
import GoogleMapViewer from '../Map/GoogleMapViewer';

interface Step3Props {
  survey: SurveyDTO;
  onNext: (hotelId: string) => void;
  onBack: () => void;
  selectedDestinations: string[];
}

// Haversine distance in km
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c;
}

export default function Step3Negotiation({ survey, onNext, onBack, selectedDestinations }: Step3Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(true);
  const [chosenHotelId, setChosenHotelId] = useState<string | null>(null);
  
  // Map State
  const [mapCenter, setMapCenter] = useState({ lat: 13.7634, lng: 109.2235 });
  const [mapZoom, setMapZoom] = useState(12);
  const [mapLocs, setMapLocs] = useState<LocationKnowledgeDTO[]>([]);

  const selectedLocs = useMemo(() => selectedDestinations.map(id => ragDatabase.find(d => d.id === id)).filter(Boolean) as LocationKnowledgeDTO[], [selectedDestinations]);
  const allHotels = useMemo(() => ragHotel as LocationKnowledgeDTO[], []);
  const userBudget = survey.budget || 3000000;

  const numPeople = (survey.who?.adults || 0) + (survey.who?.children || 0) || 2;
  const hotelRooms = Math.ceil(numPeople / 4);

  // Calculate scores and ranks
  const hotelScores = useMemo(() => {
    const rawScores = allHotels.map(hotel => {
      let totalDistance = 0;
      // In a real tour, you go back and forth. So multiply distance by 2 for each location.
      selectedLocs.forEach(loc => {
        totalDistance += getDistanceFromLatLonInKm(hotel.lat, hotel.lng, loc.lat, loc.lng) * 2;
      });
      
      const days = survey.days || 3;
      let vehicles = 1;
      let transportRate = 5000;
      let vehicleDesc = '';
      
      if (survey.transport === 'grab_car' || survey.transport === 'personal_car' || survey.transport === 'rent_car') {
        transportRate = survey.transport === 'grab_car' ? ragTransport.grab.car_price_per_km : ragTransport.personal.car_price_per_km;
        if (numPeople > 7) {
          const num7 = Math.floor(numPeople / 7);
          const rem = numPeople % 7;
          const num4 = Math.ceil(rem / 4);
          vehicles = num7 + num4;
          vehicleDesc = `${num7} xe 7 chỗ` + (num4 > 0 ? ` & ${num4} xe 4 chỗ` : '');
        } else if (numPeople > 4) {
          vehicles = 1;
          vehicleDesc = `1 xe 7 chỗ`;
        } else {
          vehicles = 1;
          vehicleDesc = `1 xe 4 chỗ`;
        }
        if (survey.transport === 'rent_car') {
          const rentFeePerDay = (Math.floor(numPeople/7) * ragTransport.rent_car["7_seater"] + Math.ceil((numPeople%7)/4) * ragTransport.rent_car["4_seater"]);
          // We roughly add rent fee to transportRate per km for negotiation.
          transportRate = ragTransport.personal.car_price_per_km + Math.round(rentFeePerDay / 30);
        }
      } else {
        transportRate = survey.transport === 'grab_motorbike' ? ragTransport.grab.motorbike_price_per_km : ragTransport.personal.motorbike_price_per_km;
        if (survey.transport === 'rent_motorbike') {
           transportRate += Math.round(ragTransport.rent_motorbike.price_per_day / 30);
        }
        vehicles = Math.ceil(numPeople / 2);
        vehicleDesc = `${vehicles} xe máy`;
      }
      
      const transportCost = Math.round(totalDistance * transportRate) * vehicles;
      const hotelCost = hotel.avgCost * days * hotelRooms;
      const totalNegotiationCost = hotelCost + transportCost;
      
      const withinBudget = totalNegotiationCost <= userBudget;

      // Calculate match score based on tags
      let matchScore = 0;
      const textToSearch = `${hotel.name} ${hotel.description} ${hotel.pros} ${hotel.socialBuzz?.vibeDescription}`.toLowerCase();
      
      if (survey.tags && survey.tags.length > 0) {
        survey.tags.forEach(tag => {
          const t = tag.toLowerCase();
          if (textToSearch.includes(t)) matchScore += 2;
          if (t === 'nghỉ dưỡng' && (textToSearch.includes('resort') || textToSearch.includes('5 sao'))) matchScore += 2;
          if (t === 'sang trọng' && (textToSearch.includes('5 sao') || textToSearch.includes('luxury') || textToSearch.includes('cao cấp'))) matchScore += 3;
          if (t === 'sống ảo' && (textToSearch.includes('view') || textToSearch.includes('sống ảo'))) matchScore += 2;
          if (t === 'biển đảo' && textToSearch.includes('biển')) matchScore += 1;
        });
      }

      return { hotel, totalDistance, transportCost, hotelCost, totalNegotiationCost, withinBudget, transportRate, days, hotelRooms, vehicles, vehicleDesc, matchScore };
    });

    const withinBudgetList = rawScores.filter(s => s.withinBudget);
    const outOfBudgetList = rawScores.filter(s => !s.withinBudget).sort((a,b) => a.totalNegotiationCost - b.totalNegotiationCost);

    let bestChoice: typeof rawScores[0] | null = null;
    let economyChoice: typeof rawScores[0] | null = null;

    if (withinBudgetList.length > 0) {
      const sortedByMatch = [...withinBudgetList].sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return a.totalNegotiationCost - b.totalNegotiationCost;
      });
      bestChoice = sortedByMatch[0];

      const sortedByCost = [...withinBudgetList].sort((a, b) => a.totalNegotiationCost - b.totalNegotiationCost);
      economyChoice = sortedByCost.find(s => s.hotel.id !== bestChoice?.hotel.id) || null;
    }

    const finalList: (typeof rawScores[0] & { badge?: string })[] = [];
    if (bestChoice) finalList.push({...bestChoice, badge: 'BEST CHOICE'});
    if (economyChoice) finalList.push({...economyChoice, badge: 'ECONOMY CHOICE'});

    const usedIds = finalList.map(s => s.hotel.id);
    const remainingWithin = withinBudgetList.filter(s => !usedIds.includes(s.hotel.id)).sort((a, b) => a.totalNegotiationCost - b.totalNegotiationCost);
    
    finalList.push(...remainingWithin);
    finalList.push(...outOfBudgetList);

    return finalList;
  }, [allHotels, selectedLocs, userBudget, survey.days, survey.transport, numPeople, hotelRooms, survey.tags]);

  useEffect(() => {
    const centroidLat = selectedLocs.reduce((sum, l) => sum + l.lat, 0) / (selectedLocs.length || 1);
    const centroidLng = selectedLocs.reduce((sum, l) => sum + l.lng, 0) / (selectedLocs.length || 1);

    type SimStep = { type: 'log' | 'map_fly', delay: number, text?: string, lat?: number, lng?: number, zoom?: number, locations?: LocationKnowledgeDTO[] };

    const simulationSteps: SimStep[] = [
      { type: 'log', delay: 500, text: `[SYS] Khởi tạo ma trận không gian. Tọa độ mục tiêu: ${selectedLocs.length} điểm.` },
      { type: 'map_fly', delay: 500, lat: centroidLat, lng: centroidLng, zoom: 12, locations: selectedLocs },
      { type: 'log', delay: 1000, text: `[LOGISTICS] Tâm hình học hướng về cụm điểm đến. Đang quét bán kính...` },
    ];
    
    // Simulate calculations
    hotelScores.forEach((hs, i) => {
      const time = 1500 + i * 2500;
      simulationSteps.push({
        type: 'log',
        delay: time,
        text: `[CALC] Phân tích ${hs.hotel.name}:`
      });
      simulationSteps.push({
        type: 'log',
        delay: time + 500,
        text: `   ├─ Tiền phòng (${hs.hotelRooms} phòng x ${hs.days} đêm x ${hs.hotel.avgCost.toLocaleString()}đ): ${hs.hotelCost.toLocaleString()}đ`
      });
      simulationSteps.push({
        type: 'log',
        delay: time + 1000,
        text: `   ├─ Phí di chuyển (${hs.totalDistance.toFixed(1)}km x ${hs.vehicleDesc} x ${hs.transportRate.toLocaleString()}đ/km): ${hs.transportCost.toLocaleString()}đ`
      });
      simulationSteps.push({
        type: 'log',
        delay: time + 1500,
        text: `   └─ TỔNG CHI PHÍ THỰC TẾ: ${hs.totalNegotiationCost.toLocaleString()}đ`
      });
      simulationSteps.push({
        type: 'log',
        delay: time + 2000,
        text: `[AUDIT] ${hs.withinBudget ? '✅ Tối ưu & Đạt chuẩn ngân sách' : '⚠️ Vượt ngân sách'}`
      });
      simulationSteps.push({
        type: 'map_fly',
        delay: time,
        lat: hs.hotel.lat,
        lng: hs.hotel.lng,
        zoom: 14,
        locations: [hs.hotel, ...selectedLocs]
      });
    });

    let currentDelay = 1500 + hotelScores.length * 2500 + 1000;
    
    simulationSteps.push({ type: 'log', delay: currentDelay, text: `[SYS] Hoàn tất quét dữ liệu. Lập Bảng Xếp Hạng Đề Xuất.` });
    simulationSteps.push({ type: 'map_fly', delay: currentDelay, lat: centroidLat, lng: centroidLng, zoom: 11, locations: [...allHotels, ...selectedLocs] });

    setLogs([]);
    setIsCalculating(true);
    
    const timeouts = simulationSteps.map(step => {
      return setTimeout(() => {
        if (step.type === 'log') {
          setLogs(prev => [...prev, step.text!]);
        } else if (step.type === 'map_fly') {
          if (step.lat && step.lng) setMapCenter({lat: step.lat, lng: step.lng});
          if (step.zoom) setMapZoom(step.zoom);
          if (step.locations) setMapLocs(step.locations);
        }
      }, step.delay);
    });

    const doneTimeout = setTimeout(() => {
      setIsCalculating(false);
      // Auto-select the top recommended hotel
      if (hotelScores.length > 0) {
        setChosenHotelId(hotelScores[0].hotel.id);
        setMapCenter({ lat: hotelScores[0].hotel.lat, lng: hotelScores[0].hotel.lng });
        setMapZoom(15);
        setMapLocs([hotelScores[0].hotel, ...selectedLocs]);
      }
    }, currentDelay + 1000);

    return () => {
      timeouts.forEach(clearTimeout);
      clearTimeout(doneTimeout);
    };
  }, [hotelScores, selectedLocs]);

  const activeHotel = useMemo(() => allHotels.find(h => h.id === chosenHotelId), [chosenHotelId, allHotels]);

  return (
    <div className="flex flex-col h-screen bg-[#111] text-white p-6 overflow-hidden">
      <div className="mb-4 flex justify-between items-end border-b border-[#333] pb-4 shrink-0">
        <div>
          <h2 className="text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-blue-500">BƯỚC 3: CỐ VẤN LƯU TRÚ</h2>
          <p className="text-slate-400 mt-2">Đa tác nhân phân tích và đề xuất Bảng xếp hạng. Hãy chọn Khách sạn bạn muốn.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#ff0050] to-rose-600">
            VIVUAGENT
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onBack}
              className="px-6 py-3 bg-[#222] hover:bg-[#333] border border-[#444] rounded-xl font-bold text-gray-300 transition-colors"
            >
              Quay lại
            </button>
            <button 
              onClick={() => chosenHotelId && onNext(chosenHotelId)}
              disabled={!chosenHotelId || isCalculating}
              className={`px-8 py-3 rounded-xl font-black text-lg tracking-wider transition-all ${!chosenHotelId || isCalculating ? 'bg-[#333] text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-[#ff0050] to-rose-600 hover:scale-105 shadow-[0_0_30px_rgba(255,0,80,0.4)]'}`}
            >
              TIẾN HÀNH LÊN LỊCH TRÌNH ➔
            </button>
          </div>
        </div>
      </div>

      {/* Top Section: Interactive UI */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden mb-6">
        
        {/* Left: Ranked List (3/12) */}
        <div className="lg:col-span-3 bg-[#1a1a1a] rounded-2xl border border-[#333] flex flex-col overflow-hidden shadow-xl">
          <div className="bg-[#222] border-b border-[#333] px-4 py-3 shrink-0 flex justify-between items-center">
            <span className="text-sm font-bold text-gray-400 tracking-widest uppercase">Bảng Xếp Hạng AI</span>
            {isCalculating && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span></span>}
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
            {isCalculating ? (
              <div className="space-y-4 p-2">
                {[1,2].map(i => (
                  <div key={i} className="animate-pulse flex space-x-4">
                    <div className="rounded-full bg-[#333] h-10 w-10"></div>
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-[#333] rounded w-3/4"></div>
                      <div className="h-3 bg-[#333] rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              hotelScores.map((hs, index) => {
                const isSelected = chosenHotelId === hs.hotel.id;
                return (
                  <div 
                    key={hs.hotel.id}
                    onClick={() => {
                      setChosenHotelId(hs.hotel.id);
                      setMapCenter({ lat: hs.hotel.lat, lng: hs.hotel.lng });
                      setMapZoom(15);
                      setMapLocs([hs.hotel, ...selectedLocs]);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer relative ${isSelected ? 'bg-[#222] border-neon-cyan shadow-[0_0_15px_rgba(0,255,255,0.15)]' : 'bg-[#111] border-[#333] hover:border-gray-500'}`}
                  >
                    {hs.badge === 'BEST CHOICE' && (
                      <div className="absolute -top-2.5 -right-2.5 bg-yellow-500 text-black text-[10px] font-black px-2 py-1 rounded-full border-2 border-[#1a1a1a] shadow-lg rotate-12">
                        ✨ PHÙ HỢP NHẤT
                      </div>
                    )}
                    {hs.badge === 'ECONOMY CHOICE' && (
                      <div className="absolute -top-2.5 -right-2.5 bg-green-500 text-black text-[10px] font-black px-2 py-1 rounded-full border-2 border-[#1a1a1a] shadow-lg rotate-6">
                        💰 TIẾT KIỆM NHẤT
                      </div>
                    )}
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h4 className={`text-sm font-bold leading-tight ${isSelected ? 'text-neon-cyan' : 'text-gray-200'}`}>
                        {hs.hotel.name}
                      </h4>
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-neon-cyan text-black flex items-center justify-center">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                          </div>
                        )}
                        <div className="text-lg font-black text-gray-600">#{index + 1}</div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1.5 mt-2 p-2 rounded-lg bg-black/40 border border-[#333]">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">🏨 Phòng ({hs.hotelRooms}P x {hs.days}Đ)</span>
                        <span className="text-gray-200">{hs.hotelCost.toLocaleString()}đ</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">🚕 Di chuyển ({hs.totalDistance.toFixed(1)}km, {hs.vehicleDesc})</span>
                        <span className="text-gray-200">{hs.transportCost.toLocaleString()}đ</span>
                      </div>
                      <div className="h-px w-full bg-[#444] my-0.5"></div>
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-gray-300">Tổng chi phí</span>
                        <span className={hs.withinBudget ? 'text-green-400' : 'text-red-400'}>{hs.totalNegotiationCost.toLocaleString()}đ</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Middle: Map (6/12) */}
        <div className="lg:col-span-6 rounded-2xl border border-[#333] overflow-hidden relative shadow-xl">
          <GoogleMapViewer 
            locations={mapLocs} 
            center={mapCenter}
            zoom={mapZoom}
            onMarkerClick={(loc) => {
              if (loc.type === 'hotel') setChosenHotelId(loc.id);
            }}
          />
          <div className="absolute top-4 left-4 bg-black/60 px-4 py-2 rounded text-neon-cyan font-mono text-xs border border-cyan-900/50 animate-pulse z-[1000]">
            VỆ TINH: {mapCenter.lat.toFixed(4)}, {mapCenter.lng.toFixed(4)}
          </div>
        </div>

        {/* Right: Hotel Profile (3/12) */}
        <div className="lg:col-span-3 bg-[#1a1a1a] rounded-2xl border border-[#333] flex flex-col overflow-hidden shadow-xl">
          {activeHotel ? (
            <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
              <div className="h-40 shrink-0 relative">
                <img 
                  src={activeHotel.socialBuzz?.imageUrl || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&w=800&q=80'} 
                  alt={activeHotel.name} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent"></div>
              </div>
              <div className="p-4 flex-1 flex flex-col space-y-3">
                <h3 className="text-lg font-black text-white leading-tight">{activeHotel.name}</h3>
                
                <div className="text-xs text-gray-300 italic">
                  "{activeHotel.description}"
                </div>
                
                <div className="space-y-2 flex-1">
                  <div>
                    <strong className="text-neon-cyan block text-[10px] uppercase mb-1">Ưu điểm:</strong>
                    <p className="text-xs text-gray-400">{activeHotel.pros}</p>
                  </div>
                  <div>
                    <strong className="text-red-400 block text-[10px] uppercase mb-1">Nhược điểm:</strong>
                    <p className="text-xs text-gray-400">{activeHotel.cons}</p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#333]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-500">Mức chi phí / đêm:</span>
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-black text-white">{(activeHotel.avgCost * hotelRooms).toLocaleString()}đ</span>
                      <span className="text-[10px] text-gray-500">({hotelRooms} phòng x {activeHotel.avgCost.toLocaleString()}đ)</span>
                    </div>
                  </div>
                  {activeHotel.avgCost <= userBudget ? (
                    <div className="text-[10px] font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded border border-green-400/20 text-center">
                      ✅ NẰM TRONG NGÂN SÁCH ({userBudget.toLocaleString()}đ)
                    </div>
                  ) : (
                    <div className="text-[10px] font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded border border-red-400/20 text-center">
                      ⚠️ VƯỢT NGÂN SÁCH DỰ KIẾN
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-gray-500 opacity-60">
              <span className="text-4xl mb-2">🏨</span>
              <p className="font-bold text-sm">Chưa chọn Khách sạn</p>
            </div>
          )}
        </div>

      </div>

      {/* Bottom Section: Hacker Logs (h-48) */}
      <div className="h-48 bg-black rounded-2xl border border-[#333] flex flex-col overflow-hidden shadow-2xl relative shrink-0">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="bg-[#111] border-b border-[#333] px-4 py-2 flex items-center gap-2 shrink-0 z-10">
          <span className="text-neon-cyan animate-pulse text-xs">▶</span>
          <span className="text-[10px] font-bold text-neon-cyan tracking-widest uppercase font-mono">Engine Logs Matrix</span>
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar font-mono text-[10px] space-y-1.5 z-10">
          {logs.map((log, idx) => (
            <div key={idx} className={`animate-slideInRight ${
              log.includes('⚠️') || log.includes('CẢNH BÁO') ? 'text-red-400' :
              log.includes('✅') || log.includes('BEST') ? 'text-green-400' :
              'text-gray-400'
            }`}>
              <span className="opacity-50 mr-2">{new Date().toISOString().split('T')[1].slice(0,8)}</span>
              {log}
            </div>
          ))}
          {isCalculating && (
            <div className="text-neon-cyan animate-pulse mt-2">_</div>
          )}
        </div>
      </div>
    </div>
  );
}
