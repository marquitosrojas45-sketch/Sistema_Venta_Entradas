# 3. Servicio de Compras y Comunicaciones
* **Propuesta - Checkout Service:** Orquesta las transacciones. Propietario exclusivo de los bloqueos (locks) temporales en Redis.

**Matriz de Comunicación:**
1. Cliente -> `POST /api/comprar` -> Checkout Service.
2. Checkout Service genera el lock en Redis.
3. Checkout Service -> `PUT /api/inventario/reducir` -> Inventory Service (vía HTTP REST).
4. Inventory Service descuenta en MongoDB y responde HTTP 200.
5. Checkout Service libera el lock en Redis y confirma al cliente.

**Caso de Uso 2: Registro de un nuevo Usuario**
1. Cliente envía `POST /api/usuarios` con sus datos al **User Service**.
2. **User Service** valida los datos (ej. DNI único).
3. **User Service** guarda el registro en su MongoDB propietario.
4. **User Service** responde HTTP 201 (Created) al cliente.
(No requiere comunicación con otros microservicios).

## Análisis de Fallos Parciales y Resiliencia (TP6)
**Escenario de Fallo Parcial en Compra Concurrente:**
1. El cliente envía `POST /api/comprar` a `checkout-service`.
2. `checkout-service` adquiere el lock en Redis y envía `PUT /api/inventario/reducir` a `inventory-service`.
3. `inventory-service` descuenta el stock en su MongoDB (pasa de 1 a 0), pero sufre un corte de red antes de responder `200 OK`.
4. `checkout-service` aborta la petición a los 3000ms (Timeout), libera el lock en Redis y responde `503 Service Unavailable` al cliente.

**Consecuencia:** Queda un estado inconsistente: el stock se redujo en la base de datos de inventario, pero el cliente recibió un error. Para mitigarlo en el futuro se requieren claves de idempotencia o el patrón Saga (transacciones compensatorias).