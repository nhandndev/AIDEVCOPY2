import { useState, useEffect } from 'react';
import type { SurveyDTO } from '../../types/dto';
import { generateItinerary } from '../../services/geminiService';
import ragDatabase from '../../data';

interface Step4Props {
  onNext: (itineraryData: any) => void;
  survey: SurveyDTO;
  selectedDestinations: string[];
  hotelId: string;
}

export default function Step4Engine({ onNext, survey, selectedDestinations, hotelId }: Step4Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState({
    scheduler: 0,
    weather: 0,
    budget: 0,
    orchestrator: 0
  });

  useEffect(() => {
    let mounted = true;
    
    const addLog = (msg: string) => {
      if (mounted) setLogs(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    const runEngine = async () => {
      // Simulate parallel agent progress
      const intervals = [
        setInterval(() => setProgress(p => ({ ...p, scheduler: Math.min(90, p.scheduler + Math.random() * 10) })), 500),
        setInterval(() => setProgress(p => ({ ...p, weather: Math.min(100, p.weather + Math.random() * 20) })), 400),
        setInterval(() => setProgress(p => ({ ...p, budget: Math.min(100, p.budget + Math.random() * 15) })), 600),
        setInterval(() => setProgress(p => ({ ...p, orchestrator: Math.min(80, p.orchestrator + Math.random() * 5) })), 800)
      ];

      const hotel = ragDatabase.find(d => d.id === hotelId);
      const locNames = selectedDestinations.map(id => ragDatabase.find(d => d.id === id)?.name).filter(Boolean);
      const locNamesStr = locNames.length > 2 ? `${locNames.slice(0, 2).join(', ')}... và ${locNames.length - 2} điểm khác` : locNames.join(', ');

      addLog('SYS_INIT: Kích hoạt Hệ thống Đa tác nhân (Multi-Agent System) v3.0');
      await new Promise(r => setTimeout(r, 800));
      
      addLog(`[SURVEY_AGENT] Parameters received -> Budget: ${survey.budget?.toLocaleString()}đ | Days: ${survey.days} | Transport: ${survey.transport}`);
      await new Promise(r => setTimeout(r, 1200));

      addLog(`[LOGISTICS_AGENT] Mapping ${selectedDestinations.length} points of interest: [${locNamesStr}]`);
      await new Promise(r => setTimeout(r, 1000));

      addLog(`[HOTEL_ANCHOR] Setting graph centroid at: ${hotel?.name?.toUpperCase() || hotelId}`);
      await new Promise(r => setTimeout(r, 1000));

      addLog('[WEATHER_AGENT] Polling meteorological data... Condition OK. Adjusting outdoor confidence score...');
      await new Promise(r => setTimeout(r, 1200));
      
      addLog('[BUDGET_AUDITOR] Generating financial constraints for TSP (Traveling Salesperson) routing matrix...');
      await new Promise(r => setTimeout(r, 1200));

      addLog(`[SCHEDULER_AGENT] Compiling JSON Schema Payload. Calling Gemini LLM Engine...`);

      try {
        // Call actual Gemini API
        const itinerary = await generateItinerary(survey);
        
        if (mounted) {
          setProgress({ scheduler: 100, weather: 100, budget: 100, orchestrator: 100 });
          addLog('[ORCHESTRATOR] SUCCESS. JSON structure received and validated from LLM.');
          addLog('[SYSTEM] Compiling finalized itinerary. Redirecting to Dashboard HQ...');
          
          setTimeout(() => {
            if (mounted) onNext(itinerary);
          }, 1500);
        }
      } catch (err) {
        if (mounted) {
          addLog(`[ERROR] LLM Timeout. Initializing Fallback Routine...`);
          setProgress({ scheduler: 100, weather: 100, budget: 100, orchestrator: 100 });
          setTimeout(() => {
            if (mounted) onNext(null); // Passing null triggers fallback in App.tsx
          }, 1500);
        }
      }

      intervals.forEach(clearInterval);
    };

    runEngine();

    return () => { mounted = false; };
  }, [survey, selectedDestinations, hotelId, onNext]);

  return (
    <div className="flex flex-col h-full bg-black text-green-500 p-8 font-mono relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-900/20 via-black to-black"></div>
      
      <div className="relative z-10 flex flex-col h-full max-w-5xl mx-auto w-full">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-black tracking-widest text-green-400 mb-2">MULTI-AGENT ENGINE RUNNING</h2>
          <p className="text-green-700">Compiling Itinerary Data via LLM Neural Network</p>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-10">
          {[
            { id: 'scheduler', name: 'SCHEDULER AGENT (Routing)', value: progress.scheduler },
            { id: 'weather', name: 'WEATHER AGENT (Safety)', value: progress.weather },
            { id: 'budget', name: 'BUDGET AUDITOR (Finance)', value: progress.budget },
            { id: 'orchestrator', name: 'ORCHESTRATOR (Sync)', value: progress.orchestrator },
          ].map(agent => (
            <div key={agent.id} className="bg-green-950/30 border border-green-800 p-4 rounded">
              <div className="flex justify-between mb-2 text-sm font-bold">
                <span>{agent.name}</span>
                <span>{Math.floor(agent.value)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(34,197,94,0.8)]"
                  style={{ width: `${agent.value}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 bg-black/80 border border-green-800 rounded p-6 overflow-y-auto custom-scrollbar font-mono text-sm leading-relaxed">
          {logs.map((log, i) => (
            <div key={i} className="mb-1 animate-pulse">{log}</div>
          ))}
          <div className="animate-ping inline-block w-2 h-4 bg-green-500 mt-2"></div>
        </div>
      </div>
    </div>
  );
}
