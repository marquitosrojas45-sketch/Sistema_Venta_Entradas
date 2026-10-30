# 3. Servicio de Compras y Comunicaciones

## Rol de Checkout Service
`checkout-service` actúa como orquestador de las transacciones de compra. Valida la identidad del comprador y delega la reducción de existencias a `inventory-service` propagando las credenciales JWT.

---

## Matriz de Comunicación Transaccional

### Flujo de Compra Concurrente:
1. **Cliente HTTP** envía `POST /api/comprar` con encabezado `Authorization: Bearer <token>` a `checkout-service`.
2. **Checkout Service** valida criptográficamente la firma del JWT y que el rol sea `USER` o `ADMIN`.
3. **Checkout Service** envía `PUT /api/inventario/reducir` a `inventory-service` vía HTTP REST interno, propagando el token JWT y estableciendo un *timeout* de 3000ms.
4. **Inventory Service** valida el token propagado, adquiere el lock temporal en Redis (`lock:producto:...`), descuenta el stock atómicamente en MongoDB y libera el lock.
5. **Inventory Service** responde `HTTP 200 OK` con el stock restante (o `HTTP 409 Conflict` si el lock estaba ocupado por otra compra en curso).
6. **Checkout Service** recibe la respuesta y confirma la compra al cliente con `HTTP 200 OK`.

---

## Análisis de Fallos Parciales y Resiliencia

### Escenario de Fallo Distribuido:
1. El cliente envía `POST /api/comprar` a `checkout-service`.
2. `checkout-service` envía `PUT /api/inventario/reducir` a `inventory-service` con un timeout de 3000ms.
3. `inventory-service` descuenta exitosamente el stock en MongoDB (pasa de 1 a 0) y libera su lock en Redis.
4. Antes de que `inventory-service` pueda responder `200 OK`, ocurre una falla de red o corte transitorio.
5. `checkout-service` agota los 3000ms de timeout y responde al cliente con `HTTP 503 Service Unavailable`.

### Consecuencia:
Se produce una inconsistencia temporal: el stock fue descontado en la base de datos de inventario, pero el cliente recibió un mensaje de error de conexión.

### Estrategias de Mitigación:
* **Claves de Idempotencia:** El cliente envía un encabezado `Idempotency-Key: <UUID>`. Ante un reintento por timeout, `inventory-service` reconoce que la operación ya fue efectuada para ese UUID y retorna la respuesta previa sin volver a descontar existencias.
* **Patrón Saga (Compensación):** `checkout-service` puede emitir un comando compensatorio (`POST /api/inventario/reponer`) ante el descarte por timeout.
* **Colas de Mensajería:** Utilizar un bus distribuido (RabbitMQ o Kafka) con confirmaciones de acuse de recibo (*acknowledgments*) para garantizar entrega segura *at-least-once*.
