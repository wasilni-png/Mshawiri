const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const supabase = require('../database/supabase');

class AdminDashboard {
    // 🛑 ملاحظة: إذا كان ملف '../database/supabase' لا يصدّر عميل Supabase مهيأ بشكل مباشر،
    // فيجب تعديل الدالة البانية لاستقبال العميل وتمريره.
    constructor() {
        this.app = express();
        this.port = process.env.ADMIN_PORT || 3000;
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('public'));
        
        // Authentication middleware
        this.app.use('/api/admin', this.authenticateAdmin.bind(this));
    }

    async authenticateAdmin(req, res, next) {
        // التأكد من أن المشرف هو الذي يتصل
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: Token missing' });
        }
        
        // التحقق من أن telegram_id موجود ومسجل كـ 'admin'
        const { data: admin } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'admin')
            // نفترض أن الـ token هو الـ telegram_id للمشرف
            .eq('telegram_id', parseInt(token)) 
            .single();

        if (!admin) {
            return res.status(403).json({ error: 'Forbidden: Not an admin user' });
        }

        req.admin = admin;
        next();
    }

    setupRoutes() {
        // Users management
        this.app.get('/api/admin/users', this.getUsers.bind(this));
        // 🛑 تم إضافة الدالة المفقودة
        this.app.put('/api/admin/users/:id/status', this.updateUserStatus.bind(this)); 
        
        // Rides management
        // 🛑 تم إضافة الدالة المفقودة
        this.app.get('/api/admin/rides', this.getRides.bind(this)); 
        this.app.get('/api/admin/rides/stats', this.getRideStats.bind(this));
        
        // Financial reports
        // 🛑 تم إضافة الدالة المفقودة
        this.app.get('/api/admin/revenue', this.getRevenueReport.bind(this)); 
        
        // Real-time monitoring
        // 🛑 تم إضافة الدالة المفقودة
        this.app.get('/api/admin/monitoring', this.getMonitoringData.bind(this)); 
        
        // Map visualization
        this.app.get('/api/admin/map-data', this.getMapData.bind(this));
    }

    // ////////////////////////////////////
    // 🛑 الدوال المفقودة (تمت الإضافة)
    // ////////////////////////////////////

    async updateUserStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body; // يتوقع body: { status: 'active' | 'suspended' }
            
            const { data, error } = await supabase
                .from('users')
                .update({ status: status })
                .eq('telegram_id', id) // نستخدم telegram_id كمعرف
                .select()
                .single();

            if (error) throw error;
            
            res.json({ message: `User ${id} status updated to ${status}`, user: data });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getRides(req, res) {
        try {
            const { status, page = 1, limit = 20 } = req.query;
            
            let query = supabase
                .from('rides')
                .select('*', { count: 'exact' });

            if (status) query = query.eq('status', status);

            const { data, error, count } = await query
                .range((page - 1) * limit, page * limit - 1)
                .order('created_at', { ascending: false });

            if (error) throw error;

            res.json({
                rides: data,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getRevenueReport(req, res) {
        // مثال: تقرير الإيرادات الكلي والصافي
        try {
            const { startDate, endDate } = req.query;

            const { data, error } = await supabase.rpc('get_financial_summary', {
                start_date: startDate,
                end_date: endDate
            });

            if (error) throw error;

            res.json({
                summary: data || { total_fare: 0, service_fee: 0, net_revenue: 0 }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    
    // هذه الدالة تعتمد على بيانات المراقبة التي يتم تجميعها
    async getMonitoringData(req, res) {
        // عادة ما يتم جلبها من كائن MonitoringService
        const mockData = {
            cpu_usage: 15,
            memory_usage: 450,
            uptime: Math.floor(process.uptime()),
            health_status: {
                Supabase: 'healthy',
                GraphHopper: 'healthy'
            }
        };
        res.json(mockData);
    }
    
    async getActiveDrivers(req, res) {
        // يجلب السائقين النشطين (is_online = true)
        const { data } = await supabase
            .from('users')
            .select(`
                telegram_id, 
                full_name, 
                current_location,
                status
            `)
            .eq('role', 'driver')
            .eq('is_online', true);

        return data;
    }
    
    async getHotspots() {
        // يستخدم نفس دالة generateHeatmapData التي تم تعريفها
        return this.generateHeatmapData();
    }
    
    // ////////////////////////////////////
    // الدوال الأساسية (Core Functions)
    // ////////////////////////////////////

    async getUsers(req, res) {
        try {
            const { role, status, page = 1, limit = 20 } = req.query;
            
            let query = supabase
                .from('users')
                .select('*', { count: 'exact' });

            if (role) query = query.eq('role', role);
            if (status) query = query.eq('status', status);

            const { data, error, count } = await query
                .range((page - 1) * limit, page * limit - 1)
                .order('created_at', { ascending: false });

            if (error) throw error;

            res.json({
                users: data,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: count
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getRideStats(req, res) {
        try {
            const { startDate, endDate } = req.query;

            // Get ride statistics
            const { data: stats } = await supabase
                .from('rides')
                .select(`
                    status,
                    count:count(*),
                    total_revenue:sum(final_fare)
                `)
                .gte('created_at', startDate)
                .lte('created_at', endDate)
                .group('status');

            // Get daily ride counts
            const { data: dailyStats } = await supabase
                .rpc('get_daily_ride_stats', {
                    start_date: startDate,
                    end_date: endDate
                });

            res.json({
                stats,
                dailyStats,
                heatmap: await this.generateHeatmapData()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async generateHeatmapData() {
        // Generate heatmap data for popular pickup locations
        const { data } = await supabase
            .rpc('get_ride_heatmap');

        return data;
    }

    async getMapData(req, res) {
        try {
            const { type = 'active_rides' } = req.query;

            let data;
            switch (type) {
                case 'active_rides':
                    data = await this.getActiveRides();
                    break;
                case 'active_drivers':
                    // 🛑 استدعاء الدالة المضافة
                    data = await this.getActiveDrivers(); 
                    break;
                case 'hotspots':
                    // 🛑 استدعاء الدالة المضافة
                    data = await this.getHotspots(); 
                    break;
                default:
                    data = [];
            }

            res.json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async getActiveRides() {
        const { data } = await supabase
            .from('rides')
            .select(`
                id,
                status,
                pickup_location,
                destination,
                users!rides_passenger_id_fkey(full_name),
                drivers:users!rides_driver_id_fkey(full_name)
            `)
            .in('status', ['driver_assigned', 'in_progress']);

        return data;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🚀 Admin dashboard running on port ${this.port}`);
        });
    }
}

module.exports = AdminDashboard;

