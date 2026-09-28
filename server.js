const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE CUENTAS: LA BUENA AL FINAL (ÍNDICE 4) ---
const cuentasApi = [
    { useruid: "US1sc9xwLJPZUPCFctlSkQeoa5r2", apiKey: "kaiqIA3oUtxFA9kBBaP9UZB8fBbFb1" }, // [0] Sin saldo (falla a propósito)
    { useruid: "qsYZfyr7CJW4oQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCSnBOT0Rxd8rBe9FR" }, // [1] 
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwCBH49kQ88MDRdWk2nGyvsCS" }, // [2] 
    { useruid: "p8OmIYODcZwK7hyZeCMaxMQUH11", apiKey: "fWHilgMaQytoBK2ItMoD34C9CfzH1" }, // [3] 
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgWMOkyUzgxKheQbJP4sNp" }  // [4] La buena (al final)
];

// --- RUTA DE PRUEBA DE ROTACIÓN ---
app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    if (!uid) {
        return res.status(400).json({ valid: false, error: "Falta el UID" });
    }

    console.log(`\n--- PROBANDO ROTACIÓN (CUENTA BUENA EN [4]) PARA UID: ${uid} ---`);
    let logRotacion = [];

    for (let i = 0; i < cuentasApi.length; i++) {
        const cuenta = cuentasApi[i];
        const url = `https://proapis.hlgamingofficial.com/main/games/freefire/validation/api?sectionName=freefireValidation&useruid=${cuenta.useruid}&api=${cuenta.apiKey}&uid=${uid}&region=US`;

        console.log(`➡️ [Intento ${i}] Probando con la cuenta índice [${i}]...`);

        try {
            const respuesta = await fetch(url);
            const textoRespuesta = await respuesta.text();

            if (textoRespuesta.trim().startsWith('<')) {
                console.warn(`⚠️ [Intento ${i}] Devolvió HTML. Pasando a la siguiente...`);
                logRotacion.push({ indice: i, resultado: "HTML recibido" });
                continue;
            }

            const data = JSON.parse(textoRespuesta);

            if (data.error_code === "QUOTA_LIMIT_REACHED" || data.status === "quota_exceeded") {
                console.warn(`❌ [Intento ${i}] Cuenta [${i}] sin saldo (Quota Exceeded). Rotando a la siguiente...`);
                logRotacion.push({ indice: i, resultado: "Sin saldo / Quota alcanzada" });
                continue;
            }

            if (data.result && data.result.valid && data.result.AccountName) {
                console.log(`✅ [Intento ${i}] ¡ÉXITO! Encontrado con la cuenta [${i}] -> Jugador: ${data.result.AccountName}`);
                return res.json({
                    valid: true,
                    AccountName: data.result.AccountName,
                    cuentaExitosa: i,
                    historialRotacion: logRotacion
                });
            } else {
                console.warn(`⚠️ [Intento ${i}] Respuesta inválida en cuenta [${i}]`);
                logRotacion.push({ indice: i, resultado: "Respuesta inválida" });
            }

        } catch (err) {
            console.error(`❌ [Intento ${i}] Excepción de red en cuenta [${i}]:`, err.message);
            logRotacion.push({ indice: i, resultado: "Excepción de red", error: err.message });
        }
    }

    console.log(`❌ [Fallo Total] Ninguna cuenta pudo verificar el UID: ${uid}`);
    return res.status(200).json({
        valid: false,
        error: "Todas las cuentas fallaron",
        historialRotacion: logRotacion
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de prueba de rotación corriendo en el puerto ${PORT}`);
});
