const { Telegraf, Markup, session } = require('telegraf');
const { message } = require('telegraf/filters');

const mapService = require('../services/maps');
const pricingService = require('../services/pricing');
const matchingService = require('../services/matching');

const BOT_TOKEN = process.env.BOT_TOKEN;
// التأكد من أن ADMIN_USER_IDS تم تعيينها بشكل آمن
const ADMIN_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id)) : [];

class RideSharingBot {
    
    constructor(supabaseClientInstance) {
        this.bot = new Telegraf(BOT_TOKEN);
        this.userStates = new Map();
        this.activeRides = new Map();
        
        // تعيين عميل Supabase لخاصية الكلاس
        this.supabase = supabaseClientInstance.client; 
        
        this.setupMiddleware();
        this.setupHandlers();
    }

    setupMiddleware() {
        this.bot.use(session());
        this.bot.use(async (ctx, next) => {
            ctx.session = ctx.session || {};
            
            // تخزين موقع المستخدم الحالي في الجلسة إذا كان متاحاً
            if (ctx.message && ctx.message.location) {
                ctx.session.currentLocation = ctx.message.location;
            }
            await next();
        });
    }

    setupHandlers() {
        // Start command
        this.bot.start(this.handleStart.bind(this));

        // Registration handlers
        this.bot.hears('سجل كـ راكب 👤', this.handlePassengerRegistration.bind(this));
        this.bot.hears('سجل كـ سائق 🚖', this.handleDriverRegistration.bind(this));
        this.bot.on(message('text'), this.handleTextMessages.bind(this)); // معالج الرسائل النصية

        // Passenger flow
        this.bot.hears('طلب مشوار جديد 📍', this.handleNewRide.bind(this));
        this.bot.on('location', this.handleLocation.bind(this));
        this.bot.action(/confirm_ride_(.+)/, this.handleConfirmRide.bind(this));
        this.bot.action('change_destination', this.handleNewRide.bind(this));
        this.bot.action(/cancel_ride_(.+)/, this.handleCancelRide.bind(this));
        this.bot.hears('تتبع مشواري الحالي 🗺️', this.handleTrackRide.bind(this));
        this.bot.hears('سجل مشاويري 📋', this.handleRideHistory.bind(this));
        this.bot.hears('تعديل الملف الشخصي 👤', this.handleProfileUpdate.bind(this));
        this.bot.hears('التقييمات ⭐', this.handleRatings.bind(this));
        this.bot.hears('الدعم الفني 🆘', this.handleSupport.bind(this));

        // Driver flow
        this.bot.hears('تفعيل وضع الاستقبال 📱', this.handleDriverOnline.bind(this));
        this.bot.hears('تعطيل وضع الاستقبال 🔴', this.handleDriverOffline.bind(this));
        this.bot.action(/accept_(.+)/, this.handleDriverAcceptance.bind(this));
        this.bot.action(/reject_(.+)/, this.handleDriverRejection.bind(this));
        this.bot.hears('عرض الطلبات المتاحة 🚖', this.handleAvailableRides.bind(this));
        this.bot.hears('الإيرادات 💰', this.handleDriverRevenue.bind(this));

        // Admin commands
        this.bot.command('admin', this.handleAdminCommand.bind(this));

        // Error handling
        this.bot.catch((err, ctx) => {
            console.error('Bot error:', err);
            ctx.reply('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.');
        });
    }

    // /////////////////////////////////////////
    // 🛑 الدوال الأساسية (Core Functions)
    // /////////////////////////////////////////

    async handleStart(ctx) {
        const userId = ctx.from.id;
        
        const { data: user } = await this.supabase
            .from('users')
            .select('*')
            .eq('telegram_id', userId)
            .single();

        if (!user) {
            // New user - show registration options
            return ctx.reply(
                'السلام عليكم ورحمة الله وبركاته، أهلاً بك في بوت مشاويري جدة! سجل معنا وسهل عليك المشاوير.',
                Markup.keyboard([
                    ['سجل كـ راكب 👤', 'سجل كـ سائق 🚖']
                ]).resize()
            );
        }

        // Existing user - show appropriate menu
        if (user.role === 'passenger') {
            return this.showPassengerMenu(ctx);
        } else if (user.role === 'driver') {
            return this.showDriverMenu(ctx);
        } else if (user.role === 'admin') {
            return this.showAdminMenu(ctx);
        }
    }

    async handleTextMessages(ctx) {
        const text = ctx.message.text;
        const session = ctx.session;

        // معالجة إدخال الاسم في مرحلة التسجيل
        if (session.state === 'awaiting_name' && text.length > 3) {
            session.registration.name = text;
            session.state = 'awaiting_location';
            return ctx.reply('شكراً! الآن، يرجى إرسال موقعك الحالي عبر خاصية مشاركة الموقع في الدردشة (Share Location).');
        }
    }

    async handleLocation(ctx) {
        const location = ctx.message.location;
        const userId = ctx.from.id;
        const session = ctx.session;

        // 🛑 مسار طلب المشوار (التقاط ثم وجهة)
        if (session.state === 'awaiting_pickup') {
            session.pickupLocation = location; // تخزين موقع الالتقاء
            session.state = 'awaiting_destination';
            return ctx.reply('شكراً. الآن، أين وجهتك؟ فضلاً، أرسل لنا موقع الوجهة عبر خاصية مشاركة الموقع.');
            
        } else if (session.state === 'awaiting_destination') {
            // Ride destination
            await this.processRideRequest(ctx, location);
            
        } else if (session.state === 'awaiting_location') {
            // Registration location
            await this.completeRegistration(ctx, location);
            
        } else {
            // تحديث موقع الراكب/السائق الحالي (افتراضي)
            ctx.session.currentLocation = location;
            ctx.reply('تم تحديث موقعك الحالي بنجاح.');
        }
    }
    
    // /////////////////////////////////////////
    // 🛑 دوال التسجيل (Registration Functions)
    // /////////////////////////////////////////

    async handlePassengerRegistration(ctx) {
        ctx.session.registration = { role: 'passenger' };
        ctx.session.state = 'awaiting_name';
        
        ctx.reply('أهلاً بك أيها الراكب! أدخل اسمك الكامل:');
    }

    async handleDriverRegistration(ctx) {
        ctx.session.registration = { role: 'driver' };
        ctx.session.state = 'awaiting_name';
        
        ctx.reply('مرحباً بك أيها الكابتن! أدخل اسمك الكامل:');
    }

    async completeRegistration(ctx, location) {
        const { registration } = ctx.session;
        const user = ctx.from;

        // Save user to database
        const { data, error } = await this.supabase
            .from('users')
            .insert({
                telegram_id: user.id,
                full_name: registration.name,
                role: registration.role,
                home_location: `POINT(${location.longitude} ${location.latitude})`,
                current_location: `POINT(${location.longitude} ${location.latitude})`,
                status: 'active'
            });

        if (error) {
            console.error('Registration error:', error);
            return ctx.reply('حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.');
        }

        ctx.reply('تم التفعيل بنجاح! شكراً لانضمامك. إليك قائمة الخدمات.');
        
        delete ctx.session.registration;
        delete ctx.session.state;

        if (registration.role === 'passenger') {
            this.showPassengerMenu(ctx);
        } else {
            this.showDriverMenu(ctx);
        }
    }

    // /////////////////////////////////////////
    // 🛑 دوال الراكب (Passenger Functions)
    // /////////////////////////////////////////

    async handleNewRide(ctx) {
        const userId = ctx.from.id;
        let activeRide = null;
        
        try {
            // 🛑 تم تعديل الاستعلام: حذف .single() لمنع الخطأ إذا كان هناك أكثر من سجل
            const { data, error } = await this.supabase
                .from('rides')
                .select('*')
                .eq('passenger_id', userId)
                .in('status', ['pending', 'searching', 'driver_assigned', 'in_progress']);
                
            if (data && data.length > 0) {
                 activeRide = data[0];
            }
            
            if (error) {
                console.error('Supabase query error in handleNewRide:', error);
                // لا نوقف التنفيذ، بل نواصل لتقديم الرد للمستخدم
            }

        } catch (e) {
            console.error('Critical error fetching active ride:', e);
            return ctx.reply('حدث خطأ داخلي أثناء التحقق من المشاوير النشطة. يرجى المحاولة مرة أخرى.');
        }


        if (activeRide) {
            return ctx.reply('لديك مشوار نشط بالفعل. يرجى إنهاء المشوار الحالي أولاً.');
        }

        // 🛑 سيصل الكود إلى هنا حتماً إذا لم يكن هناك مشوار نشط أو بعد معالجة الأخطاء
        ctx.session.state = 'awaiting_pickup'; 
        return ctx.reply('لطلب مشوار جديد، فضلاً، أرسل لنا موقع الالتقاء عبر خاصية مشاركة الموقع في الدردشة (Share Location).');
    }

    async processRideRequest(ctx, destination) {
        const userId = ctx.from.id;
        const pickup = ctx.session.pickupLocation; 

        if (!pickup) {
            return ctx.reply('حدث خطأ: لم يتم تحديد موقع الالتقاء. يرجى البدء من جديد عبر النقر على "طلب مشوار جديد 📍".');
        }

        // Calculate route and pricing
        const route = await mapService.calculateRoute(pickup, destination);
        const fare = pricingService.calculateFare(route.distance, route.duration);

        // Create ride record
        const { data: ride } = await this.supabase
            .from('rides')
            .insert({
                passenger_id: userId,
                pickup_location: `POINT(${pickup.longitude} ${pickup.latitude})`,
                destination: `POINT(${destination.longitude} ${destination.latitude})`,
                distance_km: route.distance,
                duration_minutes: route.duration,
                estimated_fare: fare,
                status: 'pending'
            })
            .select()
            .single();

        // Show ride summary
        const pickupAddress = await mapService.reverseGeocode(pickup);
        const destAddress = await mapService.reverseGeocode(destination);
        
        // تنظيف الحالة بعد نجاح معالجة الطلب
        delete ctx.session.state; 
        delete ctx.session.pickupLocation;

        ctx.replyWithHTML(
            `<b>ملخص الطلب:</b>\n\n` +
            `📍 <b>من:</b> ${pickupAddress}\n` +
            `🎯 <b>إلى:</b> ${destAddress}\n` +
            `📏 <b>المسافة:</b> ${route.distance.toFixed(2)} كم\n` +
            `⏱️ <b>الوقت المتوقع:</b> ${route.duration} دقيقة\n` +
            `💰 <b>الأجرة المقدرة:</b> ${fare.toFixed(2)} ريال\n\n` +
            `هل تريد تأكيد الطلب؟`,
            Markup.inlineKeyboard([
                Markup.button.callback('تأكيد الطلب 🟢', `confirm_ride_${ride.id}`),
                Markup.button.callback('تعديل الوجهة ✏️', 'change_destination')
            ])
        );
    }
    
    async handleConfirmRide(ctx) {
        const rideId = ctx.match[1];
        
        // تحديث حالة المشوار إلى "searching"
        await this.supabase
            .from('rides')
            .update({ status: 'searching' })
            .eq('id', rideId);
            
        ctx.editMessageText('تم تأكيد الطلب! جار البحث عن أقرب سائق مناسب. يرجى الانتظار...', {
            reply_markup: Markup.inlineKeyboard([
                Markup.button.callback('إلغاء الطلب ❌', `cancel_ride_${rideId}`)
            ]).reply_markup
        });
        
        matchingService.startMatching(rideId); 
        ctx.answerCbQuery('تم تأكيد طلبك بنجاح.');
    }
    
    async handleCancelRide(ctx) {
        const rideId = ctx.match[1];
        
        // تحديث حالة المشوار إلى "cancelled"
        await this.supabase
            .from('rides')
            .update({ status: 'cancelled' })
            .eq('id', rideId);
            
        ctx.editMessageText('تم إلغاء الطلب.');
        ctx.answerCbQuery('تم إلغاء المشوار.');
    }

    async handleTrackRide(ctx) {
        ctx.reply('جاري عرض موقع المشوار الحالي...');
    }
    
    async handleRideHistory(ctx) {
        ctx.reply('جاري جلب سجل المشاوير...');
    }
    
    // /////////////////////////////////////////
    // 🛑 دوال السائق (Driver Functions)
    // /////////////////////////////////////////

    async handleDriverOnline(ctx) {
        const userId = ctx.from.id;

        await this.supabase
            .from('users')
            .update({
                is_online: true,
                current_location: ctx.session.currentLocation 
                    ? `POINT(${ctx.session.currentLocation.longitude} ${ctx.session.currentLocation.latitude})`
                    : null
            })
            .eq('telegram_id', userId);

        ctx.reply('تم تفعيل وضع الاستقبال. أنت الآن جاهز لاستلام طلبات المشاوير.');
        
        // Start listening for nearby rides
        this.startDriverMatching(userId);
    }

    async handleDriverOffline(ctx) {
        const userId = ctx.from.id;

        await this.supabase
            .from('users')
            .update({ is_online: false })
            .eq('telegram_id', userId);

        ctx.reply('تم تعطيل وضع الاستقبال. لن تستقبل طلبات جديدة الآن.');
        
        // إيقاف ميزة المطابقة للسائق
        clearInterval(this.activeRides.get(userId));
        this.activeRides.delete(userId);
    }

    async handleDriverAcceptance(ctx) {
        const rideId = ctx.match[1];
        const driverId = ctx.from.id;
        
        // تحديث حالة المشوار وتعيين السائق
        const { data: ride, error } = await this.supabase
            .from('rides')
            .update({ status: 'driver_assigned', driver_id: driverId })
            .eq('id', rideId)
            .select()
            .single();
            
        if (error) {
            return ctx.reply('حدث خطأ أثناء قبول المشوار.');
        }

        // إشعار الراكب
        this.bot.telegram.sendMessage(
            ride.passenger_id,
            `✅ تم قبول طلبك! السائق في الطريق إليك.`,
            Markup.inlineKeyboard([
                Markup.button.callback('بدء المشوار 🏁', `start_ride_${ride.id}`)
            ])
        );
        
        ctx.editMessageText('لقد قبلت المشوار. يرجى التوجه إلى نقطة الالتقاط.');
        ctx.answerCbQuery('تم قبول المشوار.');
    }

    async handleDriverRejection(ctx) {
        const rideId = ctx.match[1];
        const driverId = ctx.from.id;
        
        matchingService.handleRejection(rideId, driverId);

        ctx.editMessageText('تم رفض المشوار. سنبحث عن سائق آخر.');
        ctx.answerCbQuery('تم رفض المشوار.');
    }

    async handleAvailableRides(ctx) {
        ctx.reply('جاري جلب الطلبات المتاحة...');
    }

    async handleDriverRevenue(ctx) {
        ctx.reply('جاري جلب تقارير الإيرادات...');
    }

    // /////////////////////////////////////////
    // 🛑 دوال إدارية وعامة (Admin & General)
    // /////////////////////////////////////////

    async handleAdminCommand(ctx) {
        const userId = ctx.from.id;
        
        if (!ADMIN_IDS.includes(userId)) { 
             return ctx.reply('⚠️ عذراً، هذا الأمر مخصص للمشرفين فقط.');
        }

        this.showAdminMenu(ctx);
    }
    
    async handleProfileUpdate(ctx) {
        ctx.reply('جاري عرض خيارات تعديل الملف الشخصي...');
    }

    async handleRatings(ctx) {
        ctx.reply('جاري جلب التقييمات...');
    }
    
    async handleSupport(ctx) {
        ctx.reply('للدعم الفني، يرجى إرسال رسالتك الآن...');
    }

    // /////////////////////////////////////////
    // 🛑 الدوال المساعدة والتشغيل (Helpers)
    // /////////////////////////////////////////

    async startDriverMatching(driverId) {
        const intervalId = setInterval(async () => {
            const nearbyRides = await matchingService.findNearbyRides(driverId);
            
            for (const ride of nearbyRides) {
                await this.notifyDriverOfRide(driverId, ride);
            }
        }, 10000); // Check every 10 seconds

        this.activeRides.set(driverId, intervalId);
    }

    async notifyDriverOfRide(driverId, ride) {
        // ... (منطق إرسال الطلب)
    }

    async getUserLocation(userId) {
        const { data: user } = await this.supabase
            .from('users')
            .select('current_location')
            .eq('telegram_id', userId)
            .single();

        if (user && user.current_location) {
            // يتم تحويل POINT(lon lat) إلى كائن { longitude, latitude }
            const match = user.current_location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
            if (!match) return null;
            
            const lon = match[1];
            const lat = match[2];
            
            return { longitude: parseFloat(lon), latitude: parseFloat(lat) };
        }
        return null;
    }

    showPassengerMenu(ctx) {
        ctx.reply(
            'قائمة الخدمات:',
            Markup.keyboard([
                ['طلب مشوار جديد 📍', 'تتبع مشواري الحالي 🗺️'],
                ['سجل مشاويري 📋', 'تعديل الملف الشخصي 👤'],
                ['التقييمات ⭐', 'الدعم الفني 🆘']
            ]).resize()
        );
    }

    showDriverMenu(ctx) {
        ctx.reply(
            'قائمة الخدمات:',
            Markup.keyboard([
                ['تفعيل وضع الاستقبال 📱', 'تعطيل وضع الاستقبال 🔴'],
                ['عرض الطلبات المتاحة 🚖', 'تتبع مشواري الحالي 🗺️'],
                ['سجل مشاويري 📋', 'الإيرادات 💰'],
                ['التقييمات ⭐', 'الدعم الفني 🆘']
            ]).resize()
        );
    }

    showAdminMenu(ctx) {
        ctx.reply(
            'قائمة المشرف:',
            Markup.keyboard([
                ['إدارة المستخدمين 🧑‍💻', 'إدارة المشاوير 🚗'],
                ['عرض الإيرادات 💰', 'إعدادات النظام ⚙️']
            ]).resize()
        );
    }

    // في ملف RideSharingBot.js

    launch() {
        // 🛑 تأكد من أن هذا الرابط هو رابط Render الفعلي الذي تستخدمه
        const URL = 'https://mshawiri.onrender.com'; 
        const PORT = process.env.PORT || 3000;
        
        // 🛑 إيقاف Polling واستخدام Webhook
        this.bot.launch({
            webhook: {
                domain: URL, // المجال العام لخادم Render
                port: PORT   // المنفذ الذي يستمع إليه الخادم
            }
        });
        
        // 🛑 إرسال أمر تعيين Webhook إلى Telegram API
        this.bot.telegram.setWebhook(`${URL}/telegraf`).then(result => {
             console.log(`✅ Webhook set to: ${URL}/telegraf`);
        }).catch(err => {
             console.error('❌ Failed to set Webhook:', err);
        });

        console.log('🤖 Ride Sharing Bot is running via Webhook...');
        
        // Enable graceful stop
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));

        // ملاحظة: لا ننسى مشكلة Supabase Realtime التي يجب معالجتها لاحقاً.
    }
}


module.exports = RideSharingBot;

