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

// --- RUTA EXCLUSIVA DE PRUEBA DE VERIFICACIÓN Y ROTACIÓN ---
app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    if (!uid) {
        return res.status(400).json({ valid: false, error: "Falta el parámetro uid" });
    }

    console.log(`\n=== INICIANDO PRUEBA DE VERIFICACIÓN PARA UID: ${uid} ===`);
    let resultadosDetallados = [];

    for (let i = 0; i < cuentasApi.length; i++) {
        const cuenta = cuentasApi[i];
        const url = `https://proapis.hlgamingofficial.com/main/games/freefire/validation/api?sectionName=freefireValidation&useruid=${cuenta.useruid}&api=${cuenta.apiKey}&uid=${uid}&region=US`;

        console.log(`🔍 Probando cuenta índice [${i}] (useruid: ${cuenta.useruid})`);

        try {
            const respuesta = await fetch(url);
            const textoRespuesta = await respuesta.text();

            console.log(`📥 Respuesta cruda cuenta [${i}]:`, textoRespuesta.substring(0, 150));

            if (textoRespuesta.trim().startsWith('<')) {
                console.warn(`⚠️ La cuenta [${i}] devolvió HTML (posible bloqueo o error de formato).`);
                resultadosDetallados.push({ indice: i, estado: "Error HTML recibido" });
                continue;
            }

            const data = JSON.parse(textoRespuesta);

            if (data.result && data.result.valid && data.result.AccountName) {
                console.log(`✅ ¡ÉXITO! Encontrado con la cuenta índice [${i}] -> Jugador: ${data.result.AccountName}`);
                return res.json({
                    valid: true,
                    AccountName: data.result.AccountName,
                    cuentaExitosa: i,
                    detallesPrueba: resultadosDetallados
                });
            } else {
                console.warn(`⚠️ La cuenta [${i}] respondió pero dio inválido o sin saldo:`, data);
                resultadosDetallados.push({ indice: i, estado: "Inválido / Sin saldo", respuesta: data });
            }

        } catch (err) {
            console.error(`❌ Excepción en cuenta [${i}]:`, err.message);
            resultadosDetallados.push({ indice: i, estado: "Excepción de red", error: err.message });
        }
    }

    console.log(`❌ Todas las cuentas fallaron para el UID: ${uid}`);
    return res.status(404).json({
        valid: false,
        error: "Ninguna cuenta pudo verificar el UID",
        detallesPrueba: resultadosDetallados
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de diagnóstico corriendo en el puerto ${PORT}`);
});
