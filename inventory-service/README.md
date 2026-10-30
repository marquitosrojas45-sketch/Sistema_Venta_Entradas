# Inventory & Stock Service (`inventory-service`)

## Descripción
Microservicio encargado del catálogo de entradas a eventos, la persistencia de existencias y la **encapsulación de la exclusión mutua distribuida** mediante Redis para garantizar la consistencia del stock ante operaciones concurrentes.

## Decisión Arquitectónica Clave: Propiedad del Lock
Al ser el propietario único del dato de stock (`MongoDB tp6_inventario`), `inventory-service` encapsula el mecanismo de bloqueo distribuido (Redis). Cualquier intento de compra o reducción de existencias debe pasar por este servicio, el cual adquiere un lock temporal (`lock:producto:<nombre>`), ejecuta el decremento atómico y libera el recurso mediante scripts Lua atómicos. Si el recurso está bloqueado, responde `HTTP 409 Conflict`.

## Tecnologías Principales
* **Node.js y Express.js**
* **MongoDB con Mongoose:** Persistencia de catálogo y stock en `tp6_inventario`.
* **Redis Client:** Gestión de locks distribuidos atómicos (`SET NX PX` y Lua Script de liberación segura).
* **JsonWebToken:** Verificación criptográfica de tokens propagados y RBAC.
* **Winston:** Logging de reducciones y bloqueos de concurrencia.
* **Swagger UI:** Documentación interactiva OpenAPI 3.0 en `/api-docs`.

## Puerto
* Por defecto: `3001` (configurable mediante `PORT`).

## Variables de Entorno
* `PORT`: Puerto de escucha del servidor HTTP (3001).
* `MONGODB_URI`: URL de conexión a MongoDB (`mongodb://inventory-db:27017/tp6_inventario`).
* `REDIS_URL`: URL de conexión al broker de locks Redis (`redis://redis:6379` en Docker).
* `JWT_SECRET`: Clave simétrica compartida para verificación de tokens.

## Endpoints Principales
* `GET /health`: Healthcheck y estado de conexión a MongoDB y Redis.
* `GET /api/inventario`: Catálogo y existencias actuales (público).
* `POST /api/inventario/stock`: Creación o modificación de stock (exclusivo `ADMIN`).
* `PUT /api/inventario/reducir`: Reducción concurrente con lock en Redis (`USER` o `ADMIN`).
