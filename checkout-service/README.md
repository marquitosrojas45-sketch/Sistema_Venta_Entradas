# Checkout & Transaction Service (`checkout-service`)

## Descripción
Microservicio encargado de la orquestación del flujo de compras en el sistema distribuido. Valida la identidad del comprador y delega la reducción de existencias hacia `inventory-service` propagando el token de seguridad JWT.

## Desacoplamiento y Concurrencia
`checkout-service` **no almacena stock ni se conecta a Redis**. La responsabilidad de exclusión mutua y bloqueo concurrente está encapsulada en `inventory-service`. `checkout-service` actúa como orquestador, aplicando políticas de resiliencia (timeout de 3000ms con `AbortController`) y transmitiendo las respuestas de éxito o conflicto (409) al cliente final.

## Tecnologías Principales
* **Node.js y Express.js**
* **Fetch API nativo:** Comunicación HTTP REST sincrónica con `inventory-service`.
* **JsonWebToken:** Verificación criptográfica autónoma del token JWT del cliente.
* **Winston:** Registro estructurado de eventos transaccionales y auditoría.
* **Swagger UI:** Documentación interactiva OpenAPI 3.0 en `/api-docs`.

## Puerto
* Por defecto: `3002` (configurable mediante `PORT`).

## Variables de Entorno
* `PORT`: Puerto de escucha del servidor HTTP (3002).
* `INVENTORY_SERVICE_URL`: URL del microservicio de inventario (`http://inventory-service:3001` en Docker).
* `JWT_SECRET`: Clave simétrica para validar la autenticidad del token del comprador.

## Endpoints Principales
* `GET /health`: Healthcheck de disponibilidad de servicio.
* `POST /api/comprar`: Orquestación de compra con propagación de JWT a Inventario (`USER` o `ADMIN`).
