const axios = require('axios');

class MapService {
    constructor() {
        this.apiKey = process.env.GRAPHHOPPER_API_KEY;
        this.baseUrl = process.env.GRAPHHOPPER_API_URL;
    }

    async calculateRoute(start, end) {
        try {
            const response = await axios.get(`${this.baseUrl}/route`, {
                params: {
                    point: `${start.latitude},${start.longitude}`,
                    point: `${end.latitude},${end.longitude}`,
                    vehicle: 'car',
                    locale: 'ar',
                    key: this.apiKey
                }
            });

            if (response.data.paths && response.data.paths.length > 0) {
                const path = response.data.paths[0];
                return {
                    distance: path.distance / 1000, // Convert to km
                    duration: Math.ceil(path.time / 60000), // Convert to minutes
                    points: path.points // Encoded polyline
                };
            }
            throw new Error('No route found');
        } catch (error) {
            console.error('Route calculation error:', error);
            throw error;
        }
    }

    async reverseGeocode(location) {
        try {
            const response = await axios.get(`${this.baseUrl}/geocode`, {
                params: {
                    point: `${location.latitude},${location.longitude}`,
                    reverse: true,
                    key: this.apiKey
                }
            });

            if (response.data.hits && response.data.hits.length > 0) {
                return response.data.hits[0].name || 'موقع غير معروف';
            }
            return 'موقع غير معروف';
        } catch (error) {
            console.error('Reverse geocode error:', error);
            return 'موقع غير معروف';
        }
    }

    async getStaticMap(points, width = 600, height = 400) {
        // Generate static map image URL
        const pointsStr = points.map(p => `${p.lat},${p.lon}`).join('|');
        return `https://graphhopper.com/api/1/route?point=${pointsStr}&vehicle=car&instructions=false&key=${this.apiKey}&width=${width}&height=${height}`;
    }

    async findNearbyDrivers(location, radiusKm = 5) {
        // This would use Supabase's PostGIS functions
        // Implemented in database query
    }
}

module.exports = new MapService();
