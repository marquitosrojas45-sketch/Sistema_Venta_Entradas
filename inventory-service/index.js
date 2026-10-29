require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_desarrollo_tp7';

app.use(express.json());

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

            logger.info('[inventory-service] Inventario inicial creado');
        }
    } catch (error) {
        logger.error('[inventory-service] Error al inicializar inventario', {
            error: error.message
        });
    }
}

// Middleware de autenticación JWT
function autenticarJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[inventory-service] Petición rechazada: token ausente');

        return res.status(401).json({
            error: 'Token de autenticación requerido'
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
        logger.warn('[inventory-service] Token inválido o vencido', {
            motivo: error.message
        });

        return res.status(401).json({
            error: 'Token inválido o expirado'
        });
    }
}

// Middleware de autorización por rol
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

// Documentación Swagger
const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'API Inventory Service - TP7',
        version: '2.0.0'
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
                summary: 'Estado de salud (público)',
                responses: {
                    '200': { description: 'Servicio disponible' }
                }
            }
        },
        '/api/inventario': {
            get: {
                summary: 'Consulta catálogo y stock (público)',
                responses: {
                    '200': { description: 'Inventario consultado' }
                }
            }
        },
        '/api/inventario/stock': {
            post: {
                summary: 'Agrega o actualiza stock (solo ADMIN)',
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
                    '400': { description: 'Datos inválidos' },
                    '401': { description: 'No autenticado' },
                    '403': { description: 'Rol insuficiente' }
                }
            }
        },
        '/api/inventario/reducir': {
            put: {
                summary: 'Descuenta una unidad (USER o ADMIN autenticado)',
                security: [{ bearerAuth: [] }],
                responses: {
                    '200': { description: 'Stock descontado' },
                    '400': { description: 'Stock insuficiente' },
                    '401': { description: 'No autenticado' },
                    '403': { description: 'Rol insuficiente' },
                    '404': { description: 'Producto no encontrado' }
                }
            }
        }
    }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/swagger.json', (req, res) => {
    res.json(swaggerDocument);
});

// Rutas públicas
app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'inventory-service',
        status: 'ok'
    });
});

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

// Solo ADMIN puede agregar o actualizar stock
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
                    error: 'Datos de producto o stock inválidos'
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

// Requiere JWT válido y rol USER o ADMIN
app.put(
    '/api/inventario/reducir',
    autenticarJWT,
    autorizarRoles('USER', 'ADMIN'),
    async (req, res) => {
        try {
            const nombreProd =
                typeof req.body.producto === 'string' &&
                req.body.producto.trim()
                    ? req.body.producto.trim()
                    : 'Entrada Conferencia';

            const item = await Inventario.findOneAndUpdate(
                {
                    producto: nombreProd,
                    stock: { $gt: 0 }
                },
                { $inc: { stock: -1 } },
                { new: true, runValidators: true }
            );

            if (item) {
                logger.info('[inventory-service] Stock descontado', {
                    userId: req.user.sub,
                    role: req.user.role,
                    stockRestante: item.stock
                });

                return res.status(200).json({
                    mensaje: 'Stock reducido',
                    stockRestante: item.stock,
                    usuarioAutenticado: req.user.sub
                });
            }

            const existe = await Inventario.exists({
                producto: nombreProd
            });

            if (!existe) {
                return res.status(404).json({
                    error: 'Producto no encontrado'
                });
            }

            logger.warn('[inventory-service] Stock insuficiente', {
                userId: req.user.sub
            });

            return res.status(400).json({
                error: 'Stock insuficiente'
            });
        } catch (error) {
            logger.error('[inventory-service] Error al reducir stock', {
                error: error.message
            });

            res.status(500).json({
                error: 'Error interno del servidor'
            });
        }
    }
);

app.listen(PORT, () => {
    logger.info(`[inventory-service] Iniciado en el puerto ${PORT}`);
});

inicializarInventario();
