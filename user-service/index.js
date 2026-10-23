require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tp6_usuarios')
    .then(() => logger.info('User Service conectado a MongoDB exitosamente'))
    .catch(err => logger.error('Error conectando a MongoDB', { error: err.message }));

const usuarioSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    apellido: { type: String, required: true },
    dni: { type: String, required: true, unique: true }, 
    telefono: { type: String, required: true },
    mail: { type: String, required: true }
});

const Usuario = mongoose.model('Usuario', usuarioSchema);

const swaggerDocument = {
    openapi: '3.0.0',
    info: { title: 'API User Service - TP6', version: '1.0.0' },
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
        '/health': { get: { summary: 'Estado de salud', responses: { '200': { description: 'OK' } } } },
        '/api/usuarios': {
            get: { summary: 'Obtiene todos los usuarios', responses: { '200': { description: 'OK' } } },
            post: {
                summary: 'Crea un nuevo usuario',
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } } },
                responses: { '201': { description: 'Creado' }, '400': { description: 'Datos inválidos' }, '409': { description: 'DNI duplicado' } }
            }
        }
    }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/swagger.json', (req, res) => res.json(swaggerDocument));

app.get('/health', (req, res) => {
    res.status(200).json({ service: 'user-service', status: 'ok' });
});

app.get('/api/usuarios', async (req, res) => {
    try {
        const usuarios = await Usuario.find();
        res.status(200).json(usuarios);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.get('/api/usuarios/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Formato de ID inválido' });
        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.status(200).json(usuario);
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const nuevoUsuario = await Usuario.create(req.body);
        res.status(201).json(nuevoUsuario);
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ error: 'El DNI ya se encuentra registrado' });
        res.status(400).json({ error: 'Datos inválidos' });
    }
});

app.put('/api/usuarios/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
        const usuarioActualizado = await Usuario.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!usuarioActualizado) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.status(200).json(usuarioActualizado);
    } catch (error) {
        res.status(400).json({ error: 'Datos inválidos' });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
        const usuarioBorrado = await Usuario.findByIdAndDelete(req.params.id);
        if (!usuarioBorrado) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.listen(PORT, () => {
    logger.info(`User Service iniciado en el puerto ${PORT}`);
});