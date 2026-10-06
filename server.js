const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());

// Límites ampliados para aceptar imágenes de comprobantes grandes en Base64
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const uri = "mongodb+srv://jxsephadmin:TUNAX2g1y6BGQbYq@jxsephstoredb.mgemkee.mongodb.net/jxseph_store?retryWrites=true&w=majority&appName=JxsephStoreDB";

mongoose.connect(uri)
.then(() => console.log('✅ Conectado exitosamente a MongoDB Atlas'))
.catch(err => console.error('❌ Error al conectar a la base de datos:', err));


// --- 1. MODELOS DE MONGOOSE ---

// Cache para UID de Free Fire
const cacheSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    nombre: String,
    createdAt: { type: Date, default: Date.now }
});
const CacheModel = mongoose.model('uids_cache', cacheSchema);

// Modelo para los Códigos de Canje (Redeem)
const redeemCodeSchema = new mongoose.Schema({
    code: { type: String, unique: true, uppercase: true, required: true },
    game: { type: String, required: true }, // 'Free Fire' o 'Roblox'
    packageType: { type: String, required: true }, // Ej: '310 Diamantes' o '800 Robux'
    used: { type: Boolean, default: false },
    usedByUid: { type: String, default: null },
    usedByName: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});
const RedeemCode = mongoose.model('RedeemCode', redeemCodeSchema);

// Modelo para los Pedidos (Formularios con captura de pago)
const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    identifier: String,
    uidFreeFire: String,
    playerName: String,
    packageType: String,
    phone: String,
    receiptImage: String,
    status: { type: String, default: 'Pendiente' },
    ipAddress: String,
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// Modelo para registros de verificación
const verificationLogSchema = new mongoose.Schema({
    ip: String,
    uid: String,
    success: Boolean,
    playerName: String,
    timestamp: { type: Date, default: Date.now }
});
const VerificationLog = mongoose.model('VerificationLog', verificationLogSchema);


// --- 2. CONFIGURACIÓN DE LAS 5 CUENTAS API (FREE FIRE) ---
const cuentasApi = [
    { useruid: "US1sc9xwLJPZUPCFctlSkQeoa5r2", apiKey: "kaiqIA3oUtxFA9kBBaP9UZB8fBbFb1" },
    { useruid: "qsYZfYr7CJW4qOQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCsNBoT0Rxd8rBe9FR" },
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwdCBH49kQ88MDRdWk2nGyvsCS" },
    { useruid: "p8OmIYOXDcZWk7hyZeCMaXmQUHl1", apiKey: "fWHi1gMaQyitoBK2ItMoD34C9CfzH1" },
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgWMOkyUzgxKheQbJP4sNp" }
];


// --- 3. RUTAS DE VERIFICACIÓN DE UID (FREE FIRE) ---
app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!uid) {
        return res.status(400).json({ valid: false, error: "Falta el UID" });
    }

    try {
        const cachedUser = await CacheModel.findOne({ uid: uid });
        if (cachedUser) {
            await VerificationLog.create({ ip: clientIp, uid, success: true, playerName: cachedUser.nombre });
            return res.json({ valid: true, AccountName: cachedUser.nombre, cached: true });
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
            return res.json({ valid: true, AccountName: nombreJugador, cached: false });
        } else {
            await VerificationLog.create({ ip: clientIp, uid, success: false, playerName: 'No encontrado' });
            return res.json({ valid: false, error: "UID no válido o cuentas agotadas" });
        }

    } catch (error) {
        await VerificationLog.create({ ip: clientIp, uid, success: false, playerName: 'Error de servidor' });
        return res.status(500).json({ valid: false, error: "Error interno del servidor" });
    }
});

// Alias por si el frontend lo llama como /api/verificar-id
app.post('/api/verificar-id', async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ success: false, error: "Falta el UID" });

    try {
        const cachedUser = await CacheModel.findOne({ uid: uid });
        if (cachedUser) {
            return res.json({ success: true, playerName: cachedUser.nombre });
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
                if (data.result && data.result.valid && data.result.AccountName) {
                    nombreJugador = data.result.AccountName;
                    break;
                }
            } catch (err) {}
        }

        if (nombreJugador) {
            await CacheModel.create({ uid: uid, nombre: nombreJugador });
            return res.json({ success: true, playerName: nombreJugador });
        } else {
            return res.json({ success: false, error: "UID no encontrado" });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: "Error de servidor" });
    }
});


// --- 4. RUTAS DE CÓDIGOS DE CANJE (REDEEM) ---

app.post('/api/redeem/verificar', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Falta el código.' });

        const cleanCode = code.trim().toUpperCase();
        const codeDoc = await RedeemCode.findOne({ code: cleanCode });

        if (!codeDoc) {
            return res.status(404).json({ success: false, message: `El código <strong>${cleanCode}</strong> no existe.` });
        }

        if (codeDoc.used) {
            return res.status(400).json({ success: false, message: `El código <strong>${cleanCode}</strong> ya fue utilizado.` });
        }

        res.json({
            success: true,
            game: codeDoc.game,
            packageType: codeDoc.packageType
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al verificar el código en la base de datos.' });
    }
});

// Ruta de canje optimizada y blindada contra condiciones de carrera
app.post('/api/redeem/canjear', async (req, res) => {
    try {
        const { code, uid, playerName, email, phone } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Falta el código.' });

        const cleanCode = code.trim().toUpperCase();
        
        // Primero consultamos el documento para saber a qué juego pertenece y armar los datos correspondientes
        const tempDoc = await RedeemCode.findOne({ code: cleanCode });
        if (!tempDoc) {
            return res.status(404).json({ success: false, message: 'El código no existe.' });
        }

        const isFreeFire = tempDoc.game === 'Free Fire';
        const assignedUid = isFreeFire ? (uid || 'N/A') : 'Giftcard Entregada';
        const assignedName = isFreeFire ? (playerName || 'N/A') : (email || phone || 'Usuario Giftcard');

        // Búsqueda y actualización atómica: solo actualiza si 'used' sigue siendo false
        const codeDoc = await RedeemCode.findOneAndUpdate(
            { code: cleanCode, used: false },
            { 
                $set: { 
                    used: true,
                    usedByUid: assignedUid,
                    usedByName: assignedName
                } 
            },
            { new: true }
        );

        if (!codeDoc) {
            return res.status(400).json({ 
                success: false, 
                message: '¡Llegaste tarde! Este código acaba de ser canjeado por otro usuario.' 
            });
        }

        res.json({
            success: true,
            message: '¡Canje procesado y guardado exitosamente!'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al registrar el canje en la base de datos.' });
    }
});

// Generar códigos automáticamente con formato JXSEPH-(RANDOM) desde el panel admin
app.post('/api/admin/redeem/generar', async (req, res) => {
    try {
        const { game, packageType } = req.body;
        if (!game || !packageType) {
            return res.status(400).json({ success: false, error: 'Faltan datos (game, packageType).' });
        }

        const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
        const code = `JXSEPH-${randomPart}`;

        const nuevoCodigo = new RedeemCode({
            code,
            game,
            packageType
        });

        await nuevoCodigo.save();
        res.json({ success: true, message: `Código ${code} generado con éxito.`, code });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al generar el código en la base de datos.' });
    }
});

// Obtener todos los códigos detallados para el Panel Admin
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
                uid: c.game === 'Free Fire' ? (c.usedByUid || 'Pendiente') : 'No aplica (Giftcard)',
                playerName: c.game === 'Free Fire' ? (c.usedByName || 'Pendiente') : 'No aplica (Giftcard)'
            },
            fechaCreacion: c.createdAt
        }));

        res.json({ success: true, codigos: listaFormateada });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al obtener la lista de códigos.' });
    }
});


// --- 5. RUTAS DE PEDIDOS Y PANEL ADMIN (CAPTURAS DE PAGO) ---

app.post('/api/pedidos', async (req, res) => {
    try {
        const { identifier, uidFreeFire, playerName, packageType, phone, receiptImage } = req.body;
        const orderId = 'JX-' + Math.floor(100000 + Math.random() * 900000);
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

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
        res.status(500).json({ error: 'Error al consultar el historial de compras.' });
    }
});

app.get('/api/admin/pedidos', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar los pedidos del panel.' });
    }
});

app.put('/api/admin/pedidos/:id', async (req, res) => {
    try {
        const { status } = req.body; 
        if (!['Completado', 'Cancelado', 'Pendiente'].includes(status)) {
            return res.status(400).json({ error: 'Estado no válido.' });
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id, 
            { status }, 
            { new: true }
        );

        res.json({ success: true, message: `Pedido actualizado a ${status}`, updatedOrder });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el pedido.' });
    }
});

app.delete('/api/admin/pedidos/:id', async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Pedido eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el pedido.' });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
