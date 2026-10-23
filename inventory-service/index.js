require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI =
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tp6_inventario';

app.use(express.json());

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

const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'API Inventory Service - TP6',
        version: '1.0.0'
    },
    paths: {
        '/health': {
            get: {
                summary: 'Verificar el estado del servicio',
                responses: {
                    '200': { description: 'Servicio funcionando' },
                    '503': { description: 'Base de datos no disponible' }
                }
            }
        },
        '/api/inventario': {
            get: {
                summary: 'Consultar el inventario',
                responses: {
                    '200': { description: 'Inventario consultado correctamente' },
                    '503': { description: 'Error al consultar el inventario' }
                }
            }
        },
        '/api/inventario/reducir': {
            put: {
                summary: 'Descontar una entrada del inventario',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['producto'],
                                properties: {
                                    producto: { type: 'string', example: 'Entrada Conferencia' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Stock descontado correctamente' },
                    '400': { description: 'Producto inválido o stock insuficiente' },
                    '503': { description: 'Error al actualizar el inventario' }
                }
            }
        }
    }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get('/swagger.json', (req, res) => {
    res.json(swaggerDocument);
});

app.get('/health', (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            service: 'inventory-service',
            status: 'unavailable',
            database: 'disconnected'
        });
    }

    res.status(200).json({
        service: 'inventory-service',
        status: 'ok'
    });
});

app.get('/api/inventario', async (req, res) => {
    try {
        const productos = await Inventario.find().sort({ producto: 1 });
        res.status(200).json(productos);
    } catch (error) {
        logger.error('Error al consultar inventario', { error: error.message });
        res.status(503).json({ error: 'No se pudo consultar el inventario' });
    }
});

app.put('/api/inventario/reducir', async (req, res) => {
    const producto = req.body?.producto;

    if (typeof producto !== 'string' || !producto.trim()) {
        return res.status(400).json({
            error: 'Debe indicar un producto válido'
        });
    }

    try {
        const actualizado = await Inventario.findOneAndUpdate(
            { producto: producto.trim(), stock: { $gt: 0 } },
            { $inc: { stock: -1 } },
            { new: true, runValidators: true }
        );

        if (actualizado) {
            logger.info('Stock descontado correctamente', {
                producto: actualizado.producto,
                stockRestante: actualizado.stock
            });

            return res.status(200).json({
                mensaje: 'Stock descontado correctamente',
                producto: actualizado.producto,
                stockRestante: actualizado.stock
            });
        }

        const existe = await Inventario.exists({ producto: producto.trim() });

        if (!existe) {
            return res.status(400).json({
                error: 'Producto inexistente o stock insuficiente'
            });
        }

        logger.warn('Compra rechazada: stock insuficiente', {
            producto: producto.trim()
        });

        return res.status(400).json({ error: 'Stock insuficiente' });
    } catch (error) {
        logger.error('Error al reducir inventario', { error: error.message });
        return res.status(503).json({
            error: 'No se pudo actualizar el inventario'
        });
    }
});

async function startServer() {
    try {
        await mongoose.connect(MONGODB_URI);
        logger.info('Conexión con MongoDB establecida');

        await Inventario.updateOne(
            { producto: 'Entrada Conferencia' },
            { $setOnInsert: { producto: 'Entrada Conferencia', stock: 1 } },
            { upsert: true }
        );

        logger.info('Inventario inicial verificado');

        app.listen(PORT, () => {
            logger.info(`Inventory Service escuchando en el puerto ${PORT}`);
        });
    } catch (error) {
        logger.error('No se pudo iniciar Inventory Service', {
            error: error.message
        });
        process.exit(1);
    }
}

startServer();
