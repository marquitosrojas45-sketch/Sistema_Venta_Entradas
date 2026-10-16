require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('redis');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');

// Importamos el logger modular (Cumpliendo el Punto 7)
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3443;
app.use(express.json());

// ==========================================
// 1. CONEXIONES A BASES DE DATOS (MONGO Y REDIS)
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => logger.info('Conectado a MongoDB exitosamente'))
    .catch(err => logger.error('Error conectando a MongoDB', { error: err.message }));

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => logger.error('Error en Redis', { error: err.message }));
redisClient.connect()
    .then(() => logger.info('Conectado a Redis/Memurai exitosamente'))
    .catch(err => logger.error('Error al conectar Redis', { error: err.message }));

// ==========================================
// 2. MODELADO CON MONGOOSE
// ==========================================
const usuarioSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    apellido: { type: String, required: true },
    dni: { type: String, required: true, unique: true }, 
    telefono: { type: String, required: true },
    mail: { type: String, required: true }
});
const Usuario = mongoose.model('Usuario', usuarioSchema);

const inventarioSchema = new mongoose.Schema({
    producto: { type: String, required: true, unique: true },
    stock: { type: Number, required: true, min: 0 } 
});
const Inventario = mongoose.model('Inventario', inventarioSchema);

// Inicializar un producto para probar la concurrencia
const inicializarInventario = async () => {
    try {
        const existe = await Inventario.findOne({ producto: "Entrada Conferencia" });
        if (!existe) {
            await Inventario.create({ producto: "Entrada Conferencia", stock: 1 });
            logger.info('Inventario inicial creado en MongoDB');
        }
    } catch (error) {
        logger.error('Error al inicializar inventario', { error: error.message });
    }
};
inicializarInventario();

// ==========================================
// 3. DOCUMENTACIÓN SWAGGER / OPENAPI (ENRIQUECIDA)
// ==========================================
const swaggerDocument = {
    openapi: '3.0.0',
    info: { 
        title: 'API REST TP3', 
        version: '1.0.0', 
        description: 'Documentación de API con MongoDB, Redis y Winston' 
    },
    components: {
        schemas: {
            Usuario: {
                type: 'object',
                required: ['nombre', 'apellido', 'dni', 'telefono', 'mail'],
                properties: {
                    nombre: { type: 'string', example: 'Carlos' },
                    apellido: { type: 'string', example: 'Gómez' },
                    dni: { type: 'string', example: '33445566' },
                    telefono: { type: 'string', example: '2619998888' },
                    mail: { type: 'string', example: 'carlos@email.com' }
                }
            }
        }
    },
    paths: {
        '/api/usuarios': {
            get: { 
                summary: 'Obtiene todos los usuarios', 
                responses: { 
                    '200': { description: 'Lista de usuarios obtenida exitosamente' },
                    '500': { description: 'Error interno del servidor' }
                } 
            },
            post: { 
                summary: 'Crea un nuevo usuario', 
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } }
                },
                responses: { 
                    '201': { description: 'Usuario creado exitosamente' }, 
                    '400': { description: 'Datos inválidos (Bad Request)' }, 
                    '409': { description: 'Conflicto: DNI duplicado' } 
                } 
            }
        },
        '/api/comprar': {
            post: { 
                summary: 'Simula una compra concurrente protegida por Redis', 
                responses: { 
                    '200': { description: 'Compra exitosa' }, 
                    '400': { description: 'Stock insuficiente' }, 
                    '409': { description: 'Recurso bloqueado por otra transacción' } 
                } 
            }
        }
    }
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/swagger.json', (req, res) => res.json(swaggerDocument)); 


// ==========================================
// 4. ENDPOINTS CRUD 
// ==========================================
app.get('/api/usuarios', async (req, res) => {
    try {
        const usuarios = await Usuario.find();
        logger.info('Usuarios listados correctamente');
        res.status(200).json(usuarios);
    } catch (error) {
        logger.error('Error al listar usuarios', { error: error.message });
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.get('/api/usuarios/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            logger.warn('Intento de búsqueda con ID inválido', { id: req.params.id });
            return res.status(400).json({ error: 'Formato de ID inválido' }); 
        }
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) {
            logger.warn('Usuario no encontrado', { id: req.params.id });
            return res.status(404).json({ error: 'Usuario no encontrado' }); 
        }
        res.status(200).json(usuario);
    } catch (error) {
        logger.error('Error al buscar usuario', { error: error.message });
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const nuevoUsuario = await Usuario.create(req.body);
        logger.info('Usuario creado exitosamente', { id: nuevoUsuario._id });
        res.status(201).json(nuevoUsuario);
    } catch (error) {
        if (error.code === 11000) { 
            logger.warn('Conflicto: DNI duplicado', { dni: req.body.dni });
            return res.status(409).json({ error: 'El DNI ya se encuentra registrado' }); 
        }
        logger.warn('Datos inválidos enviados al crear usuario', { error: error.message });
        res.status(400).json({ error: 'Datos inválidos', detalles: error.message }); 
    }
});

app.put('/api/usuarios/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
        const usuarioActualizado = await Usuario.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!usuarioActualizado) return res.status(404).json({ error: 'Usuario no encontrado' });
        logger.info('Usuario modificado', { id: usuarioActualizado._id });
        res.status(200).json(usuarioActualizado);
    } catch (error) {
        logger.warn('Error validando actualización', { error: error.message });
        res.status(400).json({ error: 'Datos inválidos' });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
        const usuarioBorrado = await Usuario.findByIdAndDelete(req.params.id);
        if (!usuarioBorrado) return res.status(404).json({ error: 'Usuario no encontrado' });
        logger.info('Usuario eliminado', { id: req.params.id });
        res.status(204).send();
    } catch (error) {
        logger.error('Error al borrar usuario', { error: error.message });
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ==========================================
// 5. CONCURRENCIA (TP2 INTEGRADO CON MONGO)
// ==========================================
app.post('/api/comprar', async (req, res) => {
    const lockKey = `lock:producto:Entrada_Conferencia`; 
    const ownerId = crypto.randomUUID(); 
    const TTL = 5000; 

    try {
        const lockAdquirido = await redisClient.set(lockKey, ownerId, { NX: true, PX: TTL });
        if (!lockAdquirido) {
            logger.warn('Intento de compra rechazado: Recurso bloqueado');
            return res.status(409).json({ error: "El recurso está bloqueado." });
        }

        const item = await Inventario.findOne({ producto: "Entrada Conferencia" });
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        if (item && item.stock > 0) {
            item.stock = item.stock - 1;
            await item.save(); 
            logger.info('Compra procesada exitosamente', { stockRestante: item.stock });
            res.status(200).json({ mensaje: "Compra exitosa", stockRestante: item.stock });
        } else {
            logger.warn('Compra fallida: Stock insuficiente');
            res.status(400).json({ error: "Stock insuficiente" });
        }
    } catch (error) {
        logger.error('Error en proceso de compra', { error: error.message });
        res.status(500).json({ error: "Error interno del servidor" });
    } finally {
        const scriptLiberacion = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
        await redisClient.eval(scriptLiberacion, { keys: [lockKey], arguments: [ownerId] });
    }
});

// ==========================================
// 6. INICIO DE HTTPS
// ==========================================
const opcionesHttps = {
    pfx: fs.readFileSync(process.env.HTTPS_PFX_PATH),
    passphrase: process.env.HTTPS_PASSPHRASE
};

https.createServer(opcionesHttps, app).listen(PORT, () => {
    logger.info(`Servidor HTTPS iniciado en https://localhost:${PORT}`);
});