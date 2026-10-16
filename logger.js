require('dotenv').config();
const winston = require('winston');
require('winston-daily-rotate-file');

// Traemos los parámetros desde la configuración externa (Punto 8)
const maxLogSize = process.env.LOG_MAX_SIZE || '20m';
const maxLogFiles = process.env.LOG_MAX_FILES || '14d';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
    ),
    transports: [
        // Archivo general de aplicación (INFO y WARN)
        new winston.transports.DailyRotateFile({
            filename: 'logs/application-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: maxLogSize,
            maxFiles: maxLogFiles,
            level: 'info'
        }),
        // Archivo destinado exclusivamente a errores (ERROR)[cite: 2]
        new winston.transports.DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: maxLogSize,
            maxFiles: maxLogFiles,
            level: 'error'
        }),
        // Salida por consola para desarrollo
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

module.exports = logger;