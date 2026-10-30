# Ficha Técnica y Responsabilidades: Checkout Service

## 1. Misión del Microservicio
Orquestar transaccionalmente el proceso de compra de entradas a eventos, actuando como fachada segura y desacoplada entre el cliente final y los servicios de dominio interno.

## 2. Límites de Dominio y Responsabilidades
* **Orquestación de Compras:** Coordina la secuencia de validaciones requeridas para procesar una compra de entradas.
* **Propagación del Contexto de Identidad:** Recibe el token JWT provisto por el cliente, valida su autenticidad y rol, y lo propaga en las cabeceras HTTP hacia los servicios internos involucrados.
* **Aislamiento de Concurrencia:** **No posee ni administra datos de stock ni mecanismos de bloqueo de bajo nivel (Redis).** Delega íntegramente la validación y decremento de existencias a `inventory-service`.
* **Resiliencia y Manejo de Fallos:** Aplica políticas de *timeout* (3000ms) ante peticiones hacia otros microservicios y gestiona respuestas de conflicto o indisponibilidad para proteger al sistema frente a cascadas de fallos.

## 3. Reglas de Negocio
1. Solo usuarios autenticados con rol `USER` o `ADMIN` pueden iniciar compras.
2. Toda compra debe especificar un producto válido (por defecto `"Entrada Conferencia"` si no se envía cuerpo).
3. La llamada a `inventory-service` debe propagar el mismo encabezado `Authorization: Bearer <token>` recibido del cliente.
4. Si la llamada a `inventory-service` demora más de 3000ms, la petición se cancela automáticamente (*AbortSignal*) y se responde `HTTP 503 Service Unavailable`.
5. Si `inventory-service` responde `HTTP 409 Conflict` (producto temporalmente bloqueado por concurrencia), `checkout-service` transmite dicho estado al cliente para que pueda reintentar.

## 4. Datos Propios Administrados
* **Microservicio Stateless:** No mantiene almacenamiento persistente propio en esta fase. No accede a MongoDB ni a Redis directamente. Toda persistencia de existencias corresponde a `inventory-service`.

## 5. Acoplamiento y Dependencias
* **Acoplamiento Eferente (Hacia afuera):**
  * Dependencia sincrónica vía HTTP/REST con `inventory-service` (`INVENTORY_SERVICE_URL:3001`).
* **Acoplamiento Aferente (Hacia adentro):**
  * Consumido por clientes externos (aplicaciones cliente, web, Swagger) a través del endpoint `POST /api/comprar`.

## 6. Endpoints Expuestos

| Método | Endpoint | Nivel de Acceso | Descripción | Códigos HTTP |
| :---: | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Público | Comprueba la disponibilidad del microservicio. | `200` |
| `POST` | `/api/comprar` | Autenticado (`USER`, `ADMIN`) | Procesa la compra delegando la reducción de stock a `inventory-service`. | `200`, `400`, `401`, `403`, `404`, `409`, `503` |
