require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_desarrollo_tp7';

app.use(express.json());

// ==========================================
// 1. CONEXIÓN A MONGODB (Persistencia de Stock)
// ==========================================
mongoose.connect(
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tp6_inventario'
)
    .then(() => {
        logger.info('[inventory-service] Conectado a MongoDB exitosamente');
    })
    .catch(error => {
        logger.error('[inventory-service] Error conectando a MongoDB', {
            error: error.message
        });
    });

// ==========================================
// 2. CONEXIÓN A REDIS (Propiedad de Locks y Concurrencia de Stock)
// ==========================================
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

redisClient.on('error', (err) => {
    logger.error('[inventory-service] Error en cliente Redis', { error: err.message });
});

redisClient.connect()
    .then(() => {
        logger.info('[inventory-service] Conectado a Redis exitosamente (Gestor de Locks de Stock)');
    })
    .catch(err => {
        logger.error('[inventory-service] Error al conectar a Redis para concurrencia', { error: err.message });
    });

// ==========================================
// 3. MODELO Y ESQUEMA DE INVENTARIO
// ==========================================
const inventarioSchema = new mongoose.Schema({
    producto: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    stock: {
        type: Number,
        required: true,
        min: 0
    }
});

const Inventario = mongoose.model('Inventario', inventarioSchema);

async function inicializarInventario() {
    try {
        const existe = await Inventario.findOne({
            producto: 'Entrada Conferencia'
        });

        if (!existe) {
            await Inventario.create({
                producto: 'Entrada Conferencia',
                stock: 5
            });

            logger.info('[inventory-service] Inventario inicial creado (Entrada Conferencia: 5)');
        }
    } catch (error) {
        logger.error('[inventory-service] Error al inicializar inventario', {
            error: error.message
        });
    }
}

// ==========================================
// 4. MIDDLEWARES DE AUTENTICACIÓN Y ROLES JWT
// ==========================================
function autenticarJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[inventory-service] Peticion rechazada: token ausente o mal formado');
        return res.status(401).json({
            error: 'Token de autenticacion requerido'
        });
    }

    const token = authHeader.slice(7);

    try {
        const payload = jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256']
        });

        req.user = payload;
        req.rawToken = token;
        next();
    } catch (error) {
        logger.warn('[inventory-service] Token invalido o vencido', {
            motivo: error.message
        });

        return res.status(401).json({
            error: 'Token invalido o expirado'
        });
    }
}

function autorizarRoles(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.user || !rolesPermitidos.includes(req.user.role)) {
            logger.warn('[inventory-service] Acceso denegado por rol', {
                userId: req.user?.sub,
                rolActual: req.user?.role,
                rolesRequeridos: rolesPermitidos
            });

            return res.status(403).json({
                error: 'No tiene permisos suficientes'
            });
        }

        next();
    };
}

// ==========================================
// 5. DOCUMENTACIÓN SWAGGER (OPENAPI 3.0)
// ==========================================
const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'API Inventory Service - TP6 & TP7',
        version: '3.0.0',
        description: 'Microservicio propietario de los datos de inventario y del bloqueo distribuido (lock en Redis) para proteger la concurrencia de stock.'
    },
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        }
    },
    paths: {
        '/health': {
            get: {
                summary: 'Estado de salud (publico)',
                responses: {
                    '200': { description: 'Servicio disponible' }
                }
            }
        },
        '/api/inventario': {
            get: {
                summary: 'Consulta catalogo y stock actual (publico)',
                responses: {
                    '200': { description: 'Inventario consultado exitosamente' }
                }
            }
        },
        '/api/inventario/stock': {
            post: {
                summary: 'Agrega o actualiza stock (exclusivo ADMIN)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['producto', 'stock'],
                                properties: {
                                    producto: {
                                        type: 'string',
                                        example: 'Entrada Conferencia'
                                    },
                                    stock: {
                                        type: 'number',
                                        example: 10
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Stock actualizado' },
                    '400': { description: 'Datos invalidos' },
                    '401': { description: 'No autenticado' },
                    '403': { description: 'Rol insuficiente (requiere ADMIN)' }
                }
            }
        },
        '/api/inventario/reducir': {
            put: {
                summary: 'Descuenta 1 unidad protegiendo la concurrencia con Lock en Redis (USER o ADMIN)',
                description: 'Inventory Service adquiere un lock temporal en Redis para el producto solicitado antes de modificar MongoDB, evitando sobreventas concurrentes y devolviendo 409 si el lock esta retenido.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: false,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    producto: {
                                        type: 'string',
                                        example: 'Entrada Conferencia'
                                    }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Stock descontado con exito' },
                    '400': { description: 'Stock insuficiente' },
                    '401': { description: 'Token ausente o invalido' },
                    '403': { description: 'Permisos insuficientes' },
                    '404': { description: 'Producto no encontrado' },
                    '409': { description: 'Recurso bloqueado por concurrencia en Inventario' }
                }
            }
        }
    }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/swagger.json', (req, res) => {
    res.json(swaggerDocument);
});

// ==========================================
// 6. ENDPOINTS
// ==========================================

// Healthcheck publico
app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'inventory-service',
        status: 'ok',
        redis: redisClient.isOpen ? 'connected' : 'disconnected',
        mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Consulta de catalogo (publico)
app.get('/api/inventario', async (req, res) => {
    try {
        const items = await Inventario.find();
        res.status(200).json(items);
    } catch (error) {
        logger.error('[inventory-service] Error consultando inventario', {
            error: error.message
        });

        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Modificacion de stock (solo ADMIN)
app.post(
    '/api/inventario/stock',
    autenticarJWT,
    autorizarRoles('ADMIN'),
    async (req, res) => {
        try {
            const { producto, stock } = req.body;

            if (
                typeof producto !== 'string' ||
                !producto.trim() ||
                typeof stock !== 'number' ||
                !Number.isFinite(stock) ||
                stock < 0
            ) {
                return res.status(400).json({
                    error: 'Datos de producto o stock invalidos'
                });
            }

            const item = await Inventario.findOneAndUpdate(
                { producto: producto.trim() },
                { $set: { stock } },
                { new: true, upsert: true, runValidators: true }
            );

            logger.info('[inventory-service] Stock actualizado por ADMIN', {
                adminId: req.user.sub,
                producto: item.producto,
                nuevoStock: item.stock
            });

            res.status(200).json({
                mensaje: 'Stock actualizado correctamente',
                inventario: item
            });
        } catch (error) {
            logger.error('[inventory-service] Error actualizando stock', {
                error: error.message
            });

            res.status(500).json({
                error: 'Error interno del servidor'
            });
        }
    }
);

// Reduccion de stock con Lock Distribuido en Redis (USER o ADMIN)
// ENCAPSULACION: Inventory Service es propietario del stock y de la concurrencia que lo protege
app.put(
    '/api/inventario/reducir',
    autenticarJWT,
    autorizarRoles('USER', 'ADMIN'),
    async (req, res) => {
        const nombreProd =
            typeof req.body?.producto === 'string' && req.body.producto.trim()
                ? req.body.producto.trim()
                : 'Entrada Conferencia';

        const lockKey = `lock:producto:${nombreProd.replace(/\s+/g, '_')}`;
        const ownerId = crypto.randomUUID();
        const TTL = 5000; // 5 segundos de TTL de seguridad

        let lockAdquirido = false;

        try {
            // 1. ADQUIRIR EL LOCK EXCLUSIVO EN REDIS
            lockAdquirido = await redisClient.set(lockKey, ownerId, { NX: true, PX: TTL });

            if (!lockAdquirido) {
                logger.warn('[inventory-service] Concurrencia detectada: Recurso bloqueado en Redis', {
                    producto: nombreProd,
                    solicitante: req.user.sub
                });
                return res.status(409).json({
                    error: 'El recurso esta bloqueado por otra transaccion en curso en Inventario.'
                });
            }

            // 2. MODIFICACION ATOMICA EN MONGODB BAJO PROTECCION DEL LOCK
            const item = await Inventario.findOneAndUpdate(
                {
                    producto: nombreProd,
                    stock: { $gt: 0 }
                },
                { $inc: { stock: -1 } },
                { new: true, runValidators: true }
            );

            if (item) {
                logger.info('[inventory-service] Stock descontado exitosamente bajo lock', {
                    producto: item.producto,
                    stockRestante: item.stock,
                    solicitante: req.user.sub,
                    rol: req.user.role
                });

                return res.status(200).json({
                    mensaje: 'Stock reducido correctamente',
                    producto: item.producto,
                    stockRestante: item.stock,
                    usuarioAutenticado: req.user.sub
                });
            }

            // 3. SI NO SE ACTUALIZO, IDENTIFICAR SI NO EXISTE O SI EL STOCK ES CERO
            const existe = await Inventario.exists({ producto: nombreProd });

            if (!existe) {
                logger.warn('[inventory-service] Intento de reduccion de producto inexistente', {
                    producto: nombreProd
                });
                return res.status(404).json({
                    error: 'Producto no encontrado'
                });
            }

            logger.warn('[inventory-service] Intento de reduccion con stock insuficiente', {
                producto: nombreProd,
                solicitante: req.user.sub
            });

            return res.status(400).json({
                error: 'Stock insuficiente'
            });

        } catch (error) {
            logger.error('[inventory-service] Error durante reduccion de stock', {
                error: error.message
            });

            res.status(500).json({
                error: 'Error interno en el servicio de inventario'
            });
        } finally {
            // 4. LIBERACION ATOMICA DEL LOCK EN REDIS MEDIANTE LUA SCRIPT
            if (lockAdquirido) {
                try {
                    const scriptLiberacion = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
                    await redisClient.eval(scriptLiberacion, { keys: [lockKey], arguments: [ownerId] });
                } catch (liberacionError) {
                    logger.error('[inventory-service] Error al liberar lock en Redis', {
                        error: liberacionError.message
                    });
                }
            }
        }
    }
);

app.listen(PORT, () => {
    logger.info(`[inventory-service] Iniciado en el puerto ${PORT}`);
});

inicializarInventario();
