import { useState } from 'react';
import type { SurveyDTO, LocationKnowledgeDTO, ItineraryDTO } from './types/dto';
import Step1Survey from './components/Steps/Step1Survey';
import Step2Picker from './components/Steps/Step2Picker';
import Step3Negotiation from './components/Steps/Step3Negotiation';
import Step4Engine from './components/Steps/Step4Engine';
import Step5HQ from './components/Steps/Step5HQ';
import ragDatabase from './data';

function App() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  
  // Master State
  const [surveyData, setSurveyData] = useState<Partial<SurveyDTO>>({});
  const [destinations, setDestinations] = useState<string[]>([]);
  const [hotelId, setHotelId] = useState<string>('');
  const [itineraryResult, setItineraryResult] = useState<any>(null);
  
  // Final parsed data for Step 5
  const [finalLocations, setFinalLocations] = useState<LocationKnowledgeDTO[]>([]);

  const handleStep1 = (data: Partial<SurveyDTO>) => {
    setSurveyData(prev => ({ ...prev, ...data }));
    if (data.destinations) {
      setDestinations(data.destinations);
    }
    setStep(2);
  };

  const handleStep2 = (selectedDestinations: string[]) => {
    setDestinations(selectedDestinations);
    setSurveyData(prev => ({ ...prev, destinations: selectedDestinations }));
    setStep(3);
  };

  const handleStep3 = (selectedHotelId: string) => {
    setHotelId(selectedHotelId);
    setStep(4);
  };

  const handleStep4 = (itinerary: ItineraryDTO | null) => {
    // Parse the result into a flat list of LocationKnowledgeDTO for Map and Itinerary
    let locs: LocationKnowledgeDTO[] = [];
    let finalItinerary = itinerary;
    
    if (itinerary && itinerary.length > 0) {
      const hotel = ragDatabase.find(l => l.id === hotelId) as LocationKnowledgeDTO;
      // Ensure ALL user-selected destinations are included in the map, 
      // even if the AI hallucinated and omitted some.
      const aiActivities = itinerary.flatMap(day => day?.activities || []);
      const aiLocations = aiActivities.map(act => ragDatabase.find(l => l.id === act?.id)).filter(Boolean) as LocationKnowledgeDTO[];
      
      const userLocations = destinations.map(id => ragDatabase.find(l => l.id === id)).filter(Boolean) as LocationKnowledgeDTO[];
      
      // Combine AI locations and User selected locations, then deduplicate
      const allMerged = [...aiLocations, ...userLocations];
      const uniqueIds = Array.from(new Set(allMerged.map(a => a.id)));
      const uniqueActivities = uniqueIds.map(id => allMerged.find(a => a.id === id)!);
      
      locs = [hotel, ...uniqueActivities];
    } else {
      // Fallback if AI completely fails
      const hotel = ragDatabase.find(l => l.id === hotelId) as LocationKnowledgeDTO;
      const acts = destinations.map(id => ragDatabase.find(l => l.id === id)).filter(Boolean) as LocationKnowledgeDTO[];
      locs = [hotel, ...acts];
      
      // Mock an itinerary so the timeline works
      finalItinerary = [];
      const days = surveyData.days || 3;
      let actIndex = 0;
      
      const today = new Date();
      for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        
        const todayActs = [];
        if (actIndex < acts.length) {
          todayActs.push({
            id: acts[actIndex].id,
            startTime: '09:00',
            endTime: '11:30',
            reason: 'Lịch trình dự phòng an toàn.'
          });
          actIndex++;
        }
        if (actIndex < acts.length) {
          todayActs.push({
            id: acts[actIndex].id,
            startTime: '14:00',
            endTime: '16:30',
            reason: 'Lịch trình dự phòng an toàn.'
          });
          actIndex++;
        }
        finalItinerary.push({
          date: dateStr,
          activities: todayActs
        });
      }
    }
    
    setItineraryResult(finalItinerary);
    setFinalLocations(locs);
    setStep(5);
  };

  return (
    <div className="min-h-screen bg-black font-sans">
      {step === 1 && (
        <Step1Survey 
          initialData={surveyData} 
          onNext={handleStep1} 
        />
      )}
      
      {step === 2 && (
        <Step2Picker 
          surveyData={surveyData}
          initialData={destinations} 
          onNext={handleStep2} 
          onBack={() => setStep(1)} 
        />
      )}

      {step === 3 && (
        <Step3Negotiation 
          survey={surveyData as SurveyDTO}
          selectedDestinations={destinations}
          onBack={() => setStep(2)}
          onNext={handleStep3}
        />
      )}

      {step === 4 && (
        <Step4Engine 
          survey={surveyData as SurveyDTO}
          selectedDestinations={destinations}
          hotelId={hotelId}
          onNext={handleStep4}
        />
      )}

      {step === 5 && (
        <Step5HQ 
          itinerary={itineraryResult}
          currentLocations={finalLocations}
          budget={surveyData.budget || 3000000}
          days={surveyData.days || 3}
          transportMode={surveyData.transport || 'personal'}
          numPeople={(surveyData.who?.adults || 0) + (surveyData.who?.children || 0) || 2}
          metrics={{ timeSaved: 12, distanceOptimized: 15, co2Reduced: 1.2 }}
          weatherState="Sunny"
          onSimulateStorm={() => {}}
          onReset={() => {}}
        />
      )}
    </div>
  );
}

export default App;
