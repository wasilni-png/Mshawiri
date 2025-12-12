// src/database/models/Ride.js
class Ride {
    constructor(data) {
        this.id = data.id;
        this.passengerId = data.passenger_id;
        this.driverId = data.driver_id;
        this.pickupLocation = data.pickup_location;
        this.destination = data.destination;
        this.distanceKm = data.distance_km;
        this.durationMinutes = data.duration_minutes;
        this.estimatedFare = data.estimated_fare;
        this.finalFare = data.final_fare;
        this.status = data.status;
        this.cancellationReason = data.cancellation_reason;
        this.startedAt = data.started_at;
        this.completedAt = data.completed_at;
        this.createdAt = data.created_at;
    }

    toJSON() {
        return {
            id: this.id,
            passengerId: this.passengerId,
            driverId: this.driverId,
            pickupLocation: this.pickupLocation,
            destination: this.destination,
            distanceKm: this.distanceKm,
            durationMinutes: this.durationMinutes,
            estimatedFare: this.estimatedFare,
            finalFare: this.finalFare,
            status: this.status,
            cancellationReason: this.cancellationReason,
            startedAt: this.startedAt,
            completedAt: this.completedAt,
            createdAt: this.createdAt
        };
    }

    getStatusText() {
        const statusMap = {
            'pending': 'قيد الانتظار',
            'searching': 'جاري البحث عن سائق',
            'driver_assigned': 'تم تعيين سائق',
            'driver_arrived': 'وصل السائق',
            'in_progress': 'جاري التنفيذ',
            'completed': 'مكتمل',
            'cancelled': 'ملغي'
        };
        
        return statusMap[this.status] || this.status;
    }

    static fromJSON(json) {
        return new Ride({
            id: json.id,
            passenger_id: json.passengerId,
            driver_id: json.driverId,
            pickup_location: json.pickupLocation,
            destination: json.destination,
            distance_km: json.distanceKm,
            duration_minutes: json.durationMinutes,
            estimated_fare: json.estimatedFare,
            final_fare: json.finalFare,
            status: json.status,
            cancellation_reason: json.cancellationReason,
            started_at: json.startedAt,
            completed_at: json.completedAt,
            created_at: json.createdAt
        });
    }
}

module.exports = Ride;
