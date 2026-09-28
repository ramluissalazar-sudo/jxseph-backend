const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE CUENTAS API HL GAMING ---
const cuentasApi = [
    { useruid: "US1sc9xwLJPZUPCFctlSkQeoa5r2", apiKey: "kaiqIA3oUtxFA9kBBaP9UZB8fBbFb1" },
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgwMOkyUzgxKheQbJP4sNp" },
    { useruid: "p8OmIYODcZwK7hyZeCMaxMQUH11", apiKey: "fWHilgMaQytoBK2ItMoD34C9CfzH1" },
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwCBH49kQ88MDRdWk2nGyvsCS" },
    { useruid: "qsYZfyr7CJW4oQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCSnBOT0Rxd8rBe9FR" }
];

app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    if (!uid) {
        return res.status(400).json({ valid: false, error: "Falta el parámetro uid" });
    }

    console.log(`\n=== INICIANDO VERIFICACIÓN PARA UID: ${uid} ===`);

    for (let i = 0; i < cuentasApi.length; i++) {
        const cuenta = cuentasApi[i];
        const url = `https://proapis.hlgamingofficial.com/main/games/freefire/validation/api?sectionName=freefireValidation&useruid=${cuenta.useruid}&api=${cuenta.apiKey}&uid=${uid}&region=US`;

        console.log(`🔍 Probando cuenta índice [${i}]...`);

        try {
            const respuesta = await fetch(url);
            const textoRespuesta = await respuesta.text();

            if (textoRespuesta.trim().startsWith('<')) {
                console.warn(`⚠️ Cuenta [${i}] devolvió HTML. Saltando...`);
                continue;
            }

            const data = JSON.parse(textoRespuesta);

            // Verificamos si la API devolvió éxito
            if (data.result && data.result.valid && data.result.AccountName) {
                console.log(`✅ ¡ÉXITO! Encontrado con la cuenta [${i}] -> Jugador: ${data.result.AccountName}`);
                return res.json({
                    valid: true,
                    AccountName: data.result.AccountName,
                    cuentaExitosa: i
                });
            } else {
                console.warn(`⚠️ Cuenta [${i}] sin saldo o respuesta inválida:`, data.status || data.error_code || 'Desconocido');
            }

        } catch (err) {
            console.error(`❌ Error en cuenta [${i}]:`, err.message);
        }
    }

    console.log(`❌ Ninguna cuenta pudo verificar el UID: ${uid}`);
    return res.status(200).json({ valid: false, error: "Todas las cuentas fallaron o no tienen saldo" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
