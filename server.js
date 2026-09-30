const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());

// ¡Límites aumentados para aceptar imágenes grandes en Base64 sin error de Payload!
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const uri = "mongodb+srv://jxsephadmin:TUNAX2g1y6BGQbYq@jxsephstoredb.mgemkee.mongodb.net/jxseph_store?retryWrites=true&w=majority&appName=JxsephStoreDB";

mongoose.connect(uri)
.then(() => console.log('✅ Conectado exitosamente a MongoDB Atlas'))
.catch(err => console.error('❌ Error al conectar a la base de datos:', err));

// --- CONFIGURACIÓN DE NODEMAILER PARA 2FA Y CORREOS ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'jxsephstore@gmail.com',         // Cambia por tu correo de la tienda
        pass: 'tpdpfogzrkoowzhv'   // Cambia por tu contraseña de aplicación de Gmail
    }
});

// Estructura temporal en memoria para los códigos 2FA (expiran en 5 minutos)
const codigosVerificacion = new Map();


// --- 1. MODELOS DE MONGOOSE ---

const cacheSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    nombre: String,
    createdAt: { type: Date, default: Date.now }
});
const CacheModel = mongoose.model('uids_cache', cacheSchema);

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: { type: String, required: false },
    phone: String,
    pic: { type: String, default: '' },
    twoFactorEnabled: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

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

const blockedIpSchema = new mongoose.Schema({
    ip: { type: String, unique: true },
    reason: String,
    blockedAt: { type: Date, default: Date.now }
});
const BlockedIp = mongoose.model('BlockedIp', blockedIpSchema);

const verificationLogSchema = new mongoose.Schema({
    ip: String,
    uid: String,
    success: Boolean,
    playerName: String,
    timestamp: { type: Date, default: Date.now }
});
const VerificationLog = mongoose.model('VerificationLog', verificationLogSchema);


// --- 2. CONFIGURACIÓN DE LAS 5 CUENTAS API ---
const cuentasApi = [
    { useruid: "US1sc9xwLJPZUPCFctlSkQeoa5r2", apiKey: "kaiqIA3oUtxFA9kBBaP9UZB8fBbFb1" },
    { useruid: "qsYZfYr7CJW4qOQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCsNBoT0Rxd8rBe9FR" },
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwdCBH49kQ88MDRdWk2nGyvsCS" },
    { useruid: "p8OmIYOXDcZWk7hyZeCMaXmQUHl1", apiKey: "fWHi1gMaQyitoBK2ItMoD34C9CfzH1" },
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgWMOkyUzgxKheQbJP4sNp" }
];


// --- 3. MIDDLEWARE DE SEGURIDAD ---
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

app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    if (!uid) {
        return res.status(400).json({ valid: false, error: "Falta el UID" });
    }

    try {
        const cachedUser = await CacheModel.findOne({ uid: uid });
        if (cachedUser) {
            await VerificationLog.create({ ip: req.clientIp, uid, success: true, playerName: cachedUser.nombre });
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
            await VerificationLog.create({ ip: req.clientIp, uid, success: true, playerName: nombreJugador });
            return res.json({ valid: true, AccountName: nombreJugador, cached: false });
        } else {
            await VerificationLog.create({ ip: req.clientIp, uid, success: false, playerName: 'No encontrado' });
            return res.json({ valid: false, error: "UID no válido o cuentas agotadas" });
        }

    } catch (error) {
        await VerificationLog.create({ ip: req.clientIp, uid, success: false, playerName: 'Error de servidor' });
        return res.status(500).json({ valid: false, error: "Error interno del servidor" });
    }
});

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

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password });
        if (!user) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }
        res.json({ 
            success: true, 
            user: { 
                name: user.name, 
                email: user.email, 
                pic: user.pic, 
                twoFactorEnabled: user.twoFactorEnabled 
            } 
        });
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor al iniciar sesión.' });
    }
});

// --- NUEVAS RUTAS DE AJUSTES Y PERFIL ---

// Actualizar perfil (Nombre y Foto)
app.put('/api/usuario/perfil', async (req, res) => {
    try {
        const { email, name, pic } = req.body;
        const updatedUser = await User.findOneAndUpdate(
            { email },
            { name, pic },
            { new: true }
        );
        if (!updatedUser) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        }
        res.json({ 
            success: true, 
            message: 'Perfil actualizado con éxito.', 
            user: { name: updatedUser.name, email: updatedUser.email, pic: updatedUser.pic } 
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el perfil.' });
    }
});

// Cambiar Contraseña
app.put('/api/usuario/password', async (req, res) => {
    try {
        const { email, currentPassword, newPassword } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        }

        // Validación simple de contraseña actual (puedes adaptarlo a bcrypt si usas hashes)
        if (user.password && user.password !== currentPassword) {
            return res.status(400).json({ success: false, error: 'La contraseña actual es incorrecta.' });
        }

        user.password = newPassword;
        await user.save();
        res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al cambiar la contraseña.' });
    }
});

// --- RUTAS DE VERIFICACIÓN EN DOS PASOS (2FA) POR CORREO ---

app.post('/api/2fa/enviar-codigo', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: 'El correo es obligatorio.' });
        }

        const codigo = Math.floor(100000 + Math.random() * 900000).toString();
        
        codigosVerificacion.set(email, {
            codigo,
            expira: Date.now() + 5 * 60 * 1000 // 5 minutos de expiración
        });

        const mailOptions = {
            from: '"Jxseph Store" <tu-correo@gmail.com>',
            to: email,
            subject: 'Código de verificación de seguridad - Jxseph Store',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #0284c7;">Código de Verificación</h2>
                    <p>Has solicitado realizar una acción de seguridad en tu cuenta de Jxseph Store.</p>
                    <p>Tu código temporal es:</p>
                    <h1 style="background: #f1f5f9; padding: 10px 20px; display: inline-block; letter-spacing: 5px; color: #0f172a;">${codigo}</h1>
                    <p>Este código expirará en 5 minutos.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'Código enviado al correo electrónico.' });
    } catch (error) {
        console.error("Error enviando correo 2FA:", error);
        res.status(500).json({ success: false, error: 'Error al enviar el correo de verificación.' });
    }
});

app.post('/api/2fa/verificar-codigo', async (req, res) => {
    try {
        const { email, codigoIngresado, enable } = req.body;
        const registro = codigosVerificacion.get(email);

        if (!registro) {
            return res.status(400).json({ success: false, error: 'No hay ningún código pendiente o ha expirado.' });
        }

        if (Date.now() > registro.expira) {
            codigosVerificacion.delete(email);
            return res.status(400).json({ success: false, error: 'El código ha expirado.' });
        }

        if (registro.codigo !== codigoIngresado) {
            return res.status(400).json({ success: false, error: 'Código incorrecto.' });
        }

        codigosVerificacion.delete(email);

        // Si se envió el parámetro enable, actualizamos el estado 2FA en la base de datos
        if (typeof enable === 'boolean') {
            await User.findOneAndUpdate({ email }, { twoFactorEnabled: enable });
        }

        res.json({ success: true, message: 'Verificación exitosa.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error al verificar el código.' });
    }
});

// --- RUTAS DE PEDIDOS E HISTORIAL DE COMPRAS ---

app.post('/api/pedidos', async (req, res) => {
    try {
        const { identifier, uidFreeFire, playerName, packageType, phone, receiptImage } = req.body;
        const orderId = 'JX-' + Math.floor(100000 + Math.random() * 900000);

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
        console.error("Error al guardar pedido:", error);
        res.status(500).json({ error: 'Error al procesar el pedido.' });
    }
});

// Endpoint para el historial de compras del usuario (Soporta /api/pedidos y /api/compras)
app.get(['/api/pedidos', '/api/compras'], async (req, res) => {
    try {
        const { identifier, email, orderId } = req.query;
        let query = {};
        
        // Permite filtrar tanto por "identifier" como por "email"
        const filtroUsuario = identifier || email;
        if (filtroUsuario) query.identifier = filtroUsuario;
        if (orderId) query.orderId = orderId;

        const orders = await Order.find(query).sort({ createdAt: -1 });
        
        // Retorna con formato compatible para que el frontend lea "compras" o directamente el array
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

app.get('/api/admin/verificaciones', async (req, res) => {
    try {
        const logs = await VerificationLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los registros de verificación.' });
    }
});

app.delete('/api/admin/verificaciones/:id', async (req, res) => {
    try {
        await VerificationLog.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Registro eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el registro.' });
    }
});

app.delete('/api/admin/verificaciones', async (req, res) => {
    try {
        await VerificationLog.deleteMany({});
        res.json({ success: true, message: 'Historial de verificaciones vaciado correctamente.' });
    } catch (error) {
        res.status(500).json({ error: 'Error al vaciar los registros.' });
    }
});

app.post('/api/admin/bloquear-ip', async (req, res) => {
    try {
        const { ip, reason } = req.body;
        const targetIp = ip || req.clientIp;
        
        await BlockedIp.create({ ip: targetIp, reason: reason || 'Actividad sospechosa' });
        res.json({ success: true, message: `IP ${targetIp} bloqueada correctamente.` });
    } catch (error) {
        res.status(500).json({ error: 'Error al bloquear la IP en la base de datos.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor central de Jxseph Store corriendo en el puerto ${PORT}`);
});
