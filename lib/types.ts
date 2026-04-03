export interface Plumber {
    id: string;
    name: string;
    status: 'active' | 'busy' | 'offline';
    current_location: {
        lat: number;
        lng: number;
    };
    phone?: string;
    specialty?: string;
    avatar_url?: string;
}

export interface Job {
    id: string;
    title: string;
    customer: string;
    address: string;
    lat: number;
    lng: number;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'EMERGENCY' | 'HIGH' | 'MEDIUM' | 'LOW';
    assigned_to?: string;
    date: string;
}

export interface FleetState {
    plumbers: Plumber[];
    jobs: Job[];
    isLive: boolean;
    connectionStatus: 'connecting' | 'connected' | 'disconnected';
}
