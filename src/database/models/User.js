// src/database/models/User.js
class User {
    constructor(data) {
        this.id = data.id;
        this.telegramId = data.telegram_id;
        this.fullName = data.full_name;
        this.phone = data.phone;
        this.role = data.role;
        this.status = data.status;
        this.homeLocation = data.home_location;
        this.currentLocation = data.current_location;
        this.rating = data.rating;
        this.totalRides = data.total_rides;
        this.carPlate = data.car_plate;
        this.carModel = data.car_model;
        this.isOnline = data.is_online;
        this.createdAt = data.created_at;
        this.updatedAt = data.updated_at;
    }

    toJSON() {
        return {
            id: this.id,
            telegramId: this.telegramId,
            fullName: this.fullName,
            phone: this.phone,
            role: this.role,
            status: this.status,
            homeLocation: this.homeLocation,
            currentLocation: this.currentLocation,
            rating: this.rating,
            totalRides: this.totalRides,
            carPlate: this.carPlate,
            carModel: this.carModel,
            isOnline: this.isOnline,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    static fromJSON(json) {
        return new User({
            id: json.id,
            telegram_id: json.telegramId,
            full_name: json.fullName,
            phone: json.phone,
            role: json.role,
            status: json.status,
            home_location: json.homeLocation,
            current_location: json.currentLocation,
            rating: json.rating,
            total_rides: json.totalRides,
            car_plate: json.carPlate,
            car_model: json.carModel,
            is_online: json.isOnline,
            created_at: json.createdAt,
            updated_at: json.updatedAt
        });
    }
}

module.exports = User;
