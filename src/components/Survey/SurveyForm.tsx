import { useState, useMemo } from 'react';
import type { LocationKnowledgeDTO } from '../../types/dto';
import ragDatabase from '../../data';
import GoogleMapViewer from '../Map/GoogleMapViewer';

interface SurveyFormProps {
  onSubmit: (survey: any) => void;
  isLoading: boolean;
}

const TAG_OPTIONS = [
  'early-risers', 'nightowls', 'business-trip', 'active', 'adventure', 'architecture', 'art', 
  'beach-chills', 'camping', 'city-urban', 'cultural-experience', 'festival-events', 
  'foodie-experience', 'hiking', 'history', 'honeymoon', 'local-markets', 'museums', 'music',
  'nature-outdoors', 'nightlife', 'photography', 'relaxation', 'religious', 'roadtrip', 
  'romantic', 'scuba-diving', 'shopping', 'spa', 'spiritual', 'sports', 'street-art', 
  'street-food', 'sustainable', 'walking', 'water-sports', 'wellness', 'wildlife', 'wine-tasting'
];

export default function SurveyForm({ onSubmit, isLoading }: SurveyFormProps) {
  const [survey, setSurvey] = useState<{ destinations: string[]; budget: string; transport: string; startDate: string; endDate: string; who: { adults: number; children: number; infants: number; pets: number }; tags: string[] }>({
    destinations: [],
    budget: 'comfort',
    transport: 'car',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    who: { adults: 2, children: 0, infants: 0, pets: 0 },
    tags: ['beach-chills', 'foodie-experience']
  });

  const [searchQuery, setSearchQuery] = useState('');

  // RAG places matching search
  const recommendedPlaces = useMemo(() => {
    return ragDatabase.filter(place => 
      !survey.destinations.includes(place.id) &&
      (place.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
       place.geoAddress.formattedAddress.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [searchQuery, survey.destinations]);

  const selectedLocations = useMemo(() => {
    return survey.destinations.map((id: string) => ragDatabase.find(p => p.id === id)).filter(Boolean) as LocationKnowledgeDTO[];
  }, [survey.destinations]);

  const mapCenter = selectedLocations.length > 0 
    ? { lat: selectedLocations[0].lat, lng: selectedLocations[0].lng }
    : { lat: 13.7634, lng: 109.2235 };

  const handleCounter = (key: keyof typeof survey.who, delta: number) => {
    setSurvey((prev) => ({
      ...prev,
      who: {
        ...prev.who,
        [key]: Math.max(0, prev.who[key] + delta)
      }
    }));
  };

  const toggleTag = (tag: string) => {
    setSurvey((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t: string) => t !== tag) : [...prev.tags, tag]
    }));
  };

  const addDestination = (id: string) => {
    setSurvey((prev) => ({ ...prev, destinations: [...prev.destinations, id] }));
    setSearchQuery('');
  };

  const removeDestination = (id: string) => {
    setSurvey((prev) => ({ ...prev, destinations: prev.destinations.filter((d: string) => d !== id) }));
  };

  const totalPeople = survey.who.adults + survey.who.children + survey.who.infants;

  return (
    <div className="min-h-screen bg-[#111] text-white p-6 font-sans flex flex-col h-screen overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">Plan your trip <span className="text-2xl">🌍</span></h1>
        <button 
          onClick={() => setSurvey({ destinations: [], budget: 'comfort', transport: 'car', startDate: '', endDate: '', who: { adults: 2, children: 0, infants: 0, pets: 0 }, tags: [] })}
          className="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-md text-sm font-medium transition-colors"
        >
          Reset all
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 h-[calc(100vh-100px)]">
        
        {/* Column 1: Where & Who */}
        <div className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
          
          {/* WHERE PANEL */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-5">
            <h3 className="font-bold text-lg mb-4">Where</h3>
            
            <div className="relative mb-4">
              <span className="absolute left-3 top-2.5 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </span>
              <input 
                type="text" 
                placeholder="Search TikTok Recommends..." 
                className="w-full bg-[#111] border border-[#333] rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-[#ff0050]"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              
              {/* Dropdown Recommends */}
              {searchQuery && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#222] border border-[#333] rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                  {recommendedPlaces.map(place => (
                    <div 
                      key={place.id} 
                      className="p-3 hover:bg-[#333] cursor-pointer flex gap-3 items-center border-b border-[#333] last:border-0"
                      onClick={() => addDestination(place.id)}
                    >
                      <img src={place.socialBuzz?.imageUrl || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded object-cover" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{place.name}</div>
                        <div className="text-xs text-gray-400 truncate flex items-center gap-1">
                          <span className="text-[#ff0050] font-bold">TikTok</span> • {place.socialBuzz?.viewsCount} views
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Destinations */}
            {selectedLocations.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {selectedLocations.map(loc => (
                  <div key={loc.id} className="flex items-center gap-1 bg-[#ff0050]/20 text-[#ff0050] border border-[#ff0050]/50 px-3 py-1.5 rounded-full text-xs font-medium">
                    {loc.name}
                    <button onClick={() => removeDestination(loc.id)} className="ml-1 hover:text-white">&times;</button>
                  </div>
                ))}
              </div>
            )}

            <h3 className="font-bold text-sm mb-3 mt-6">Budget</h3>
            <div className="space-y-2 mb-6">
              {[
                { id: 'budget-friendly', label: 'Budget-friendly' },
                { id: 'comfort', label: 'Comfort' },
                { id: 'luxury', label: 'Luxury' }
              ].map(opt => (
                <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                  <input type="radio" name="budget" checked={survey.budget === opt.id} onChange={() => setSurvey({...survey, budget: opt.id as any})} className="hidden" />
                  <div className={`w-4 h-4 rounded-full border ${survey.budget === opt.id ? 'border-[#ff0050] border-4' : 'border-gray-500 group-hover:border-gray-300'}`}></div>
                  <span className="text-sm text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>

            <h3 className="font-bold text-sm mb-3">Local transport</h3>
            <div className="space-y-2">
              {[
                { id: 'car', label: 'Car - rental or own' },
                { id: 'public', label: 'Public transport' },
                { id: 'combination', label: 'Combination' }
              ].map(opt => (
                <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
                  <input type="radio" name="transport" checked={survey.transport === opt.id} onChange={() => setSurvey({...survey, transport: opt.id as any})} className="hidden" />
                  <div className={`w-4 h-4 rounded-full border ${survey.transport === opt.id ? 'border-[#ff0050] border-4' : 'border-gray-500 group-hover:border-gray-300'}`}></div>
                  <span className="text-sm text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* WHO PANEL */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-5">
            <h3 className="font-bold text-lg mb-4">Who</h3>
            
            {[
              { id: 'adults', title: 'Adults', sub: 'Age 13 or above' },
              { id: 'children', title: 'Children', sub: 'Age 2-12' },
              { id: 'infants', title: 'Infants', sub: 'Under 2' },
              { id: 'pets', title: 'Pets', sub: 'Bringing a pet?' },
            ].map(item => (
              <div key={item.id} className="flex items-center justify-between py-3 border-b border-[#333] last:border-0">
                <div>
                  <div className="font-bold text-sm">{item.title}</div>
                  <div className="text-xs text-gray-500">{item.sub}</div>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => handleCounter(item.id as any, -1)} className="w-8 h-8 rounded-full border border-[#444] flex items-center justify-center text-xl hover:bg-[#333] hover:border-gray-300 transition-colors">&minus;</button>
                  <span className="w-4 text-center font-bold">{survey.who[item.id as keyof typeof survey.who]}</span>
                  <button onClick={() => handleCounter(item.id as any, 1)} className="w-8 h-8 rounded-full border border-[#444] flex items-center justify-center text-xl hover:bg-[#333] hover:border-gray-300 transition-colors">+</button>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Column 2: Map & What */}
        <div className="lg:col-span-6 flex flex-col gap-4 overflow-hidden">
          
          {/* MAP PANEL */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] overflow-hidden flex-1 relative">
            <GoogleMapViewer locations={selectedLocations} center={mapCenter} />
          </div>

          {/* WHAT PANEL */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-5 h-64 overflow-y-auto custom-scrollbar">
            <h3 className="font-bold text-lg mb-4">What</h3>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${survey.tags.includes(tag) ? 'bg-[#ff0050] text-white border-[#ff0050]' : 'bg-transparent text-gray-300 border-[#444] hover:border-gray-400 hover:bg-[#222]'}`}
                >
                  {tag.replace('-', ' ')}
                </button>
              ))}
              <button className="px-4 py-1.5 rounded-full text-xs font-medium border border-[#444] text-gray-500 hover:text-gray-300 hover:border-gray-400">
                + Add a custom tag
              </button>
            </div>
          </div>

        </div>

        {/* Column 3: When & Summary */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          
          {/* WHEN PANEL */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">When</h3>
              <div className="bg-[#111] rounded-full p-1 border border-[#333] flex text-xs">
                <button className="bg-[#333] text-white px-3 py-1 rounded-full">Exact dates</button>
                <button className="text-gray-400 px-3 py-1 rounded-full hover:text-white">Flexible</button>
              </div>
            </div>
            
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold">Start Date</label>
                <input 
                  type="date" 
                  value={survey.startDate}
                  onChange={(e) => setSurvey({...survey, startDate: e.target.value})}
                  className="w-full bg-[#111] border border-[#333] rounded-lg p-2 text-sm mt-1 focus:outline-none focus:border-[#ff0050] text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold">End Date</label>
                <input 
                  type="date" 
                  value={survey.endDate}
                  onChange={(e) => setSurvey({...survey, endDate: e.target.value})}
                  className="w-full bg-[#111] border border-[#333] rounded-lg p-2 text-sm mt-1 focus:outline-none focus:border-[#ff0050] text-white"
                />
              </div>
            </div>
          </div>

          {/* SUMMARY PANEL */}
          <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-5 flex-1 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-lg mb-6">Summary</h3>
              
              <div className="space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm">Where</div>
                    <div className="text-sm text-gray-400">{selectedLocations.length > 0 ? selectedLocations.map(l => l.name).join(', ') : 'No destination'}</div>
                  </div>
                  <div className="text-[#ff0050]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                </div>

                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm">When</div>
                    <div className="text-sm text-gray-400">{survey.startDate} - {survey.endDate}</div>
                  </div>
                  <div className="text-[#ff0050]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                </div>

                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm">Who</div>
                    <div className="text-sm text-gray-400">{totalPeople} people{survey.who.pets > 0 ? `, ${survey.who.pets} pet` : ''}</div>
                  </div>
                  <div className="text-[#ff0050]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                </div>

                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm">What</div>
                    <div className="text-sm text-gray-400">{survey.tags.length} tags selected</div>
                  </div>
                  <div className="text-[#ff0050]"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
                </div>
              </div>
            </div>

            <button 
              onClick={() => onSubmit(survey)}
              disabled={isLoading || selectedLocations.length === 0}
              className={`w-full py-4 mt-8 rounded-lg font-bold text-white transition-all shadow-lg ${isLoading || selectedLocations.length === 0 ? 'bg-[#444] cursor-not-allowed text-gray-500 shadow-none' : 'bg-[#ff0050] hover:bg-[#d40042] shadow-[#ff0050]/20 hover:shadow-[#ff0050]/40'}`}
            >
              {isLoading ? 'Generating magic...' : 'Generate trip'}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
