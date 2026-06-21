import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { LocationKnowledgeDTO } from '../../types/dto';

// Fix for default marker icons in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;

const defaultIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41], // Thẻ ghim ngay đúng mũi nhọn
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const activeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface GoogleMapViewerProps {
  locations: LocationKnowledgeDTO[];
  center: { lat: number; lng: number };
  zoom?: number;
  onMarkerClick?: (loc: LocationKnowledgeDTO) => void;
  disableRouting?: boolean;
  activeLocationId?: string;
}

// Helper component to auto-pan map when center changes
function ChangeView({ center, zoom }: { center: { lat: number; lng: number }, zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    // Timeout helps Leaflet recalculate dimensions before flying, preventing offset bugs
    const timeout = setTimeout(() => {
      map.invalidateSize();
      map.flyTo([center.lat, center.lng], zoom || map.getZoom(), {
        animate: true,
        duration: 0.8,
      });
    }, 100);
    return () => clearTimeout(timeout);
  }, [center, zoom, map]);
  return null;
}

// Helper to fetch route from OSRM public routing API (driving profile)
async function fetchOSRMRoute(locations: LocationKnowledgeDTO[]): Promise<[number, number][] | null> {
  try {
    if (locations.length < 2) return null;
    // OSRM coordinates are formatted as {lng},{lat};{lng},{lat}
    const coords = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const routeGeo = data.routes[0].geometry;
      if (routeGeo && routeGeo.coordinates) {
        // GeoJSON coordinates are [lng, lat], map back to [lat, lng] for Leaflet
        return routeGeo.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch OSRM route:', error);
    return null;
  }
}

export default function GoogleMapViewer({ locations, center, zoom = 12, onMarkerClick, disableRouting = false, activeLocationId }: GoogleMapViewerProps) {
  const [routePath, setRoutePath] = useState<[number, number][]>([]);

  // Straight line path as fallback
  const straightLinePath = React.useMemo(() => {
    return locations.map(loc => [loc.lat, loc.lng] as [number, number]);
  }, [locations]);

  useEffect(() => {
    if (disableRouting || locations.length < 2) {
      setRoutePath([]);
      return;
    }

    // Set straight line fallback immediately for zero latency response
    setRoutePath(straightLinePath);

    let active = true;
    fetchOSRMRoute(locations).then(path => {
      if (!active) return;
      if (path) {
        setRoutePath(path);
      }
    });

    return () => {
      active = false;
    };
  }, [locations, straightLinePath, disableRouting]);

  return (
    <div style={{ width: '100%', height: '100%', zIndex: 0 }}>
      <MapContainer 
        center={[center.lat, center.lng]} 
        zoom={zoom} 
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <ChangeView center={center} zoom={zoom} />
        
        {locations.map((loc, idx) => (
          <Marker 
            key={`${loc.id}-${idx}`} 
            position={[loc.lat, loc.lng]}
            icon={loc.id === activeLocationId ? activeIcon : defaultIcon}
            zIndexOffset={loc.id === activeLocationId ? 1000 : 0}
            eventHandlers={{
              click: () => onMarkerClick && onMarkerClick(loc)
            }}
          >
            <Popup autoPan={false} className="bg-[#111] text-black">
              <strong className="text-black">{loc.name}</strong>
              {loc.ticketPrice !== undefined && (
                <div className="text-xs mt-1">
                  Giá vé: {loc.ticketPrice === 0 ? 'Miễn phí' : `${loc.ticketPrice.toLocaleString()}đ`}
                </div>
              )}
            </Popup>
          </Marker>
        ))}

        {routePath.length > 1 && (
          <Polyline 
            positions={routePath} 
            pathOptions={{ color: '#ff0050', weight: 4, opacity: 0.8 }} 
          />
        )}
      </MapContainer>
    </div>
  );
}

