# 3. Servicio de Compras y Comunicaciones
* **Propuesta - Checkout Service:** Orquesta las transacciones. Propietario exclusivo de los bloqueos (locks) temporales en Redis.

**Matriz de Comunicación:**
1. Cliente -> `POST /api/comprar` -> Checkout Service.
2. Checkout Service genera el lock en Redis.
3. Checkout Service -> `PUT /api/inventario/reducir` -> Inventory Service (vía HTTP REST).
4. Inventory Service descuenta en MongoDB y responde HTTP 200.
5. Checkout Service libera el lock en Redis y confirma al cliente.