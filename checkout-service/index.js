require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { createClient } = require('redis');
const swaggerUi = require('swagger-ui-express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3002;
app.use(express.json());

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
redisClient.on('error', (err) => logger.error('Error en Redis', { error: err.message }));
redisClient.connect()
    .then(() => logger.info('Checkout Service conectado a Redis exitosamente'))
    .catch(err => logger.error('Error al conectar Redis', { error: err.message }));

const swaggerDocument = {
    openapi: '3.0.0',
    info: { title: 'API Checkout Service - TP6', version: '1.0.0' },
    paths: {
        '/health': { get: { summary: 'Estado de salud', responses: { '200': { description: 'OK' } } } },
        '/api/comprar': {
            post: { 
                summary: 'Simula una compra concurrente protegida por Redis', 
                responses: { 
                    '200': { description: 'Compra exitosa' }, 
                    '400': { description: 'Stock insuficiente' }, 
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

app.post('/api/comprar', async (req, res) => {
    const producto = req.body.producto || "Entrada Conferencia";
    const lockKey = `lock:producto:${producto.replace(/\s+/g, '_')}`; 
    const ownerId = crypto.randomUUID(); 
    const TTL = 5000; 

    try {
        const lockAdquirido = await redisClient.set(lockKey, ownerId, { NX: true, PX: TTL });
        if (!lockAdquirido) {
            logger.warn('Intento de compra rechazado: Recurso bloqueado');
            return res.status(409).json({ error: "El recurso está bloqueado." });
        }

        const inventoryUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3001';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${inventoryUrl}/api/inventario/reducir`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ producto }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            logger.info('Compra procesada exitosamente', { stockRestante: data.stockRestante });
            return res.status(200).json({ mensaje: "Compra exitosa", stockRestante: data.stockRestante });
        } else if (response.status === 400) {
            logger.warn('Compra fallida: Stock insuficiente');
            return res.status(400).json({ error: "Stock insuficiente" });
        } else {
            logger.error('Error desde Inventory Service', { status: response.status });
            return res.status(503).json({ error: "Servicio de inventario devolvió un error" });
        }
    } catch (error) {
        logger.error('Fallo de comunicación o Timeout', { error: error.message });
        return res.status(503).json({ error: "Fallo de comunicación con Inventario o Timeout" });
    } finally {
        const scriptLiberacion = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
        await redisClient.eval(scriptLiberacion, { keys: [lockKey], arguments: [ownerId] });
    }
});

app.listen(PORT, () => {
    logger.info(`Checkout Service iniciado en el puerto ${PORT}`);
});