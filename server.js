// ////////////////////////////////////////////////////////
// محتوى ملف: server.js (الكود المصحح والكامل)
// ////////////////////////////////////////////////////////

require('dotenv').config();

// 🛑 1. الاستيراد الإضافي: استيراد نسخة عميل Supabase
// (يجب التأكد من أن هذا الملف يقوم بتصدير نسخة مهيأة من SupabaseClient)
const supabaseClientInstance = require('./src/database/supabase'); 

const RideSharingBot = require('./src/bot/bot');
const AdminDashboard = require('./src/admin/dashboard');
const MonitoringService = require('./src/monitoring/performance');

class Application {
    constructor() {
        // 🛑 2. التمرير المصحح: تمرير العميل كاعتمادية إلى البوت ولوحة التحكم
        // هذا يحل مشكلة 'this.supabase is undefined' في الكلاسات الأخرى
        this.bot = new RideSharingBot(supabaseClientInstance); 
        this.adminDashboard = new AdminDashboard(supabaseClientInstance);
        this.monitoring = MonitoringService;
    }

    async initialize() {
        console.log('🚗 Starting Ride Sharing Application...');
        
        // Check environment variables
        this.validateEnvironment();
        
        // Start bot
        this.bot.launch();
        
        // Start admin dashboard
        this.adminDashboard.start();
        
        // Start monitoring
        this.startMonitoring();
        
        // Handle graceful shutdown
        this.setupGracefulShutdown();
        
        console.log('✅ Application started successfully!');
    }

    validateEnvironment() {
        const required = [
            'BOT_TOKEN',
            'SUPABASE_URL',
            'SUPABASE_ANON_KEY',
            'SUPABASE_SERVICE_KEY', // يفضل إضافة هذا للتأكد من عمل الدوال الإدارية
            'GRAPHHOPPER_API_KEY'
        ];

        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing environment variables: ${missing.join(', ')}`);
        }
    }

    startMonitoring() {
        // Health check every 5 minutes
        setInterval(async () => {
            const health = await this.monitoring.checkServiceHealth();
            console.log('Service Health:', health);
        }, 5 * 60 * 1000);

        // Log metrics every hour
        setInterval(() => {
            const metrics = this.monitoring.getMetrics();
            console.log('Application Metrics:', metrics);
        }, 60 * 60 * 1000);
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n${signal} received. Starting graceful shutdown...`);
            
            // Stop accepting new requests
            // Close database connections
            // Stop background jobs
            
            console.log('👋 Shutdown complete');
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }
}

// Start the application
const app = new Application();
app.initialize().catch(console.error);

// ////////////////////////////////////////////////////////

