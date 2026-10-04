import { useCallback, useRef, useState } from 'react';
import { Map, Marker } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap } from 'maplibre-gl';

import { middleOfUSA } from './lib/constants';
import YouAreHere from './components/you-are-here';
import TopNav from './components/top-nav';
import LeftSplit from './components/left-split';
import BeehiveList from './BeehiveList';

const BIEN_DONG  = { lng: 115.05, lat: 15   };
const HOANG_SA   = { lng: 111.2,  lat: 15.8 };
const TRUONG_SA  = { lng: 114.3,  lat: 10.5 };

const MapStar = ({ label, showStar = true }: { label: string; showStar?: boolean }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none', userSelect: 'none' }}>
    {showStar && (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD700" stroke="#B8860B" strokeWidth="1">
        <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z" />
      </svg>
    )}
    <span style={{ marginTop: showStar ? '4px' : '0', color: '#222', fontSize: showStar ? '13px' : '16px', fontWeight: '600', fontFamily: '"Open Sans", Arial, sans-serif', textTransform: 'uppercase', letterSpacing: '1px', textShadow: '-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff' }}>
      {label}
    </span>
  </div>
);

export default function App() {
  const mapRef = useRef<MapLibreMap | null>(null);

  // One-shot callback: when set, the next map click fires it with (lng, lat)
  const pendingClickRef = useRef<((lng: number, lat: number) => void) | null>(null);
  const [pickingMode, setPickingMode] = useState(false);

  const handleRequestMapClick = useCallback((cb: (lng: number, lat: number) => void) => {
    pendingClickRef.current = cb;
    setPickingMode(true);
  }, []);

  const onStyleLoad = useCallback((e: any) => {
    const map = e.target;
    mapRef.current = map;
    ['water_name', 'water_name_ocean', 'water_label'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    });
    map.getStyle().layers.forEach((layer: any) => {
      if (layer.type === 'symbol' && map.getLayer(layer.id)) {
        map.setFilter(layer.id, ['all', ['!=', ['get', 'name:en'], 'South China Sea'], ['!=', ['get', 'name'], '南海']]);
      }
    });
  }, []);

  const onMapClick = useCallback((e: any) => {
    if (!pendingClickRef.current) return;
    const lng = e.lngLat?.lng ?? e.lngLat[0];
    const lat = e.lngLat?.lat ?? e.lngLat[1];
    pendingClickRef.current(lng, lat);
    pendingClickRef.current = null;
    setPickingMode(false);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopNav onLogin={() => alert('Login clicked')} onLogout={() => alert('Logout clicked')} />

      <LeftSplit
        left={<BeehiveList mapRef={mapRef} onRequestMapClick={handleRequestMapClick} />}
        right={
          <div style={{ height: '100%', width: '100%', position: 'relative' }}>
            {pickingMode && (
              <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20, background: 'rgba(0,0,0,0.72)', color: 'white', padding: '8px 18px', borderRadius: 8, fontSize: 13, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                🗺️ Click anywhere on the map to place your hive
              </div>
            )}
            <Map
              onIdle={onStyleLoad}
              onClick={onMapClick}
              initialViewState={{ longitude: middleOfUSA[0], latitude: middleOfUSA[1], zoom: 2 }}
              mapStyle="https://tiles.openfreemap.org/styles/liberty"
              style={{ height: '100%', width: '100%', cursor: pickingMode ? 'crosshair' : undefined }}
            >
              <Marker longitude={HOANG_SA.lng}  latitude={HOANG_SA.lat}  anchor="center"><MapStar label="Hoàng Sa" /></Marker>
              <Marker longitude={BIEN_DONG.lng} latitude={BIEN_DONG.lat} anchor="center"><MapStar label="Biển Đông" showStar={false} /></Marker>
              <Marker longitude={TRUONG_SA.lng} latitude={TRUONG_SA.lat} anchor="center"><MapStar label="Trường Sa" /></Marker>
              <YouAreHere />
            </Map>
          </div>
        }
      />
    </div>
  );
}
