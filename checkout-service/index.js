require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_desarrollo_tp7';
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001';

app.use(express.json());

// ==========================================
// 1. MIDDLEWARES DE AUTENTICACIÓN Y AUTORIZACIÓN JWT
// ==========================================
const autenticarJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[checkout-service] Intento de compra sin token o formato invalido');
        return res.status(401).json({ error: 'Token de autenticacion ausente o mal formado' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        req.user = payload;
        req.rawToken = token; // Se preserva el token para propagarlo al servicio interno
        next();
    } catch (error) {
        logger.warn('[checkout-service] Token invalido o vencido', { motivo: error.message });
        return res.status(401).json({ error: 'Token invalido o expirado' });
    }
};

const autorizarRoles = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.user || !rolesPermitidos.includes(req.user.role)) {
            logger.warn('[checkout-service] Rol no autorizado para comprar', {
                userId: req.user?.sub,
                role: req.user?.role
            });
            return res.status(403).json({ error: 'No tiene permisos para realizar compras' });
        }
        next();
    };
};

// ==========================================
// 2. SWAGGER (OPENAPI 3.0)
// ==========================================
const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'API Checkout Service - TP6 & TP7',
        version: '3.0.0',
        description: 'Orquestador del proceso de compra. Valida la identidad y delega la reduccion concurrente de stock a Inventory Service propagando el contexto de seguridad.'
    },
    components: {
        securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        }
    },
    paths: {
        '/health': {
            get: {
                summary: 'Estado de salud (Publico)',
                responses: { '200': { description: 'Servicio disponible' } }
            }
        },
        '/api/comprar': {
            post: {
                summary: 'Ejecuta una compra propagando el JWT a Inventory Service (USER o ADMIN)',
                description: 'Verifica el token JWT del comprador y delega la operacion de reduccion de stock a Inventory Service (quien gestiona el lock de concurrencia y persistencia).',
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
                    '401': { description: 'Token ausente, invalido o expirado' },
                    '403': { description: 'Permisos insuficientes' },
                    '404': { description: 'Producto no encontrado' },
                    '409': { description: 'Recurso bloqueado por concurrencia en Inventario' },
                    '503': { description: 'Servicio de inventario no disponible o Timeout' }
                }
            }
        }
    }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/swagger.json', (req, res) => res.json(swaggerDocument));

// ==========================================
// 3. ENDPOINTS
// ==========================================
app.get('/health', (req, res) => {
    res.status(200).json({ service: 'checkout-service', status: 'ok' });
});

// Proceso de Compra:
// Checkout Service orquesta la transaccion pero delega la concurrencia a Inventory Service (duenio del dato)
app.post('/api/comprar', autenticarJWT, autorizarRoles('USER', 'ADMIN'), async (req, res) => {
    const producto = req.body?.producto || "Entrada Conferencia";

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        // PROPAGACION DEL TOKEN JWT AL MICROSERVICIO DE INVENTARIO
        const response = await fetch(`${INVENTORY_SERVICE_URL}/api/inventario/reducir`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${req.rawToken}`
            },
            body: JSON.stringify({ producto }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            logger.info('[checkout-service] Compra procesada exitosamente', {
                compradorId: req.user.sub,
                role: req.user.role,
                stockRestante: data.stockRestante
            });
            return res.status(200).json({
                mensaje: "Compra exitosa",
                compradorId: req.user.sub,
                rol: req.user.role,
                producto,
                stockRestante: data.stockRestante
            });
        }

        if (response.status === 409) {
            logger.warn('[checkout-service] Compra rechazada: Recurso bloqueado en Inventario', {
                compradorId: req.user.sub,
                producto
            });
            return res.status(409).json({
                error: data.error || "El recurso esta bloqueado por otra compra en curso en Inventario."
            });
        }

        if (response.status === 400) {
            logger.warn('[checkout-service] Compra rechazada: Stock insuficiente', {
                compradorId: req.user.sub,
                producto
            });
            return res.status(400).json({ error: data.error || "Stock insuficiente" });
        }

        if (response.status === 404) {
            logger.warn('[checkout-service] Compra rechazada: Producto no encontrado', { producto });
            return res.status(404).json({ error: data.error || "Producto no encontrado" });
        }

        if (response.status === 401 || response.status === 403) {
            logger.warn('[checkout-service] Inventario rechazo token propagado', { status: response.status });
            return res.status(response.status).json({
                error: data.error || "Rechazado por Inventory Service al validar credenciales"
            });
        }

        logger.error('[checkout-service] Error inesperado devuelto por Inventory Service', { status: response.status });
        return res.status(503).json({ error: "Servicio de inventario devolvio un error inesperado" });

    } catch (error) {
        if (error.name === 'AbortError') {
            logger.error('[checkout-service] Timeout al comunicarse con Inventory Service (3000ms agotados)');
            return res.status(503).json({ error: "Tiempo de espera agotado al comunicarse con Inventory Service" });
        }
        logger.error('[checkout-service] Fallo de comunicacion con Inventario', { error: error.message });
        return res.status(503).json({ error: "Fallo de comunicacion con el servicio de inventario" });
    }
});

app.listen(PORT, () => {
    logger.info(`[checkout-service] Iniciado en el puerto ${PORT}`);
});
