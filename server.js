const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// 1. RESTRINGIR PETICIONES (Panel Netlify, tienda y localhost)
const whitelist = [
    'https://jxsephpaneladmin.netlify.app',
    'https://jxsephstore.shop',
    'https://www.jxsephstore.shop',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado por CORS: Acceso no autorizado desde otro sitio web.'));
        }
    }
};

app.use(cors(corsOptions));

// Límites ampliados para aceptar imágenes de comprobantes grandes en Base64
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const uri = "mongodb+srv://jxsephadmin:TUNAX2g1y6BGQbYq@jxsephstoredb.mgemkee.mongodb.net/jxseph_store?retryWrites=true&w=majority&appName=JxsephStoreDB";
mongoose.connect(uri)
.then(() => console.log('✅ Conectado exitosamente a MongoDB Atlas'))
.catch(err => console.error('❌ Error al conectar a la base de datos:', err));

// --- MODELOS DE MONGOOSE ---

const blockedIpSchema = new mongoose.Schema({
    ip: { type: String, unique: true },
    reason: String,
    createdAt: { type: Date, default: Date.now }
});
const BlockedIp = mongoose.model('BlockedIp', blockedIpSchema);

const cacheSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    nombre: String,
    createdAt: { type: Date, default: Date.now }
});
const CacheModel = mongoose.model('uids_cache', cacheSchema);

// Modelo para Códigos de Canje
const redeemCodeSchema = new mongoose.Schema({
    code: { type: String, unique: true, uppercase: true, required: true },
    game: { type: String, required: true },
    packageType: { type: String, required: true },
    used: { type: Boolean, default: false },
    usedByUid: { type: String, default: null },
    usedByName: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});
const RedeemCode = mongoose.model('RedeemCode', redeemCodeSchema);

// Controlar Cooldown de Canjes por UID (1 hora)
const redeemCooldownSchema = new mongoose.Schema({
    uid: { type: String, unique: true, required: true },
    lastRedeemTime: { type: Date, required: true }
});
const RedeemCooldown = mongoose.model('RedeemCooldown', redeemCooldownSchema);

// Modelo de Pedidos
const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    identifier: String,
    uidFreeFire: String,
    playerName: String,
    packageType: String,
    phone: String,
    reference: String,
    receiptImage: String,
    status: { type: String, default: 'Pendiente' },
    ipAddress: String,
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const verificationLogSchema = new mongoose.Schema({
    ip: String,
    uid: String,
    success: Boolean,
    playerName: String,
    createdAt: { type: Date, default: Date.now }
});
const VerificationLog = mongoose.model('VerificationLog', verificationLogSchema);

// Modelo de Usuarios (Autenticación)
const userAuthSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String },
    telefono: { type: String },
    googleId: { type: String },
    totalCompras: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const UserAuth = mongoose.model('UserAuth', userAuthSchema);

// --- MIDDLEWARE PARA BLOQUEAR IPS BANEADAS ---
app.use(async (req, res, next) => {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp && clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim();
    }
    try {
        const isBlocked = await BlockedIp.findOne({ ip: clientIp });
        if (isBlocked) {
            if (req.originalUrl.startsWith('/api') || req.path.startsWith('/api')) {
                return res.status(403).json({ success: false, error: 'Tu dirección IP ha sido bloqueada.', reason: isBlocked.reason });
            }
            return res.status(403).json({ success: false, error: 'Tu dirección IP ha sido bloqueada por seguridad.' });
        }
    } catch (e) {}
    req.clientIp = clientIp || 'Desconocida';
    next();
});

// --- CONFIGURACIÓN DE LAS 5 CUENTAS API (FREE FIRE) ---
const cuentasApi = [
    { useruid: "US1sc9xwLJPZUPCFctlSkQeoa5r2", apiKey: "kaiqIA3oUtxFA9kBBaP9UZB8fBbFb1" },
    { useruid: "qsYZfYr7CJW4qOQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCsNBoT0Rxd8rBe9FR" },
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwdCBH49kQ88MDRdWk2nGyvsCS" },
    { useruid: "p8OmIYOXDcZWk7hyZeCMaXmQUHl1", apiKey: "fWHi1gMaQyitoBK2ItMoD34C9CfzH1" },
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgWMOkyUzgxKheQbJP4sNp" }
];

async function procesarVerificacionUid(uid, clientIp) {
    try {
        const cachedUser = await CacheModel.findOne({ uid: uid });
        if (cachedUser) {
            await VerificationLog.create({ ip: clientIp, uid, success: true, playerName: cachedUser.nombre });
            return { valid: true, AccountName: cachedUser.nombre, cached: true };
        }

        let nombreJugador = null;
        for (let i = 0; i < cuentasApi.length; i++) {
            const cuenta = cuentasApi[i];
            const url = `https://proapis.hlgamingofficial.com/main/games/freefire/validation/api?sectionName=freefireValidation&useruid=${cuenta.useruid}&api=${cuenta.apiKey}&uid=${uid}&region=US`;

            try {
                const respuesta = await fetch(url);
                const textoRespuesta = await respuesta.text();
                if (textoRespuesta.trim().startsWith('<') || !respuesta.ok) continue;
                const data = JSON.parse(textoRespuesta);
                if (data.error_code === "QUOTA_LIMIT_REACHED" || data.status === "quota_exceeded" || data.error === "Auth Failed") continue;
                if (data.result && data.result.valid && data.result.AccountName) {
                    nombreJugador = data.result.AccountName;
                    break;
                }
            } catch (err) {}
        }

        if (nombreJugador) {
            await CacheModel.create({ uid: uid, nombre: nombreJugador });
            await VerificationLog.create({ ip: clientIp, uid, success: true, playerName: nombreJugador });
            return { valid: true, AccountName: nombreJugador, cached: false };
        } else {
            await VerificationLog.create({ ip: clientIp, uid, success: false, playerName: 'No encontrado' });
            return { valid: false, error: "UID no válido o cuentas agotadas" };
        }
    } catch (error) {
        await VerificationLog.create({ ip: clientIp, uid, success: false, playerName: 'Error de servidor' });
        return { valid: false, error: "Error interno del servidor" };
    }
}

app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    const clientIp = req.clientIp;
    if (!uid) return res.status(400).json({ valid: false, error: "Falta el UID" });
    const resultado = await procesarVerificacionUid(uid, clientIp);
    res.json(resultado);
});

app.post('/api/verificar-id', async (req, res) => {
    const { uid } = req.body;
    const clientIp = req.clientIp;
    if (!uid) return res.status(400).json({ success: false, error: "Falta el UID" });
    const resultado = await procesarVerificacionUid(uid, clientIp);
    res.json({ success: resultado.valid, playerName: resultado.AccountName || null, error: resultado.error });
});

app.get('/api/admin/verificaciones', async (req, res) => {
    try {
        const logs = await VerificationLog.find().sort({ createdAt: -1 }).limit(100);
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener registros de verificación.' });
    }
});

app.post('/api/admin/bloquear-ip', async (req, res) => {
    try {
        const { ip, reason } = req.body;
        if (!ip) return res.status(400).json({ success: false, error: 'Falta la IP.' });
        await BlockedIp.findOneAndUpdate(
            { ip },
            { reason: reason || 'Bloqueado por administrador', createdAt: Date.now() },
            { upsert: true, new: true }
        );
        res.json({ success: true, message: `IP ${ip} bloqueada correctamente.` });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al bloquear la IP.' });
    }
});

// --- RUTAS DE GESTIÓN Y DESBLOQUEO DE IPS ---

app.get('/api/admin/ips-bloqueadas', async (req, res) => {
    try {
        const ips = await BlockedIp.find().sort({ createdAt: -1 });
        res.json({ success: true, ips });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener las IPs bloqueadas.' });
    }
});

app.delete('/api/admin/desbloquear-ip', async (req, res) => {
    try {
        const { ip } = req.body;
        if (!ip) return res.status(400).json({ success: false, error: 'Falta la dirección IP.' });

        const resultado = await BlockedIp.findOneAndDelete({ ip: ip.trim() });
        if (!resultado) {
            return res.status(404).json({ success: false, error: 'La IP no se encuentra en la lista de bloqueados.' });
        }

        res.json({ success: true, message: `IP ${ip} desbloqueada correctamente.` });
    } catch (error) {
        console.error("Error al desbloquear IP:", error);
        res.status(500).json({ success: false, error: 'Error interno al desbloquear la IP.' });
    }
});

// --- RUTAS DE AUTENTICACIÓN Y USUARIO ---

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nombre, telefono, email, password } = req.body;
        if (!email || !password || !nombre) {
            return res.status(400).json({ success: false, message: 'Faltan datos obligatorios.' });
        }

        const existingUser = await UserAuth.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Este correo ya está registrado.' });
        }

        const newUser = new UserAuth({
            nombre,
            telefono,
            email: email.toLowerCase().trim(),
            password,
            totalCompras: 0
        });

        await newUser.save();

        res.json({ success: true, message: '¡Cuenta creada exitosamente!' });
    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ success: false, message: 'Error interno al registrar usuario.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Faltan datos.' });
        }

        const user = await UserAuth.findOne({ email: email.toLowerCase().trim() });
        if (!user || user.password !== password) {
            return res.status(400).json({ success: false, message: 'Correo o contraseña incorrectos.' });
        }

        res.json({
            success: true,
            token: "token_jwt_mock_" + user._id,
            user: {
                nombre: user.nombre,
                email: user.email,
                totalCompras: user.totalCompras
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al iniciar sesión.' });
    }
});

app.post('/api/auth/google', async (req, res) => {
    try {
        const { token } = req.body;
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
        
        const { sub: googleId, email, name: nombre } = payload;
        if (!email) return res.status(400).json({ success: false, message: 'Token de Google inválido.' });

        let user = await UserAuth.findOne({ email: email.toLowerCase().trim() });

        if (!user) {
            user = new UserAuth({
                nombre,
                email: email.toLowerCase().trim(),
                googleId,
                totalCompras: 0
            });
            await user.save();
        }

        res.json({
            success: true,
            token: "token_google_" + user._id,
            user: {
                nombre: user.nombre,
                email: user.email,
                totalCompras: user.totalCompras
            }
        });
    } catch (error) {
        console.error("Error Google Auth:", error);
        res.status(500).json({ success: false, message: 'Error al autenticar con Google.' });
    }
});

// Ruta para obtener datos actualizados del usuario en tiempo real
app.get('/api/auth/usuario', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ success: false, error: 'Falta el correo.' });

        const user = await UserAuth.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });

        res.json({
            success: true,
            user: {
                nombre: user.nombre,
                email: user.email,
                totalCompras: user.totalCompras || 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener datos del usuario.' });
    }
});

// --- RUTAS DE CÓDIGOS DE CANJE ---

app.post('/api/redeem/verificar', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Falta el código.' });
        const cleanCode = code.trim().toUpperCase();
        const codeDoc = await RedeemCode.findOne({ code: cleanCode });

        if (!codeDoc) return res.status(404).json({ success: false, message: `El código no existe.` });
        if (codeDoc.used) return res.status(400).json({ success: false, message: `El código ya fue utilizado.` });

        res.json({ success: true, game: codeDoc.game, packageType: codeDoc.packageType });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al verificar el código.' });
    }
});

app.post('/api/redeem/canjear', async (req, res) => {
    try {
        const { code, uid, playerName, email, phone, contacto } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Falta el código.' });
        const cleanCode = code.trim().toUpperCase();
        
        const tempDoc = await RedeemCode.findOne({ code: cleanCode });
        if (!tempDoc) return res.status(404).json({ success: false, message: 'El código no existe.' });

        const isFreeFire = tempDoc.game === 'Free Fire';

        if (isFreeFire && uid) {
            const cooldownRegistro = await RedeemCooldown.findOne({ uid: uid });
            if (cooldownRegistro) {
                const tiempoTranscurrido = Date.now() - new Date(cooldownRegistro.lastRedeemTime).getTime();
                const unaHoraEnMilisegundos = 60 * 60 * 1000;

                if (tiempoTranscurrido < unaHoraEnMilisegundos) {
                    const minutosRestantes = Math.ceil((unaHoraEnMilisegundos - tiempoTranscurrido) / (60 * 1000));
                    return res.status(400).json({ 
                        success: false, 
                        message: `⏳ Ya has canjeado un código recientemente. Debes esperar ${minutosRestantes} minuto(s) más para volver a canjear con este UID.` 
                    });
                }
            }
        }

        const assignedUid = isFreeFire ? (uid || 'N/A') : 'Giftcard Entregada';
        let datoRoblox = email && phone ? `Email: ${email} | Tel: ${phone}` : (email || phone || contacto);
        const assignedName = isFreeFire ? (playerName || 'N/A') : (datoRoblox ? String(datoRoblox).trim() : 'Sin contacto');

        const codeDoc = await RedeemCode.findOneAndUpdate(
            { code: cleanCode, used: false },
            { $set: { used: true, usedByUid: assignedUid, usedByName: assignedName } },
            { new: true }
        );
        if (!codeDoc) return res.status(400).json({ success: false, message: 'Este código acaba de ser canjeado por otro usuario.' });

        if (isFreeFire && uid) {
            await RedeemCooldown.findOneAndUpdate(
                { uid: uid },
                { lastRedeemTime: new Date() },
                { upsert: true, new: true }
            );
        }

        res.json({ success: true, message: '¡Canje procesado exitosamente!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al registrar el canje.' });
    }
});

app.post('/api/admin/redeem/generar', async (req, res) => {
    try {
        const { game, packageType } = req.body;
        if (!game || !packageType) return res.status(400).json({ success: false, error: 'Faltan datos.' });

        const code = `JXSEPH-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        await new RedeemCode({ code, game, packageType }).save();
        res.json({ success: true, message: `Código generado con éxito.`, code });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al generar el código.' });
    }
});

app.get('/api/admin/redeem/todos', async (req, res) => {
    try {
        const codigos = await RedeemCode.find().sort({ createdAt: -1 });
        const listaFormateada = codigos.map(c => ({
            id: c._id,
            code: c.code,
            game: c.game,
            packageType: c.packageType,
            estado: c.used ? 'Canjeado' : 'Disponible',
            canjeadoPor: {
                uid: c.game === 'Free Fire' ? (c.usedByUid || 'Pendiente') : 'No aplica',
                playerName: c.game === 'Free Fire' ? (c.usedByName || 'Pendiente') : (c.usedByName || 'No aplica')
            },
            fechaCreacion: c.createdAt
        }));
        res.json({ success: true, codigos: listaFormateada });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener códigos.' });
    }
});

app.delete('/api/admin/redeem/:id', async (req, res) => {
    try {
        let parametro = req.params.id;
        let resultado = null;

        if (mongoose.Types.ObjectId.isValid(parametro)) {
            resultado = await RedeemCode.findByIdAndDelete(parametro);
        }
        
        if (!resultado) {
            resultado = await RedeemCode.findOneAndDelete({ code: parametro.toUpperCase() });
        }

        if (!resultado) {
            return res.status(404).json({ success: false, error: 'Código no encontrado en la base de datos.' });
        }

        res.json({ success: true, message: 'Código eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al eliminar el código.' });
    }
});

// --- RUTAS DE PEDIDOS Y PANEL ADMIN ---

app.post('/api/pedidos', async (req, res) => {
    try {
        const { orderId: orderIdCliente, identifier, uidFreeFire, playerName, packageType, phone, reference, receiptImage } = req.body;
        
        const orderId = orderIdCliente || ('JX-' + Math.floor(100000 + Math.random() * 900000));
        const clientIp = req.clientIp;

        const newOrder = new Order({
            orderId,
            identifier,
            uidFreeFire,
            playerName,
            packageType,
            phone,
            reference, 
            receiptImage,
            ipAddress: clientIp
        });

        await newOrder.save();

        res.json({ success: true, orderId, message: 'Pedido creado exitosamente.' });
    } catch (error) {
        console.error("Error al guardar pedido:", error);
        res.status(500).json({ error: 'Error al procesar el pedido.' });
    }
});

app.get(['/api/pedidos', '/api/compras'], async (req, res) => {
    try {
        const { identifier, email, orderId } = req.query;
        let query = {};
        const filtroUsuario = identifier || email;
        if (filtroUsuario) query.identifier = filtroUsuario;
        if (orderId) query.orderId = orderId;

        const orders = await Order.find(query).sort({ createdAt: -1 });
        res.json({ success: true, compras: orders, orders });
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar compras.' });
    }
});

app.get('/api/admin/pedidos', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar pedidos.' });
    }
});

// ACTUALIZACIÓN DE PEDIDO CON INCREMENTO AUTOMÁTICO DE COMPRAS AL COMPLETAR
app.put('/api/admin/pedidos/:id', async (req, res) => {
    try {
        const { status } = req.body; 
        if (!['Completado', 'Cancelado', 'Pendiente'].includes(status)) {
            return res.status(400).json({ error: 'Estado no válido.' });
        }

        const pedidoAnterior = await Order.findById(req.params.id);
        if (!pedidoAnterior) {
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id, 
            { status }, 
            { new: true }
        );

        // Si cambia a 'Completado' por primera vez, sumamos +1 al totalCompras del usuario
        if (status === 'Completado' && pedidoAnterior.status !== 'Completado') {
            const identificadorUsuario = updatedOrder.identifier;
            
            if (identificadorUsuario) {
                await UserAuth.findOneAndUpdate(
                    { email: identificadorUsuario.toLowerCase().trim() },
                    { $inc: { totalCompras: 1 } }
                );
            }
        }

        res.json({ success: true, message: `Pedido actualizado`, updatedOrder });
    } catch (error) {
        console.error("Error al actualizar pedido:", error);
        res.status(500).json({ error: 'Error al actualizar pedido.' });
    }
});

app.delete('/api/admin/pedidos/:id', async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Pedido eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar pedido.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
