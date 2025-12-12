const winston = require('winston');
const axios = require('axios');

class MonitoringService {
    constructor() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });

        this.metrics = {
            apiCalls: 0,
            errors: 0,
            rideMatches: 0,
            averageResponseTime: 0
        };
    }

    logApiCall(endpoint, duration, success = true) {
        this.metrics.apiCalls++;
        
        if (!success) {
            this.metrics.errors++;
        }

        this.logger.info('API Call', {
            endpoint,
            duration,
            success,
            timestamp: new Date().toISOString()
        });

        // Update average response time
        this.metrics.averageResponseTime = 
            (this.metrics.averageResponseTime * (this.metrics.apiCalls - 1) + duration) / 
            this.metrics.apiCalls;
    }

    logRideEvent(event, rideId, details = {}) {
        this.logger.info('Ride Event', {
            event,
            rideId,
            ...details,
            timestamp: new Date().toISOString()
        });

        if (event === 'driver_matched') {
            this.metrics.rideMatches++;
        }
    }

    async checkServiceHealth() {
        const BOT_TOKEN = process.env.BOT_TOKEN;

        // 🛑 التعديل: استخدام BOT_TOKEN في مسار Telegram API للتحقق من الصحة
        const healthChecks = [
            { 
                name: 'Telegram API', 
                url: `https://api.telegram.org/bot${BOT_TOKEN}/getMe`, // تم تضمين التوكن هنا
                options: { timeout: 5000 } 
            },
            { 
                name: 'Supabase', 
                url: `${process.env.SUPABASE_URL}/rest/v1/users?limit=1`, 
                options: { 
                    timeout: 5000,
                    headers: {
                        'apikey': process.env.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                    }
                } 
            },
            { 
                name: 'GraphHopper', 
                url: `https://graphhopper.com/api/1/route?point=21.4858,39.1925&point=21.4859,39.1926&vehicle=car&key=${process.env.GRAPHHOPPER_API_KEY}`,
                options: { timeout: 5000 }
            }
        ];

        const healthStatus = {};

        for (const check of healthChecks) {
            try {
                const start = Date.now();
                await axios.get(check.url, check.options); 
                const duration = Date.now() - start;

                healthStatus[check.name] = {
                    status: 'healthy',
                    responseTime: duration,
                    timestamp: new Date().toISOString()
                };
            } catch (error) {
                const errorMessage = error.response 
                                     ? `Request failed with status code ${error.response.status}` 
                                     : error.message;

                healthStatus[check.name] = {
                    status: 'unhealthy',
                    error: errorMessage,
                    timestamp: new Date().toISOString()
                };

                // Send alert
                this.sendAlert(`🚨 ${check.name} is down: ${errorMessage}`);
            }
        }

        return healthStatus;
    }

    sendAlert(message) {
        // Send alert to admin (could be Telegram, email, etc.)
        console.error(message);
        
        // In production, integrate with Sentry, PagerDuty, etc.
    }

    getMetrics() {
        return {
            ...this.metrics,
            timestamp: new Date().toISOString(),
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };
    }
}

module.exports = new MonitoringService();

