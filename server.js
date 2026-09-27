const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// URI de conexión a MongoDB Atlas
const uri = "mongodb+srv://jxsephadmin:TUNAX2g1y6BGQbYq@jxsephstoredb.mgemkee.mongodb.net/jxseph_store?retryWrites=true&w=majority&appName=JxsephStoreDB";

mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ Conectado exitosamente a MongoDB Atlas'))
.catch(err => console.error('❌ Error al conectar a la base de datos:', err));


// --- 1. MODELOS DE MONGOOSE ---

const cacheSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    nombre: String
});
const CacheModel = mongoose.model('uids_cache', cacheSchema);

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: { type: String, required: false },
    phone: String,
    googleId: { type: String, required: false },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    identifier: String, // Correo del usuario o código de seguimiento
    uidFreeFire: String,
    playerName: String,
    packageType: String,
    phone: String,
    receiptImage: String,
    status: { type: String, default: 'Pendiente' }, // Pendiente, Completado, Cancelado
    ipAddress: String,
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const blockedIpSchema = new mongoose.Schema({
    ip: { type: String, unique: true },
    reason: String,
    blockedAt: { type: Date, default: Date.now }
});
const BlockedIp = mongoose.model('BlockedIp', blockedIpSchema);

// Nuevo modelo para registrar las consultas de verificación de UIDs
const verificationLogSchema = new mongoose.Schema({
    ip: String,
    uid: String,
    success: Boolean,
    playerName: String,
    timestamp: { type: Date, default: Date.now }
});
const VerificationLog = mongoose.model('VerificationLog', verificationLogSchema);


// --- 2. CONFIGURACIÓN DE CUENTAS API HL GAMING ---
const cuentasApi = [
    { useruid: "US1sc9xwLJPZUPCFctlSkQeoa5r2", apiKey: "kaiqIA3oUtxFA9kBBaP9UZB8fBbFb1" },
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgwMOkyUzgxKheQbJP4sNp" },
    { useruid: "p8OmIYODcZwK7hyZeCMaxMQUH11", apiKey: "fWHilgMaQytoBK2ItMoD34C9CfzH1" },
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwCBH49kQ88MDRdWk2nGyvsCS" },
    { useruid: "qsYZfyr7CJW4oQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCSnBOT0Rxd8rBe9FR" }
];
let indiceCuentaActual = 0;


// --- 3. MIDDLEWARE DE SEGURIDAD (BLOQUEO DE IPS) ---
app.use(async (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    try {
        const blocked = await BlockedIp.findOne({ ip: clientIp });
        if (blocked) {
            return res.status(403).json({ error: 'Acceso restringido. Tu IP ha sido bloqueada por seguridad.' });
        }
        req.clientIp = clientIp;
        next();
    } catch (e) {
        next();
    }
});


// --- 4. RUTAS DE LA API ---

// A. Verificar UID con caché, rotación de llaves y registro en logs
app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    if (!uid) {
        return res.status(400).json({ valid: false });
    }

    try {
        const cachedUser = await CacheModel.findOne({ uid: uid });
        if (cachedUser) {
            await VerificationLog.create({ ip: req.clientIp, uid, success: true, playerName: cachedUser.nombre });
            return res.json({ valid: true, AccountName: cachedUser.nombre });
        }

        let intentos = 0;
        let nombreJugador = null;

        while (intentos < cuentasApi.length) {
            const cuenta = cuentasApi[indiceCuentaActual];
            const url = `https://proapis.hlgamingofficial.com/main/games/freefire/validation/api?sectionName=freefireValidation&useruid=${cuenta.useruid}&api=${cuenta.apiKey}&uid=${uid}&region=US`;

            const respuesta = await fetch(url);
            const data = await respuesta.json();

            if (data.result && data.result.valid && data.result.AccountName) {
                nombreJugador = data.result.AccountName;
                break;
            } else {
                indiceCuentaActual = (indiceCuentaActual + 1) % cuentasApi.length;
            }
            intentos++;
        }

        if (nombreJugador) {
            await CacheModel.create({ uid: uid, nombre: nombreJugador });
            await VerificationLog.create({ ip: req.clientIp, uid, success: true, playerName: nombreJugador });
            return res.json({ valid: true, AccountName: nombreJugador });
        } else {
            await VerificationLog.create({ ip: req.clientIp, uid, success: false, playerName: 'No encontrado' });
            return res.json({ valid: false });
        }

    } catch (error) {
        await VerificationLog.create({ ip: req.clientIp, uid, success: false, playerName: 'Error de servidor' });
        return res.status(500).json({ valid: false });
    }
});

// B. Registro con Correo
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'El correo ya está registrado.' });
        }
        const newUser = new User({ name, email, password, phone });
        await newUser.save();
        res.json({ success: true, message: 'Usuario registrado con éxito.' });
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor al registrar.' });
    }
});

// C. Login con Correo
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password });
        if (!user) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }
        res.json({ success: true, user: { name: user.name, email: user.email } });
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor al iniciar sesión.' });
    }
});

// D. Crear Pedido
app.post('/api/pedidos', async (req, res) => {
    try {
        const { identifier, uidFreeFire, playerName, packageType, phone, receiptImage } = req.body;
        const orderId = 'JX-' + Math.floor(10000 + Math.random() * 90000);

        const newOrder = new Order({
            orderId,
            identifier,
            uidFreeFire,
            playerName,
            packageType,
            phone,
            receiptImage,
            ipAddress: req.clientIp
        });

        await newOrder.save();
        res.json({ success: true, orderId, message: 'Pedido creado exitosamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al procesar el pedido.' });
    }
});

// E. Consultar Pedidos (Historial o Notificaciones)
app.get('/api/pedidos', async (req, res) => {
    try {
        const { identifier, orderId } = req.query;
        let query = {};
        if (identifier) query.identifier = identifier;
        if (orderId) query.orderId = orderId;

        const orders = await Order.find(query).sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Error al consultar los pedidos.' });
    }
});

// F. PANEL DE ADMIN: Ver pedidos pendientes
app.get('/api/admin/pedidos', async (req, res) => {
    try {
        const pendingOrders = await Order.find({ status: 'Pendiente' }).sort({ createdAt: -1 });
        res.json(pendingOrders);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar los pedidos del panel.' });
    }
});

// G. PANEL DE ADMIN: Confirmar Recarga o Cancelar (Pago falso)
app.put('/api/admin/pedidos/:id', async (req, res) => {
    try {
        const { status } = req.body; // "Completado" o "Cancelado"
        if (!['Completado', 'Cancelado'].includes(status)) {
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

// H. PANEL DE ADMIN: Ver historial de UIDs verificados por los usuarios
app.get('/api/admin/verificaciones', async (req, res) => {
    try {
        const logs = await VerificationLog.find().sort({ timestamp: -1 }).limit(50);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los registros de verificación.' });
    }
});

// I. SEGURIDAD: Bloquear IP (F12 o fraudes)
app.post('/api/admin/bloquear-ip', async (req, res) => {
    try {
        const { ip, reason } = req.body;
        const targetIp = ip || req.clientIp;
        
        await BlockedIp.create({ ip: targetIp, reason: reason || 'Actividad sospechosa o intento de vulneración' });
        res.json({ success: true, message: `IP ${targetIp} bloqueada correctamente.` });
    } catch (error) {
        res.status(500).json({ error: 'Error al bloquear la IP en la base de datos.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor central de Jxseph Store corriendo en el puerto ${PORT}`);
});
