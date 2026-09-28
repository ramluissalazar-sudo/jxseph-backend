const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const uri = "mongodb+srv://jxsephadmin:TUNAX2g1y6BGQbYq@jxsephstoredb.mgemkee.mongodb.net/jxseph_store?retryWrites=true&w=majority&appName=JxsephStoreDB";

mongoose.connect(uri)
.then(() => console.log('✅ Conectado exitosamente a MongoDB Atlas'))
.catch(err => console.error('❌ Error al conectar a la base de datos:', err));

// --- 1. MODELOS DE MONGOOSE ---

// Caché de UIDs en MongoDB (Cero caché en navegador para ahorrar peticiones)
const cacheSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    nombre: String,
    createdAt: { type: Date, default: Date.now }
});
const CacheModel = mongoose.model('uids_cache', cacheSchema);

// Usuarios registrados
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: { type: String, required: false },
    phone: String,
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Pedidos realizados
const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    identifier: String, // Correo del usuario para asociar sus pedidos
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

// IPs bloqueadas por seguridad
const blockedIpSchema = new mongoose.Schema({
    ip: { type: String, unique: true },
    reason: String,
    blockedAt: { type: Date, default: Date.now }
});
const BlockedIp = mongoose.model('BlockedIp', blockedIpSchema);

// Logs de verificación para el panel de administración
const verificationLogSchema = new mongoose.Schema({
    ip: String,
    uid: String,
    success: Boolean,
    playerName: String,
    timestamp: { type: Date, default: Date.now }
});
const VerificationLog = mongoose.model('VerificationLog', verificationLogSchema);


// --- 2. CONFIGURACIÓN DE LAS 5 CUENTAS API (ROTACIÓN AUTOMÁTICA) ---
const cuentasApi = [
    { useruid: "US1sc9xwLJPZUPCFctlSkQeoa5r2", apiKey: "kaiqIA3oUtxFA9kBBaP9UZB8fBbFb1" }, // [0] Sin saldo / Referencia
    { useruid: "qsYZfYr7CJW4qOQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCsNBoT0Rxd8rBe9FR" }, // [1] 
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwdCBH49kQ88MDRdWk2nGyvsCS" }, // [2] 
    { useruid: "p8OmIYOXDcZWk7hyZeCMaXmQUHl1", apiKey: "fWHi1gMaQyitoBK2ItMoD34C9CfzH1" }, // [3] 
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgWMOkyUzgxKheQbJP4sNp" }  // [4] Principal
];


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

// A. Verificar UID consultando MongoDB primero y rotando cuentas si es necesario
app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    if (!uid) {
        return res.status(400).json({ valid: false, error: "Falta el UID" });
    }

    try {
        // 1. Buscar en MongoDB para evitar gastar peticiones si ya fue consultado antes
        const cachedUser = await CacheModel.findOne({ uid: uid });
        if (cachedUser) {
            console.log(`⚡ UID ${uid} encontrado en MongoDB (Ahorro de petición).`);
            await VerificationLog.create({ ip: req.clientIp, uid, success: true, playerName: cachedUser.nombre });
            return res.json({ valid: true, AccountName: cachedUser.nombre, cached: true });
        }

        let nombreJugador = null;

        // 2. Iterar por las 5 cuentas API con rotación automática ante fallos
        for (let i = 0; i < cuentasApi.length; i++) {
            const cuenta = cuentasApi[i];
            const url = `https://proapis.hlgamingofficial.com/main/games/freefire/validation/api?sectionName=freefireValidation&useruid=${cuenta.useruid}&api=${cuenta.apiKey}&uid=${uid}&region=US`;

            console.log(`🔍 [Intento ${i}] Probando cuenta para el UID: ${uid}`);

            try {
                const respuesta = await fetch(url);
                const textoRespuesta = await respuesta.text();

                if (textoRespuesta.trim().startsWith('<') || !respuesta.ok) {
                    console.warn(`⚠️ Cuenta [${i}] devolvió HTML o error HTTP. Rotando...`);
                    continue;
                }

                const data = JSON.parse(textoRespuesta);

                if (data.error_code === "QUOTA_LIMIT_REACHED" || data.status === "quota_exceeded" || data.error === "Auth Failed") {
                    console.warn(`❌ Cuenta [${i}] falló (${data.error_code || data.error}). Rotando a la siguiente...`);
                    continue;
                }

                if (data.result && data.result.valid && data.result.AccountName) {
                    nombreJugador = data.result.AccountName;
                    console.log(`✅ ¡Éxito! Jugador: ${nombreJugador} encontrado con la cuenta [${i}]`);
                    break;
                }
            } catch (err) {
                console.warn(`⚠️ Error de red en cuenta [${i}]:`, err.message);
            }
        }

        // 3. Guardar en MongoDB y registrar log (los no válidos solo generan log, no caché)
        if (nombreJugador) {
            await CacheModel.create({ uid: uid, nombre: nombreJugador });
            await VerificationLog.create({ ip: req.clientIp, uid, success: true, playerName: nombreJugador });
            return res.json({ valid: true, AccountName: nombreJugador, cached: false });
        } else {
            await VerificationLog.create({ ip: req.clientIp, uid, success: false, playerName: 'No encontrado' });
            return res.json({ valid: false, error: "UID no válido o cuentas agotadas" });
        }

    } catch (error) {
        console.error("❌ Error crítico en /verificar:", error);
        await VerificationLog.create({ ip: req.clientIp, uid, success: false, playerName: 'Error de servidor' });
        return res.status(500).json({ valid: false, error: "Error interno del servidor" });
    }
});

// B. Registro de Usuario
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

// C. Login de Usuario
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

// D. Crear Pedido (Checkout)
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

// E. Consultar Pedidos (Soporta filtrado por correo con ?identifier=correo@domain.com)
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

// F. PANEL DE ADMIN: Ver todos los pedidos (para gestionar pendientes, completados y cancelados)
app.get('/api/admin/pedidos', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar los pedidos del panel.' });
    }
});

// G. PANEL DE ADMIN: Actualizar estado de pedido
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

// G.1. PANEL DE ADMIN: Eliminar un pedido individual [NUEVO AÑADIDO]
app.delete('/api/admin/pedidos/:id', async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Pedido eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el pedido.' });
    }
});

// H. PANEL DE ADMIN: Ver historial de UIDs verificados
app.get('/api/admin/verificaciones', async (req, res) => {
    try {
        const logs = await VerificationLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los registros de verificación.' });
    }
});

// H.1. PANEL DE ADMIN: Eliminar un registro de verificación individual
app.delete('/api/admin/verificaciones/:id', async (req, res) => {
    try {
        await VerificationLog.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Registro eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el registro.' });
    }
});

// H.2. PANEL DE ADMIN: Vaciar todo el historial de verificaciones
app.delete('/api/admin/verificaciones', async (req, res) => {
    try {
        await VerificationLog.deleteMany({});
        res.json({ success: true, message: 'Historial de verificaciones vaciado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al vaciar los registros.' });
    }
});

// I. SEGURIDAD: Bloquear IP
app.post('/api/admin/bloquear-ip', async (req, res) => {
    try {
        const { ip, reason } = req.body;
        const targetIp = ip || req.clientIp;
        
        await BlockedIp.create({ ip: targetIp, reason: reason || 'Actividad sospechosa' });
        res.json({ success: true, message: `IP ${targetIp} bloqueada correctamente.` });
    } catch (error) {
        res.status(500).json({ error: 'Error al bloquear la IP en la base de datos (posiblemente ya esté bloqueada).' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor central de Jxseph Store corriendo en el puerto ${PORT}`);
});
