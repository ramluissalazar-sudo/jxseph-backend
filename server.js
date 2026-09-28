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

const cacheSchema = new mongoose.Schema({
    uid: { type: String, unique: true },
    nombre: String
});
const CacheModel = mongoose.model('uids_cache', cacheSchema);

// CUENTA FUNCIONAL COLOCADA EN PRIMER LUGAR (ÍNDICE 0)
const cuentasApi = [
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgwMOkyUzgxKheQbJP4sNp" },
    { useruid: "US1sc9xwLJPZUPCFctlSkQeoa5r2", apiKey: "kaiqIA3oUtxFA9kBBaP9UZB8fBbFb1" },
    { useruid: "p8OmIYODcZwK7hyZeCMaxMQUH11", apiKey: "fWHilgMaQytoBK2ItMoD34C9CfzH1" },
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwCBH49kQ88MDRdWk2nGyvsCS" },
    { useruid: "qsYZfyr7CJW4oQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCSnBOT0Rxd8rBe9FR" }
];

app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    if (!uid) {
        return res.status(400).json({ valid: false });
    }

    try {
        const cachedUser = await CacheModel.findOne({ uid: uid });
        if (cachedUser) {
            return res.json({ valid: true, AccountName: cachedUser.nombre });
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
                    await CacheModel.create({ uid: uid, nombre: nombreJugador });
                    break;
                }
            } catch (err) {
                // Salto automático si falla la petición de red
            }
        }

        if (nombreJugador) {
            return res.json({ valid: true, AccountName: nombreJugador });
        } else {
            return res.json({ valid: false });
        }

    } catch (error) {
        return res.status(500).json({ valid: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
