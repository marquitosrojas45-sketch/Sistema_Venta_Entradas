require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
const swaggerUi = require('swagger-ui-express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_desarrollo_tp7';

app.use(express.json());

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
redisClient.on('error', (err) => logger.error('[checkout-service] Error en Redis', { error: err.message }));
redisClient.connect()
    .then(() => logger.info('[checkout-service] Conectado a Redis exitosamente'))
    .catch(err => logger.error('[checkout-service] Error al conectar Redis', { error: err.message }));

// MIDDLEWARE DE AUTENTICACIÓN JWT (Sección 9 TP7)
const autenticarJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[checkout-service] Intento de compra sin token');
        return res.status(401).json({ error: 'Token de autenticación ausente o mal formado' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        req.user = payload;
        req.rawToken = token; // Guardamos para propagarlo a inventory-service
        next();
    } catch (error) {
        logger.warn('[checkout-service] Token inválido o vencido', { motivo: error.message });
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// MIDDLEWARE DE AUTORIZACIÓN POR ROL (Sección 11 TP7)
const autorizarRoles = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.user || !rolesPermitidos.includes(req.user.role)) {
            logger.warn('[checkout-service] Rol no autorizado para comprar', { userId: req.user?.sub, role: req.user?.role });
            return res.status(403).json({ error: 'No tiene permisos para realizar compras' });
        }
        next();
    };
};

// SWAGGER CON ESQUEMA BEARER
const swaggerDocument = {
    openapi: '3.0.0',
    info: { title: 'API Checkout Service - TP7', version: '2.0.0' },
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        }
    },
    paths: {
        '/health': { get: { summary: 'Estado de salud (Público)', responses: { '200': { description: 'OK' } } } },
        '/api/comprar': {
            post: {
                summary: 'Ejecuta una compra concurrente propagando el JWT a Inventario (USER o ADMIN)',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: false,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { producto: { type: 'string', example: 'Entrada Conferencia' } }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Compra exitosa' },
                    '400': { description: 'Stock insuficiente' },
                    '401': { description: 'Token ausente, inválido o expirado' },
                    '403': { description: 'Permisos insuficientes' },
                    '409': { description: 'Recurso bloqueado por otra transacción' },
                    '503': { description: 'Servicio de inventario no disponible' }
                }
            }
        }
    }
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/swagger.json', (req, res) => res.json(swaggerDocument));

app.get('/health', (req, res) => {
    res.status(200).json({ service: 'checkout-service', status: 'ok' });
});

// ENDPOINT PROTEGIDO CON PROPAGACIÓN DE TOKEN (Sección 13 TP7)
app.post('/api/comprar', autenticarJWT, autorizarRoles('USER', 'ADMIN'), async (req, res) => {
    const producto = req.body.producto || "Entrada Conferencia";
    const lockKey = `lock:producto:${producto.replace(/\s+/g, '_')}`;
    const ownerId = crypto.randomUUID();
    const TTL = 5000;

    try {
        const lockAdquirido = await redisClient.set(lockKey, ownerId, { NX: true, PX: TTL });
        if (!lockAdquirido) {
            logger.warn('[checkout-service] Compra rechazada: Recurso bloqueado en Redis', { userId: req.user.sub });
            return res.status(409).json({ error: "El recurso está bloqueado por otra compra en curso." });
        }

        const inventoryUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        // PROPAGACIÓN DEL TOKEN JWT AL MICROSERVICIO INTERNO (Sección 13 TP7)
        const response = await fetch(`${inventoryUrl}/api/inventario/reducir`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${req.rawToken}`
            },
            body: JSON.stringify({ producto }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            logger.info('[checkout-service] Compra procesada exitosamente', {
                compradorId: req.user.sub,
                role: req.user.role,
                stockRestante: data.stockRestante
            });
            return res.status(200).json({
                mensaje: "Compra exitosa",
                compradorId: req.user.sub,
                rol: req.user.role,
                stockRestante: data.stockRestante
            });
        } else if (response.status === 400) {
            logger.warn('[checkout-service] Compra fallida: Stock insuficiente', { compradorId: req.user.sub });
            return res.status(400).json({ error: "Stock insuficiente" });
        } else if (response.status === 401 || response.status === 403) {
            return res.status(response.status).json({ error: "Rechazado por Inventory Service al validar token propagado" });
        } else {
            logger.error('[checkout-service] Error desde Inventory Service', { status: response.status });
            return res.status(503).json({ error: "Servicio de inventario devolvió un error" });
        }
    } catch (error) {
        logger.error('[checkout-service] Fallo de comunicación o Timeout', { error: error.message });
        return res.status(503).json({ error: "Fallo de comunicación con Inventario o Timeout" });
    } finally {
        const scriptLiberacion = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
        await redisClient.eval(scriptLiberacion, { keys: [lockKey], arguments: [ownerId] });
    }
});

app.listen(PORT, () => {
    logger.info(`[checkout-service] Iniciado en el puerto ${PORT}`);
});