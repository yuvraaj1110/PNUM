'use client';

import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Navigation } from 'lucide-react';
import { supabase } from '@/lib/supabase';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

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
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const activeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-122.676483, 45.523062], // Portland, OR
      zoom: 11,
    });

    return () => {
      map.current?.remove();
    };
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
      if (!map.current) return;
      if (map.current.getLayer('recommendation-lines')) {
        map.current.removeLayer('recommendation-lines');
      }
      if (map.current.getSource('recommendation-lines')) {
        map.current.removeSource('recommendation-lines');
      }
      markers.current.forEach(marker => marker.remove());
      markers.current = [];
    };

    cleanupMap();

    // Add Job Marker
    const jobEl = document.createElement('div');
    jobEl.className = 'job-marker';
    jobEl.innerHTML = `<div class="p-2 bg-red-500 rounded-full text-white shadow-lg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg></div>`;

    const jobMarker = new mapboxgl.Marker(jobEl)
      .setLngLat([activeJob.lng, activeJob.lat])
      .addTo(map.current);
    markers.current.push(jobMarker);

    // Fetch Recommendations
    const fetchRecommendations = async () => {
      const currentJobId = activeJob.id;
      const { data, error } = await supabase.rpc('get_plumber_recommendations', {
        job_id: currentJobId.replace('#', '') // Assuming the RPC expects ID without '#'
      });

      // Avoid race condition: only update if this job is still active
      if (activeJobIdRef.current !== currentJobId) return;

      if (error) {
        console.error('Error fetching recommendations:', error);
        return;
      }

      if (data) {
        const top3 = (data as Recommendation[]).slice(0, 3);
        drawLines(activeJob, top3);
        addPlumberMarkers(top3);
      }
    };

    fetchRecommendations();
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
        'line-color': '#3b82f6',
        'line-width': 2,
        'line-dasharray': [2, 2],
        'line-opacity': 0.5
      }
    });
  };

  const addPlumberMarkers = (plumbers: Recommendation[]) => {
    if (!map.current) return;

    plumbers.forEach(plumber => {
      const el = document.createElement('div');
      el.className = 'plumber-marker';
      el.innerHTML = `<div class="p-2 bg-blue-600 rounded-full text-white shadow-lg cursor-pointer hover:scale-110 transition-transform"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`;

      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div class="p-3 bg-[#161922] text-white rounded-lg border border-gray-800">
            <h4 class="font-bold text-sm mb-1">${plumber.name}</h4>
            <p class="text-[10px] text-gray-400 mb-3">Recommendation Score: ${Math.round(plumber.score * 100)}%</p>
            <button
              id="dispatch-${plumber.plumber_id}"
              class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors"
            >
              Confirm Dispatch
            </button>
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([plumber.lng, plumber.lat])
        .setPopup(popup)
        .addTo(map.current!);

      popup.on('open', () => {
        const btn = document.getElementById(`dispatch-${plumber.plumber_id}`);
        if (btn) {
          btn.onclick = async () => {
            const { error } = await supabase
              .from('plumbers')
              .update({ status: 'Assigned' })
              .eq('id', plumber.plumber_id);

            if (error) {
              console.error('Error dispatching:', error);
            } else {
              btn.innerText = 'Dispatched!';
              btn.classList.remove('bg-blue-600');
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
            <div className="p-4 bg-[#161922] rounded-3xl border border-gray-800 inline-block mb-4 shadow-xl">
              <Navigation className="text-blue-500 animate-pulse" size={40} />
            </div>
            <h3 className="text-xl font-bold text-white">Select a job to view fleet</h3>
            <p className="text-gray-400 text-sm mt-2">Active recommendations will appear here</p>
          </div>
        </div>
      )}
    </div>
  );
}
