const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

// Conexión directa a tu base de datos de MongoDB Atlas
const MONGO_URI = "mongodb+srv://jxsephstore_db_user:lNowAa4aHMLCy5f3@jxsephstoredb.mgemkee.mongodb.net/?appName=JxsephStoreDB";

mongoose.connect(MONGO_URI)
  .then(() => console.log("Conectado a MongoDB Atlas con éxito"))
  .catch(err => console.error("Error al conectar a MongoDB:", err));

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    email: { type: String, required: false }, // Opcional para los que se registran por usuario/contraseña
    password: { type: String, required: true },
    pic: { type: String, default: '' }
});

const User = mongoose.model('User', UserSchema);

// Registrar Usuario (Usando Nombre de Usuario y Contraseña)
app.post('/api/register', async (req, res) => {
    try {
        const { name, password } = req.body;
        
        // Verificar si el usuario ya existe
        let existingUser = await User.findOne({ name });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está en uso.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            name, 
            email: '', 
            password: hashedPassword, 
            pic: '' 
        });
        
        await newUser.save();
        res.json({ success: true, message: 'Usuario registrado correctamente', user: { name, email: '', pic: '' } });
    } catch (error) {
        console.error("Error en registro:", error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

// Iniciar Sesión (Buscando por Nombre de Usuario)
app.post('/api/login', async (req, res) => {
    try {
        const { name, password } = req.body;
        
        // Buscamos al usuario por su nombre (name)
        const user = await User.findOne({ name });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        res.json({ success: true, message: 'Sesión iniciada', user: { name: user.name, email: user.email, pic: user.pic } });
    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
