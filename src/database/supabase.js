// src/database/supabase.js
const { createClient } = require('@supabase/supabase-js');

class SupabaseClient {
    constructor() {
        // Validate environment variables
        this.validateConfig();
        
        // Create Supabase clients with different keys for different access levels
        this.client = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                auth: {
                    persistSession: false
                },
                db: {
                    schema: 'public'
                },
                global: {
                    headers: {
                        'x-application-name': 'ride-sharing-bot'
                    }
                }
            }
        );

        // Admin client for privileged operations
        this.adminClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY,
            {
                auth: {
                    persistSession: false
                },
                db: {
                    schema: 'public'
                }
            }
        );

        // Initialize real-time subscriptions
        this.setupRealtime();
        
        console.log('✅ Supabase client initialized successfully');
    }

    validateConfig() {
        const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing Supabase configuration: ${missing.join(', ')}`);
        }

        // Validate URL format
        if (!process.env.SUPABASE_URL.includes('supabase.co')) {
            throw new Error('Invalid Supabase URL format');
        }
    }

    setupRealtime() {
        // Real-time subscriptions for live updates
        this.subscriptions = new Map();
        
        // Listen for new rides
        this.subscribeToTable('rides', 'INSERT', (payload) => {
            console.log('New ride created:', payload.new);
            // Handle new ride notifications
            this.emit('new-ride', payload.new);
        });

        // Listen for ride status updates
        this.subscribeToTable('rides', 'UPDATE', (payload) => {
            console.log('Ride updated:', payload.new);
            this.emit('ride-updated', payload.new);
        });

        // Listen for driver status updates
        this.subscribeToTable('users', 'UPDATE', (payload) => {
            if (payload.new.role === 'driver') {
                console.log('Driver status updated:', payload.new);
                this.emit('driver-updated', payload.new);
            }
        });
    }

    subscribeToTable(table, event, callback) {
        const subscription = this.client
            .channel(`public:${table}`)
            .on(
                'postgres_changes',
                {
                    event: event,
                    schema: 'public',
                    table: table,
                },
                callback
            )
            .subscribe((status) => {
                console.log(`${table} ${event} subscription status:`, status);
            });

        this.subscriptions.set(`${table}:${event}`, subscription);
        return subscription;
    }

    // Event emitter for real-time updates
    events = new Map();
    
    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(callback);
    }

    emit(event, data) {
        if (this.events.has(event)) {
            this.events.get(event).forEach(callback => callback(data));
        }
    }

    // User management methods
    async createUser(userData) {
        try {
            const { data, error } = await this.client
                .from('users')
                .insert({
                    telegram_id: userData.telegram_id,
                    full_name: userData.full_name,
                    phone: userData.phone,
                    role: userData.role,
                    home_location: userData.home_location,
                    current_location: userData.current_location,
                    car_plate: userData.car_plate,
                    car_model: userData.car_model,
                    status: 'active'
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error creating user:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserByTelegramId(telegramId) {
        try {
            const { data, error } = await this.client
                .from('users')
                .select('*')
                .eq('telegram_id', telegramId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return { success: true, data: null }; // User not found
                }
                throw error;
            }
            return { success: true, data };
        } catch (error) {
            console.error('Error fetching user:', error);
            return { success: false, error: error.message };
        }
    }

    async updateUserLocation(telegramId, location) {
        try {
            const point = `POINT(${location.longitude} ${location.latitude})`;
            const { data, error } = await this.client
                .from('users')
                .update({
                    current_location: point,
                    updated_at: new Date().toISOString()
                })
                .eq('telegram_id', telegramId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error updating user location:', error);
            return { success: false, error: error.message };
        }
    }

    async updateUserStatus(telegramId, status) {
        try {
            const { data, error } = await this.client
                .from('users')
                .update({
                    is_online: status === 'online',
                    updated_at: new Date().toISOString()
                })
                .eq('telegram_id', telegramId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error updating user status:', error);
            return { success: false, error: error.message };
        }
    }

    // Ride management methods
    async createRide(rideData) {
        try {
            const { data, error } = await this.client
                .from('rides')
                .insert({
                    passenger_id: rideData.passenger_id,
                    pickup_location: rideData.pickup_location,
                    destination: rideData.destination,
                    distance_km: rideData.distance_km,
                    duration_minutes: rideData.duration_minutes,
                    estimated_fare: rideData.estimated_fare,
                    status: 'pending'
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error creating ride:', error);
            return { success: false, error: error.message };
        }
    }

    async updateRideStatus(rideId, status, driverId = null) {
        try {
            const updateData = {
                status: status,
                updated_at: new Date().toISOString()
            };

            if (driverId && status === 'driver_assigned') {
                updateData.driver_id = driverId;
            }

            if (status === 'in_progress') {
                updateData.started_at = new Date().toISOString();
            }

            if (status === 'completed') {
                updateData.completed_at = new Date().toISOString();
            }

            const { data, error } = await this.client
                .from('rides')
                .update(updateData)
                .eq('id', rideId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error updating ride status:', error);
            return { success: false, error: error.message };
        }
    }

    async getActiveRides() {
        try {
            const { data, error } = await this.client
                .from('rides')
                .select(`
                    *,
                    passenger:users!rides_passenger_id_fkey(full_name, telegram_id),
                    driver:users!rides_driver_id_fkey(full_name, telegram_id, car_plate)
                `)
                .in('status', ['pending', 'searching', 'driver_assigned', 'in_progress']);

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error fetching active rides:', error);
            return { success: false, error: error.message };
        }
    }

    // Driver matching methods
    async findNearbyDrivers(lat, lon, radiusKm = 5) {
        try {
            // Use the PostGIS function we created
            const { data, error } = await this.client
                .rpc('find_nearby_drivers', {
                    lat: lat,
                    lon: lon,
                    radius_km: radiusKm
                });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error finding nearby drivers:', error);
            return { success: false, error: error.message };
        }
    }

    async findNearbyRides(lat, lon, radiusKm = 5) {
        try {
            const { data, error } = await this.client
                .rpc('find_nearby_rides', {
                    lat: lat,
                    lon: lon,
                    radius_km: radiusKm
                });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error finding nearby rides:', error);
            return { success: false, error: error.message };
        }
    }

    // Ride request management
    async createRideRequest(rideId, driverId) {
        try {
            const { data, error } = await this.client
                .from('ride_requests')
                .insert({
                    ride_id: rideId,
                    driver_id: driverId,
                    status: 'sent'
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error creating ride request:', error);
            return { success: false, error: error.message };
        }
    }

    async updateRideRequest(requestId, status) {
        try {
            const { data, error } = await this.client
                .from('ride_requests')
                .update({
                    status: status,
                    responded_at: new Date().toISOString()
                })
                .eq('id', requestId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error updating ride request:', error);
            return { success: false, error: error.message };
        }
    }

    // Analytics and reporting
    async getRideStats(startDate, endDate) {
        try {
            const { data, error } = await this.client
                .from('rides')
                .select(`
                    status,
                    count:count(*),
                    total_revenue:sum(final_fare)
                `)
                .gte('created_at', startDate)
                .lte('created_at', endDate)
                .group('status');

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error getting ride stats:', error);
            return { success: false, error: error.message };
        }
    }

    async getDailyStats(days = 30) {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            // Use RPC function for complex analytics
            const { data, error } = await this.client
                .rpc('get_daily_ride_stats', {
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString()
                });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error getting daily stats:', error);
            return { success: false, error: error.message };
        }
    }

    // Admin methods (using service key)
    async adminGetAllUsers(filters = {}) {
        try {
            let query = this.adminClient
                .from('users')
                .select('*', { count: 'exact' });

            // Apply filters
            if (filters.role) query = query.eq('role', filters.role);
            if (filters.status) query = query.eq('status', filters.status);
            if (filters.is_online !== undefined) query = query.eq('is_online', filters.is_online);

            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range(filters.offset || 0, filters.limit || 50);

            if (error) throw error;
            return { success: true, data, count };
        } catch (error) {
            console.error('Error fetching users:', error);
            return { success: false, error: error.message };
        }
    }

    async adminUpdateUser(userId, updateData) {
        try {
            const { data, error } = await this.adminClient
                .from('users')
                .update({
                    ...updateData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error updating user:', error);
            return { success: false, error: error.message };
        }
    }

    async adminDeleteUser(userId) {
        try {
            const { error } = await this.adminClient
                .from('users')
                .delete()
                .eq('id', userId);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error deleting user:', error);
            return { success: false, error: error.message };
        }
    }

    // Cleanup method
    async cleanupExpiredRideRequests() {
        try {
            const expiryTime = new Date();
            expiryTime.setMinutes(expiryTime.getMinutes() - 5); // 5 minutes expiry

            const { error } = await this.client
                .from('ride_requests')
                .update({ status: 'expired' })
                .eq('status', 'sent')
                .lt('sent_at', expiryTime.toISOString());

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error cleaning up expired requests:', error);
            return { success: false, error: error.message };
        }
    }

    // Health check
    async healthCheck() {
        try {
            const { data, error } = await this.client
                .from('users')
                .select('count')
                .limit(1);

            if (error) throw error;
            
            return {
                healthy: true,
                timestamp: new Date().toISOString(),
                message: 'Supabase connection is healthy'
            };
        } catch (error) {
            return {
                healthy: false,
                timestamp: new Date().toISOString(),
                message: `Supabase connection failed: ${error.message}`
            };
        }
    }

    // Close connections
    async close() {
        try {
            // Unsubscribe from all real-time channels
            for (const [key, subscription] of this.subscriptions) {
                await this.client.removeChannel(subscription);
            }
            
            console.log('Supabase connections closed');
        } catch (error) {
            console.error('Error closing Supabase connections:', error);
        }
    }
}

// Create singleton instance
const supabaseClient = new SupabaseClient();

// Handle application shutdown
process.on('SIGTERM', async () => {
    await supabaseClient.close();
});

process.on('SIGINT', async () => {
    await supabaseClient.close();
});

module.exports = supabaseClient;
