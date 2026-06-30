import { useState, useMemo, useEffect } from 'react';
import type { LocationKnowledgeDTO, SurveyDTO } from '../../types/dto';
import ragDatabase from '../../data';
import ragTransport from '../../data/rag_transport.json';
import GoogleMapViewer from '../Map/GoogleMapViewer';
import { chatWithStep2Agent } from '../../services/geminiService';

interface Step2Props {
  onNext: (destinations: string[]) => void;
  onBack: () => void;
  initialData: string[];
  surveyData: Partial<SurveyDTO>;
}

type WeatherState = 'Sunny' | 'Rainy' | 'Storm';

export default function Step2Picker({ onNext, onBack, initialData, surveyData }: Step2Props) {
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>(initialData || []);
  const [activeLocId, setActiveLocId] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherState>('Sunny');
  const [realWeatherStr, setRealWeatherStr] = useState<string>('Đang tải...');

  const [leftTab, setLeftTab] = useState<'chat' | 'details'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'agent', text: string}[]>([]);
  const [isAgentTyping, setIsAgentTyping] = useState(false);

  useEffect(() => {
    // Fetch actual weather in Quy Nhon
    fetch('https://api.open-meteo.com/v1/forecast?latitude=13.7634&longitude=109.2235&current_weather=true')
      .then(res => res.json())
      .then(data => {
        const cw = data.current_weather;
        if (!cw) return;
        const code = cw.weathercode;
        const temp = Math.round(cw.temperature);
        let wea: WeatherState = 'Sunny';
        let weaText = 'Trời Trong';
        
        if (code <= 3) {
          wea = 'Sunny';
          weaText = 'Nắng Đẹp';
        } else if (code >= 51 && code <= 82) {
          wea = 'Rainy';
          weaText = 'Mưa Rào';
        } else if (code >= 95) {
          wea = 'Storm';
          weaText = 'Có Dông Bão';
        } else {
          weaText = 'Nhiều Mây';
        }

        setWeather(wea);
        setRealWeatherStr(`${temp}°C, ${weaText}`);
      })
      .catch(e => {
        console.error('Lỗi lấy thời tiết', e);
        setRealWeatherStr('Không thể tải');
      });
  }, []);

  const mapLocations = useMemo(() => {
    return ragDatabase.filter(d => d.type !== 'hotel') as LocationKnowledgeDTO[];
  }, []);

  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const { totalCost, totalDistance } = useMemo(() => {
    let cost = 0;
    let dist = 0;
    const selectedLocs = selectedDestinations.map(id => mapLocations.find(l => l.id === id)).filter(Boolean) as LocationKnowledgeDTO[];
    
    selectedLocs.forEach((loc, index) => {
      cost += (loc.ticketPrice || 0) + (loc.avgCost || 0);
      if (index > 0) {
        const prev = selectedLocs[index - 1];
        dist += haversineDistance(prev.lat, prev.lng, loc.lat, loc.lng);
      }
    });

    let transCost = 0;
    const tMode = surveyData.transport || 'personal_motorbike';
    if (tMode === 'grab_car') transCost = dist * ragTransport.grab.car_price_per_km;
    else if (tMode === 'grab_motorbike') transCost = dist * ragTransport.grab.motorbike_price_per_km;
    else if (tMode.includes('car')) transCost = dist * ragTransport.personal.car_price_per_km;
    else transCost = dist * ragTransport.personal.motorbike_price_per_km;

    return { totalCost: Math.round(cost + transCost), totalDistance: dist };
  }, [selectedDestinations, mapLocations, surveyData.transport]);

  useEffect(() => {
    if (initialData && initialData.length > 0) return;
    
    const tags = surveyData.tags || [];
    const numLocs = surveyData.numLocations || 4;
    const maxBudget = surveyData.budget || 5000000;
    
    // Simple heuristic score
    const scoredLocations = mapLocations.map(loc => {
      let score = 0;
      const desc = loc.description.toLowerCase();
      const name = loc.name.toLowerCase();
      
      tags.forEach(tag => {
        const t = tag.toLowerCase();
        if (desc.includes(t) || name.includes(t)) score += 50;
        
        if (t === 'biển đảo' && (desc.includes('biển') || desc.includes('đảo'))) score += 100;
        if (t === 'khám phá' && loc.type === 'attraction') score += 50;
        if (t === 'văn hóa' && (desc.includes('lịch sử') || desc.includes('chăm') || desc.includes('bảo tàng'))) score += 100;
        if (t === 'ẩm thực' && loc.type === 'food_beverage') score += 100;
        if (t === 'sống ảo' && (desc.includes('chụp ảnh') || desc.includes('view') || desc.includes('check-in'))) score += 50;
        if (t === 'thiên nhiên' && (desc.includes('núi') || desc.includes('rừng') || desc.includes('cây') || desc.includes('biển'))) score += 50;
      });
      
      return { ...loc, score };
    });
    
    scoredLocations.sort((a, b) => b.score - a.score);
    
    const autoSelected: string[] = [];
    let currentCost = 0;
    
    for (const loc of scoredLocations) {
      if (autoSelected.length >= numLocs) break;
      const locCost = (loc.ticketPrice || 0) + (loc.avgCost || 0);
      if (currentCost + locCost <= maxBudget * 0.5) { // Allocate max 50% budget for attractions/food
        autoSelected.push(loc.id);
        currentCost += locCost;
      }
    }
    
    if (autoSelected.length > 0) {
      setSelectedDestinations(autoSelected);
      setChatHistory([{ role: 'agent', text: `Dựa vào sở thích [${tags.join(', ')}] và ngân sách của bạn, tôi đã tự động chọn ra ${autoSelected.length} địa điểm phù hợp nhất để tham khảo.` }]);
    }
  }, [initialData, surveyData.tags, surveyData.numLocations, surveyData.budget, mapLocations]);

  const toggleDestination = (id: string) => {
    setSelectedDestinations(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsAgentTyping(true);

    try {
      const budget = surveyData.budget || 5000000;
      const days = surveyData.days || 3;
      const response = await chatWithStep2Agent(userMsg, weather, budget, days, selectedDestinations);
      setChatHistory(prev => [...prev, { role: 'agent', text: response.reply }]);
      
      if (response.addLocationIds || response.removeLocationIds) {
        setSelectedDestinations(prev => {
          let next = [...prev];
          
          if (Array.isArray(response.removeLocationIds)) {
             const toRemove = response.removeLocationIds.map((idOrName: string) => {
               const found = mapLocations.find(l => l.id === idOrName || l.name.toLowerCase() === idOrName.toLowerCase());
               return found ? found.id : null;
             }).filter(Boolean);
             next = next.filter(id => !toRemove.includes(id as string));
          }

          if (Array.isArray(response.addLocationIds)) {
             const toAdd = response.addLocationIds.map((idOrName: string) => {
               const found = mapLocations.find(l => l.id === idOrName || l.name.toLowerCase() === idOrName.toLowerCase());
               return found ? found.id : null;
             }).filter(Boolean) as string[];
             next = [...next, ...toAdd];
          }
          
          const validIds = Array.from(new Set(next));
          
          // Auto select the first NEW one if possible
          if (Array.isArray(response.addLocationIds) && response.addLocationIds.length > 0) {
            const firstNew = response.addLocationIds[0];
            const found = mapLocations.find(l => l.id === firstNew || l.name.toLowerCase() === firstNew.toLowerCase());
            if (found) setActiveLocId(found.id);
          }
          
          return validIds;
        });
      }
    } catch (e) {
      console.error(e);
      setChatHistory(prev => [...prev, { role: 'agent', text: 'Xin lỗi, hệ thống Agent đang bận hoặc quá tải. Vui lòng thử lại sau.' }]);
    } finally {
      setIsAgentTyping(false);
    }
  };

  const activeLoc = useMemo(() => {
    return mapLocations.find(l => l.id === activeLocId);
  }, [activeLocId, mapLocations]);

  const mapCenter = useMemo(() => {
    if (activeLoc) return { lat: activeLoc.lat, lng: activeLoc.lng };
    if (mapLocations.length > 0) return { lat: mapLocations[0].lat, lng: mapLocations[0].lng };
    return { lat: 13.7634, lng: 109.2235 };
  }, [activeLoc, mapLocations]);

  const getWeatherWarning = (isIndoor: boolean, currentWea: WeatherState) => {
    if (currentWea === 'Sunny') {
      return !isIndoor 
        ? { text: '🌟 Thời tiết lý tưởng để khám phá', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' }
        : { text: '👍 Phù hợp', color: 'text-green-400 bg-green-400/10 border-green-400/20' };
    }
    if (currentWea === 'Rainy') {
      return !isIndoor 
        ? { text: '🌧 Có thể mưa ướt, hạn chế di chuyển', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' }
        : { text: '🏠 Nơi trú mưa an toàn', color: 'text-green-400 bg-green-400/10 border-green-400/20' };
    }
    // Storm
    return !isIndoor 
      ? { text: '⚠️ RỦI RO CAO! Cấm đi biển/núi', color: 'text-red-500 bg-red-500/20 border-red-500/30 font-bold animate-pulse' }
      : { text: '🛡️ Điểm tránh trú bão tuyệt đối', color: 'text-green-500 bg-green-500/10 border-green-500/30' };
  };

  return (
    <div className="flex flex-col h-screen bg-[#111] text-white p-6 overflow-hidden">
      <div className="flex justify-between items-end mb-6 border-b border-[#333] pb-4 shrink-0">
        <div>
          <h2 className="text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-blue-500">BƯỚC 2: RAG POOL KHÁM PHÁ</h2>
          <p className="text-slate-400 mt-2">Dữ liệu được các Agent quét và chấm điểm. Kiểm tra thời tiết để ra quyết định.</p>
        </div>
        
        {/* Weather Control Panel */}
        <div className="flex flex-col items-end gap-2">
          <div className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#ff0050] to-rose-600 mb-1">
            Chill Travel QN
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs px-3 py-1 bg-[#1a1a1a] rounded-full border border-neon-cyan/30 text-neon-cyan flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              Thực tế (API): <strong className="text-white">{realWeatherStr}</strong>
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">| Giả lập:</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setWeather('Sunny')}
              className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${weather === 'Sunny' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-gray-500'}`}
            >
              ☀️ Nắng Đẹp
            </button>
            <button 
              onClick={() => setWeather('Rainy')}
              className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${weather === 'Rainy' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-gray-500'}`}
            >
              🌧 Mưa Rào
            </button>
            <button 
              onClick={() => setWeather('Storm')}
              className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${weather === 'Storm' ? 'bg-red-600/30 border-red-500 text-red-500' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-gray-500'}`}
            >
              🌪 Áp Thấp / Bão
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        
        {/* Left Column: Detailed Info Panel & Chat (3/12) */}
        <div className="lg:col-span-3 bg-[#1a1a1a] rounded-2xl border border-[#333] flex flex-col overflow-hidden shadow-xl">
          {/* Tạm Tính Panel */}
          <div className="bg-[#111] p-4 border-b border-[#333] shrink-0">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Thông số tạm tính
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-[#444]">
                <span className="text-xs text-gray-400 font-bold">Ngân sách (Bước 1):</span>
                <span className="text-sm font-black text-gray-200">{(surveyData.budget || 5000000).toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-[#444]">
                <span className="text-xs text-gray-400 font-bold">Tổng chi phí (Tạm tính):</span>
                <span className="text-sm font-black text-orange-400">{totalCost.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-[#444]">
                <span className="text-xs text-gray-400 font-bold">Quỹ còn lại:</span>
                <span className={`text-sm font-black ${((surveyData.budget || 5000000) - totalCost) < 0 ? 'text-red-500' : 'text-green-400'}`}>{((surveyData.budget || 5000000) - totalCost).toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-[#444]">
                <span className="text-xs text-gray-400 font-bold">Quãng đường:</span>
                <span className="text-sm font-black text-blue-400">~{totalDistance.toFixed(1)} km</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#333] shrink-0 bg-[#111]">
            <button 
              onClick={() => setLeftTab('chat')}
              className={`flex-1 py-3 text-sm font-bold tracking-wider transition-colors border-b-2 ${leftTab === 'chat' ? 'border-neon-cyan text-neon-cyan bg-neon-cyan/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              🤖 VIVU AGENT
            </button>
            <button 
              onClick={() => setLeftTab('details')}
              className={`flex-1 py-3 text-sm font-bold tracking-wider transition-colors border-b-2 ${leftTab === 'details' ? 'border-neon-cyan text-neon-cyan bg-neon-cyan/5' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              📍 CHI TIẾT
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {leftTab === 'chat' ? (
              <div className="flex flex-col h-full bg-black/50">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
                  {chatHistory.length === 0 && (
                    <div className="text-center text-xs text-gray-500 my-auto px-4 leading-relaxed">
                      <p>💡 Gợi ý cho bạn:</p>
                      <p className="mt-2 italic">"Tài chính 500k, thích thiên nhiên hoang sơ để chụp hình..."</p>
                      <p className="mt-2 italic">"Nhà có người lớn tuổi, sợ say sóng, muốn đi chỗ nào nhẹ nhàng..."</p>
                    </div>
                  )}
                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#222] text-gray-200 border border-[#333] rounded-bl-none'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isAgentTyping && (
                    <div className="flex justify-start">
                      <div className="bg-[#222] border border-[#333] rounded-2xl rounded-bl-none px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                        <span className="animate-pulse">Agent đang quét RAG...</span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Input */}
                <div className="p-3 border-t border-[#333] bg-[#1a1a1a] flex gap-2 shrink-0">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Hỏi Agent..." 
                    className="flex-1 bg-black border border-[#333] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-cyan min-w-0"
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={isAgentTyping || !chatInput.trim()}
                    className="bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-50 p-2 rounded-xl border border-neon-cyan/30 transition-colors shrink-0"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                  </button>
                </div>
              </div>
            ) : (
              // Details Tab
              activeLoc ? (
                <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
                  <div className="h-48 shrink-0 relative">
                    <img 
                      src={activeLoc.socialBuzz?.imageUrl || 'https://images.unsplash.com/photo-1542272201-b1ca555f8505?ixlib=rb-4.0.3&w=800&q=80'} 
                      alt={activeLoc.name} 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent"></div>
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <h3 className="text-xl font-black text-white leading-tight mb-2">{activeLoc.name}</h3>
                    
                    <div className="flex flex-col gap-2 mb-4">
                      {/* Weather Warning Badge */}
                      {(() => {
                        const status = getWeatherWarning(activeLoc.isIndoor, weather);
                        return (
                          <div className={`text-xs px-3 py-1.5 rounded-lg border ${status.color}`}>
                            {status.text}
                          </div>
                        );
                      })()}

                      {activeLoc.socialBuzz && (parseInt(activeLoc.socialBuzz.viewsCount) > 1 || activeLoc.socialBuzz?.viewsCount.includes('M')) ? (
                        <div className="text-xs font-bold text-[#ff0050] bg-[#ff0050]/10 px-2 py-1 rounded w-fit flex items-center gap-1 border border-[#ff0050]/20">
                          <span>👁</span> {activeLoc.socialBuzz.viewsCount} Lượt tương tác
                        </div>
                      ) : null}
                    </div>

                    <div className="text-sm text-gray-300 italic mb-4 leading-relaxed">
                      "{activeLoc.description}"
                    </div>
                    
                    <div className="space-y-3 mb-6 flex-1">
                      <div>
                        <strong className="text-neon-cyan block text-xs uppercase mb-1">Ưu điểm:</strong>
                        <p className="text-xs text-gray-400">{activeLoc.pros}</p>
                      </div>
                      <div>
                        <strong className="text-red-400 block text-xs uppercase mb-1">Nhược điểm:</strong>
                        <p className="text-xs text-gray-400">{activeLoc.cons}</p>
                      </div>
                      <div className="flex items-center justify-between bg-[#222] p-2 rounded border border-[#444] mt-4">
                        <span className="text-xs font-bold text-gray-400">GIÁ VÉ:</span>
                        <span className="text-sm font-black text-green-400">{activeLoc.ticketPrice === 0 ? 'Miễn phí' : `${activeLoc.ticketPrice.toLocaleString()}đ`}</span>
                      </div>
                    </div>

                    {activeLoc.socialBuzz?.tiktokLink && (
                      <div className="mt-auto shrink-0 bg-black/50 p-4 rounded-xl border border-[#333]">
                        <a 
                          href={activeLoc.socialBuzz.tiktokLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-500 hover:to-blue-400 py-3 rounded-lg transition-transform hover:scale-[1.02]"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 15.68a6.34 6.34 0 006.32 6.32 6.33 6.33 0 006.32-6.32v-5.6a8.31 8.31 0 004.36 1.22v-3.37a5.54 5.54 0 01-2.41-.24z"/></svg>
                          Xem Review trên TikTok
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500 opacity-60">
                  <span className="text-6xl mb-4">📍</span>
                  <p className="font-bold text-lg mb-2">Chưa chọn địa điểm</p>
                  <p className="text-sm">Hãy click vào một địa danh ở danh sách bên phải hoặc trên bản đồ để xem phân tích chi tiết.</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Center Column: Map Viewer (6/12) */}
        <div className="lg:col-span-6 bg-black rounded-2xl border border-[#333] overflow-hidden shadow-xl relative group">
          <div className="absolute top-4 left-4 z-[9999] bg-black/80 backdrop-blur-md px-4 py-2 rounded-lg border border-[#333] text-sm text-gray-300">
            Click vào danh sách bên phải hoặc điểm trên bản đồ
          </div>
          <GoogleMapViewer 
            locations={mapLocations} 
            center={mapCenter} 
            zoom={activeLocId ? 14 : 13} 
            onMarkerClick={(loc) => setActiveLocId(loc.id)} 
            disableRouting={true}
            activeLocationId={activeLocId || undefined}
          />
          {/* Map Overlay styling */}
          <div className="absolute inset-0 border-2 border-transparent group-hover:border-neon-cyan/20 rounded-2xl pointer-events-none transition-colors"></div>
        </div>

        {/* Right Column: Compact List (3/12) */}
        <div className="lg:col-span-3 bg-[#111] border border-[#222] rounded-2xl p-4 flex flex-col h-full overflow-hidden">
          <div className="flex justify-between items-center mb-3 border-b border-[#333] pb-2">
            <h3 className="text-sm font-bold text-gray-400 tracking-widest uppercase">Danh sách Địa Điểm</h3>
            <span className="text-[#ff0050] font-black text-sm">{selectedDestinations.length} đã chọn</span>
          </div>
          
          <div className="mb-3">
            <input 
              type="text"
              placeholder="🔍 Tìm kiếm địa điểm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#333] text-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-neon-cyan transition-colors text-sm"
            />
          </div>

          <div className="overflow-y-auto custom-scrollbar flex-1 space-y-2 pr-2">
            {mapLocations
              .filter(loc => {
                const sq = searchQuery.toLowerCase();
                return loc.name.toLowerCase().includes(sq) || 
                       (loc.description && loc.description.toLowerCase().includes(sq)) ||
                       (loc.tags && loc.tags.some((tag: string) => tag.toLowerCase().includes(sq)));
              })
              .map((loc) => {
              const isSelected = selectedDestinations.includes(loc.id);
              const isActive = activeLocId === loc.id;
              const status = getWeatherWarning(loc.isIndoor, weather);
              
              return (
                <div 
                  key={loc.id} 
                  onClick={() => setActiveLocId(loc.id)}
                  className={`flex flex-col p-3 rounded-xl border transition-all cursor-pointer ${isActive ? 'bg-[#222] border-neon-cyan shadow-[0_0_10px_rgba(0,255,255,0.2)]' : 'bg-[#1a1a1a] border-[#333] hover:border-gray-500'}`}
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h4 className={`text-sm font-bold leading-tight ${isActive ? 'text-neon-cyan' : 'text-gray-200'}`}>{loc.name}</h4>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDestination(loc.id);
                      }}
                      className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-[#ff0050] border-[#ff0050] text-white' : 'border-gray-500 hover:border-gray-300'}`}
                    >
                      {isSelected && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded truncate ${status.color}`}>
                      {status.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <div className="mt-6 flex justify-between shrink-0">
        <button onClick={onBack} className="px-8 py-3 bg-[#222] hover:bg-[#333] border border-[#444] rounded-xl font-bold text-gray-300 transition-colors">
          Quay lại
        </button>
        <button 
          onClick={() => onNext(selectedDestinations)}
          disabled={selectedDestinations.length === 0}
          className={`px-10 py-3 rounded-xl font-black text-lg tracking-wider transition-all ${selectedDestinations.length === 0 ? 'bg-[#333] text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-[#ff0050] to-rose-600 hover:scale-105 shadow-[0_0_30px_rgba(255,0,80,0.4)]'}`}
        >
          BƯỚC 3: CHỌN KHÁCH SẠN ➔
        </button>
      </div>
    </div>
  );
}
