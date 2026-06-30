export interface GeoAddress {
  placeId: string;
  formattedAddress: string;
  administrativeLevels: {
    level1: string;
    level2: string;
  };
  searchKeywords: string[];
}

export interface LocationKnowledgeDTO {
  id: string;
  name: string;
  type: 'hotel' | 'attraction' | 'food_beverage' | 'entertainment';
  lat: number;
  lng: number;
  geoAddress: GeoAddress;
  isIndoor: boolean;
  ticketPrice: number;
  recommendedHours: number;
  avgCost: number;
  disasterAlternativeId: string | null;
  pros: string;
  cons: string;
  description: string;
  socialBuzz?: {
    hashtag: string;
    viewsCount: string;
    vibeDescription: string;
    imageUrl?: string;
    tiktokLink?: string;
  };
  tags?: string[];
}

export interface SurveyDTO {
  destinations: string[]; // List of selected RAG IDs
  budget: number;
  transport: 'personal_motorbike' | 'personal_car' | 'rent_motorbike' | 'rent_car' | 'grab_motorbike' | 'grab_car';
  startDate: string;
  endDate: string;
  who: {
    adults: number;
    children: number;
    infants: number;
    pets: number;
  };
  tags: string[];
  numLocations: number;
  days?: number;
}

export interface ItineraryActivity {
  id: string; // RAG location ID
  startTime: string; // e.g. "08:00"
  endTime: string; // e.g. "10:30"
  reason: string;
  canceled?: boolean;
}

export interface ItineraryDay {
  date: string;
  hotelId: string;
  activities: ItineraryActivity[];
}

export type ItineraryDTO = ItineraryDay[];
