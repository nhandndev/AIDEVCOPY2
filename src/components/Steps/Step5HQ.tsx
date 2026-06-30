import React, { useState, useMemo } from 'react';
import type { LocationKnowledgeDTO, ItineraryDTO } from '../../types/dto';
import GoogleMapViewer from '../Map/GoogleMapViewer';
import ragDatabase from '../../data';
import ragTransport from '../../data/rag_transport.json';
import { parseTimeIntent, analyzeStep5Intent, searchPlacesByAgent } from '../../services/geminiService';

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

interface Step5Props {
  itinerary: ItineraryDTO | null;
  currentLocations: LocationKnowledgeDTO[];
  budget: number;
  days: number;
  transportMode: string;
  numPeople?: number;
  metrics: { timeSaved: number; distanceOptimized: number; co2Reduced: number };
  weatherState: 'Sunny' | 'Rainy' | 'Storm';
  onSimulateStorm: () => void;
  onReset: () => void;
}

export default function Step5HQ({ itinerary, currentLocations: initialLocations, budget, days, transportMode: initialTransport, numPeople = 2, metrics: _metrics, weatherState: initialWeather, onSimulateStorm, onReset }: Step5Props) {
  const [locations, setLocations] = useState<LocationKnowledgeDTO[]>(initialLocations);
  const [activeItinerary, setActiveItinerary] = useState<ItineraryDTO | null>(itinerary);
  const [weather, setWeather] = useState(initialWeather);
  const [consoleLogs, setConsoleLogs] = useState<{time: string, agent: string, msg: string}[]>([
    { time: new Date().toLocaleTimeString(), agent: 'System', msg: 'Dashboard initialized. Lịch trình đã được nạp.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [pendingSuggestion, setPendingSuggestion] = useState<any | null>(null);
  const [chatContext, setChatContext] = useState<{ intent: string } | null>(null);
  const [optLevelContext, setOptLevelContext] = useState<boolean>(false);
  
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customForm, setCustomForm] = useState({ locId: '', dayIdx: 0, startTime: '08:00', endTime: '10:00' });
  const [draggedItem, setDraggedItem] = useState<{ dayIdx: number, actIdx: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ dayIdx: number, actIdx: number } | null>(null);
  const [hasSuggestedHotel, setHasSuggestedHotel] = useState(false);
  const [currentBudget, setCurrentBudget] = useState(budget);
  const [preStormLocations, setPreStormLocations] = useState<LocationKnowledgeDTO[] | null>(null);
  const [preStormItinerary, setPreStormItinerary] = useState<ItineraryDTO | null>(null);
  const [pendingBudgetCut, setPendingBudgetCut] = useState<{
    allCosts: { id: string; name: string; totalCost: number; dayIdx: number; actIdx: number }[];
    toRemove: { id: string; name: string; totalCost: number; dayIdx: number; actIdx: number }[];
    savedAmount: number;
  } | null>(null);

  const [transportInfo, setTransportInfo] = useState({
    type: initialTransport || 'personal_motorbike',
    isHybridWalk: false,
    gasPrice: 24000
  });

  React.useEffect(() => {
    // Mock API to fetch gas price
    const fetchGas = async () => {
      await new Promise(r => setTimeout(r, 600));
      setTransportInfo(prev => ({ ...prev, gasPrice: 23500 }));
    };
    fetchGas();
  }, []);

  const addLog = (agent: string, msg: string) => {
    setConsoleLogs(prev => [{ time: new Date().toLocaleTimeString(), agent, msg }, ...prev]);
  };

  const recalculateTimes = (dayActivities: any[]) => {
    const START_HOUR = 8;
    const MAX_END_HOUR = 23;
    const maxAvailableHours = MAX_END_HOUR - START_HOUR;

    let totalNeededHours = 0;
    dayActivities.forEach(act => {
      if (!act.canceled) {
        const loc = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
        totalNeededHours += loc?.recommendedHours || 2;
      }
    });

    const compressionRatio = totalNeededHours > maxAvailableHours 
      ? maxAvailableHours / totalNeededHours 
      : 1;

    let currentHour = START_HOUR;
    let currentMinute = 0;

    return dayActivities.map(act => {
      if (act.canceled) return act;
      const loc = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
      const originalHours = loc?.recommendedHours || 2;
      
      const allocatedHours = originalHours * compressionRatio;
      
      const formatTime = (h: number, m: number) => {
         const totalMins = Math.round(h * 60 + m);
         const hh = Math.floor(totalMins / 60);
         const mm = totalMins % 60;
         return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
      };
      
      const startTime = formatTime(currentHour, currentMinute);
      
      const addedMins = allocatedHours * 60;
      currentHour += Math.floor(addedMins / 60);
      currentMinute += addedMins % 60;
      
      const endTime = formatTime(currentHour, currentMinute);
      
      return { ...act, startTime, endTime };
    });
  };

  const handleDragStart = (e: React.DragEvent, dayIdx: number, actIdx: number) => {
    setDraggedItem({ dayIdx, actIdx });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, dayIdx: number, actIdx: number) => {
    e.preventDefault();
    setDragOverItem({ dayIdx, actIdx });
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDrop = (e: React.DragEvent, targetDayIdx: number, targetActIdx: number) => {
    e.preventDefault();
    if (!draggedItem || !activeItinerary) return;
    if (draggedItem.dayIdx === targetDayIdx && draggedItem.actIdx === targetActIdx) {
      handleDragEnd();
      return;
    }
    const newIti = [...activeItinerary];
    const sourceDay = { ...newIti[draggedItem.dayIdx] };
    sourceDay.activities = [...sourceDay.activities];
    const targetDay = draggedItem.dayIdx === targetDayIdx ? sourceDay : { ...newIti[targetDayIdx] };
    if (draggedItem.dayIdx !== targetDayIdx) {
      targetDay.activities = [...targetDay.activities];
    }
    const [movedAct] = sourceDay.activities.splice(draggedItem.actIdx, 1);
    targetDay.activities.splice(targetActIdx, 0, movedAct);
    sourceDay.activities = recalculateTimes(sourceDay.activities);
    if (draggedItem.dayIdx !== targetDayIdx) {
      targetDay.activities = recalculateTimes(targetDay.activities);
    }
    newIti[draggedItem.dayIdx] = sourceDay;
    if (draggedItem.dayIdx !== targetDayIdx) {
      newIti[targetDayIdx] = targetDay;
    }
    setActiveItinerary(newIti);
    addLog('System', `Đã di chuyển lịch trình. Scheduler Agent đã tự động tính toán lại thời gian cho các địa điểm.`);
    handleDragEnd();
  };

  const handleDeleteAct = (dayIdx: number, actIdx: number, actId: string) => {
    if (!activeItinerary) return;
    const newIti = [...activeItinerary];
    const updatedDay = { ...newIti[dayIdx] };
    updatedDay.activities = [...updatedDay.activities];
    updatedDay.activities.splice(actIdx, 1);
    newIti[dayIdx] = updatedDay;
    setActiveItinerary(newIti);
    
    // Check if the location is completely removed from the itinerary
    const stillExists = newIti.some(d => d.activities.some(a => a.id === actId && !a.canceled));
    if (!stillExists) {
      setLocations(prev => prev.filter(l => l.id !== actId));
    }
    
    addLog('System', `Người dùng đã xóa 1 địa điểm khỏi lịch trình. Budget Auditor đã cập nhật lại ngân sách.`);
  };

  const handleTimeChange = (dayIdx: number, actIdx: number, field: 'startTime' | 'endTime', value: string) => {
    if (!activeItinerary) return;
    const newIti = [...activeItinerary];
    const updatedDay = { ...newIti[dayIdx] };
    updatedDay.activities = [...updatedDay.activities];
    
    // Time helpers
    const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const formatTime = (mins: number) => { 
      const h = Math.floor(mins / 60) % 24; 
      const m = mins % 60; 
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; 
    };

    updatedDay.activities[actIdx] = { ...updatedDay.activities[actIdx], [field]: value };
    
    // 1. Ensure Start <= End for the current item
    let startMins = parseTime(updatedDay.activities[actIdx].startTime);
    let endMins = parseTime(updatedDay.activities[actIdx].endTime);
    if (startMins > endMins) {
      if (field === 'startTime') endMins = startMins + 60;
      else startMins = endMins - 60;
      updatedDay.activities[actIdx].startTime = formatTime(startMins);
      updatedDay.activities[actIdx].endTime = formatTime(endMins);
    }

    // 2. Cascade Backward: if new startTime < previous endTime, reduce previous event's duration
    if (field === 'startTime' && actIdx > 0) {
      const prevEndMins = parseTime(updatedDay.activities[actIdx - 1].endTime);
      if (startMins < prevEndMins) {
        updatedDay.activities[actIdx - 1].endTime = formatTime(startMins);
        // Force prevStart <= new prevEnd
        if (parseTime(updatedDay.activities[actIdx - 1].startTime) > startMins) {
          updatedDay.activities[actIdx - 1].startTime = formatTime(startMins);
        }
      }
    }

    // 3. Cascade Forward: if new endTime > next startTime, push the next event forward
    if (field === 'endTime' && actIdx < updatedDay.activities.length - 1) {
      let currentEnd = endMins;
      for (let i = actIdx + 1; i < updatedDay.activities.length; i++) {
        const nextStartMins = parseTime(updatedDay.activities[i].startTime);
        if (nextStartMins < currentEnd) {
          const duration = Math.max(0, parseTime(updatedDay.activities[i].endTime) - nextStartMins);
          updatedDay.activities[i].startTime = formatTime(currentEnd);
          updatedDay.activities[i].endTime = formatTime(currentEnd + duration);
          currentEnd = currentEnd + duration;
        } else {
          break; // No more overlap, stop cascading
        }
      }
    }

    newIti[dayIdx] = updatedDay;
    setActiveItinerary(newIti);
  };

  const hotel = locations.find(l => l.type === 'hotel');

  const handleOptimizeRoute = (overrideHotel?: LocationKnowledgeDTO, overrideLocations?: LocationKnowledgeDTO[], overrideItinerary?: ItineraryDTO) => {
    const currentHotel = overrideHotel || hotel;
    const currentLocs = overrideLocations || locations;
    const currentItinerary = overrideItinerary || activeItinerary;
    if (!currentItinerary || !currentHotel) return;
    
    addLog('THINK (Logistics Agent)', 'Bắt đầu tối ưu hóa lộ trình để tìm TỔNG quãng đường ngắn nhất (Brute-force TSP)...');
    
    const getPermutations = (arr: any[]): any[][] => {
      if (arr.length <= 1) return [arr];
      const result: any[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
        const remainingPerms = getPermutations(remaining);
        for (const perm of remainingPerms) {
          result.push([current, ...perm]);
        }
      }
      return result;
    };

    let summaryLog = '';
    let hasChanges = false;
    let totalSaved = 0;

    const newIti = currentItinerary.map((day, dIdx) => {
      if (day.activities.length <= 1) return day;

      const unvisited = day.activities.filter(a => !a.canceled);
      if (unvisited.length === 0) return { ...day, activities: day.activities };
      
      // Calculate original distance
      let originalTotal = 0;
      let curr = currentHotel;
      unvisited.forEach(act => {
        const actLoc = (currentLocs.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id)) as LocationKnowledgeDTO;
        if (actLoc) {
          originalTotal += getDistance(curr.lat, curr.lng, actLoc.lat, actLoc.lng);
          curr = actLoc;
        }
      });
      originalTotal += getDistance(curr.lat, curr.lng, currentHotel.lat, currentHotel.lng);

      let bestPermutation = unvisited;
      let minTotalDistance = Infinity;

      if (unvisited.length <= 8) {
        const allPerms = getPermutations(unvisited);
        for (const perm of allPerms) {
          let currentTotal = 0;
          let currentLoc = currentHotel;
          
          for (let i = 0; i < perm.length; i++) {
            const act = perm[i];
            const actLoc = (currentLocs.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id)) as LocationKnowledgeDTO;
            if (actLoc) {
              currentTotal += getDistance(currentLoc.lat, currentLoc.lng, actLoc.lat, actLoc.lng);
              currentLoc = actLoc;
            }
          }
          // Add return trip to hotel
          currentTotal += getDistance(currentLoc.lat, currentLoc.lng, currentHotel.lat, currentHotel.lng);
          
          if (currentTotal < minTotalDistance) {
            minTotalDistance = currentTotal;
            bestPermutation = perm;
          }
        }
      } else {
        const optimizedActs: any[] = [];
        let currentLoc = currentHotel;
        let unv = [...unvisited];
        while (unv.length > 0) {
          let nearestIdx = 0;
          let minDistance = Infinity;
          unv.forEach((act, idx) => {
            const actLoc = currentLocs.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
            if (actLoc) {
              const dist = getDistance(currentLoc.lat, currentLoc.lng, actLoc.lat, actLoc.lng);
              if (dist < minDistance) {
                minDistance = dist;
                nearestIdx = idx;
              }
            }
          });
          const nextAct = unv.splice(nearestIdx, 1)[0];
          optimizedActs.push(nextAct);
          const nextLoc = (currentLocs.find(l => l.id === nextAct.id) || ragDatabase.find(l => l.id === nextAct.id)) as LocationKnowledgeDTO;
          if (nextLoc) currentLoc = nextLoc;
        }
        
        // Calculate the NN total distance
        let nnTotal = 0;
        let nnLoc = currentHotel;
        optimizedActs.forEach(act => {
          const actLoc = (currentLocs.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id)) as LocationKnowledgeDTO;
          if (actLoc) {
            nnTotal += getDistance(nnLoc.lat, nnLoc.lng, actLoc.lat, actLoc.lng);
            nnLoc = actLoc;
          }
        });
        nnTotal += getDistance(nnLoc.lat, nnLoc.lng, currentHotel.lat, currentHotel.lng);
        minTotalDistance = nnTotal;
        bestPermutation = optimizedActs;
      }

      if (minTotalDistance < originalTotal - 0.1) {
        const saved = originalTotal - minTotalDistance;
        totalSaved += saved;
        hasChanges = true;
        
        const oldNames = unvisited.map(a => (currentLocs.find(l=>l.id===a.id)||ragDatabase.find(l=>l.id===a.id))?.name).join(' ➔ ');
        const newNames = bestPermutation.map(a => (currentLocs.find(l=>l.id===a.id)||ragDatabase.find(l=>l.id===a.id))?.name).join(' ➔ ');
        
        summaryLog += `\n📍 **Ngày ${dIdx + 1}:**\n- Cũ: [${oldNames}]\n- Mới: [${newNames}]\n=> Rút ngắn được **${saved.toFixed(1)} km**!`;
      }

      // Re-assign and recalculate times for non-canceled, keep canceled at the end
      const canceledActs = day.activities.filter(a => a.canceled);
      const newDay = { ...day, activities: [...recalculateTimes(bestPermutation), ...canceledActs] };
      return newDay;
    });

    setActiveItinerary(newIti);
    
    if (hasChanges) {
      addLog('ACT (Logistics Agent)', `Đã quy hoạch lại thứ tự đi lại!${summaryLog}\n\n**Tổng cộng tiết kiệm được ${totalSaved.toFixed(1)} km** vòng vèo trên đường.`);
    } else {
      addLog('ACT (Logistics Agent)', 'Lịch trình hiện tại đã là tối ưu nhất, không có cách xếp nào ngắn hơn nữa nên tôi xin phép giữ nguyên.');
    }
  };

  const handleFullOptimize = async () => {
    if (!activeItinerary || activeItinerary.length === 0) return;
    
    addLog('THINK (Logistics Agent)', 'Bắt đầu quy hoạch lại TOÀN BỘ hành trình: Gom cụm các điểm gần nhau và chia đều số lượng vào các ngày...');
    await new Promise(r => setTimeout(r, 800));

    // 1. Gather all non-canceled activities
    const allActs: any[] = [];
    activeItinerary.forEach(day => {
      day.activities.forEach(act => {
        if (!act.canceled) {
          allActs.push(act);
        }
      });
    });

    const numDays = activeItinerary.length;
    if (allActs.length === 0 || numDays === 0) return;
    const actsPerDay = Math.ceil(allActs.length / numDays);
    
    // 2. Clustering (Heuristic: Seed & Nearest)
    const unassigned = [...allActs];
    const clusteredDays: any[][] = Array(numDays).fill([]).map(() => []);

    for (let d = 0; d < numDays; d++) {
      if (unassigned.length === 0) break;
      
      const targetCount = (d === numDays - 1) ? unassigned.length : Math.min(actsPerDay, unassigned.length);
      
      // Pick seed: first unassigned item
      const seedAct = unassigned.shift()!;
      clusteredDays[d].push(seedAct);
      const seedLoc = locations.find(l => l.id === seedAct.id) || ragDatabase.find(l => l.id === seedAct.id);

      // Find targetCount - 1 nearest items to the seed
      while (clusteredDays[d].length < targetCount && unassigned.length > 0) {
        if (!seedLoc) {
           clusteredDays[d].push(unassigned.shift()!);
           continue;
        }

        let nearestIdx = 0;
        let minDist = Infinity;
        unassigned.forEach((act, idx) => {
          const loc = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
          if (loc) {
            const dist = getDistance(seedLoc.lat, seedLoc.lng, loc.lat, loc.lng);
            if (dist < minDist) {
              minDist = dist;
              nearestIdx = idx;
            }
          }
        });
        
        clusteredDays[d].push(unassigned.splice(nearestIdx, 1)[0]);
      }
    }

    // 3. TSP Optimization within each day and map back to activeItinerary
    const getPermutations = (arr: any[]): any[][] => {
      if (arr.length <= 1) return [arr];
      const result: any[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
        const remainingPerms = getPermutations(remaining);
        for (const perm of remainingPerms) {
          result.push([current, ...perm]);
        }
      }
      return result;
    };

    const newIti = activeItinerary.map((day, dIdx) => {
      const dayActs = clusteredDays[dIdx];
      if (!dayActs || dayActs.length === 0) return { ...day, activities: [] };
      
      // Sequence optimization
      let bestPermutation = dayActs;
      if (dayActs.length <= 8) {
        let minTotalDistance = Infinity;
        const allPerms = getPermutations(dayActs);
        for (const perm of allPerms) {
          let currentTotal = 0;
          let currentLoc: any = hotel;
          for (let i = 0; i < perm.length; i++) {
            const act = perm[i];
            const actLoc = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
            if (actLoc && currentLoc) {
              currentTotal += getDistance(currentLoc.lat, currentLoc.lng, actLoc.lat, actLoc.lng);
              currentLoc = actLoc;
            }
          }
          if (currentLoc && hotel) {
             currentTotal += getDistance(currentLoc.lat, currentLoc.lng, hotel.lat, hotel.lng);
          }
          if (currentTotal < minTotalDistance) {
            minTotalDistance = currentTotal;
            bestPermutation = perm;
          }
        }
      } else {
         // NN fallback
         const optimizedActs: any[] = [];
         let currentLoc: any = hotel;
         let unv = [...dayActs];
         while (unv.length > 0) {
           let nearestIdx = 0;
           let minDist = Infinity;
           unv.forEach((act, idx) => {
             const actLoc = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
             if (actLoc && currentLoc) {
               const dist = getDistance(currentLoc.lat, currentLoc.lng, actLoc.lat, actLoc.lng);
               if (dist < minDist) {
                 minDist = dist;
                 nearestIdx = idx;
               }
             }
           });
           const nextAct = unv.splice(nearestIdx, 1)[0];
           optimizedActs.push(nextAct);
           const nextLoc = locations.find(l => l.id === nextAct.id) || ragDatabase.find(l => l.id === nextAct.id);
           if (nextLoc) currentLoc = nextLoc;
         }
         bestPermutation = optimizedActs;
      }
      
      // Re-assign times
      return { ...day, activities: recalculateTimes(bestPermutation) };
    });

    setActiveItinerary(newIti);
    addLog('ACT (Logistics Agent)', 'Đã hoàn tất! Các điểm gần nhau được xếp chung 1 ngày với số lượng cân bằng và lộ trình di chuyển cực ngắn.');
  };

  const getOptimalVehicles = (type: string, num: number) => {
    if (type === 'grab_car' || type === 'personal_car' || type === 'rent_car') {
      if (num > 7) {
        const num7 = Math.floor(num / 7);
        const rem = num % 7;
        const num4 = Math.ceil(rem / 4);
        return { count: num7 + num4, desc: `${num7} xe 7 chỗ` + (num4 > 0 ? ` & ${num4} xe 4 chỗ` : '') };
      } else if (num > 4) {
        return { count: 1, desc: `1 xe 7 chỗ` };
      } else {
        return { count: 1, desc: `1 xe 4 chỗ` };
      }
    }
    return { count: Math.ceil(num / 2), desc: `${Math.ceil(num / 2)} xe máy` };
  };

  const hotelRoomsGlobal = Math.ceil(numPeople / 4);
  const hotelCost = hotel ? (hotel.avgCost || 0) * days * hotelRoomsGlobal : 0;
  
  let attrCost = 0;
  let globalTransportCost = 0;
  
  if (activeItinerary) {
    const activeIds = new Set<string>();
    let totalDrivenDist = 0;
    
    activeItinerary.forEach(day => {
      let currentLoc: any = hotel;
      day.activities.forEach(act => {
        if (!act.canceled) {
          activeIds.add(act.id);
          const loc = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
          if (loc && currentLoc) {
            const dist = getDistance(currentLoc.lat, currentLoc.lng, loc.lat, loc.lng);
            if (!(transportInfo.isHybridWalk && dist <= 1.5)) {
              totalDrivenDist += dist;
            }
            currentLoc = loc;
          }
        }
      });
      if (currentLoc && hotel) {
        const dist = getDistance(currentLoc.lat, currentLoc.lng, hotel.lat, hotel.lng);
        if (!(transportInfo.isHybridWalk && dist <= 1.5)) {
          totalDrivenDist += dist;
        }
      }
    });
    
    attrCost = locations.filter(l => l.type !== 'hotel' && activeIds.has(l.id)).reduce((sum, loc) => sum + ((loc.ticketPrice || 0) + (loc.avgCost || 0)) * numPeople, 0);
    
    if (transportInfo.type === 'walk') {
      globalTransportCost = 0;
    } else if (transportInfo.type === 'grab_car') {
      const v = getOptimalVehicles(transportInfo.type, numPeople);
      globalTransportCost = Math.round(totalDrivenDist * ragTransport.grab.car_price_per_km) * v.count;
    } else if (transportInfo.type === 'grab_motorbike') {
      const v = getOptimalVehicles(transportInfo.type, numPeople);
      globalTransportCost = Math.round(totalDrivenDist * ragTransport.grab.motorbike_price_per_km) * v.count;
    } else if (transportInfo.type === 'rent_car') {
      const v = getOptimalVehicles(transportInfo.type, numPeople);
      const rentFee = (Math.floor(numPeople/7) * ragTransport.rent_car["7_seater"] + Math.ceil((numPeople%7)/4) * ragTransport.rent_car["4_seater"]) * days;
      globalTransportCost = rentFee + Math.round(totalDrivenDist * ragTransport.personal.car_price_per_km) * v.count;
    } else if (transportInfo.type === 'rent_motorbike') {
      const v = getOptimalVehicles(transportInfo.type, numPeople);
      const rentFee = v.count * ragTransport.rent_motorbike.price_per_day * days;
      globalTransportCost = rentFee + Math.round(totalDrivenDist * ragTransport.personal.motorbike_price_per_km) * v.count;
    } else if (transportInfo.type === 'personal_car') {
      const v = getOptimalVehicles(transportInfo.type, numPeople);
      globalTransportCost = Math.round(totalDrivenDist * ragTransport.personal.car_price_per_km) * v.count;
    } else {
      const v = getOptimalVehicles(transportInfo.type, numPeople);
      globalTransportCost = Math.round(totalDrivenDist * ragTransport.personal.motorbike_price_per_km) * v.count;
    }
  } else {
    attrCost = locations.filter(l => l.type !== 'hotel').reduce((sum, loc) => sum + ((loc.ticketPrice || 0) + (loc.avgCost || 0)) * numPeople, 0);
  }
  
  const totalCost = Math.round(hotelCost + attrCost + globalTransportCost);
  const remainingBudget = Math.round(currentBudget - totalCost);

  const suggestCheaperHotel = () => {
    addLog('THINK (Budget Agent)', `Ngân sách đang ÂM (${remainingBudget.toLocaleString()}đ). Tìm khách sạn thay thế rẻ hơn...`);
    
    const cheaperHotels = ragDatabase.filter(l => 
      l.type === 'hotel' && l.avgCost < (hotel?.avgCost || 0)
    ).sort((a, b) => {
      // Sort by cost mainly, but consider distance to center slightly
      const distA = getDistance(13.7634, 109.2235, a.lat, a.lng);
      const distB = getDistance(13.7634, 109.2235, b.lat, b.lng);
      return (a.avgCost + distA * 5000) - (b.avgCost + distB * 5000);
    }).slice(0, 3);

    if (cheaperHotels.length > 0) {
      const options = cheaperHotels.map(h => ({
        ...h,
        savings: ((hotel?.avgCost || 0) - h.avgCost) * days * hotelRoomsGlobal
      }));
      
      addLog('ACT (Budget Agent)', `Tìm thấy ${options.length} khách sạn rẻ hơn. Vui lòng chọn 1 khách sạn để tiết kiệm chi phí.`);
      
      setPendingSuggestion({
        intent: 'change_hotel_list',
        options: options
      });
    } else {
      addLog('ACT (Budget Agent)', `Không tìm thấy khách sạn nào rẻ hơn trong cơ sở dữ liệu.`);
    }
  };

  React.useEffect(() => {
    if (remainingBudget < 0 && !hasSuggestedHotel && hotel) {
      setHasSuggestedHotel(true);
      suggestCheaperHotel();
    }
  }, [remainingBudget, hasSuggestedHotel, hotel]);

  const handleSimulate = async () => {
    setPreStormLocations(locations);
    setPreStormItinerary(activeItinerary);
    setWeather('Storm');
    addLog('OBSERVE (Weather Agent)', 'CẢNH BÁO BÃO! Rủi ro ngập lụt tại QL19 và sạt lở đèo An Khê.');
    await new Promise(r => setTimeout(r, 800));
    
    addLog('THINK (Orchestrator)', 'Kích hoạt chiến lược an toàn. Phân tích ngữ nghĩa tên địa danh để loại bỏ khu vực ngoài trời.');
    await new Promise(r => setTimeout(r, 800));

    let changed = false;
    const replacementMap: Record<string, string> = {};
    const newLocations = [...locations]; // We will append new ones instead of replacing

    locations.forEach(loc => {
      const lowerName = loc.name.toLowerCase();
      const isDangerous = lowerName.includes('đảo') || lowerName.includes('bãi') || lowerName.includes('dã ngoại') || lowerName.includes('biển') || !loc.isIndoor;
      
      if (isDangerous && loc.type !== 'hotel') {
        changed = true;
        replacementMap[loc.id] = 'canceled';
        addLog('OBSERVE (Language Agent)', `Phân tích NLP: "${loc.name}" -> Không gian mở/Thiếu mái che. ĐÁNH GIÁ: NGUY HIỂM.`);
        addLog('ACT (Scheduler Agent)', `Đã hủy lịch trình đi ${loc.name} vì lý do an toàn.`);
      }
    });

    await new Promise(r => setTimeout(r, 500));
    setLocations(newLocations);
    
    if (activeItinerary) {
      const newIti = activeItinerary.map(day => {
        const newActivities: any[] = [];
        day.activities.forEach(act => {
          if (replacementMap[act.id]) {
            newActivities.push({ ...act, canceled: true, reason: '🚫 Hủy do Siêu bão' });
          } else {
            newActivities.push(act);
          }
        });
        return { ...day, activities: newActivities };
      });
      handleOptimizeRoute(hotel, newLocations, newIti);
    }

    if (changed) {
      addLog('OBSERVE (System)', 'Bản đồ và Timeline đã được cập nhật lộ trình an toàn.');
    }
    onSimulateStorm();
  };

  const processSuggestion = async (intent: string, dayIndex: number, _timeStr: string, rawQuery: string = '') => {
    addLog('THINK (Orchestrator)', `Tìm kiếm địa điểm (Intent: ${intent})...`);
    
    let mockDataList: LocationKnowledgeDTO[] = [];
    
    addLog('AI Agent', `Đang phân tích cơ sở dữ liệu RAG để tìm địa điểm phù hợp với yêu cầu...`);
    
    const excludeIds = activeItinerary ? activeItinerary.flatMap(d => d.activities.map(a => a.id)) : [];
    
    // Fallback if rawQuery is missing, use intent word
    const queryToSearch = rawQuery || intent; 
    const suggestedIds = await searchPlacesByAgent(queryToSearch, excludeIds);

    if (suggestedIds && suggestedIds.length > 0) {
      mockDataList = suggestedIds.map(id => ragDatabase.find(l => l.id === id)).filter(Boolean) as LocationKnowledgeDTO[];
    }
    
    if (mockDataList.length > 0) {
      addLog('ACT (Scheduler Agent)', `Đã tìm thấy ${mockDataList.length} địa điểm phù hợp từ RAG.`);
      setPendingSuggestion({ 
        intent: 'multi_suggest', 
        options: mockDataList,
        selectedIds: [],
        targetDayIndex: dayIndex || 0
      });
    } else {
      addLog('System', `Không tìm thấy gợi ý phù hợp trong RAG.`);
    }
    setChatContext(null);
  };

  const processHotelChange = async (text?: string) => {
    addLog('THINK (Logistics Agent)', `Đang truy vấn cơ sở dữ liệu để tìm các khách sạn khác...`);
    await new Promise(r => setTimeout(r, 800));
    
    let otherHotels = ragDatabase.filter(l => l.type === 'hotel' && l.id !== hotel?.id);
    
    // Phân tích Intent sơ bộ để sort (tốt hơn/đắt hơn vs rẻ hơn/bình dân)
    if (text) {
      if (text.includes('rẻ') || text.includes('tiết kiệm') || text.includes('bình dân')) {
        otherHotels.sort((a, b) => (a.avgCost || 0) - (b.avgCost || 0)); // Rẻ nhất lên đầu
      } else if (text.includes('tốt') || text.includes('sang') || text.includes('xịn') || text.includes('đẹp')) {
        otherHotels.sort((a, b) => (b.avgCost || 0) - (a.avgCost || 0)); // Đắt nhất lên đầu
      } else {
        otherHotels.sort(() => Math.random() - 0.5);
      }
    } else {
      otherHotels.sort(() => Math.random() - 0.5);
    }
    if (otherHotels.length > 0) {
      // Show up to 20 alternative hotels
      const options = otherHotels.slice(0, 20).map(h => ({
        ...h,
        savings: ((hotel?.avgCost || 0) - (h.avgCost || 0)) * days * hotelRoomsGlobal
      }));
      
      addLog('ACT (Logistics Agent)', `Tìm thấy ${options.length} lựa chọn thay thế. Vui lòng chọn khách sạn bạn muốn.`);
      
      setPendingSuggestion({
        intent: 'change_hotel_list',
        options: options
      });
    } else {
      addLog('System', `Không tìm thấy khách sạn nào khác trong cơ sở dữ liệu.`);
    }
  };

  const processBudgetCut = async () => {
    addLog('THINK (Budget Agent)', `Đang kiểm toán toàn bộ chi phí các điểm đến...`);
    await new Promise(r => setTimeout(r, 800));

    if (!activeItinerary) return;

    let allActs: any[] = [];
    activeItinerary.forEach((day, dIdx) => {
      day.activities.forEach((act, aIdx) => {
        if (!act.canceled) {
          const loc = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
          if (loc) {
            allActs.push({
              id: loc.id,
              name: loc.name,
              totalCost: ((loc.ticketPrice || 0) + (loc.avgCost || 0)) * numPeople,
              dayIdx: dIdx,
              actIdx: aIdx
            });
          }
        }
      });
    });

    allActs.sort((a, b) => b.totalCost - a.totalCost);
    const toRemove = allActs.slice(0, 2);
    const savedAmount = toRemove.reduce((sum, a) => sum + a.totalCost, 0);

    if (toRemove.length > 0) {
      setPendingBudgetCut({
        allCosts: allActs,
        toRemove: toRemove,
        savedAmount: savedAmount
      });
      addLog('ACT (Budget Agent)', `Để tối ưu ngân sách, tôi đề xuất gạch bỏ ${toRemove.length} điểm tốn kém nhất: ${toRemove.map(a => a.name).join(', ')} (Tiết kiệm ${savedAmount.toLocaleString()}đ). Bạn có đồng ý cắt giảm không? (Gõ "ok" hoặc "đồng ý")`);
    } else {
      addLog('System', 'Lịch trình hiện tại không có điểm nào phát sinh chi phí để cắt giảm thêm.');
    }
  };

  const processTransportCost = async (text: string) => {
    addLog('THINK (Budget Agent)', `Đang phân tích yêu cầu phương tiện di chuyển...`);
    await new Promise(r => setTimeout(r, 600));
    
    let newType = transportInfo.type;
    let newHybrid = false;
    
    if (text.includes('kết hợp') && text.includes('đi bộ')) {
      newHybrid = true;
      if (text.includes('thuê') && text.includes('7')) newType = 'rent_7';
      else if (text.includes('thuê') || text.includes('oto') || text.includes('ô tô') || text.includes('xe hơi')) newType = 'rent_4';
      else if (text.includes('grab') || text.includes('taxi')) newType = 'grab';
      else if (text.includes('xăng') || text.includes('cá nhân') || text.includes('xe máy') || text.includes('đi xe')) newType = 'personal';
      else if (newType === 'walk') newType = 'personal'; // default vehicle for hybrid if currently pure walk
    } else {
      if (text.includes('thuê') && text.includes('7')) newType = 'rent_7';
      else if (text.includes('thuê') || text.includes('oto') || text.includes('ô tô') || text.includes('xe hơi')) newType = 'rent_4';
      else if (text.includes('grab') || text.includes('taxi')) newType = 'grab';
      else if (text.includes('đi bộ') || text.includes('cuốc bộ')) newType = 'walk';
      else if (text.includes('xăng') || text.includes('cá nhân') || text.includes('xe máy')) newType = 'personal';
    }
    
    if (newType !== transportInfo.type || newHybrid !== transportInfo.isHybridWalk) {
       setTransportInfo(prev => ({ ...prev, type: newType, isHybridWalk: newHybrid }));
       const typeStr = newType === 'walk' ? 'Đi bộ' : newType === 'grab' ? 'Grab' : newType.includes('rent') ? 'Thuê xe ô tô' : 'Xe cá nhân';
       addLog('ACT (Budget Agent)', `Đã cập nhật phương tiện thành: ${newHybrid ? 'Kết hợp Đi bộ & ' + typeStr : typeStr}. Đang tính toán lại chi phí trên toàn tuyến...`);
    } else {
       addLog('ACT (Budget Agent)', `Đang tính toán chi phí hiện tại...`);
    }
    await new Promise(r => setTimeout(r, 600));
    
    let totalDist = 0;
    let totalWalkedDist = 0;
    let totalDrivenDist = 0;
    if (activeItinerary) {
      activeItinerary.forEach(day => {
        let currentLoc = hotel;
        day.activities.forEach(act => {
          if (!act.canceled) {
            const loc = (locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id)) as LocationKnowledgeDTO;
            if (loc && currentLoc) {
              const dist = getDistance(currentLoc.lat, currentLoc.lng, loc.lat, loc.lng);
              totalDist += dist;
              if (newHybrid && dist <= 1.5) {
                totalWalkedDist += dist;
              } else {
                totalDrivenDist += dist;
              }
              currentLoc = loc;
            }
          }
        });
        if (currentLoc && hotel) {
          const dist = getDistance(currentLoc.lat, currentLoc.lng, hotel.lat, hotel.lng);
          totalDist += dist;
          if (newHybrid && dist <= 1.5) {
            totalWalkedDist += dist;
          } else {
            totalDrivenDist += dist;
          }
        }
      });
    }

    if (!newHybrid) {
      totalDrivenDist = newType === 'walk' ? 0 : totalDist;
      totalWalkedDist = newType === 'walk' ? totalDist : 0;
    }

    let costStr = '';
    const { rent_car, grab, personal } = ragTransport;
    const gasCostCar = totalDrivenDist * personal.car_price_per_km;
    const gasCostMoto = totalDrivenDist * personal.motorbike_price_per_km;
    
    let walkStr = newHybrid && totalWalkedDist > 0 ? ` Tiết kiệm được ${totalWalkedDist.toFixed(1)}km đi bộ.` : '';

    if (newType === 'grab_car' && !newHybrid) {
      const v = getOptimalVehicles(newType, numPeople);
      costStr = `Dự kiến đi Grab Taxi tổng quãng đường ${totalDist.toFixed(1)}km x ${v.desc}: khoảng ${Math.round(totalDist * grab.car_price_per_km * v.count).toLocaleString()}đ`;
    } else if (newType === 'grab_motorbike' && !newHybrid) {
      const v = getOptimalVehicles(newType, numPeople);
      costStr = `Dự kiến đi Grab Xe Máy tổng quãng đường ${totalDist.toFixed(1)}km x ${v.desc}: khoảng ${Math.round(totalDist * grab.motorbike_price_per_km * v.count).toLocaleString()}đ`;
    } else if (newType === 'walk') {
      costStr = `Đi bộ: Tổng quãng đường ${totalWalkedDist.toFixed(1)}km. Hoàn toàn miễn phí, rèn luyện sức khỏe và không phát thải CO2! 🌱`;
    } else if (newType === 'rent_car') {
      const v = getOptimalVehicles(newType, numPeople);
      const rentFee7 = Math.floor(numPeople/7) * rent_car["7_seater"];
      const rentFee4 = Math.ceil((numPeople%7)/4) * rent_car["4_seater"];
      const totalRentFee = (rentFee7 + rentFee4) * days;
      costStr = `Thuê xe (${v.desc}): ${totalRentFee.toLocaleString()}đ/${days} ngày. Xăng cho ${totalDrivenDist.toFixed(1)}km: ${Math.round(gasCostCar * v.count).toLocaleString()}đ. Tổng: ${Math.round(totalRentFee + gasCostCar * v.count).toLocaleString()}đ.${walkStr}`;
    } else if (newType === 'rent_motorbike') {
      const v = getOptimalVehicles(newType, numPeople);
      const rentFee = v.count * ragTransport.rent_motorbike.price_per_day * days;
      costStr = `Thuê xe máy (${v.desc}): ${rentFee.toLocaleString()}đ/${days} ngày. Xăng cho ${totalDrivenDist.toFixed(1)}km: ${Math.round(gasCostMoto * v.count).toLocaleString()}đ. Tổng: ${Math.round(rentFee + gasCostMoto * v.count).toLocaleString()}đ.${walkStr}`;
    } else if (newType === 'personal_car') {
      const v = getOptimalVehicles(newType, numPeople);
      costStr = `${newHybrid ? 'Kết hợp đi bộ và ' : ''}Xe ô tô cá nhân (${v.desc}): Quãng đường ${totalDrivenDist.toFixed(1)}km, ước tính tiền xăng ${Math.round(gasCostCar * v.count).toLocaleString()}đ.${walkStr}`;
    } else {
      // personal_motorbike
      const v = getOptimalVehicles(newType, numPeople);
      costStr = `${newHybrid ? 'Kết hợp đi bộ và ' : ''}Xe máy cá nhân (${v.desc}): Quãng đường ${totalDrivenDist.toFixed(1)}km, ước tính tiền xăng ${Math.round(gasCostMoto * v.count).toLocaleString()}đ.${walkStr}`;
    }
    
    addLog('Budget Auditor', `✅ BÁO CÁO CHI PHÍ DI CHUYỂN:\n${costStr}`);
  };

  const acceptHotelListOption = (selectedHotel: any) => {
      const newLocations = [...locations];
      const hotelIdx = newLocations.findIndex(l => l.type === 'hotel');
      if (hotelIdx >= 0) {
        newLocations[hotelIdx] = selectedHotel;
      } else {
        newLocations.unshift(selectedHotel);
      }
      setLocations(newLocations);
      
      addLog('System', `User đã CHỌN đổi khách sạn sang ${selectedHotel.name}. Đang tính toán lại đường đi...`);
      setPendingSuggestion(null);
      handleOptimizeRoute(selectedHotel, newLocations);
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || pendingSuggestion) return;
    
    const userText = chatInput.trim();
    addLog('User', userText);
    setChatInput('');

    let lowerText = userText.toLowerCase();

    if (lowerText === 'help' || lowerText === 'giúp đỡ' || lowerText === '/help' || lowerText === '/giupdo' || lowerText === 'giupdo') {
      addLog('System', `📘 DANH SÁCH LỆNH & TÍNH NĂNG:
- "sắp xếp lại" / "tối ưu": Tối ưu đường đi từng ngày.
- "sắp xếp lại toàn bộ": Quy hoạch lại tất cả các ngày.
- "đổi khách sạn": Liệt kê các khách sạn để chọn.
- "tìm chỗ ăn / hải sản / quán cafe": Tìm nhà hàng/quán nước.
- "đi dạo / miễn phí": Tìm các địa điểm không tốn vé.
- "thêm địa danh": Gợi ý ngẫu nhiên điểm tham quan.
(Budget Agent sẽ tự động gợi ý đổi khách sạn nếu ngân sách ÂM!)`);
      return;
    }

    // If waiting for opt level
    if (optLevelContext) {
      setOptLevelContext(false);
      let level = '';
      if (['hết cỡ', 'hết mức', 'cao nhất'].some(k => lowerText.includes(k))) level = 'max';
      else if (['bình thường', 'vừa phải'].some(k => lowerText.includes(k))) level = 'normal';
      else if (['nhẹ nhàng', 'ít', 'thấp'].some(k => lowerText.includes(k))) level = 'light';
      
      if (!level) {
        addLog('System', `Không nhận diện được mức độ tối ưu. Hệ thống sẽ tự động xếp ở mức BÌNH THƯỜNG.`);
        level = 'normal';
      }
      
      addLog('System', `Đã chọn mức tối ưu: ${level === 'max' ? 'HẾT CỠ' : level === 'normal' ? 'BÌNH THƯỜNG' : 'NHẸ NHÀNG'}. Đang tiến hành...`);
      
      if (level === 'max') {
        handleFullOptimize();
        processTransportCost('kết hợp đi bộ ' + lowerText);
      } else if (level === 'normal') {
        handleFullOptimize();
        processTransportCost(lowerText);
      } else if (level === 'light') {
        processTransportCost(lowerText);
      }
      return;
    }

    // If waiting for time input
    if (chatContext) {
      const lower = userText.toLowerCase();
      // NLP extract day
      let dayIndex = -1;
      if (lower.includes('ngày 1') || lower.includes('ngay 1')) dayIndex = 0;
      else if (lower.includes('ngày 2') || lower.includes('ngay 2')) dayIndex = 1;
      else if (lower.includes('ngày 3') || lower.includes('ngay 3')) dayIndex = 2;
      else if (lower.includes('ngày 4') || lower.includes('ngay 4')) dayIndex = 3;
      else if (lower.includes('ngày 5') || lower.includes('ngay 5')) dayIndex = 4;
      
      // NLP extract time
      let timeStr = '';
      const timeMatch = lower.match(/(\d{1,2})(h|:| )/);
      if (timeMatch) timeStr = `${timeMatch[1].padStart(2, '0')}:00`;
      else if (lower.includes('sáng')) timeStr = '08:00';
      else if (lower.includes('trưa')) timeStr = '12:00';
      else if (lower.includes('chiều')) timeStr = '14:00';
      else if (lower.includes('tối')) timeStr = '19:00';

      if (dayIndex === -1 || timeStr === '') {
        addLog('System', `Không thể trích xuất Ngày/Giờ từ chuỗi "${userText}". Đang chuyển cho AI Agent phân tích ngữ nghĩa...`);
        try {
          const maxDays = activeItinerary ? activeItinerary.length : days;
          const result = await parseTimeIntent(userText, maxDays);
          dayIndex = result.dayIndex;
          timeStr = result.timeStr;
          
          if (dayIndex === -1) {
            let minActs = Infinity;
            let bestDay = 0;
            if (activeItinerary) {
              activeItinerary.forEach((day, idx) => {
                const validActs = day.activities.filter(a => !a.canceled).length;
                if (validActs < minActs) {
                  minActs = validActs;
                  bestDay = idx;
                }
              });
            }
            dayIndex = bestDay;
            addLog('Scheduler Agent', `Đã tìm thấy Ngày ${dayIndex + 1} đang trống lịch nhất. Tôi sẽ tự động xếp vào ngày này nhé!`);
          } else {
            addLog('Language Agent', `Phân tích thành công: Ngày ${dayIndex + 1}, lúc ${timeStr}`);
          }
        } catch (error) {
          addLog('System', `Lỗi kết nối AI. Sử dụng mặc định: Ngày 1 lúc 19:00.`);
          dayIndex = 0;
          timeStr = '19:00';
        }
      }

      addLog('System', `Ghi nhận thời gian: Ngày ${dayIndex + 1}, lúc ${timeStr}. Đang chèn vào lịch trình...`);
      await processSuggestion(chatContext.intent, dayIndex, timeStr, (chatContext as any).query);
      return;
    }

    if (pendingBudgetCut) {
      if (['ok', 'đồng ý', 'yes', 'cắt', 'tiến hành', 'duyệt', 'được'].some(k => lowerText.includes(k))) {
        // Execute budget cut
        addLog('Budget Auditor', `Xác nhận ĐỒNG Ý. Đang tiến hành hủy ${pendingBudgetCut.toRemove.length} địa điểm khỏi lịch trình...`);
        const newIti = [...(activeItinerary || [])];
        pendingBudgetCut.toRemove.forEach(rem => {
          if (newIti[rem.dayIdx] && newIti[rem.dayIdx].activities[rem.actIdx]) {
            newIti[rem.dayIdx].activities[rem.actIdx].canceled = true;
            newIti[rem.dayIdx].activities[rem.actIdx].reason = 'Đã hủy do thiếu ngân sách';
          }
        });
        setActiveItinerary(newIti);
        setPendingBudgetCut(null);
        addLog('System', `Đã cắt giảm thành công. Bạn tiết kiệm được ${pendingBudgetCut.savedAmount.toLocaleString()}đ! Vui lòng kiểm tra lại ngân sách.`);
        return;
      } else {
        addLog('Budget Auditor', `Đã hủy bỏ lệnh cắt giảm ngân sách theo yêu cầu của bạn.`);
        setPendingBudgetCut(null);
        return;
      }
    }

    // Simulate Agent Thinking
    await new Promise(r => setTimeout(r, 500));
    addLog('THINK (Orchestrator)', `Phân tích ý định (Intent Analysis).`);
    
    let intent = '';
    let level = '';
    let newBudget = 0;
    
    addLog('LLM Processing', `Đang gọi AI Agent phân tích ngữ nghĩa...`);
    try {
      const aiResult = await analyzeStep5Intent(userText);
      intent = aiResult.intent;
      if (aiResult.level) level = aiResult.level;
      if (aiResult.newBudget) newBudget = aiResult.newBudget;
      
      if (intent && intent !== 'unknown') {
        addLog('LLM Processing', `AI Agent chẩn đoán ý định: [${intent}]`);
      } else {
        intent = '';
      }
    } catch (e) {
      console.error('AI Intent Error', e);
      intent = 'unknown';
    }

    if (intent === 'update_budget') {
      addLog('Orchestrator', `Function Calling: update_budget()`);
      if (newBudget) {
        setCurrentBudget(newBudget);
        addLog('System', `✅ Đã cập nhật ngân sách thành: ${newBudget.toLocaleString()}đ. Các Agent đang tự động kiểm toán lại tính an toàn của lộ trình...`);
        return;
      } else {
        let nBudget = currentBudget;
        const match = lowerText.match(/\d+/);
        if (match) {
          nBudget = parseInt(match[0], 10);
          if (lowerText.includes('triệu') || lowerText.includes('tr')) nBudget *= 1000000;
          else if (lowerText.includes('k') || lowerText.includes('ngàn')) nBudget *= 1000;
          setCurrentBudget(nBudget);
          addLog('System', `✅ Đã cập nhật ngân sách thành: ${nBudget.toLocaleString()}đ. Các Agent đang tự động kiểm toán lại tính an toàn của lộ trình...`);
        } else {
          addLog('System', `Vui lòng nhập rõ con số ngân sách bạn muốn thay đổi (Ví dụ: 'tăng ngân sách lên 5 triệu').`);
        }
        return;
      }
    }

    if (intent === 'cut_budget') {
      addLog('Orchestrator', `Function Calling: audit_and_cut_budget()`);
      processBudgetCut();
      return;
    }

    if (intent === 'opt_transport_cost') {
      if (!level) {
        setOptLevelContext(true);
        addLog('System', `Bạn muốn tối ưu chi phí ở mức độ nào?
🟢 **Nhẹ nhàng:** Giữ nguyên lịch trình, chỉ kiểm toán lại chi phí.
🟡 **Bình thường:** Sắp xếp lại tuyến đường cho ngắn nhất, giữ phương tiện.
🔴 **Hết cỡ:** Sắp xếp lại tuyến đường + Tự động Đi bộ ở điểm gần & Xe ở điểm xa.
💡 Phương tiện hiện tại là ${transportInfo.type === 'walk' ? 'Đi bộ' : transportInfo.type.includes('grab') ? 'Grab' : transportInfo.type.includes('rent') ? 'Thuê xe' : 'Xe cá nhân'}. (Nếu muốn đổi, hãy gõ kèm tên phương tiện, VD: 'Tối ưu hết cỡ bằng Grab').`);
        return;
      } else {
        addLog('System', `Đã nhận lệnh tối ưu: ${level === 'max' ? 'HẾT CỠ' : level === 'normal' ? 'BÌNH THƯỜNG' : 'NHẸ NHÀNG'}. Đang tiến hành...`);
        if (level === 'max') {
          handleOptimizeRoute();
          processTransportCost('kết hợp đi bộ ' + lowerText);
        } else if (level === 'normal') {
          handleOptimizeRoute();
          processTransportCost(lowerText);
        } else if (level === 'light') {
          processTransportCost(lowerText);
        }
        return;
      }
    }

    if (intent === 'suggest_budget') {
      addLog('Orchestrator', `Function Calling: suggest_optimal_budget()`);
      await new Promise(r => setTimeout(r, 600));
      let totalAttrCost = 0;
      if (activeItinerary) {
        activeItinerary.forEach(day => {
          day.activities.forEach(act => {
            if (!act.canceled) {
              const loc = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
              if (loc) totalAttrCost += (loc.ticketPrice || 0) + (loc.avgCost || 0);
            }
          });
        });
      }
      const hotelCost = hotel ? (hotel.avgCost || 0) * days : 0;
      const recommended = (totalAttrCost + hotelCost) * 1.2 + 500000;
      addLog('Budget Auditor', `Dựa trên Lịch trình hiện tại (Chi phí cứng: ${(totalAttrCost + hotelCost).toLocaleString()}đ chưa tính di chuyển). Mức ngân sách an toàn gợi ý là: ${Math.ceil(recommended/100000)*100000}đ (Đã bao gồm 20% dự phòng rủi ro).`);
      return;
    }

    if (intent === 'transport_cost') {
      addLog('Orchestrator', `Function Calling: calculate_transport_cost()`);
      processTransportCost(lowerText);
      return;
    }

    if (intent === 'optimize_full') {
      addLog('Orchestrator', `Function Calling: optimize_full_itinerary()`);
      handleFullOptimize();
      return;
    }

    if (intent === 'optimize_day') {
      addLog('Orchestrator', `Function Calling: optimize_day_routing()`);
      handleOptimizeRoute();
      return;
    }

    if (intent === 'change_hotel') {
      addLog('Orchestrator', `Function Calling: search_alternative_hotels()`);
      processHotelChange(lowerText);
      return;
    }

    if (['food', 'cafe', 'shopping', 'explore', 'free'].includes(intent)) {
      addLog('Orchestrator', `Function Calling: search_places({ intent: '${intent}' })`);
      addLog('Scheduler Agent', `Bạn muốn tôi chèn lịch trình này vào Ngày thứ mấy và Lúc mấy giờ? (VD: "Ngày 2 lúc 19h" hoặc "tùy ý")`);
      setChatContext({ intent, query: userText } as any);
      return;
    }

    addLog('System', `LLM Processing: Tôi chưa hiểu rõ ý bạn. Bạn có thể thử các từ khoá: "ăn hải sản", "đi cafe", "đổi khách sạn", "miễn phí", "tối ưu", "cắt giảm"...`);
  };

  const acceptSuggestion = () => {
    if (!pendingSuggestion) return;
    
    if (pendingSuggestion.intent === 'change_hotel') {
      const newLocations = [...locations];
      const newHotel = pendingSuggestion as LocationKnowledgeDTO;
      // Replace hotel which is typically at index 0
      const hotelIdx = newLocations.findIndex(l => l.type === 'hotel');
      if (hotelIdx >= 0) {
        newLocations[hotelIdx] = newHotel;
      } else {
        newLocations.unshift(newHotel);
      }
      setLocations(newLocations);
      
      addLog('System', `User đã ĐỒNG Ý đổi khách sạn sang ${newHotel.name}. Đang tính toán lại đường đi...`);
      setPendingSuggestion(null);
      
      handleOptimizeRoute(newHotel, newLocations);
      return;
    }

    setLocations(prev => [...prev, pendingSuggestion]);

    if (activeItinerary && activeItinerary.length > 0) {
      const newIti = [...activeItinerary];
      const targetDayIndex = Math.min(pendingSuggestion.targetDayIndex, newIti.length - 1);
      
      const targetDay = { ...newIti[targetDayIndex] };
      targetDay.activities = [...targetDay.activities];
      
      targetDay.activities.push({
        id: pendingSuggestion.id,
        startTime: pendingSuggestion.startTime || "08:00",
        endTime: pendingSuggestion.endTime || "10:00",
        reason: 'Lựa chọn bổ sung do AI gợi ý (User xác nhận).'
      });
      
      targetDay.activities = recalculateTimes(targetDay.activities);
      newIti[targetDayIndex] = targetDay;
      
      setActiveItinerary(newIti);
    }

    addLog('System', `User đã ĐỒNG Ý. Đã thêm ${pendingSuggestion.name} vào lộ trình Ngày ${pendingSuggestion.targetDayIndex + 1} lúc ${pendingSuggestion.startTime}.`);
    setPendingSuggestion(null);
  };

  const declineSuggestion = () => {
    addLog('System', `User TỪ CHỐI gợi ý: ${pendingSuggestion?.name}.`);
    setPendingSuggestion(null);
  };

  const [selectedLocId, setSelectedLocId] = useState<string | null>(null);

  const displayedLocations = useMemo(() => {
    if (!selectedLocId) return locations;
    const hotel = locations.find(l => l.type === 'hotel');
    const target = locations.find(l => l.id === selectedLocId) || ragDatabase.find(l => l.id === selectedLocId);
    
    if (!hotel || !target || hotel.id === target.id) return locations;

    let prevLocForMap = hotel;
    
    if (activeItinerary) {
      for (const day of activeItinerary) {
        const idx = day.activities.findIndex(a => a.id === selectedLocId);
        if (idx > 0) {
           const currAct = day.activities[idx];
           const prevAct = day.activities[idx - 1];
           const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
           const gap = parseTime(currAct.startTime) - parseTime(prevAct.endTime);
           
           if (gap <= 60 && gap >= 0) {
             const prevData = locations.find(l => l.id === prevAct.id) || ragDatabase.find(l => l.id === prevAct.id);
             if (prevData) {
               prevLocForMap = prevData as LocationKnowledgeDTO;
             }
           }
        }
        if (idx !== -1) break;
      }
    }

    return [prevLocForMap, target as LocationKnowledgeDTO];
  }, [selectedLocId, locations, activeItinerary]);

  const mapCenter = useMemo(() => {
    if (selectedLocId) {
      const target = locations.find(l => l.id === selectedLocId) || ragDatabase.find(l => l.id === selectedLocId);
      if (target) return { lat: target.lat, lng: target.lng };
    }
    if (displayedLocations.length > 0) return { lat: displayedLocations[0].lat, lng: displayedLocations[0].lng };
    return { lat: 13.7634, lng: 109.2235 };
  }, [displayedLocations, selectedLocId, locations]);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden font-sans">
      <header className="p-4 bg-[#111] border-b border-[#333] shadow-md flex justify-between items-center z-10 shrink-0">
        <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan to-blue-500">ViVuAgent HQ</h1>
        <div className="flex gap-4">
          <div className="px-4 py-1 rounded-full bg-green-900/30 text-green-400 border border-green-800 text-sm font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Multi-Agent Active
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-hidden">
        
        {/* Left Column: Itinerary & Budget */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-full overflow-hidden">
          <div className="bg-[#111] rounded-xl border border-[#222] p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-[#222] pb-2 sticky top-0 bg-[#111] z-10">
              <h3 className="text-neon-cyan font-bold flex items-center gap-2 uppercase tracking-wider text-sm">
                📅 Timeline Agent (Lịch Trình)
              </h3>
              <div className="flex gap-2">
                <button onClick={() => handleOptimizeRoute()} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 text-xs font-bold rounded shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-colors flex items-center gap-1">
                  <span>✨</span> Tối ưu
                </button>
                <button onClick={() => setShowCustomModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 text-xs font-bold rounded shadow-[0_0_10px_rgba(37,99,235,0.5)] transition-colors">
                  Chỉnh lịch
                </button>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap mb-3">
              {/* Transport Mode Badge */}
              {(() => {
                const t = transportInfo.type;
                const hybrid = transportInfo.isHybridWalk;
                const icon = t === 'walk' ? '🚶‍♂️' : t === 'grab' ? '🚕' : t === 'rent_4' ? '🚙' : t === 'rent_7' ? '🚙' : '🛵';
                const label = t === 'walk' ? 'Đi bộ'
                  : t === 'grab' ? 'Xe Grab'
                  : t === 'rent_4' ? 'Xe thuê 4 chỗ'
                  : t === 'rent_7' ? 'Xe thuê 7 chỗ'
                  : 'Xe cá nhân';
                const fullLabel = hybrid ? `Kết hợp: ${label} + Đi bộ (< 1.5km)` : label;
                const color = t === 'walk' ? 'text-green-400 border-green-800 bg-green-900/20'
                  : t === 'grab' ? 'text-yellow-400 border-yellow-800 bg-yellow-900/20'
                  : t.includes('rent') ? 'text-blue-400 border-blue-800 bg-blue-900/20'
                  : 'text-purple-400 border-purple-800 bg-purple-900/20';
                return (
                  <div className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border w-fit ${color}`}>
                    <span>{icon}</span>
                    <span>Phương tiện: {fullLabel}</span>
                  </div>
                );
              })()}

              {/* Weather Badge */}
              <div className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border w-fit text-cyan-400 border-cyan-800 bg-cyan-900/20">
                <span>{weather === 'Sunny' ? '☀️' : weather === 'Rainy' ? '🌧️' : weather === 'Storm' ? '⛈️' : '☁️'}</span>
                <span>Thời tiết: {weather === 'Sunny' ? 'Nắng đẹp' : weather === 'Rainy' ? 'Mưa nhẹ' : weather === 'Storm' ? 'Bão/Gió lớn' : weather}</span>
              </div>
            </div>

            <div className="flex justify-between items-center bg-[#1a1a1a] p-3 rounded-xl border border-[#333] shadow-md mt-4">
              <div className="text-gray-400 font-medium flex items-center gap-2">
                <span className="text-xl">💰</span> Ngân sách: 
              </div>
              <span className="text-white font-bold">{currentBudget.toLocaleString()}đ</span>
            </div>

            <p className="text-xs text-gray-500 mb-4 italic shrink-0">Bấm vào từng địa điểm để xem đường đi từ Khách sạn đến đó.</p>
            <div className="space-y-6 flex-1 pr-2 pb-10">
              {activeItinerary && activeItinerary.length > 0 ? (
                activeItinerary.map((day, dIdx) => {
                  let dailyDrivenDist = 0;
                  let dailyWalkedDist = 0;
                  
                  const dailyAttrCost = day.activities.reduce((sum, act, aIdx) => {
                    if (act.canceled) return sum;
                    const loc = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
                    
                    let prevLocData = null;
                    if (aIdx === 0) {
                      prevLocData = hotel;
                    } else {
                      const prevAct = day.activities[aIdx - 1];
                      const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                      const gap = parseTime(act.startTime) - parseTime(prevAct.endTime);
                      
                      if (gap <= 60 && gap >= 0) {
                        prevLocData = locations.find(l => l.id === prevAct.id) || ragDatabase.find(l => l.id === prevAct.id);
                      } else {
                        prevLocData = hotel;
                      }
                    }
                    if (prevLocData && loc) {
                      const dist = getDistance(prevLocData.lat, prevLocData.lng, loc.lat, loc.lng);
                      if (transportInfo.isHybridWalk && dist <= 1.5) {
                        dailyWalkedDist += dist;
                      } else if (transportInfo.type === 'walk') {
                        dailyWalkedDist += dist;
                      } else {
                        dailyDrivenDist += dist;
                      }
                    }
                    
                    if (loc) return sum + ((loc.ticketPrice || 0) + (loc.avgCost || 0)) * numPeople;
                    return sum;
                  }, 0);
                  
                  let returnDist = 0;
                  let returnLocName = '';
                  const lastAct = day.activities.slice().reverse().find(a => !a.canceled);
                  if (lastAct && hotel) {
                    const lastLoc = locations.find(l => l.id === lastAct.id) || ragDatabase.find(l => l.id === lastAct.id);
                    if (lastLoc) {
                       returnLocName = lastLoc.name;
                       const dist = getDistance(lastLoc.lat, lastLoc.lng, hotel.lat, hotel.lng);
                       returnDist = dist;
                       if (transportInfo.isHybridWalk && dist <= 1.5) dailyWalkedDist += dist;
                       else if (transportInfo.type === 'walk') dailyWalkedDist += dist;
                       else dailyDrivenDist += dist;
                    }
                  }
                  
                  const hotelRooms = Math.ceil(numPeople / 4);
                  const dailyHotelCost = hotel ? (hotel.avgCost || 0) * hotelRooms : 0;
                  
                  let dailyTransportCost = 0;
                  let transportLabel: React.ReactNode = null;
                  const gasCostCar = dailyDrivenDist > 0 ? dailyDrivenDist * ragTransport.personal.car_price_per_km : 0;
                  const gasCostMoto = dailyDrivenDist > 0 ? dailyDrivenDist * ragTransport.personal.motorbike_price_per_km : 0;
                  const walkLabel = (transportInfo.isHybridWalk && dailyWalkedDist > 0) ? <div className="text-green-400">Đi bộ kết hợp ({dailyWalkedDist.toFixed(1)}km): Miễn phí 🌱</div> : null;

                  if (transportInfo.type === 'walk') {
                     dailyTransportCost = 0;
                     transportLabel = <span>Đi bộ ({dailyWalkedDist.toFixed(1)}km): Miễn phí 🌱</span>;
                  } else if (transportInfo.type === 'grab_car') {
                     const v = getOptimalVehicles(transportInfo.type, numPeople);
                     dailyTransportCost = Math.round(dailyDrivenDist * ragTransport.grab.car_price_per_km) * v.count;
                     transportLabel = (
                       <>
                         <div>Grab Taxi ({dailyDrivenDist.toFixed(1)}km, {v.desc}): {Math.round(dailyTransportCost).toLocaleString()}đ</div>
                         {walkLabel}
                       </>
                     );
                  } else if (transportInfo.type === 'grab_motorbike') {
                     const v = getOptimalVehicles(transportInfo.type, numPeople);
                     dailyTransportCost = Math.round(dailyDrivenDist * ragTransport.grab.motorbike_price_per_km) * v.count;
                     transportLabel = (
                       <>
                         <div>Grab Xe Máy ({dailyDrivenDist.toFixed(1)}km, {v.desc}): {Math.round(dailyTransportCost).toLocaleString()}đ</div>
                         {walkLabel}
                       </>
                     );
                  } else if (transportInfo.type === 'rent_car') {
                     const v = getOptimalVehicles(transportInfo.type, numPeople);
                     const rentFee7 = Math.floor(numPeople/7) * ragTransport.rent_car["7_seater"];
                     const rentFee4 = Math.ceil((numPeople % 7) / 4) * ragTransport.rent_car["4_seater"];
                     const totalRentFee = rentFee7 + rentFee4;
                     dailyTransportCost = totalRentFee + Math.round(gasCostCar) * v.count;
                     transportLabel = (
                       <>
                         <div>Thuê xe ({v.desc}): {totalRentFee.toLocaleString()}đ/ngày</div>
                         <div>Tiền xăng ({dailyDrivenDist.toFixed(1)}km, {v.desc}): {Math.round(gasCostCar * v.count).toLocaleString()}đ</div>
                         {walkLabel}
                       </>
                     );
                  } else if (transportInfo.type === 'rent_motorbike') {
                     const v = getOptimalVehicles(transportInfo.type, numPeople);
                     const rentFee = v.count * ragTransport.rent_motorbike.price_per_day;
                     dailyTransportCost = rentFee + Math.round(gasCostMoto) * v.count;
                     transportLabel = (
                       <>
                         <div>Thuê {v.desc}: {rentFee.toLocaleString()}đ/ngày</div>
                         <div>Tiền xăng ({dailyDrivenDist.toFixed(1)}km): {Math.round(gasCostMoto * v.count).toLocaleString()}đ</div>
                         {walkLabel}
                       </>
                     );
                  } else if (transportInfo.type === 'personal_car') {
                     const v = getOptimalVehicles(transportInfo.type, numPeople);
                     dailyTransportCost = Math.round(gasCostCar) * v.count;
                     transportLabel = (
                       <>
                         <div>Xe tự túc (Xăng cho {dailyDrivenDist.toFixed(1)}km, {v.desc}): {Math.round(dailyTransportCost).toLocaleString()}đ</div>
                         {walkLabel}
                       </>
                     );
                  } else {
                     // personal_motorbike (default)
                     const v = getOptimalVehicles(transportInfo.type, numPeople);
                     dailyTransportCost = Math.round(gasCostMoto) * v.count;
                     transportLabel = (
                       <>
                         <div>Xe máy tự túc (Xăng cho {dailyDrivenDist.toFixed(1)}km, {v.desc}): {Math.round(dailyTransportCost).toLocaleString()}đ</div>
                         {walkLabel}
                       </>
                     );
                  }

                  const totalDailyCost = dailyAttrCost + dailyHotelCost + dailyTransportCost;

                  return (
                  <div key={dIdx} className="relative mb-6">
                    <div className="sticky top-10 bg-[#111] py-2 font-black text-gray-300 border-b border-[#333] mb-4 z-10 shadow-md">
                      NGÀY {day.date}
                    </div>
                    <div className="absolute left-[15px] top-12 bottom-0 w-0.5 bg-[#333] -z-10"></div>
                    <div className="space-y-4">
                      {day.activities.map((act, aIdx) => {
                        const locData = locations.find(l => l.id === act.id) || ragDatabase.find(l => l.id === act.id);
                        if (!locData) return null;
                        
                        let prevLocData = null;
                        if (aIdx === 0) {
                          prevLocData = hotel;
                        } else {
                          let prevAct = null;
                          for (let i = aIdx - 1; i >= 0; i--) {
                            if (!day.activities[i].canceled) {
                              prevAct = day.activities[i];
                              break;
                            }
                          }
                          
                          if (!prevAct) {
                            prevLocData = hotel;
                          } else {
                            const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                            const gap = parseTime(act.startTime) - parseTime(prevAct.endTime);
                            
                            if (gap <= 60 && gap >= 0) {
                              prevLocData = locations.find(l => l.id === prevAct.id) || ragDatabase.find(l => l.id === prevAct.id);
                            } else {
                              prevLocData = hotel;
                            }
                          }
                        }
                        
                        let distanceStr = '';
                        let transportIcon = '🚗';
                        let segmentCostStr = '';
                        let segmentTransportCostNum = 0;
                        let walkNote: React.ReactNode = null;

                        if (prevLocData && locData) {
                          const dist = getDistance(prevLocData.lat, prevLocData.lng, locData.lat, locData.lng);
                          // Walking speed: 5 km/h => 12 min/km
                          const WALK_SPEED_KMH = 5;
                          
                          let isWalked = false;
                          if (transportInfo.isHybridWalk && dist <= 1.5) {
                            isWalked = true;
                          } else if (transportInfo.type === 'walk') {
                            isWalked = true;
                          }

                          if (isWalked) {
                            transportIcon = '🚶‍♂️';
                            segmentTransportCostNum = 0;
                            segmentCostStr = 'Miễn phí 🌱';
                            const walkMins = Math.round((dist / WALK_SPEED_KMH) * 60);
                            if (transportInfo.isHybridWalk && (transportInfo.type === 'personal_car' || transportInfo.type === 'personal_motorbike')) {
                              const returnMins = walkMins;
                              walkNote = (
                                <div className="mt-1.5 text-[10px] bg-amber-900/30 border border-amber-700/50 rounded-lg px-2.5 py-2 text-amber-300 space-y-1">
                                  <div className="font-bold flex items-center gap-1">⏱️ Ước tính đi bộ tới đây</div>
                                  <div>🚶 Đi bộ: <span className="text-white font-semibold">{dist.toFixed(1)} km (~{walkMins} phút)</span></div>
                                  <div>↩️ Quay về lấy xe: <span className="text-white font-semibold">~{returnMins} phút</span></div>
                                  <div className="text-amber-400 italic">📝 Lưu ý: Xe để lại tại {prevLocData.id === hotel?.id ? 'Khách sạn' : `gần ${prevLocData.name}`}. Sau khi xong cần quay về lấy xe trước khi đi tiếp.</div>
                                </div>
                              );
                            } else {
                              walkNote = (
                                <div className="mt-1.5 text-[10px] bg-green-900/20 border border-green-800/40 rounded-lg px-2.5 py-1.5 text-green-400">
                                  ⏱️ Đi bộ khoảng <span className="text-white font-semibold">{walkMins} phút</span> để tới nơi
                                </div>
                              );
                            }
                          } else {
                            const optV = getOptimalVehicles(transportInfo.type, numPeople);
                            if (transportInfo.type === 'grab_car' || transportInfo.type === 'grab_motorbike') {
                              transportIcon = transportInfo.type === 'grab_car' ? '🚕' : '🏍️';
                              const pricePerKm = transportInfo.type === 'grab_car' ? ragTransport.grab.car_price_per_km : ragTransport.grab.motorbike_price_per_km;
                              segmentTransportCostNum = Math.round(dist * pricePerKm) * optV.count;
                              segmentCostStr = `Grab (~${Math.round(dist * pricePerKm).toLocaleString()}đ x ${optV.desc})`;
                            } else if (transportInfo.type === 'rent_car' || transportInfo.type === 'rent_motorbike') {
                              transportIcon = transportInfo.type === 'rent_car' ? '🚙' : '🛵';
                              const isCar = transportInfo.type === 'rent_car';
                              const gasC = dist * (isCar ? ragTransport.personal.car_price_per_km : ragTransport.personal.motorbike_price_per_km);
                              const rentPrice = isCar ? `${ragTransport.rent_car["4_seater"].toLocaleString()}đ (4C) - ${ragTransport.rent_car["7_seater"].toLocaleString()}đ (7C)` : `${ragTransport.rent_motorbike.price_per_day.toLocaleString()}đ`;
                              segmentTransportCostNum = Math.round(gasC) * optV.count; // per-segment only gas; rent fee is daily
                              segmentCostStr = `Tiền xăng ~${Math.round(gasC).toLocaleString()}đ x ${optV.desc} (+ Thuê xe: ${rentPrice}/ngày/xe)`;
                            } else {
                              transportIcon = transportInfo.type === 'personal_car' ? '🚙' : '🛵';
                              const isCar = transportInfo.type === 'personal_car';
                              const gasC = dist * (isCar ? ragTransport.personal.car_price_per_km : ragTransport.personal.motorbike_price_per_km);
                              segmentTransportCostNum = Math.round(gasC) * optV.count;
                              segmentCostStr = `Tiền xăng (~${Math.round(gasC).toLocaleString()}đ x ${optV.desc})`;
                            }
                          }

                          distanceStr = `${dist.toFixed(1)} km từ ${prevLocData.id === hotel?.id ? 'Khách sạn' : prevLocData.name}`;
                        }

                        const isSelected = selectedLocId === act.id;
                        const isDragging = draggedItem?.dayIdx === dIdx && draggedItem?.actIdx === aIdx;
                        const isDragOver = dragOverItem?.dayIdx === dIdx && dragOverItem?.actIdx === aIdx;
                        
                        return (
                          <div 
                            key={aIdx} 
                            className={`relative pl-10 cursor-pointer group ${act.canceled ? 'opacity-60 grayscale' : ''} ${isDragging ? 'opacity-30' : ''}`} 
                            onClick={() => !act.canceled && setSelectedLocId(isSelected ? null : act.id)}
                            draggable={!act.canceled}
                            onDragStart={(e) => !act.canceled && handleDragStart(e, dIdx, aIdx)}
                            onDragEnter={(e) => !act.canceled && handleDragEnter(e, dIdx, aIdx)}
                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                            onDragEnd={handleDragEnd}
                            onDrop={(e) => !act.canceled && handleDrop(e, dIdx, aIdx)}
                          >
                            {isDragOver && !isDragging && (
                              <div className="absolute top-0 left-10 right-0 h-1 bg-neon-cyan shadow-[0_0_15px_rgba(0,255,255,1)] z-20 rounded-full" />
                            )}
                            {/* Node */}
                            <div className={`absolute left-[-1px] top-1 w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center z-10 transition-colors ${act.canceled ? 'border-2 border-gray-600' : isSelected ? 'border-2 border-neon-cyan shadow-[0_0_15px_rgba(0,255,255,0.6)]' : 'border-2 border-[#ff0050] shadow-[0_0_10px_rgba(255,0,80,0.5)] group-hover:border-neon-cyan'}`}>
                              <span className={`w-2.5 h-2.5 rounded-full ${act.canceled ? 'bg-gray-600' : isSelected ? 'bg-neon-cyan' : 'bg-[#ff0050]'}`}></span>
                            </div>
                            
                            <div className={`bg-[#1a1a1a] p-4 rounded-xl border transition-colors shadow-lg ${act.canceled ? 'border-red-900/50 bg-red-900/10' : isSelected ? 'border-neon-cyan bg-cyan-950/20' : 'border-[#333] group-hover:border-[#555]'}`}>
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                  {act.canceled && <span className="text-lg">🚫</span>}
                                  <h4 className={`text-white text-base font-bold leading-tight ${act.canceled ? 'line-through text-gray-500' : ''}`}>{locData.name}</h4>
                                  {!act.canceled && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleDeleteAct(dIdx, aIdx, act.id); }}
                                      className="text-red-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Xóa địa điểm này"
                                    >
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                  )}
                                </div>
                                <div className={`flex items-center gap-1 font-mono text-xs px-2 py-1 rounded border ${act.canceled ? 'text-gray-500 bg-gray-800/50 border-gray-700/50' : isSelected ? 'text-neon-cyan bg-cyan-900/30 border-cyan-800' : 'text-gray-400 bg-gray-800 border-gray-700'}`}>
                                  <input 
                                    type="time" 
                                    value={act.startTime} 
                                    onChange={(e) => handleTimeChange(dIdx, aIdx, 'startTime', e.target.value)}
                                    className="bg-transparent outline-none w-[85px] text-center cursor-pointer hover:text-white focus:text-neon-cyan"
                                    disabled={act.canceled}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span>-</span>
                                  <input 
                                    type="time" 
                                    value={act.endTime} 
                                    onChange={(e) => handleTimeChange(dIdx, aIdx, 'endTime', e.target.value)}
                                    className="bg-transparent outline-none w-[85px] text-center cursor-pointer hover:text-white focus:text-neon-cyan"
                                    disabled={act.canceled}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                              <div className="text-xs text-gray-400 mb-2">{act.reason || locData.description}</div>
                              {distanceStr && (
                                <div className={`text-xs mb-2 flex flex-col gap-1 font-bold ${transportIcon === '🚶‍♂️' ? 'text-green-400' : 'text-blue-400'}`}>
                                  <div className="flex items-center gap-1">
                                    <span>{transportIcon}</span>
                                    <span>{distanceStr}</span>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-80 text-[11px] font-medium ml-4">
                                    <span>↳ Chi phí chặng này:</span>
                                    <span className="text-white bg-black/30 px-1.5 rounded">{segmentCostStr}</span>
                                  </div>
                                  {walkNote}
                                </div>
                              )}
                              {!act.canceled && (() => {
                                const actCostPerPerson = (locData.ticketPrice || 0) + (locData.avgCost || 0);
                                const actCost = actCostPerPerson * numPeople;
                                const totalAtLoc = actCost + segmentTransportCostNum;
                                return (
                                  <div className="mt-3 space-y-2">
                                    <div className="flex gap-2 flex-wrap">
                                      <span className="text-[10px] font-medium px-2 py-0.5 bg-black border border-[#444] rounded-full text-slate-400">
                                        {locData.isIndoor ? '🏠 An toàn bão' : '☀️ Rủi ro thời tiết'}
                                      </span>
                                    </div>
                                    <div className="bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-[11px] space-y-1">
                                      <div className="text-gray-400 flex justify-between">
                                        <span>{transportIcon} Tiền đi lại:</span>
                                        <span className="text-white">{segmentTransportCostNum === 0 ? 'Miễn phí' : `~${segmentTransportCostNum.toLocaleString()}đ`}</span>
                                      </div>
                                      <div className="text-gray-400 flex justify-between items-start">
                                        <span>🎫 Vé + Chi tiêu tại đây:</span>
                                        <div className="text-white text-right">
                                          <div>{actCost === 0 ? 'Miễn phí' : `${actCost.toLocaleString()}đ`}</div>
                                          {actCost > 0 && <div className="text-[9px] text-gray-500 font-normal">({actCostPerPerson.toLocaleString()}đ x {numPeople} người)</div>}
                                        </div>
                                      </div>
                                      <div className="border-t border-[#333] pt-1 flex justify-between font-bold">
                                        <span className="text-neon-cyan">💰 Tổng chi cho chặng này:</span>
                                        <span className="text-neon-cyan">{totalAtLoc === 0 ? 'Miễn phí 🎉' : `~${totalAtLoc.toLocaleString()}đ`}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Daily Summary */}
                    <div className="mt-6 mb-4 bg-[#1a1a1a] p-3 rounded-xl border border-[#333] shadow-md ml-10 relative">
                      <div className="absolute left-[-41px] top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#111] flex items-center justify-center border-2 border-gray-600 z-10">
                        <span className="text-sm">🏨</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-xs text-gray-500 uppercase font-black tracking-wider mb-0.5">Nghỉ đêm tại</div>
                          <div className="text-white font-bold text-sm">{hotel?.name || 'Chưa chọn khách sạn'}</div>
                          <div className="text-[10px] text-gray-400 mt-1 flex flex-col gap-1">
                            {hotel && (
                              <div className="flex items-center gap-1">
                                <span>🏨</span> 
                                <span>Chi phí: {hotelRooms} phòng x {(hotel.avgCost || 0).toLocaleString()}đ = {dailyHotelCost.toLocaleString()}đ</span>
                              </div>
                            )}
                            {returnDist > 0 && (
                              <div className="flex items-center gap-1 text-amber-400">
                                <span>🚕</span>
                                <span>Trở về từ {returnLocName}: ~{returnDist.toFixed(1)}km</span>
                              </div>
                            )}
                            <div className="flex items-start gap-1">
                              <span>🚗</span> 
                              <div className="flex flex-col">
                                {transportLabel}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-gray-500 uppercase font-medium mb-0.5">Tổng chi phí ngày</div>
                          <div className="text-neon-cyan font-bold text-base">{totalDailyCost.toLocaleString()}đ</div>
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })
              ) : (
                <ul className="space-y-3">
                  {locations.map((loc, idx) => (
                    <li key={`${loc.id}-${idx}`} className="flex gap-3 items-start bg-[#1a1a1a] p-3 rounded-lg border border-[#333] cursor-pointer hover:border-[#ff0050]" onClick={() => setSelectedLocId(loc.id)}>
                      <div className="bg-slate-800 text-neon-cyan w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="text-white text-sm font-bold leading-tight">{loc.name}</h4>
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-black border border-[#333] rounded-full text-slate-400 mt-1 inline-block">
                          {loc.isIndoor ? '🏠 An toàn' : '☀️ Rủi ro thời tiết'}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-black border border-[#333] rounded-full text-green-400 mt-1 ml-2 inline-block">
                          {(loc.ticketPrice || 0).toLocaleString()}đ
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Middle Column: Map */}
        <div className="lg:col-span-5 flex flex-col gap-4 h-full overflow-hidden">
          <div className="rounded-xl border border-[#222] overflow-hidden relative shadow-2xl flex-1">
            <GoogleMapViewer 
              locations={displayedLocations} 
              center={mapCenter} 
              zoom={selectedLocId ? 15 : 12}
              activeLocationId={selectedLocId || undefined} 
            />
            
            {weather === 'Storm' && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-6 py-2 rounded-full font-black tracking-widest text-sm shadow-[0_0_20px_rgba(220,38,38,0.8)] border border-red-400 animate-bounce">
                ⚠️ CẢNH BÁO BÃO ⚠️
              </div>
            )}
          </div>
          
          <div className="bg-[#111] rounded-xl border border-[#222] p-4 shrink-0 shadow-lg">
            <h3 className="text-yellow-500 font-bold mb-3 flex items-center gap-2 uppercase tracking-wider text-sm border-b border-[#222] pb-2">
              💰 Budget Auditor (Tài chính)
            </h3>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm">Ngân sách dự kiến:</span>
              <span className="text-white font-bold">{currentBudget.toLocaleString()}đ</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm">Tổng chi phí hiện tại:</span>
              <span className="text-red-400 font-bold text-lg">{totalCost.toLocaleString()}đ</span>
            </div>
            <div className={`flex justify-between items-center pt-2 border-t border-[#333] ${remainingBudget < 0 ? 'text-red-500' : 'text-green-500'}`}>
              <span className="text-xs font-semibold">Dư dả:</span>
              <span className={`font-black ${remainingBudget < 0 ? 'text-xl animate-pulse' : 'text-sm'}`}>
                {remainingBudget < 0
                  ? `${Math.round(remainingBudget).toLocaleString()}đ ⚠️`
                  : `+${Math.round(remainingBudget).toLocaleString()}đ`}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Orchestrator & Disaster Control */}
        <div className="lg:col-span-3 flex flex-col gap-4 h-full overflow-hidden">
          
          <div className="bg-[#111] rounded-xl border border-[#222] p-4 shrink-0 shadow-lg">
            <h3 className="text-red-500 font-bold mb-3 flex items-center gap-2 uppercase tracking-wider text-sm border-b border-[#222] pb-2">
              🌪 Bảng Điều Khiển Sự Cố
            </h3>
            <p className="text-xs text-gray-400 mb-4">Mô phỏng thiên tai để kiểm tra khả năng tự trị (Autonomy) của hệ thống.</p>
            {weather === 'Sunny' ? (
              <button 
                onClick={handleSimulate}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(220,38,38,0.4)]"
              >
                Giả lập Siêu Bão
              </button>
            ) : (
              <button 
                onClick={() => {
                  setWeather('Sunny');
                  if (preStormLocations) setLocations(preStormLocations);
                  if (preStormItinerary) setActiveItinerary(preStormItinerary);
                  setPreStormLocations(null);
                  setPreStormItinerary(null);
                  onReset();
                  addLog('System', 'Khôi phục điều kiện thời tiết bình thường. Đã tải lại lịch trình gốc trước bão.');
                }}
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(34,197,94,0.4)]"
              >
                Khôi phục Nắng đẹp
              </button>
            )}
          </div>

          {/* Location Detail Panel */}
          {selectedLocId ? (() => {
            const detailLoc = ragDatabase.find(l => l.id === selectedLocId);
            if (!detailLoc) return null;
            return (
              <div className="bg-[#111] rounded-xl border border-neon-cyan/50 p-4 shrink-0 shadow-[0_0_15px_rgba(0,255,255,0.1)] flex flex-col gap-3 animate-fade-in-up">
                <div className="flex justify-between items-start">
                  <h3 className="text-neon-cyan font-bold uppercase tracking-wider text-sm truncate pr-2">
                    {detailLoc.name}
                  </h3>
                  <button onClick={() => setSelectedLocId(null)} className="text-gray-500 hover:text-white shrink-0">✕</button>
                </div>
                {detailLoc.socialBuzz && (
                  <div className="relative h-24 rounded-lg overflow-hidden bg-[#222] group border border-[#333]">
                    {detailLoc.socialBuzz.imageUrl ? (
                      <img src={detailLoc.socialBuzz.imageUrl} alt={detailLoc.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl opacity-50">📸</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-pink-600 rounded-full text-white shadow-lg">
                        ❤️ {detailLoc.socialBuzz.viewsCount}
                      </span>
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-gray-300 line-clamp-3 leading-relaxed">{detailLoc.description}</p>
                {detailLoc.socialBuzz && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[10px] text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded border border-blue-800/50">
                      {detailLoc.socialBuzz.hashtag}
                    </span>
                    <span className="text-[10px] text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-800/50">
                      {detailLoc.socialBuzz.vibeDescription}
                    </span>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="bg-[#111] rounded-xl border border-[#222] p-4 shrink-0 shadow-lg text-center flex flex-col items-center justify-center h-[120px] text-gray-500 text-xs">
              <span className="text-2xl mb-2 opacity-50">ℹ️</span>
              <p>Click vào một địa điểm<br/>để xem chi tiết & Social Buzz</p>
            </div>
          )}

          <div className="bg-[#111] rounded-xl border border-[#222] p-4 flex-1 overflow-hidden flex flex-col shadow-lg">
            <h3 className="text-purple-400 font-bold mb-3 flex items-center gap-2 uppercase tracking-wider text-sm border-b border-[#222] pb-2">
              🧠 Orchestrator Agent (Console)
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col-reverse gap-2 font-mono text-xs">
              {consoleLogs.map((log, idx) => (
                <div key={idx} className={`p-2 rounded border-l-2 border-purple-500 bg-[#1a1a1a] ${log.agent === 'User' ? 'border-l-blue-500 bg-blue-900/10' : ''}`}>
                  <div className={`text-gray-500 mb-1 flex justify-between ${log.agent === 'User' ? 'text-blue-400' : ''}`}>
                    <span className="font-bold">{log.agent}</span>
                    <span>{log.time}</span>
                  </div>
                  <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">{log.msg}</div>
                </div>
              ))}
            </div>

            {pendingSuggestion && pendingSuggestion.intent === 'multi_suggest' ? (
              <div className="mt-3 bg-[#112233] border border-blue-500/50 p-3 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.2)] animate-fade-in-up shrink-0">
                <div className="text-blue-400 font-black mb-2 text-xs tracking-widest uppercase">
                  ✨ DANH SÁCH GỢI Ý (CHỌN NHIỀU)
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {pendingSuggestion.options.map((opt: any, idx: number) => {
                    const isChecked = pendingSuggestion.selectedIds.includes(opt.id);
                    return (
                    <label key={idx} className={`bg-[#0a0a0a] p-2 rounded border flex items-center gap-3 cursor-pointer transition-colors ${isChecked ? 'border-neon-cyan bg-neon-cyan/10' : 'border-[#333] hover:border-gray-500'}`}>
                       <input 
                         type="checkbox" 
                         checked={isChecked}
                         onChange={() => {
                           setPendingSuggestion((prev: any) => {
                             const newIds = isChecked ? prev.selectedIds.filter((id: string) => id !== opt.id) : [...prev.selectedIds, opt.id];
                             return { ...prev, selectedIds: newIds };
                           });
                         }}
                         className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-neon-cyan focus:ring-neon-cyan focus:ring-offset-gray-900"
                       />
                       <div className="flex-1">
                         <div className="text-white font-bold text-sm">{opt.name}</div>
                         <div className="text-[10px] text-gray-400 line-clamp-1">{opt.description}</div>
                       </div>
                       <div className="text-green-400 font-bold text-[10px]">{(opt.ticketPrice + (opt.avgCost || 0)).toLocaleString()}đ</div>
                    </label>
                    );
                  })}
                </div>
                {pendingSuggestion.selectedIds.length > 0 && (
                  <div className="mt-3 bg-[#0a0a0a] p-2 rounded border border-[#333]">
                    <div className="text-xs text-gray-400 mb-1">Thêm vào ngày nào?</div>
                    <select 
                      className="w-full bg-[#222] border border-[#444] text-white px-2 py-1 rounded text-sm focus:border-neon-cyan focus:outline-none"
                      value={pendingSuggestion.targetDayIndex}
                      onChange={(e) => setPendingSuggestion((prev: any) => ({ ...prev, targetDayIndex: parseInt(e.target.value) }))}
                    >
                      {activeItinerary?.map((d, i) => (
                        <option key={i} value={i}>Ngày {d.date}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button 
                    disabled={pendingSuggestion.selectedIds.length === 0}
                    onClick={() => {
                      const selectedOpts = pendingSuggestion.options.filter((o: any) => pendingSuggestion.selectedIds.includes(o.id));
                      let targetDay = pendingSuggestion.targetDayIndex;
                      if (activeItinerary && activeItinerary.length > 0) {
                        const newIti = [...activeItinerary];
                        const day = { ...newIti[targetDay] };
                        day.activities = [...day.activities];
                        
                        selectedOpts.forEach((opt: any) => {
                          day.activities.push({
                            id: opt.id,
                            startTime: '08:00',
                            endTime: '10:00',
                            reason: 'User chọn từ danh sách gợi ý'
                          });
                          
                          // Ensure location is added to map
                          setLocations(prev => {
                            if (!prev.some(l => l.id === opt.id)) {
                              return [...prev, opt];
                            }
                            return prev;
                          });
                        });
                        
                        day.activities = recalculateTimes(day.activities);
                        newIti[targetDay] = day;
                        setActiveItinerary(newIti);
                        addLog('System', `Đã thêm ${selectedOpts.length} địa điểm vào Ngày ${targetDay + 1}.`);
                      }
                      setPendingSuggestion(null);
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-bold py-1.5 rounded"
                  >
                    XÁC NHẬN
                  </button>
                  <button onClick={declineSuggestion} className="flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-1.5 rounded">HỦY BỎ</button>
                </div>
              </div>
            ) : pendingSuggestion && pendingSuggestion.intent === 'change_hotel_list' ? (
              <div className="mt-3 bg-[#112233] border border-blue-500/50 p-3 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.2)] animate-fade-in-up shrink-0">
                <div className="text-blue-400 font-black mb-2 text-xs tracking-widest uppercase">
                  🏨 ĐỀ XUẤT CÁC KHÁCH SẠN PHÙ HỢP
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {pendingSuggestion.options.map((opt: any, idx: number) => (
                    <div key={idx} className="bg-[#0a0a0a] p-2 rounded border border-[#333] flex justify-between items-center">
                       <div>
                         <div className="text-white font-bold text-sm">{opt.name}</div>
                         {opt.savings >= 0 ? (
                           <div className="text-[10px] text-green-400">Tiết kiệm: +{opt.savings.toLocaleString()}đ</div>
                         ) : (remainingBudget + opt.savings < 0) ? (
                           <div className="text-[10px] text-red-500 font-bold">⚠️ Thiếu ngân sách: {(remainingBudget + opt.savings).toLocaleString()}đ (Âm tiền)</div>
                         ) : (
                           <div className="text-[10px] text-yellow-500">Tốn thêm: {Math.abs(opt.savings).toLocaleString()}đ</div>
                         )}                       </div>
                       <button onClick={() => acceptHotelListOption(opt)} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3 py-1.5 rounded">CHỌN</button>
                    </div>
                  ))}
                </div>
                <button onClick={declineSuggestion} className="w-full mt-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-1.5 rounded">HỦY BỎ</button>
              </div>
            ) : pendingSuggestion && (
              <div className="mt-3 bg-[#112233] border border-blue-500/50 p-3 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.2)] animate-fade-in-up shrink-0">
                <div className="text-blue-400 font-black mb-1 text-xs tracking-widest uppercase">
                  {pendingSuggestion.intent === 'change_hotel' ? '🏨 ĐỀ XUẤT ĐỔI KHÁCH SẠN' : '✨ ĐỀ XUẤT ĐỊA ĐIỂM MỚI'}
                </div>
                <div className="text-white font-bold text-sm">{pendingSuggestion.name}</div>
                <div className="text-xs text-gray-400 my-1 line-clamp-2">{pendingSuggestion.description}</div>
                <div className="text-[10px] flex justify-between mb-3 bg-black/50 px-2 py-1 rounded">
                  {pendingSuggestion.intent === 'change_hotel' ? (
                     <span className="text-green-400 font-bold">Tiết kiệm: +{pendingSuggestion.savings?.toLocaleString()}đ</span>
                  ) : (
                     <span className="text-gray-400">⏱ {pendingSuggestion.startTime} - {pendingSuggestion.endTime}</span>
                  )}
                  <span className="text-green-400 font-bold">💰 {pendingSuggestion.intent === 'change_hotel' ? pendingSuggestion.avgCost.toLocaleString() + 'đ/đêm' : (pendingSuggestion.ticketPrice + pendingSuggestion.avgCost).toLocaleString() + 'đ'}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={acceptSuggestion} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2 rounded transition-colors shadow-lg shadow-green-900/20">
                    ĐỒNG Ý
                  </button>
                  <button onClick={declineSuggestion} className="flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 rounded transition-colors shadow-lg shadow-red-900/20">
                    TỪ CHỐI
                  </button>
                </div>
              </div>
            )}
            
            <form onSubmit={handleChat} className="mt-3 pt-3 border-t border-[#222] flex gap-2 shrink-0">
              <input 
                type="text" 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ví dụ: Thêm địa danh đi..." 
                className="flex-1 bg-[#1a1a1a] border border-[#333] focus:border-neon-cyan focus:outline-none rounded px-3 py-2 text-sm text-gray-200 transition-colors" 
              />
              <button type="submit" className="bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan hover:text-black border border-neon-cyan/50 px-3 rounded font-bold transition-colors">
                Gửi
              </button>
            </form>
          </div>
        </div>
      </div>

      {showCustomModal && (
        <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#333] rounded-xl p-6 w-full max-w-md shadow-[0_0_30px_rgba(0,0,0,0.8)] animate-fade-in-up">
            <h3 className="text-xl font-bold text-white mb-4 text-neon-cyan">Tùy Chỉnh Lịch Trình</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Chọn địa điểm (Database):</label>
                <select 
                  className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-white text-sm focus:border-neon-cyan focus:outline-none"
                  value={customForm.locId}
                  onChange={e => setCustomForm({...customForm, locId: e.target.value})}
                >
                  <option value="">-- Chọn địa điểm --</option>
                  {ragDatabase.filter(l => l.type === 'attraction' || l.type === 'food_beverage').map(l => (
                    <option key={l.id} value={l.id}>{l.name} - {(l.ticketPrice + l.avgCost).toLocaleString()}đ</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Vào Ngày:</label>
                  <select 
                    className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-white text-sm focus:border-neon-cyan focus:outline-none"
                    value={customForm.dayIdx}
                    onChange={e => setCustomForm({...customForm, dayIdx: parseInt(e.target.value)})}
                  >
                    {activeItinerary?.map((_, i) => <option key={i} value={i}>Ngày {i + 1}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Từ giờ:</label>
                  <input type="time" value={customForm.startTime} onChange={e => setCustomForm({...customForm, startTime: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-white text-sm focus:border-neon-cyan focus:outline-none" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Đến giờ:</label>
                  <input type="time" value={customForm.endTime} onChange={e => setCustomForm({...customForm, endTime: e.target.value})} className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 text-white text-sm focus:border-neon-cyan focus:outline-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowCustomModal(false)} className="flex-1 py-2 rounded font-bold text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors text-sm">Hủy bỏ</button>
                <button 
                  onClick={() => {
                    if (!customForm.locId || !activeItinerary) return;
                    const loc = ragDatabase.find(l => l.id === customForm.locId);
                    if (!loc) return;
                    
                    const newIti = [...activeItinerary];
                    const updatedDay = { ...newIti[customForm.dayIdx] };
                    updatedDay.activities = [...updatedDay.activities, {
                      id: loc.id,
                      startTime: customForm.startTime,
                      endTime: customForm.endTime,
                      reason: 'Thêm thủ công bởi User'
                    }];
                    updatedDay.activities.sort((a, b) => a.startTime.localeCompare(b.startTime));
                    // Recalculate times to keep consistency with drag-and-drop
                    updatedDay.activities = recalculateTimes(updatedDay.activities);
                    newIti[customForm.dayIdx] = updatedDay;
                    setActiveItinerary(newIti);
                    
                    if (!locations.some(l => l.id === loc.id)) {
                      setLocations(prev => [...prev, loc as LocationKnowledgeDTO]);
                    }
                    
                    addLog('System', `User đã tự custom lịch: thêm ${loc.name} vào Ngày ${customForm.dayIdx + 1} lúc ${customForm.startTime}.`);
                    setShowCustomModal(false);
                    setCustomForm({ locId: '', dayIdx: 0, startTime: '08:00', endTime: '10:00' });
                  }} 
                  className="flex-1 py-2 rounded font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors text-sm shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
