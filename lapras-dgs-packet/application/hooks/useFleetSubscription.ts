'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Plumber, Job, FleetState } from '@/lib/types';
import { MOCK_PLUMBERS, MOCK_JOBS } from '@/lib/mockData';

export function useFleetSubscription(): FleetState & {
    updatePlumberPosition: (id: string, lat: number, lng: number) => void;
} {
    const [plumbers, setPlumbers] = useState<Plumber[]>(MOCK_PLUMBERS);
    const [jobs, setJobs] = useState<Job[]>(MOCK_JOBS);
    const [isLive, setIsLive] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<
        'connecting' | 'connected' | 'disconnected'
    >('connecting');

    useEffect(() => {
        let mounted = true;

        async function fetchInitialData() {
            if (!supabase) {
                if (mounted) {
                    setConnectionStatus('disconnected');
                    setIsLive(false);
                }
                return;
            }
            try {
                // Try to fetch plumbers from Supabase profiles table
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('*');

                if (!profileError && profileData && profileData.length > 0 && mounted) {
                    const mapped: Plumber[] = profileData.map((p: Record<string, unknown>) => ({
                        id: p.id as string,
                        name: (p.full_name as string) || (p.name as string) || 'Unknown',
                        status: (p.status as Plumber['status']) || 'active',
                        current_location: (p.current_location as Plumber['current_location']) || {
                            lat: 45.5052,
                            lng: -122.6784,
                        },
                        phone: p.phone as string | undefined,
                        specialty: (p.specialty as string) || (Array.isArray(p.skills_tags) ? (p.skills_tags as string[]).join(', ') : undefined),
                    }));
                    setPlumbers(mapped);
                    setIsLive(true);
                }

                // Try to fetch jobs
                const { data: jobData, error: jobError } = await supabase
                    .from('jobs')
                    .select('*');

                if (!jobError && jobData && jobData.length > 0 && mounted) {
                    setJobs(
                        jobData.map((j: Record<string, unknown>) => ({
                            id: j.id as string,
                            title: j.title as string,
                            customer: (j.customer_name as string) || (j.customer as string) || 'Unknown',
                            address: (j.address as string) || '',
                            lat: (j.lat as number) || 45.5052,
                            lng: (j.lng as number) || -122.6784,
                            status: (j.status as Job['status']) || 'pending',
                            priority: ((j.priority as string) || 'MEDIUM').toUpperCase() as Job['priority'],
                            assigned_to: j.assigned_to as string | undefined,
                            date: (j.date as string) || new Date(j.created_at as string).toLocaleDateString(),
                        }))
                    );
                }

                if (mounted) setConnectionStatus('connected');
            } catch {
                // Supabase not configured — use mock data
                if (mounted) {
                    setConnectionStatus('disconnected');
                    setIsLive(false);
                }
            }
        }

        fetchInitialData();

        if (!supabase) {
            return () => {
                mounted = false;
            };
        }

        // Real-time subscription for plumber location updates
        const fleetChannel = supabase
            .channel('fleet-map')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                },
                (payload) => {
                    if (!mounted) return;
                    setPlumbers((prev) =>
                        prev.map((p) =>
                            p.id === payload.new.id
                                ? {
                                    ...p,
                                    current_location:
                                        payload.new.current_location || p.current_location,
                                    status: payload.new.status || p.status,
                                    name: payload.new.name || payload.new.full_name || p.name,
                                }
                                : p
                        )
                    );
                    setIsLive(true);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'jobs',
                },
                (payload) => {
                    if (!mounted) return;
                    if (payload.eventType === 'INSERT') {
                        const j = payload.new;
                        setJobs((prev) => [
                            ...prev,
                            {
                                id: j.id,
                                title: j.title,
                                customer: j.customer,
                                address: j.address,
                                lat: j.lat,
                                lng: j.lng,
                                status: j.status,
                                priority: j.priority,
                                assigned_to: j.assigned_to,
                                date: j.date,
                            },
                        ]);
                    } else if (payload.eventType === 'UPDATE') {
                        setJobs((prev) =>
                            prev.map((job) =>
                                job.id === payload.new.id ? { ...job, ...payload.new } : job
                            )
                        );
                    } else if (payload.eventType === 'DELETE') {
                        setJobs((prev) =>
                            prev.filter((job) => job.id !== payload.old.id)
                        );
                    }
                }
            )
            .subscribe((status) => {
                if (mounted) {
                    setConnectionStatus(
                        status === 'SUBSCRIBED' ? 'connected' : 'connecting'
                    );
                }
            });

        return () => {
            mounted = false;
            supabase?.removeChannel(fleetChannel);
        };
    }, []);

    // Local position update (used by demo simulator)
    const updatePlumberPosition = useCallback(
        (id: string, lat: number, lng: number) => {
            setPlumbers((prev) =>
                prev.map((p) =>
                    p.id === id ? { ...p, current_location: { lat, lng } } : p
                )
            );
        },
        []
    );

    return { plumbers, jobs, isLive, connectionStatus, updatePlumberPosition };
}
