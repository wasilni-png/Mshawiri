const supabase = require('../database/supabase');

class MatchingService {
    async findNearbyRides(driverId, maxDistanceKm = 5) {
        // Get driver's location
        const { data: driver } = await supabase
            .from('users')
            .select('current_location')
            .eq('id', driverId)
            .single();

        if (!driver || !driver.current_location) {
            return [];
        }

        // Extract coordinates
        const match = driver.current_location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
        if (!match) return [];

        const driverLon = parseFloat(match[1]);
        const driverLat = parseFloat(match[2]);

        // Find nearby rides using PostGIS
        const { data: rides } = await supabase
            .rpc('find_nearby_rides', {
                driver_lat: driverLat,
                driver_lon: driverLon,
                max_distance: maxDistanceKm
            });

        return rides || [];
    }

    async matchDriverToRide(rideId) {
        const ride = await this.getRide(rideId);
        if (!ride) return null;

        // Get nearby drivers
        const match = ride.pickup_location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
        const pickupLon = parseFloat(match[1]);
        const pickupLat = parseFloat(match[2]);

        const { data: drivers } = await supabase
            .rpc('find_nearby_drivers', {
                lat: pickupLat,
                lon: pickupLon,
                radius_km: 5
            });

        if (!drivers || drivers.length === 0) {
            return null;
        }

        // Select best driver (closest with highest rating)
        const bestDriver = drivers.reduce((best, current) => {
            if (!best) return current;
            if (current.distance_km < best.distance_km && current.rating >= 4.0) {
                return current;
            }
            return best;
        });

        return bestDriver;
    }

    async sendRideRequestToDrivers(rideId, driverIds) {
        const ride = await this.getRide(rideId);
        
        for (const driverId of driverIds) {
            // Create ride request record
            await supabase
                .from('ride_requests')
                .insert({
                    ride_id: rideId,
                    driver_id: driverId,
                    status: 'sent'
                });

            // Send notification (handled by bot)
            // This would trigger a real-time notification
        }
    }
}

module.exports = new MatchingService();
