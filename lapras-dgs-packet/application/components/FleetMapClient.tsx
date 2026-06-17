'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plumber, Job } from '@/lib/types';
import { SERVICE_AREA_CENTER, DEFAULT_ZOOM } from '@/lib/mockData';

// ─── Dark map tiles ───
const DARK_TILES =
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_ATTR =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

// ─── Icon factories ───
function plumberIcon(name: string, highlighted = false): L.DivIcon {
    const initials = name
        .split(' ')
        .map((w) => w[0])
        .join('');
    return L.divIcon({
        className: 'plumber-marker',
        html: `<div class="plumber-dot${highlighted ? ' highlighted' : ''}"><span>${initials}</span></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
    });
}

function jobIcon(priority: string): L.DivIcon {
    const cls = priority === 'EMERGENCY' ? 'emergency' : 'pending';
    return L.divIcon({
        className: '',
        html: `<div class="job-marker ${cls}"><div class="job-pulse-ring"></div><div class="job-pulse-ring delay"></div><div class="job-dot"></div></div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
    });
}

function clusterIcon(count: number): L.DivIcon {
    return L.divIcon({
        className: '',
        html: `<div class="cluster-marker"><span>${count}</span></div>`,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
    });
}

// ─── Haversine distance (km) ───
function haversine(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Simple grid-based clustering ───
interface ClusterGroup {
    id: string;
    lat: number;
    lng: number;
    plumbers: Plumber[];
}

function clusterPlumbers(
    plumbers: Plumber[],
    radiusKm = 1.5
): ClusterGroup[] {
    const used = new Set<string>();
    const groups: ClusterGroup[] = [];

    for (const p of plumbers) {
        if (used.has(p.id)) continue;

        const nearby = plumbers.filter(
            (q) =>
                !used.has(q.id) &&
                haversine(
                    p.current_location.lat,
                    p.current_location.lng,
                    q.current_location.lat,
                    q.current_location.lng
                ) < radiusKm
        );

        const lat =
            nearby.reduce((s, m) => s + m.current_location.lat, 0) / nearby.length;
        const lng =
            nearby.reduce((s, m) => s + m.current_location.lng, 0) / nearby.length;

        groups.push({ id: nearby.map((m) => m.id).join('-'), lat, lng, plumbers: nearby });
        nearby.forEach((m) => used.add(m.id));
    }

    return groups;
}

// ─── Animated marker with smooth transitions ───
function AnimatedMarker({
    position,
    icon,
    children,
    eventHandlers,
}: {
    position: [number, number];
    icon: L.DivIcon;
    children?: React.ReactNode;
    eventHandlers?: L.LeafletEventHandlerFnMap;
}) {
    const markerRef = useRef<L.Marker>(null);
    const prevPos = useRef(position);

    useEffect(() => {
        const marker = markerRef.current;
        if (!marker) return;

        const [srcLat, srcLng] = prevPos.current;
        const [dstLat, dstLng] = position;

        if (srcLat === dstLat && srcLng === dstLng) return;

        let start: number | null = null;
        const duration = 1000;
        let rafId: number;

        const animate = (ts: number) => {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);

            marker.setLatLng([
                srcLat + (dstLat - srcLat) * ease,
                srcLng + (dstLng - srcLng) * ease,
            ]);

            if (progress < 1) rafId = requestAnimationFrame(animate);
        };

        rafId = requestAnimationFrame(animate);
        prevPos.current = position;

        return () => cancelAnimationFrame(rafId);
    }, [position]);

    return (
        <Marker
            ref={markerRef}
            position={prevPos.current}
            icon={icon}
            eventHandlers={eventHandlers}
        >
            {children}
        </Marker>
    );
}

// ─── FlyTo handler ───
function FlyToHandler({
    target,
    zoom,
}: {
    target: [number, number] | null;
    zoom?: number;
}) {
    const map = useMap();
    const prev = useRef<string | null>(null);

    useEffect(() => {
        if (!target) return;
        const key = `${target[0]},${target[1]}`;
        if (key === prev.current) return;
        prev.current = key;
        map.flyTo(target, zoom || 15, { duration: 1.5 });
    }, [target, zoom, map]);

    return null;
}

// ─── Props ───
export interface FleetMapProps {
    plumbers: Plumber[];
    jobs: Job[];
    selectedJobId?: string | null;
    onJobSelect?: (id: string | null) => void;
    highlightedPlumberIds?: string[];
    mini?: boolean;
}

// ═══════════════════════════════════════════
// Main FleetMap component
// ═══════════════════════════════════════════
export default function FleetMapClient({
    plumbers,
    jobs,
    selectedJobId = null,
    onJobSelect,
    highlightedPlumberIds = [],
    mini = false,
}: FleetMapProps) {
    const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

    // Find the selected job
    const selectedJob = useMemo(
        () => jobs.find((j) => j.id === selectedJobId) || null,
        [jobs, selectedJobId]
    );

    // Nearest 3 plumbers to the selected job
    const nearestPlumbers = useMemo(() => {
        if (!selectedJob) return [];
        return plumbers
            .filter((p) => p.status === 'active')
            .map((p) => ({
                ...p,
                dist: haversine(
                    selectedJob.lat,
                    selectedJob.lng,
                    p.current_location.lat,
                    p.current_location.lng
                ),
            }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 3);
    }, [selectedJob, plumbers]);

    const nearestIds = useMemo(
        () => new Set([...nearestPlumbers.map((p) => p.id), ...highlightedPlumberIds]),
        [nearestPlumbers, highlightedPlumberIds]
    );

    // Fly-to target
    const flyTarget: [number, number] | null = selectedJob
        ? [selectedJob.lat, selectedJob.lng]
        : null;

    // Clustering
    const activePlumbers = plumbers.filter((p) => p.status === 'active');
    const clusterRadius = mapZoom < 11 ? 3 : mapZoom < 13 ? 1.5 : 0.5;
    const clusters = useMemo(
        () => clusterPlumbers(activePlumbers, clusterRadius),
        [activePlumbers, clusterRadius]
    );

    // Only show pending/emergency jobs on map (not completed)
    const visibleJobs = jobs.filter(
        (j) => j.status === 'pending' || j.status === 'in_progress'
    );

    // Zoom tracker
    function ZoomTracker() {
        useMap();
        const map = useMap();
        useEffect(() => {
            const handler = () => setMapZoom(map.getZoom());
            map.on('zoomend', handler);
            return () => { map.off('zoomend', handler); };
        }, [map]);
        return null;
    }

    return (
        <MapContainer
            center={SERVICE_AREA_CENTER}
            zoom={DEFAULT_ZOOM}
            className={mini ? 'mini-map-container' : 'fleet-map-container'}
            zoomControl={!mini}
            attributionControl={!mini}
            scrollWheelZoom={!mini}
            dragging={!mini}
            doubleClickZoom={!mini}
            style={{
                width: '100%',
                height: '100%',
                borderRadius: mini ? '24px' : '0px',
            }}
        >
            <TileLayer url={DARK_TILES} attribution={DARK_ATTR} />
            <ZoomTracker />
            <FlyToHandler target={flyTarget} />

            {/* ─── Plumber markers (clustered) ─── */}
            {clusters.map((group) =>
                group.plumbers.length === 1 ? (
                    <AnimatedMarker
                        key={group.plumbers[0].id}
                        position={[
                            group.plumbers[0].current_location.lat,
                            group.plumbers[0].current_location.lng,
                        ]}
                        icon={plumberIcon(
                            group.plumbers[0].name,
                            nearestIds.has(group.plumbers[0].id)
                        )}
                    >
                        {!mini && (
                            <Popup>
                                <div className="map-popup">
                                    <div className="popup-name">{group.plumbers[0].name}</div>
                                    <div className="popup-detail">
                                        {group.plumbers[0].specialty || 'General Plumber'}
                                    </div>
                                    <div className="popup-detail">{group.plumbers[0].phone}</div>
                                    <div className="popup-status active">● Active</div>
                                </div>
                            </Popup>
                        )}
                    </AnimatedMarker>
                ) : (
                    <Marker
                        key={group.id}
                        position={[group.lat, group.lng]}
                        icon={clusterIcon(group.plumbers.length)}
                    >
                        {!mini && (
                            <Popup>
                                <div className="map-popup">
                                    <div className="popup-name">
                                        {group.plumbers.length} Plumbers
                                    </div>
                                    {group.plumbers.map((p) => (
                                        <div key={p.id} className="popup-detail">
                                            ● {p.name}
                                        </div>
                                    ))}
                                </div>
                            </Popup>
                        )}
                    </Marker>
                )
            )}

            {/* ─── Job markers ─── */}
            {visibleJobs.map((job) => (
                <Marker
                    key={job.id}
                    position={[job.lat, job.lng]}
                    icon={jobIcon(job.priority)}
                    eventHandlers={{
                        click: () => onJobSelect?.(job.id),
                    }}
                >
                    {!mini && (
                        <Popup>
                            <div className="map-popup">
                                <div className="popup-name">{job.title}</div>
                                <div className="popup-detail">{job.customer}</div>
                                <div className="popup-detail">{job.address}</div>
                                <div
                                    className={`popup-priority ${job.priority.toLowerCase()}`}
                                >
                                    {job.priority}
                                </div>
                            </div>
                        </Popup>
                    )}
                </Marker>
            ))}

            {/* ─── Lines from selected job to nearest plumbers ─── */}
            {selectedJob &&
                nearestPlumbers.map((p, i) => (
                    <Polyline
                        key={`line-${p.id}`}
                        positions={[
                            [selectedJob.lat, selectedJob.lng],
                            [p.current_location.lat, p.current_location.lng],
                        ]}
                        pathOptions={{
                            color: i === 0 ? '#facc15' : '#fde047',
                            weight: i === 0 ? 3 : 2,
                            dashArray: '10, 8',
                            opacity: 1 - i * 0.2,
                        }}
                    />
                ))}
        </MapContainer>
    );
}
