class PricingService {
    calculateFare(distanceKm, durationMinutes, surgeMultiplier = 1.0) {
        const baseFare = parseFloat(process.env.BASE_FARE) || 5.0;
        const pricePerKm = parseFloat(process.env.PRICE_PER_KM) || 2.0;
        const pricePerMinute = parseFloat(process.env.PRICE_PER_MINUTE) || 0.5;
        const minimumFare = parseFloat(process.env.MINIMUM_FARE) || 10.0;

        let fare = baseFare + 
                  (distanceKm * pricePerKm) + 
                  (durationMinutes * pricePerMinute);

        fare *= surgeMultiplier;
        
        return Math.max(fare, minimumFare);
    }

    calculateSurgeMultiplier(area, time) {
        // Implement surge pricing logic based on demand
        const now = new Date();
        const hour = now.getHours();
        const isPeak = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
        
        if (isPeak) {
            return 1.5; // 50% surge during peak hours
        }
        
        return 1.0;
    }
}

module.exports = new PricingService();
