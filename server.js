const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

// URI completa con tu usuario y contraseña nuevos ya integrados
const uri = "mongodb+srv://jxsephadmin:TUNAX2g1y6BGQbYq@jxsephstoredb.mgemkee.mongodb.net/?retryWrites=true&w=majority&appName=JxsephStoreDB";
const client = new MongoClient(uri);

let cacheCollection;

async function conectarDB() {
    try {
        await client.connect();
        const db = client.db("jxseph_store");
        cacheCollection = db.collection("uids_cache");
        console.log("Conectado exitosamente a MongoDB Atlas");
    } catch (e) {
        console.error("Error al conectar a la base de datos:", e);
    }
}
conectarDB();

const cuentasApi = [
    { useruid: "US1sc9xwLJPZUPCFctlSkQeoa5r2", apiKey: "kaiqIA3oUtxFA9kBBaP9UZB8fBbFb1" },
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgwMOkyUzgxKheQbJP4sNp" },
    { useruid: "p8OmIYODcZwK7hyZeCMaxMQUH11", apiKey: "fWHilgMaQytoBK2ItMoD34C9CfzH1" },
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwCBH49kQ88MDRdWk2nGyvsCS" },
    { useruid: "qsYZfyr7CJW4oQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCSnBOT0Rxd8rBe9FR" }
];

let indiceCuentaActual = 0;

app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;

    if (!uid) {
        return res.status(400).json({ valid: false });
    }

    try {
        const cachedUser = await cacheCollection.findOne({ uid: uid });
        if (cachedUser) {
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
            await cacheCollection.insertOne({ uid: uid, nombre: nombreJugador });
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
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
