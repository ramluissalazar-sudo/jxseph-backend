const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());

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
    if (!uid) {
        return res.status(400).json({ valid: false, error: "Falta el UID" });
    }

    try {
        const cachedUser = await CacheModel.findOne({ uid: uid });
        if (cachedUser) {
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
            return res.json({ valid: true, AccountName: nombreJugador, cached: false });
        } else {
            return res.json({ valid: false, error: "UID no válido o cuentas agotadas" });
        }

    } catch (error) {
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


// --- 4. RUTAS DE CÓDIGOS DE CANJE (REDEEM) GUARDADOS EN MONGODB ---

// Verificar si un código existe y no ha sido usado
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

// Procesar el canje final y marcarlo como usado en MongoDB
app.post('/api/redeem/canjear', async (req, res) => {
    try {
        const { code, uid, playerName, email, phone } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Falta el código.' });

        const cleanCode = code.trim().toUpperCase();
        const codeDoc = await RedeemCode.findOne({ code: cleanCode });

        if (!codeDoc) {
            return res.status(404).json({ success: false, message: 'El código no existe.' });
        }

        if (codeDoc.used) {
            return res.status(400).json({ success: false, message: 'Este código ya fue canjeado anteriormente.' });
        }

        // Actualizamos el código como usado y guardamos los datos de quién lo reclamó
        codeDoc.used = true;
        codeDoc.usedByUid = uid || email || phone || 'Anónimo';
        codeDoc.usedByName = playerName || email || 'Usuario';
        await codeDoc.save();

        res.json({
            success: true,
            message: '¡Canje procesado y guardado exitosamente!'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al registrar el canje en la base de datos.' });
    }
});

// Ruta extra para que puedas crear códigos nuevos fácilmente desde Postman, tu navegador o un panel futuro
app.post('/api/admin/redeem/crear', async (req, res) => {
    try {
        const { code, game, packageType } = req.body;
        if (!code || !game || !packageType) {
            return res.status(400).json({ success: false, error: 'Faltan datos (code, game, packageType).' });
        }

        const nuevoCodigo = new RedeemCode({
            code: code.trim().toUpperCase(),
            game,
            packageType
        });

        await nuevoCodigo.save();
        res.json({ success: true, message: `Código ${nuevoCodigo.code} creado con éxito.` });
    } catch (error) {
        res.status(500).json({ success: false, error: 'El código ya existe o hubo un error al guardarlo.' });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
