const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(cors());

// Conexión directa a tu base de datos de MongoDB Atlas
const MONGO_URI = "mongodb+srv://jxsephstore_db_user:lNowAa4aHMLCy5f3@jxsephstoredb.mgemkee.mongodb.net/?appName=JxsephStoreDB";

mongoose.connect(MONGO_URI)
  .then(() => console.log("Conectado a MongoDB Atlas con éxito"))
  .catch(err => console.error("Error al conectar a MongoDB:", err));

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    pic: { type: String, default: '' }
});

const User = mongoose.model('User', UserSchema);

// Registrar Usuario
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, pic } = req.body;
        let existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El correo ya está registrado.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword, pic });
        await newUser.save();
        res.json({ success: true, message: 'Usuario registrado correctamente', user: { name, email, pic } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

// Iniciar Sesión
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Correo o contraseña incorrectos.' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Correo o contraseña incorrectos.' });
        }
        res.json({ success: true, message: 'Sesión iniciada', user: { name: user.name, email: user.email, pic: user.pic } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));