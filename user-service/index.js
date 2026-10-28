require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_desarrollo_tp7';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tp6_usuarios')
    .then(() => logger.info('[user-service] Conectado a MongoDB exitosamente'))
    .catch(err => logger.error('[user-service] Error conectando a MongoDB', { error: err.message }));

// MODELO DE USUARIO E IDENTIDAD (Sección 6 TP7)
const usuarioSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    apellido: { type: String, required: true },
    dni: { type: String, required: true, unique: true },
    telefono: { type: String, required: true },
    mail: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
    activo: { type: Boolean, default: true }
});

// Ocultar siempre passwordHash al convertir a JSON
usuarioSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.passwordHash;
        return ret;
    }
});

const Usuario = mongoose.model('Usuario', usuarioSchema);

// MIDDLEWARE DE AUTENTICACIÓN (Sección 9 TP7)
const autenticarJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[user-service] Acceso denegado: Token ausente o formato inválido');
        return res.status(401).json({ error: 'Token de autenticación ausente o mal formado' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        req.user = payload;
        next();
    } catch (error) {
        logger.warn('[user-service] Token inválido o vencido', { motivo: error.message });
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// MIDDLEWARE DE AUTORIZACIÓN POR ROL (Sección 11 TP7)
const autorizarRoles = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.user || !rolesPermitidos.includes(req.user.role)) {
            logger.warn('[user-service] Acceso prohibido por rol insuficiente', {
                userId: req.user?.sub,
                rolActual: req.user?.role,
                rolesRequeridos: rolesPermitidos
            });
            return res.status(403).json({ error: 'Permisos insuficientes para realizar esta operación' });
        }
        next();
    };
};

// SWAGGER CON ESQUEMA BEARER (Sección 16 TP7)
const swaggerDocument = {
    openapi: '3.0.0',
    info: { title: 'API User & Auth Service - TP7', version: '2.0.0' },
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        }
    },
    paths: {
        '/health': { get: { summary: 'Estado de salud (Público)', responses: { '200': { description: 'OK' } } } },
        '/auth/register': {
            post: {
                summary: 'Registro de nuevo usuario (Público)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['nombre', 'apellido', 'dni', 'telefono', 'mail', 'password'],
                                properties: {
                                    nombre: { type: 'string', example: 'Carlos' },
                                    apellido: { type: 'string', example: 'Gómez' },
                                    dni: { type: 'string', example: '33445566' },
                                    telefono: { type: 'string', example: '2619998888' },
                                    mail: { type: 'string', example: 'carlos@email.com' },
                                    password: { type: 'string', example: 'MiClaveSegura123' },
                                    role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' }
                                }
                            }
                        }
                    }
                },
                responses: { '201': { description: 'Usuario registrado' }, '400': { description: 'Datos inválidos' }, '409': { description: 'Usuario duplicado' } }
            }
        },
        '/auth/login': {
            post: {
                summary: 'Login de usuario y emisión de JWT (Público)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['mail', 'password'],
                                properties: {
                                    mail: { type: 'string', example: 'carlos@email.com' },
                                    password: { type: 'string', example: 'MiClaveSegura123' }
                                }
                            }
                        }
                    }
                },
                responses: { '200': { description: 'JWT emitido' }, '401': { description: 'Credenciales inválidas' }, '403': { description: 'Cuenta deshabilitada' } }
            }
        },
        '/api/usuarios': {
            get: {
                summary: 'Lista todos los usuarios (Solo ADMIN)',
                security: [{ bearerAuth: [] }],
                responses: { '200': { description: 'OK' }, '401': { description: 'No autenticado' }, '403': { description: 'No autorizado (Requiere ADMIN)' } }
            }
        },
        '/api/usuarios/{id}': {
            get: {
                summary: 'Obtiene un usuario (Propio usuario o ADMIN)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '200': { description: 'OK' }, '401': { description: 'No autenticado' }, '403': { description: 'No es propietario ni ADMIN' } }
            },
            delete: {
                summary: 'Elimina un usuario (Solo ADMIN)',
                security: [{ bearerAuth: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: { '204': { description: 'Eliminado' }, '401': { description: 'No autenticado' }, '403': { description: 'Requiere ADMIN' } }
            }
        }
    }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/swagger.json', (req, res) => res.json(swaggerDocument));

// ENDPOINT PÚBLICO: HEALTH
app.get('/health', (req, res) => {
    res.status(200).json({ service: 'user-service', status: 'ok' });
});

// HITO 2: REGISTRO DE USUARIOS (Sección 6.2 TP7)
app.post('/auth/register', async (req, res) => {
    try {
        const { nombre, apellido, dni, telefono, mail, password, role } = req.body;
        if (!nombre || !apellido || !dni || !telefono || !mail || !password) {
            return res.status(400).json({ error: 'Todos los campos obligatorios deben completarse' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const rolAsignado = (role === 'ADMIN') ? 'ADMIN' : 'USER';

        const nuevoUsuario = await Usuario.create({
            nombre,
            apellido,
            dni,
            telefono,
            mail,
            passwordHash,
            role: rolAsignado,
            activo: true
        });

        logger.info('[user-service] Usuario registrado exitosamente', { userId: nuevoUsuario._id.toString(), role: nuevoUsuario.role });
        res.status(201).json(nuevoUsuario);
    } catch (error) {
        if (error.code === 11000) {
            logger.warn('[user-service] Intento de registro duplicado', { mail: req.body?.mail, dni: req.body?.dni });
            return res.status(409).json({ error: 'El DNI o mail ya se encuentra registrado' });
        }
        logger.error('[user-service] Error en registro', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// HITO 2: LOGIN Y EMISIÓN DE JWT (Sección 7 y 8 TP7)
app.post('/auth/login', async (req, res) => {
    try {
        const { mail, password } = req.body;
        if (!mail || !password) {
            return res.status(400).json({ error: 'Debe proporcionar mail y password' });
        }

        const usuario = await Usuario.findOne({ mail });
        if (!usuario) {
            logger.warn('[user-service] Login fallido: usuario inexistente', { mail });
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
        if (!passwordValida) {
            logger.warn('[user-service] Login fallido: password incorrecta', { userId: usuario._id.toString() });
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        if (!usuario.activo) {
            logger.warn('[user-service] Login rechazado: cuenta deshabilitada', { userId: usuario._id.toString() });
            return res.status(403).json({ error: 'La cuenta se encuentra deshabilitada' });
        }

        const payload = {
            sub: usuario._id.toString(),
            role: usuario.role,
            iss: 'user-service'
        };

        const accessToken = jwt.sign(payload, JWT_SECRET, {
            algorithm: 'HS256',
            expiresIn: JWT_EXPIRES_IN
        });

        logger.info('[user-service] Login exitoso', { userId: usuario._id.toString(), role: usuario.role });
        res.status(200).json({
            accessToken,
            tokenType: 'Bearer',
            expiresIn: JWT_EXPIRES_IN,
            usuario: {
                id: usuario._id,
                mail: usuario.mail,
                role: usuario.role
            }
        });
    } catch (error) {
        logger.error('[user-service] Error en login', { error: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ENDPOINTS PROTEGIDOS DE USUARIOS (Sección 11 y 11.2 TP7)
// Listar todos: Solo ADMIN
app.get('/api/usuarios', autenticarJWT, autorizarRoles('ADMIN'), async (req, res) => {
    try {
        const usuarios = await Usuario.find();
        res.status(200).json(usuarios);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Ver perfil por ID: Propiedad del recurso (El propio usuario o un ADMIN)
app.get('/api/usuarios/:id', autenticarJWT, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Formato de ID inválido' });
        }
        // Regla de propiedad del recurso (Sección 11.2)
        if (req.user.role !== 'ADMIN' && req.user.sub !== req.params.id) {
            logger.warn('[user-service] Violación de propiedad del recurso', { solicitante: req.user.sub, recursoObjetivo: req.params.id });
            return res.status(403).json({ error: 'No tiene permisos para consultar el perfil de otro usuario' });
        }

        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.status(200).json(usuario);
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar usuario: Solo ADMIN
app.delete('/api/usuarios/:id', autenticarJWT, autorizarRoles('ADMIN'), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Formato de ID inválido' });
        }
        const usuarioBorrado = await Usuario.findByIdAndDelete(req.params.id);
        if (!usuarioBorrado) return res.status(404).json({ error: 'Usuario no encontrado' });
        logger.info('[user-service] Usuario eliminado por ADMIN', { adminId: req.user.sub, eliminadoId: req.params.id });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.listen(PORT, () => {
    logger.info(`[user-service] Iniciado en el puerto ${PORT}`);
});