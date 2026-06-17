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
    description?: string;
    category?: string;
    customer: string;
    customer_id?: string;
    customer_name?: string;
    address: string;
    lat: number;
    lng: number;
    status: 'pending' | 'assigned' | 'in_progress' | 'completed';
    priority: 'emergency' | 'high' | 'medium' | 'low';
    assigned_to?: string;
    assigned_plumber_id?: string;
    date: string;
}

export interface FleetState {
    plumbers: Plumber[];
    jobs: Job[];
    isLive: boolean;
    connectionStatus: 'connecting' | 'connected' | 'disconnected';
}
