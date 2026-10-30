# Ficha Técnica y Responsabilidades: Inventory Service

## 1. Misión del Microservicio
Gestionar de manera autónoma el catálogo de eventos, las existencias disponibles (stock) y la **exclusión mutua distribuida** que protege dicho stock frente a transacciones concurrentes.

## 2. Límites de Dominio y Responsabilidades
* **Catálogo de Entradas:** Almacenamiento, consulta y administración de los productos/entradas disponibles para la venta.
* **Control de Existencias:** Aumento, reabastecimiento y disminución de stock con validación de mínimos (`stock >= 0`).
* **Encapsulación de la Concurrencia (Propiedad del Lock):** Al ser el propietario exclusivo del dato de stock, `inventory-service` encapsula el mecanismo de bloqueo distribuido (locks en Redis) para evitar condiciones de carrera (*race conditions*) y sobreventas (*overselling*).
* **Control de Acceso (RBAC):** Restricción de operaciones de modificación y reposición de stock únicamente a usuarios con rol `ADMIN`.

## 3. Reglas de Negocio
1. El stock nunca puede ser un valor negativo (`stock >= 0`).
2. Cualquier intento de reducir existencias debe adquirir previamente un bloqueo temporal exclusivo en Redis (`lock:producto:<nombre_producto>`) con un TTL de 5000ms.
3. Si el lock distribuido se encuentra retenido por otra transacción, el servicio rechaza inmediatamente la petición con código `HTTP 409 Conflict`.
4. La disminución de stock en MongoDB debe realizarse de forma atómica (`$inc: { stock: -1 }`).
5. Tras completarse la operación (exitosa o fallida), el lock en Redis debe liberarse de forma atómica mediante un script Lua que garantice que únicamente el hilo/proceso propietario (`ownerId`) pueda removerlo.
6. La modificación arbitraria de stock (`POST /api/inventario/stock`) está estrictamente reservada para administradores (`ADMIN`).

## 4. Datos Propios Administrados
* **Base de Datos NoSQL Propietaria:** MongoDB (`tp6_inventario` en `inventory-db:27017`).
  * Colección `inventarios`: `{ producto: String, stock: Number }`.
* **Almacenamiento en Memoria Distribuido:** Redis (`redis:6379`).
  * Claves de exclusión mutua: `lock:producto:<nombre>` con valores UUID y TTL de expiración automática.

## 5. Acoplamiento y Dependencias
* **Acoplamiento Eferente (Hacia afuera):**
  * Ninguno con otros microservicios de la aplicación. `inventory-service` no consume ni conoce a `user-service` ni a `checkout-service`.
  * Dependencias de infraestructura: MongoDB e instancia de Redis.
* **Acoplamiento Aferente (Hacia adentro):**
  * Es consumido de manera sincrónica por `checkout-service` a través del endpoint `PUT /api/inventario/reducir`.
  * Es consumido por clientes externos (Swagger, frontend) a través de `GET /api/inventario` y `POST /api/inventario/stock`.

## 6. Endpoints Expuestos

| Método | Endpoint | Nivel de Acceso | Descripción | Códigos HTTP |
| :---: | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Público | Comprueba el estado del servicio y sus conexiones a MongoDB y Redis. | `200` |
| `GET` | `/api/inventario` | Público | Retorna el catálogo completo de productos y existencias. | `200`, `500` |
| `POST` | `/api/inventario/stock` | Restringido (`ADMIN`) | Crea o actualiza el stock disponible de un producto. | `200`, `400`, `401`, `403`, `500` |
| `PUT` | `/api/inventario/reducir` | Autenticado (`USER`, `ADMIN`) | Reduce en 1 unidad el stock adquiriendo previamente el lock en Redis. | `200`, `400`, `401`, `403`, `404`, `409`, `500` |
