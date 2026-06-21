import React from 'react';

interface AutonomyDashboardProps {
  weatherState: 'Sunny' | 'Storm';
  onSimulateStorm: () => void;
  onReset: () => void;
  metrics: {
    timeSaved: number;
    distanceOptimized: number;
    co2Reduced: number;
  };
}

export default function AutonomyDashboard({ weatherState, onSimulateStorm, onReset, metrics }: AutonomyDashboardProps) {
  return (
    <div className="bg-slate-800 p-6 rounded-lg shadow-xl border border-slate-700">
      <h2 className="text-xl font-bold mb-4 text-neon-cyan">ViVuAgent Dashboard</h2>
      
      <div className="mb-6">
        <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-2">Environment State</h3>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2 rounded-full font-bold ${weatherState === 'Sunny' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
            {weatherState === 'Sunny' ? '☀️ Nắng đẹp' : '⛈️ Siêu Bão'}
          </div>
          {weatherState === 'Sunny' ? (
            <button 
              onClick={onSimulateStorm}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md transition-colors font-medium text-white shadow-lg shadow-red-900/50"
            >
              Giả lập Bão (Re-plan)
            </button>
          ) : (
            <button 
              onClick={onReset}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors font-medium text-white"
            >
              Khôi phục Nắng đẹp
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm text-slate-400 uppercase tracking-wider mb-2">Real Impact Metrics</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900 p-4 rounded border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">Time Saved</div>
            <div className="text-2xl font-bold text-neon-cyan">{metrics.timeSaved}h</div>
          </div>
          <div className="bg-slate-900 p-4 rounded border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">Distance Cut</div>
            <div className="text-2xl font-bold text-neon-cyan">{metrics.distanceOptimized}km</div>
          </div>
          <div className="bg-slate-900 p-4 rounded border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">CO2 Reduced</div>
            <div className="text-2xl font-bold text-neon-cyan">{metrics.co2Reduced}kg</div>
          </div>
        </div>
      </div>
    </div>
  );
}
