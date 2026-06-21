import React, { useState, useEffect } from 'react';
import type { SurveyDTO } from '../../types/dto';
import { chatWithSurveyAgent } from '../../services/geminiService';

interface Step1Props {
  onNext: (data: Partial<SurveyDTO>) => void;
  initialData: Partial<SurveyDTO>;
}

export default function Step1Survey({ onNext, initialData }: Step1Props) {
  const [budget, setBudget] = useState<number>(initialData.budget !== undefined ? Number(initialData.budget) : 0);
  const [transport, setTransport] = useState<'personal' | 'rent' | 'grab' | ''>(initialData.transport || '');

  // Default dates: tomorrow to +3 days
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  const defaultEnd = new Date(tomorrow);
  defaultEnd.setDate(defaultEnd.getDate() + 3);
  defaultEnd.setHours(17, 0, 0, 0);

  const formatDatetimeLocal = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const [startDate, setStartDate] = useState(initialData.startDate || formatDatetimeLocal(tomorrow));
  const [endDate, setEndDate] = useState(initialData.endDate || formatDatetimeLocal(defaultEnd));
  const [destinations, setDestinations] = useState<string[]>(initialData.destinations || []);
  const [who, setWho] = useState(initialData.who || { adults: 0, children: 0, infants: 0, pets: 0 });
  const [tags, setTags] = useState<string[]>(initialData.tags || []);
  const [numLocations, setNumLocations] = useState<number>(initialData.numLocations || 0);
  const [errors, setErrors] = useState<{ budget?: boolean, who?: boolean }>({});

  const availableTags = ['Nghỉ dưỡng', 'Khám phá', 'Sống ảo', 'Văn hóa', 'Ẩm thực', 'Biển đảo', 'Thiên nhiên'];

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatHistory, setAiChatHistory] = useState<{ role: 'user' | 'agent', text: string }[]>([
    { role: 'agent', text: 'Chào bạn! Mình là Trợ lý AI Du Lịch. Bạn muốn đi Quy Nhơn chơi mấy ngày, đi mấy người và ngân sách khoảng bao nhiêu để mình tư vấn nhé!' }
  ]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [agentMessages, setAgentMessages] = useState<{ agent: string, msg: string, id: number }[]>([]);

  const addAgentMessage = (agent: string, msg: string) => {
    setAgentMessages(prev => {
      const newMsgs = [...prev, { agent, msg, id: Date.now() + Math.random() }];
      if (newMsgs.length > 4) return newMsgs.slice(1);
      return newMsgs;
    });
  };

  const handleAiChatSubmit = async () => {
    if (!aiChatInput.trim()) return;
    const userMsg = aiChatInput.trim();
    setAiChatInput('');

    const updatedHistory: { role: 'user' | 'agent', text: string }[] = [
      ...aiChatHistory,
      { role: 'user', text: userMsg }
    ];
    setAiChatHistory(updatedHistory);
    setIsAnalyzing(true);
    addAgentMessage('Orchestrator Agent', 'Đang trích xuất thông tin bằng LLM...');

    try {
      const currentState = {
        budget, transport, who, startDate, endDate, tags, numLocations
      };
      const result = await chatWithSurveyAgent(updatedHistory, currentState);

      setAiChatHistory(prev => [...prev, { role: 'agent', text: result.reply }]);

      const extracted = result.extractedData;
      if (extracted) {
        if (extracted.budget !== null && extracted.budget !== undefined) setBudget(extracted.budget);
        if (extracted.transport !== null && extracted.transport !== undefined) setTransport(extracted.transport);
        if (extracted.startDate !== null && extracted.startDate !== undefined) setStartDate(extracted.startDate);
        if (extracted.endDate !== null && extracted.endDate !== undefined) setEndDate(extracted.endDate);
        if (extracted.destinations && extracted.destinations.length > 0) {
          setDestinations(extracted.destinations);
          setNumLocations(extracted.destinations.length);
        } else if (extracted.numLocations !== null && extracted.numLocations !== undefined) {
          setNumLocations(extracted.numLocations);
        }

        if (extracted.who !== null && extracted.who !== undefined) setWho(prev => ({ ...prev, ...extracted.who }));
        if (extracted.tags && extracted.tags.length > 0) setTags(extracted.tags);

        const foundItems = [];
        if (extracted.budget) foundItems.push(`Ngân sách: ${extracted.budget.toLocaleString()}đ`);
        if (extracted.transport) foundItems.push(`Di chuyển: ${extracted.transport.toUpperCase()}`);
        if (extracted.startDate) foundItems.push(`Bắt đầu: ${extracted.startDate.replace('T', ' ')}`);
        if (extracted.who) foundItems.push(`${extracted.who.adults || 0} NL, ${extracted.who.children || 0} TE`);
        if (extracted.tags && extracted.tags.length > 0) foundItems.push(`Sở thích: ${extracted.tags.join(', ')}`);
        if (extracted.numLocations) foundItems.push(`Muốn đi ${extracted.numLocations} nơi`);
        if (extracted.destinations && extracted.destinations.length > 0) foundItems.push(`Đã chốt ${extracted.destinations.length} địa điểm`);

        if (foundItems.length > 0) {
          addAgentMessage('Orchestrator Agent', `Cập nhật cấu hình: ${foundItems.join(', ')}`);
        } else {
          addAgentMessage('Orchestrator Agent', 'Chưa thu thập đủ thông tin để cập nhật.');
        }
      }
    } catch (e) {
      addAgentMessage('Orchestrator Agent', 'Lỗi: Không kết nối được AI Engine.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Agent Reactions
  useEffect(() => {
    if (budget <= 0) return; // Không kích hoạt nếu chưa có ngân sách
    const handler = setTimeout(() => {
      if (budget < 2000000) {
        addAgentMessage('Budget Auditor', `Phát hiện ngân sách tiết kiệm (${budget.toLocaleString()}đ). Sẽ ưu tiên các quán ăn địa phương và miễn phí vé vào cổng.`);
      } else if (budget >= 5000000) {
        addAgentMessage('Budget Auditor', `Ngân sách dư dả (${budget.toLocaleString()}đ). Đã kích hoạt bộ lọc Resort 4-5 sao và nhà hàng view biển.`);
      } else {
        addAgentMessage('Budget Auditor', `Ngân sách tiêu chuẩn (${budget.toLocaleString()}đ). Cân bằng tốt giữa trải nghiệm và chi phí.`);
      }
    }, 800);
    return () => clearTimeout(handler);
  }, [budget]);

  useEffect(() => {
    if (transport?.includes('personal')) {
      addAgentMessage('Logistics Agent', 'Đã thiết lập bộ đệm bãi đỗ xe cho tuyến cá nhân.');
    } else if (transport?.includes('rent')) {
      addAgentMessage('Logistics Agent', 'Đã lưu ý dịch vụ thuê xe. Chi phí thuê có thể dao động.');
    } else {
      addAgentMessage('Logistics Agent', 'Đã ưu tiên các điểm dễ gọi xe Grab/Taxi.');
    }
  }, [transport]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#111] text-white p-8">
      <div className="flex justify-between items-end mb-8 border-b border-[#333] pb-4">
        <div>
          <h2 className="text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-blue-500">BƯỚC 1: KHỞI TẠO</h2>
          <p className="text-slate-400 mt-2">Cấu hình tham số lõi cho hệ thống Đa tác nhân.</p>
        </div>
        <div className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-[#ff0050] to-rose-600 mb-2">
          VIVUAGENT - AGENT TRỢ LÝ DU LỊCH
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">

        {/* Column 1: AI Assistant */}
        <div className="flex flex-col gap-4 h-full min-h-0">
          <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 p-4 rounded-2xl border border-purple-500/30 relative h-full flex flex-col min-h-0">
            <div className="absolute top-0 right-0 p-3 opacity-50"><span className="text-2xl">✨</span></div>
            <h3 className="font-bold text-lg mb-2 text-purple-400">Trợ Lý AI Tư Vấn</h3>

            <div className="flex-1 overflow-y-auto mb-4 space-y-3 custom-scrollbar pr-2">
              {aiChatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl p-3 text-sm whitespace-pre-wrap break-words ${msg.role === 'user'
                      ? 'bg-purple-600 text-white rounded-br-none'
                      : 'bg-[#1a1a1a] border border-[#333] text-gray-200 rounded-bl-none'
                    }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isAnalyzing && (
                <div className="flex justify-start">
                  <div className="bg-[#1a1a1a] border border-[#333] text-gray-400 rounded-xl rounded-bl-none p-3 text-sm animate-pulse">
                    Đang suy nghĩ...
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={aiChatInput}
                onChange={e => setAiChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleAiChatSubmit();
                  }
                }}
                placeholder="Nhập yêu cầu (VD: Gợi ý cho tôi đi 3 ngày...)"
                className="flex-1 bg-[#1a1a1a] border border-[#444] text-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors text-sm"
              />
              <button
                onClick={handleAiChatSubmit}
                disabled={isAnalyzing || !aiChatInput.trim()}
                className={`px-4 py-3 rounded-lg font-bold transition-all ${isAnalyzing ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white'
                  }`}
              >
                GỬI ➔
              </button>
            </div>
          </div>
        </div>

        {/* Column 2: Agent Network Status */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-[#333] p-6 relative overflow-hidden flex flex-col justify-end h-full min-h-0">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

          <h3 className="text-lg font-bold mb-6 relative z-10 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            Agent Network Status
          </h3>

          <div className="space-y-4 relative z-10 flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col justify-end">
            {agentMessages.map(msg => (
              <div key={msg.id} className="animate-slideInRight flex gap-3 items-end">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] border shrink-0 ${msg.agent === 'Budget Auditor' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' :
                    msg.agent === 'Orchestrator Agent' ? 'bg-purple-500/20 border-purple-500 text-purple-500' :
                      'bg-blue-500/20 border-blue-500 text-blue-500'
                  }`}>
                  {msg.agent.charAt(0)}A
                </div>
                <div className="bg-[#222] border border-[#333] p-3 rounded-2xl rounded-bl-none text-xs text-gray-300 shadow-lg">
                  <span className="text-[10px] font-bold block mb-1 opacity-70 text-neon-cyan">{msg.agent}</span>
                  {msg.msg}
                </div>
              </div>
            ))}
            {agentMessages.length === 0 && (
              <div className="text-center text-gray-500 animate-pulse text-sm">Các Agent đang chờ yêu cầu...</div>
            )}
          </div>
        </div>

        {/* Column 3: Form Controls */}
        <div className="space-y-6 overflow-y-auto pr-4 custom-scrollbar h-full min-h-0 pb-10">

          <div>
            <h3 className="font-bold text-sm mb-2 text-neon-cyan">Ngân sách dự kiến (VND)</h3>
            <div className={`relative w-full ${errors.budget ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
              <input
                type="text"
                value={budget ? budget.toLocaleString('vi-VN') : ''}
                onChange={(e) => setBudget(Number(e.target.value.replace(/\D/g, '')))}
                className={`bg-[#1a1a1a] border ${errors.budget ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'border-[#333]'} text-white font-black text-lg px-4 py-2 rounded-lg focus:outline-none focus:border-[#ff0050] transition-colors w-full shadow-inner`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">VNĐ</span>
            </div>
            {errors.budget && <p className="text-red-500 text-xs font-bold mt-2">Vui lòng điền chỗ này (Bắt buộc)</p>}
            {budget > 0 && !errors.budget && (
              <p className="text-xs font-bold text-green-400 mt-2">
                Quy đổi: {budget.toLocaleString('vi-VN')} đ ({budget >= 1000000 ? `${(budget / 1000000).toLocaleString('vi-VN')} triệu` : budget >= 1000 ? `${(budget / 1000).toLocaleString('vi-VN')} ngàn` : budget})
              </p>
            )}
          </div>

          <div className={`${errors.transport ? 'animate-shake' : ''}`}>
            <h3 className="font-bold text-sm mb-2 text-neon-cyan">Phương tiện (Transport)</h3>
            <div className={`grid grid-cols-2 gap-2 p-2 rounded-xl ${errors.transport ? 'border border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] bg-red-500/5' : 'border border-transparent'}`}>
              {[
                { id: 'personal_motorbike', label: 'XE MÁY CÁ NHÂN' },
                { id: 'personal_car', label: 'XE Ô TÔ CÁ NHÂN' },
                { id: 'rent_motorbike', label: 'XE MÁY THUÊ' },
                { id: 'rent_car', label: 'XE Ô TÔ THUÊ' },
                { id: 'grab_motorbike', label: 'ĐI GRAB XE MÁY' },
                { id: 'grab_car', label: 'ĐI GRAB TAXI' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setTransport(opt.id as any)}
                  className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all ${transport === opt.id ? 'border-[#ff0050] bg-[#ff0050]/20 text-white shadow-[0_0_10px_rgba(255,0,80,0.3)]' : 'border-[#333] bg-[#1a1a1a] text-gray-400 hover:border-gray-500'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {errors.transport && <p className="text-red-500 text-xs font-bold mt-2">Vui lòng điền chỗ này (Bắt buộc)</p>}
          </div>

          <div>
            <h3 className="font-bold text-sm mb-2 text-neon-cyan">Số lượng người</h3>
            <div className={`flex gap-2 ${errors.who ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
              <div className={`bg-[#1a1a1a] p-2 px-3 rounded-lg border ${errors.who ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'border-[#333]'} flex-1 flex justify-between items-center`}>
                <span className={`${errors.who ? 'text-red-400' : 'text-gray-400'} font-bold text-sm`}>Người lớn</span>
                <input
                  type="number" min="1" max="20"
                  value={who.adults || ''}
                  onChange={(e) => setWho(p => ({ ...p, adults: parseInt(e.target.value) || 0 }))}
                  className="bg-[#222] border border-[#444] text-white px-2 py-1 w-12 rounded text-center focus:border-neon-cyan focus:outline-none text-sm"
                />
              </div>
              <div className="bg-[#1a1a1a] p-2 px-3 rounded-lg border border-[#333] flex-1 flex justify-between items-center">
                <span className="text-gray-400 font-bold text-sm">Trẻ em</span>
                <input
                  type="number" min="0" max="20"
                  value={who.children || ''}
                  onChange={(e) => setWho(p => ({ ...p, children: parseInt(e.target.value) || 0 }))}
                  className="bg-[#222] border border-[#444] text-white px-2 py-1 w-12 rounded text-center focus:border-neon-cyan focus:outline-none text-sm"
                />
              </div>
            </div>
            {errors.who && <p className="text-red-500 text-xs font-bold mt-2">Vui lòng điền số người lớn (Bắt buộc)</p>}
          </div>

          <div>
            <h3 className="font-bold text-sm mb-2 text-neon-cyan">Số lượng nơi muốn đi</h3>
            <div className="flex items-center gap-2 bg-[#1a1a1a] p-2 px-3 rounded-lg border border-[#333] w-full">
              <span className="text-gray-400 font-bold text-sm flex-1">Điểm đến (Nơi)</span>
              <input
                type="number" min="1" max="15" step="1"
                value={numLocations || ''}
                onChange={(e) => setNumLocations(parseInt(e.target.value) || 0)}
                className="bg-[#222] border border-[#444] text-white px-2 py-1 w-12 rounded text-center focus:border-neon-cyan focus:outline-none text-sm font-bold"
              />
            </div>
          </div>

          <div>
            <h3 className="font-bold text-sm mb-2 text-neon-cyan">Sở thích / Gu du lịch</h3>
            <div className="flex flex-wrap gap-2">
              {availableTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${tags.includes(tag) ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-gray-500'
                    }`}
                >
                  {tags.includes(tag) ? '✓ ' : '+ '}{tag}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-bold text-sm mb-2 text-neon-cyan">Thời gian chuyến đi</h3>
            <div className="flex flex-col gap-3 bg-[#1a1a1a] p-3 rounded-lg border border-[#333]">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1 font-bold">Bắt đầu (Đến Khách sạn)</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#222] border border-[#444] text-white px-3 py-1.5 text-sm rounded focus:outline-none focus:border-neon-cyan w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1 font-bold">Kết thúc (Rời Khách sạn)</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-[#222] border border-[#444] text-white px-3 py-1.5 text-sm rounded focus:outline-none focus:border-neon-cyan w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end pt-4 border-t border-[#333]">
        <button
          onClick={() => {
            const newErrors: { budget?: boolean, who?: boolean, transport?: boolean } = {};
            if (!budget || budget <= 0) newErrors.budget = true;
            if (!who.adults || who.adults <= 0) newErrors.who = true;
            if (!transport) newErrors.transport = true;

            if (Object.keys(newErrors).length > 0) {
              setErrors(newErrors);
              setTimeout(() => setErrors({}), 1000);
              return;
            }
            onNext({ budget, transport, startDate, endDate, destinations, who, tags, numLocations });
          }}
          className="px-10 py-4 bg-gradient-to-r from-[#ff0050] to-rose-600 rounded-xl font-black text-lg tracking-wider hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,0,80,0.4)]"
        >
          TIẾP TỤC: CHỌN ĐIỂM ĐẾN ➔
        </button>
      </div>
    </div>
  );
}
