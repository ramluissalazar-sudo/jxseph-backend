const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// 1. RESTRINGIR PETICIONES (Agregado tu panel en Netlify, tu tienda y localhost)
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

// Lista de IPs bloqueadas (Baneadas)
const blockedIpSchema = new mongoose.Schema({
    ip: { type: String, unique: true },
    reason: String,
    createdAt: { type: Date, default: Date.now }
});
const BlockedIp = mongoose.model('BlockedIp', blockedIpSchema);

// Cache para UID de Free Fire
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

// Modelo de Pedidos (Con número de orden unificado)
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

// Modelo de Verificaciones de ID mejorado
const verificationLogSchema = new mongoose.Schema({
    ip: String,
    uid: String,
    success: Boolean,
    playerName: String,
    createdAt: { type: Date, default: Date.now } // Guarda fecha y hora exacta
});
const VerificationLog = mongoose.model('VerificationLog', verificationLogSchema);


// --- MIDDLEWARE PARA BLOQUEAR IPS BANEADAS ---
app.use(async (req, res, next) => {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp && clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim();
    }
    try {
        const isBlocked = await BlockedIp.findOne({ ip: clientIp });
        if (isBlocked) {
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


// --- RUTAS DE VERIFICACIÓN DE UID ---
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

// Ruta para ver el historial de verificaciones en tu panel admin
app.get('/api/admin/verificaciones', async (req, res) => {
    try {
        const logs = await VerificationLog.find().sort({ createdAt: -1 }).limit(100);
        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener registros de verificación.' });
    }
});

// Ruta para bloquear una IP desde el panel admin
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
        const { code, uid, playerName, email, phone } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Falta el código.' });
        const cleanCode = code.trim().toUpperCase();
        
        const tempDoc = await RedeemCode.findOne({ code: cleanCode });
        if (!tempDoc) return res.status(404).json({ success: false, message: 'El código no existe.' });

        const isFreeFire = tempDoc.game === 'Free Fire';
        const assignedUid = isFreeFire ? (uid || 'N/A') : 'Giftcard Entregada';
        const assignedName = isFreeFire ? (playerName || 'N/A') : (email || phone || 'Usuario Giftcard');

        const codeDoc = await RedeemCode.findOneAndUpdate(
            { code: cleanCode, used: false },
            { $set: { used: true, usedByUid: assignedUid, usedByName: assignedName } },
            { new: true }
        );

        if (!codeDoc) return res.status(400).json({ success: false, message: 'Este código acaba de ser canjeado por otro usuario.' });

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
                playerName: c.game === 'Free Fire' ? (c.usedByName || 'Pendiente') : 'No aplica'
            },
            fechaCreacion: c.createdAt
        }));
        res.json({ success: true, codigos: listaFormateada });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener códigos.' });
    }
});


// --- RUTAS DE PEDIDOS ---

app.post('/api/pedidos', async (req, res) => {
    try {
        const { orderId: orderIdCliente, identifier, uidFreeFire, playerName, packageType, phone, receiptImage } = req.body;
        
        const orderId = orderIdCliente || ('JX-' + Math.floor(100000 + Math.random() * 900000));
        const clientIp = req.clientIp;

        const newOrder = new Order({
            orderId,
            identifier,
            uidFreeFire,
            playerName,
            packageType,
            phone,
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

app.put('/api/admin/pedidos/:id', async (req, res) => {
    try {
        const { status } = req.body; 
        if (!['Completado', 'Cancelado', 'Pendiente'].includes(status)) {
            return res.status(400).json({ error: 'Estado no válido.' });
        }
        const updatedOrder = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.json({ success: true, message: `Pedido actualizado`, updatedOrder });
    } catch (error) {
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
