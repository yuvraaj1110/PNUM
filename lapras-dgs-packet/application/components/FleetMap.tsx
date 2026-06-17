'use client';

import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export interface Job {
  id: string;
  title: string;
  customer: string;
  address: string;
  lat: number;
  lng: number;
  date: string;
  priority: string;
  status: string;
  color: string;
  assigned?: string;
}

interface Recommendation {
  plumber_id: string;
  name: string;
  lat: number;
  lng: number;
  score: number;
}

interface FleetMapProps {
  activeJob: Job | null;
}

export default function FleetMap({ activeJob }: FleetMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const activeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Map Initialization Guard
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [-122.676483, 45.523062], // Portland, OR
      zoom: 11,
    });

    // We deliberately omit map.remove() here to prevent WebGL context 
    // dropping during React 18 StrictMode double-invocations which causes blank boxes.
  }, []);

  useEffect(() => {
    if (!map.current || !activeJob) return;

    activeJobIdRef.current = activeJob.id;

    // Fly-To Animation
    map.current.flyTo({
      center: [activeJob.lng, activeJob.lat],
      zoom: 13,
      essential: true,
      duration: 2000,
    });

    // Cleanup existing lines and markers
    const cleanupMap = () => {
      const currentMap = map.current;
      if (!currentMap) return;
      
      try {
        if (currentMap.getLayer && currentMap.getLayer('recommendation-lines')) {
          currentMap.removeLayer('recommendation-lines');
        }
        if (currentMap.getSource && currentMap.getSource('recommendation-lines')) {
          currentMap.removeSource('recommendation-lines');
        }
      } catch (e) {
        console.warn('Map cleanup warning:', e);
      }
      
      markers.current.forEach(marker => marker.remove());
      markers.current = [];
    };

    cleanupMap();

    // Add Job Marker
    const jobEl = document.createElement('div');
    jobEl.className = 'job-marker';
    jobEl.innerHTML = `<div class="p-2 bg-red-500 rounded-full text-white shadow-lg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg></div>`;

    const jobMarker = new maplibregl.Marker({ element: jobEl })
      .setLngLat([activeJob.lng, activeJob.lat])
      .addTo(map.current);
    markers.current.push(jobMarker);

    // Fetch Recommendations
    const fetchRecommendations = async () => {
      if (!supabase) return;
      const currentJobId = activeJob.id;
      
      // RLS Bypass/Check
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      console.log('Current Session Status:', sessionData.session ? 'Active' : 'Missing', sessionError || '');

      let data: Recommendation[] | null = null;
      let error: { message: string } | null = null;

      // Always use client-side spatial sort (PostGIS st_distance is not available)
      const { data: activeProfiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('id, full_name, current_location')
        .eq('status', 'active');

      if (profilesErr) error = profilesErr;
      else if (activeProfiles && activeProfiles.length > 0) {
        // Client-side spatial sort using Euclidean distance
        const sorted = activeProfiles
          .map((p) => {
             const pLat = p.current_location?.lat || 0;
             const pLng = p.current_location?.lng || 0;
             const dist = Math.hypot(pLat - activeJob.lat, pLng - activeJob.lng) * 111;
             return {
               plumber_id: p.id as string,
               name: (p.full_name || 'Unknown') as string,
               lat: pLat as number,
               lng: pLng as number,
               score: Math.max(0, 1 - dist / 50),
               _dist: dist,
             };
          })
          .sort((a, b) => a._dist - b._dist)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .map(({ _dist, ...rest }) => rest);
        data = sorted;
      }

      // Avoid race condition: only update if this job is still active
      if (activeJobIdRef.current !== currentJobId) return;

      if (error) {
        console.error('Error fetching recommendations:', error);
        console.error('Full Error Object:', JSON.stringify(error, null, 2));
        return;
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('Query returned empty data or no recommendations. Is the plumbers table empty?', data);
        return;
      }

      if (data) {
        const top3 = (data as Recommendation[]).slice(0, 3);
        drawLines(activeJob, top3);
        addPlumberMarkers(top3);
      }
    };

    fetchRecommendations();

    return () => {
      cleanupMap();
    };
  }, [activeJob]);

  const drawLines = (job: Job, plumbers: Recommendation[]) => {
    if (!map.current) return;

    const features: GeoJSON.Feature<GeoJSON.LineString>[] = plumbers.map(plumber => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [job.lng, job.lat],
          [plumber.lng, plumber.lat]
        ]
      }
    }));

    map.current.addSource('recommendation-lines', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: features
      }
    });

    map.current.addLayer({
      id: 'recommendation-lines',
      type: 'line',
      source: 'recommendation-lines',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#facc15',
        'line-width': 2,
        'line-dasharray': [2, 2],
        'line-opacity': 0.5
      }
    });
  };

  const addPlumberMarkers = (plumbers: Recommendation[]) => {
    if (!map.current || !supabase) return;

    plumbers.forEach(plumber => {
      const el = document.createElement('div');
      el.className = 'plumber-marker';
      el.innerHTML = `<div class="p-2 bg-yellow-400 rounded-full text-black shadow-lg cursor-pointer hover:scale-110 transition-transform"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`;

      const popup = new maplibregl.Popup({ offset: 25 })
        .setHTML(`
          <div class="p-3 bg-[#161616] text-white rounded-lg border border-gray-800">
            <h4 class="font-bold text-sm mb-1">${plumber.name}</h4>
            <p class="text-[10px] text-gray-400 mb-3">Recommendation Score: ${Math.round(plumber.score * 100)}%</p>
            <button
              id="dispatch-${plumber.plumber_id}"
              class="w-full py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors"
            >
              Confirm Dispatch
            </button>
          </div>
        `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([plumber.lng, plumber.lat])
        .setPopup(popup)
        .addTo(map.current!);

      popup.on('open', () => {
        const btn = document.getElementById(`dispatch-${plumber.plumber_id}`);
        if (btn) {
          btn.onclick = async () => {
            if (!supabase) return;
            const { error } = await supabase
              .from('profiles')
              .update({ status: 'busy' })
              .eq('id', plumber.plumber_id);

            if (error) {
              console.error('Error dispatching:', error);
            } else {
              btn.innerText = 'Dispatched!';
              btn.classList.remove('bg-yellow-400');
              btn.classList.add('bg-green-600');
              (btn as HTMLButtonElement).disabled = true;
            }
          };
        }
      });

      markers.current.push(marker);
    });
  };

  return (
    <div className="relative w-full h-[600px] rounded-[2.5rem] overflow-hidden border border-gray-800 shadow-2xl">
      <div ref={mapContainer} className="absolute inset-0" />
      {!activeJob && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10 text-center">
          <div>
            <div className="p-4 bg-[#161616] rounded-3xl border border-gray-800 inline-block mb-4 shadow-xl">
              <Navigation className="text-yellow-400 animate-pulse" size={40} />
            </div>
            <h3 className="text-xl font-bold text-white">Select a job to view fleet</h3>
            <p className="text-gray-400 text-sm mt-2">Active recommendations will appear here</p>
          </div>
        </div>
      )}
    </div>
  );
}
