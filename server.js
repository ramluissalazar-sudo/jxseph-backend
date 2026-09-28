const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const cuentasApi = [
    { useruid: "p8OmIYOXDcZWk7hyZeCMaXmQUHl1", apiKey: "fWHi1gMaQyitoBK2ItMoD34C9CfzH1" }, //
    { useruid: "qsYZfyr7CJW4oQChPrXyyYueRq2", apiKey: "Ss9QZiIqikUBOCSnBOT0Rxd8rBe9FR" }, // 
    { useruid: "elnyJoK2siVkw06ozYVrZI5dij12", apiKey: "CyyrdwCBH49kQ88MDRdWk2nGyvsCS" }, // 
    { useruid: "p8OmIYOXDcZWk7hyZeCMaXmQUHl1", apiKey: "fWHi1gMaQyitoBK2ItMoD34C9CfzH11" }, // 
    { useruid: "N5RkJGYopvdfi2ckptkstByn5Ef2", apiKey: "hxrT1OIMKgWMOkyUzgxKheQbJP4sNp" }  // 
];

app.get('/verificar', async (req, res) => {
    const uid = req.query.uid;
    if (!uid) {
        return res.status(400).json({ valid: false, error: "Falta el UID" });
    }

    console.log(`\n--- DIAGNÓSTICO DETALLADO PARA UID: ${uid} ---`);

    for (let i = 0; i < cuentasApi.length; i++) {
        const cuenta = cuentasApi[i];
        const url = `https://proapis.hlgamingofficial.com/main/games/freefire/validation/api?sectionName=freefireValidation&useruid=${cuenta.useruid}&api=${cuenta.apiKey}&uid=${uid}&region=US`;

        console.log(`➡️ Probando cuenta [${i}] (useruid: ${cuenta.useruid})`);

        try {
            const respuesta = await fetch(url);
            const textoRespuesta = await respuesta.text();

            if (textoRespuesta.trim().startsWith('<')) {
                console.warn(`⚠️ Cuenta [${i}] devolvió HTML.`);
                continue;
            }

            const data = JSON.parse(textoRespuesta);
            console.log(`📥 Respuesta de cuenta [${i}]:`, data); // <--- ESTO IMPRIMIRÁ EL ERROR EXACTO

            if (data.result && data.result.valid && data.result.AccountName) {
                console.log(`✅ ¡ÉXITO en cuenta [${i}] -> Jugador: ${data.result.AccountName}`);
                return res.json({ valid: true, AccountName: data.result.AccountName, cuentaExitosa: i });
            }

        } catch (err) {
            console.error(`❌ Error en cuenta [${i}]:`, err.message);
        }
    }

    return res.status(200).json({ valid: false, error: "Ninguna cuenta funcionó" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor de diagnóstico en puerto ${PORT}`);
});
