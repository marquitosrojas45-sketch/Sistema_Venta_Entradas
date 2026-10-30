# Sistema Distribuido de Venta de Entradas (TP1 - TP7)
**Cátedra de Programación Distribuida - Universidad Champagnat**

---

## 1. Descripción del Proyecto
Este proyecto implementa una arquitectura distribuida basada en microservicios para la gestión y venta concurrente de entradas a eventos. El sistema ha evolucionado progresivamente desde un monolito inicial hasta un conjunto desacoplado de microservicios contenerizados, con persistencia independiente, exclusión mutua distribuida, autenticación stateless con JSON Web Tokens (JWT) y control de acceso basado en roles (RBAC).

### Stack Tecnológico:
* **Entorno de Ejecución:** Node.js (v20 LTS), Express.js.
* **Persistencia Independiente:** MongoDB (bases de datos independientes por servicio: `tp6_usuarios` y `tp6_inventario`).
* **Concurrencia y Bloqueo Distribuido:** Redis (gestión de mutex y locks temporales con expiración TTL y liberación atómica vía scripts Lua).
* **Seguridad y Autorización:** Criptografía simétrica JWT (`HS256`), hashing con `bcryptjs`, RBAC (`USER` y `ADMIN`), propagación de identidad entre servicios.
* **Observabilidad y Documentación:** Winston (logging estructurado con niveles de severidad), Swagger UI / OpenAPI 3.0 para cada microservicio.
* **Orquestación e Infraestructura:** Docker y Docker Compose con healthchecks automáticos y red privada tipo bridge.

---

## 2. Integrantes del Grupo
* **Marcos:** Microservicio de Identidad (`user-service`), hashing con `bcryptjs`, emisión de JWT, persistencia de usuarios y configuración de Docker Compose.
* **Nahuel:** Microservicio de Catálogo y Stock (`inventory-service`), **encapsulación de concurrencia y lock de stock en Redis**, control de acceso RBAC y validación de tokens.
* **Lisandro:** Microservicio de Transacciones (`checkout-service`), orquestación de compra, propagación de credenciales JWT, manejo de fallos parciales y suite de pruebas reproducibles.

---

## 3. Matriz de Arquitectura y Responsabilidades

| Microservicio | Puerto | Responsabilidad de Dominio | Datos Propios / Almacenamiento | Dependencias Técnicas | Endpoints Principales |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **User Service** | `3000` | Gestión centralizada de identidades, registro de clientes, emisión de credenciales y perfiles de usuario. | Base de datos MongoDB propia (`users-db:27017/tp6_usuarios`). | Ninguna (autónomo). | `POST /auth/register`<br>`POST /auth/login`<br>`GET /api/usuarios`<br>`GET /api/usuarios/:id` |
| **Inventory Service** | `3001` | Catálogo de eventos, actualización de existencias y **control estricto de concurrencia de stock**. | Base de datos MongoDB propia (`inventory-db:27017/tp6_inventario`) y **Locks distribuidos en Redis** (`inventory-redis`). | Redis (`redis:6379`), MongoDB (`inventory-db:27017`). | `GET /api/inventario`<br>`POST /api/inventario/stock`<br>`PUT /api/inventario/reducir` |
| **Checkout Service** | `3002` | Orquestación transaccional del proceso de compra, propagación del contexto de identidad del comprador. | *Stateless* (no almacena stock ni maneja bloqueos de bajo nivel de inventario). | `inventory-service` (vía HTTP/REST interno). | `POST /api/comprar`<br>`GET /health` |

---

## 4. Encapsulación de la Concurrencia: Propiedad del Lock en Inventory Service

> [!IMPORTANT]
> **Decisión Arquitectónica Clave (Devolución TP5 y TP6):**
> Anteriormente, `checkout-service` gestionaba el lock en Redis sobre el producto antes de invocar a `inventory-service`. Esto violaba la separación de responsabilidades y el principio de propiedad del dato: si `inventory-service` es el único dueño del stock, cualquier mecanismo de exclusión mutua que proteja ese recurso debe encapsularse **dentro de `inventory-service`**.
>
> **Corrección Implementada:**
> 1. `inventory-service` administra la conexión con Redis y es el único responsable de adquirir y liberar el bloqueo (`lock:producto:<nombre>`) al procesar `PUT /api/inventario/reducir`.
> 2. `checkout-service` ya no accede a Redis ni conoce las claves de lock; simplemente delega la reducción de existencias mediante una petición HTTP REST sincrónica hacia `inventory-service`, propagando el token JWT.
> 3. Si `inventory-service` detecta concurrencia y no logra adquirir el lock, responde con un código `HTTP 409 Conflict`, el cual `checkout-service` transmite limpiamente al cliente.

```
[ Cliente HTTP ]
       │
       │ POST /api/comprar (Bearer JWT)
       ▼
┌──────────────────────────────────────────────┐
│             CHECKOUT SERVICE                 │
│  - Valida firma y expiración del JWT         │
│  - Orquesta la compra con Timeout de 3000ms  │
└──────────────────────┬───────────────────────┘
                       │
                       │ PUT /api/inventario/reducir
                       │ Headers: Authorization: Bearer <token>
                       ▼
┌────────────────────────────────────────────────────────┐
│               INVENTORY SERVICE                        │
│  - Dueño del dominio de Stock e Inventario             │
│  - Valida rol (USER/ADMIN)                             │
│  - Adquiere Lock en Redis: lock:producto:Entrada...    │
│  - Descuenta en MongoDB atómicamente ($inc: -1)        │
│  - Libera Lock en Redis mediante Lua Script            │
└────────────┬─────────────────────────────┬─────────────┘
             │                             │
             ▼                             ▼
     ┌───────────────┐             ┌───────────────┐
     │  Redis Mutex  │             │ Inventory DB  │
     │ (Locks Stock) │             │   (MongoDB)   │
     └───────────────┘             └───────────────┘
```

---

## 5. Análisis de Fallos Parciales y Resiliencia en Sistemas Distribuidos

En una arquitectura de microservicios con comunicación sincrónica HTTP, pueden ocurrir fallos parciales de red donde el estado de los componentes quede transitoriamente desalineado:

1. **Escenario de Fallo:**
   - El cliente envía `POST /api/comprar` a `checkout-service`.
   - `checkout-service` envía `PUT /api/inventario/reducir` a `inventory-service` con un temporizador (*timeout*) de 3000ms.
   - `inventory-service` adquiere el lock en Redis, descuenta con éxito el stock en su base de datos MongoDB (pasa de 1 a 0), y libera el lock.
   - Justo antes de que la respuesta `HTTP 200 OK` viaje por la red de regreso a `checkout-service`, ocurre un corte de red intempestivo o caída transitoria.
   - `checkout-service` agota los 3000ms sin recibir confirmación, aborta la petición y responde al cliente con un código `HTTP 503 Service Unavailable`.
2. **Consecuencia:** Se genera una inconsistencia temporal: el stock fue descontado en `inventory-service`, pero el cliente recibió un fallo de comunicación.
3. **Mecanismos de Mitigación en Arquitecturas Distribuidas:**
   - **Claves de Idempotencia (*Idempotency Keys*):** El cliente o `checkout-service` envía un UUID de transacción único (`Idempotency-Key`). Si se reintenta la operación, `inventory-service` detecta la clave y no descuenta nuevamente.
   - **Patrón Saga (Transacciones Compensatorias):** Al detectarse un error de timeout en el orquestador, se dispara automáticamente una acción compensatoria (`POST /api/inventario/reponer` o rollback compensatorio).
   - **Mensajería Asincrónica:** Migrar transacciones críticas a brokers de mensajes durables (RabbitMQ / Apache Kafka) con garantías *at-least-once*.

---

## 6. Matriz de Control de Acceso y RBAC (TP7)

| Servicio | Endpoint | Método | Acceso | Público | USER | ADMIN | Justificación Funcional |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **User Service** | `/health` | `GET` | Público | Sí | Sí | Sí | Healthcheck de orquestación Docker. |
| **User Service** | `/auth/register` | `POST` | Público | Sí | Sí | Sí | Registro de nuevos usuarios con hash `bcrypt` (10 rondas). |
| **User Service** | `/auth/login` | `POST` | Público | Sí | Sí | Sí | Login y emisión de token JWT con expiración configurable. |
| **User Service** | `/api/usuarios` | `GET` | Restringido | No | No | Sí | Listado global de cuentas, exclusivo para administración. |
| **User Service** | `/api/usuarios/:id` | `GET` | Propietario / ADMIN | No | Sí (Propio) | Sí | **Propiedad del recurso:** Un `USER` solo consulta su propio ID; `ADMIN` consulta cualquiera. |
| **User Service** | `/api/usuarios/:id` | `DELETE` | Restringido | No | No | Sí | Baja de cuentas de usuario, exclusivo para administradores. |
| **Inventory Service** | `/health` | `GET` | Público | Sí | Sí | Sí | Healthcheck y estado de conexión a Mongo y Redis. |
| **Inventory Service** | `/api/inventario` | `GET` | Público | Sí | Sí | Sí | Consulta de catálogo y entradas disponibles. |
| **Inventory Service** | `/api/inventario/stock` | `POST` | Restringido | No | No | Sí | Carga y modificación de existencias exclusiva de `ADMIN`. |
| **Inventory Service** | `/api/inventario/reducir` | `PUT` | Autenticado | No | Sí | Sí | Descuento concurrente de stock con lock en Redis. |
| **Checkout Service** | `/health` | `GET` | Público | Sí | Sí | Sí | Healthcheck de disponibilidad de servicio. |
| **Checkout Service** | `/api/comprar` | `POST` | Autenticado | No | Sí | Sí | Compra con propagación de token JWT a Inventario. |

---

## 7. Despliegue y Ejecución con Docker Compose

### Requisitos Previos:
* Docker Desktop instalado y en ejecución (con soporte para Docker Compose v2).
* Node.js v18+ (opcional, únicamente si se desea ejecutar el script de pruebas automatizadas fuera de los contenedores).

### Pasos de Puesta en Marcha:
1. Clonar el repositorio y posicionarse en la raíz del proyecto.
2. Iniciar todos los contenedores en segundo plano:
   ```bash
   docker compose up -d --build
   ```
3. Comprobar que los 6 contenedores (`users-db`, `inventory-db`, `inventory-redis`, `user-service`, `inventory-service`, `checkout-service`) se encuentren en estado `healthy`:
   ```bash
   docker compose ps
   ```

### Documentación Interactiva OpenAPI (Swagger):
Con los contenedores activos, es posible acceder a las consolas Swagger de cada servicio:
* **User Service:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
* **Inventory Service:** [http://localhost:3001/api-docs](http://localhost:3001/api-docs)
* **Checkout Service:** [http://localhost:3002/api-docs](http://localhost:3002/api-docs)

---

## 8. Pruebas Reproducibles Automatizadas

Para validar de forma fehaciente y reproducible la concurrencia, la exclusión mutua del stock en Inventory Service y el control de identidades (RBAC/JWT), se desarrolló una suite completa de pruebas automatizadas:

### Ejecución de la Suite:
En una terminal en la raíz del proyecto, ejecutar:
```bash
node tests/test-reproducible.js
```

### Escenarios Validados en la Suite:
1. **Healthchecks de Infraestructura:** Comprobación de que `user-service` (3000), `inventory-service` (3001) y `checkout-service` (3002) responden favorablemente.
2. **Registro y Login (User Service):**
   - Registro de un usuario administrador (`admin@test.com`) y un usuario cliente (`cliente@test.com`).
   - Obtención de tokens JWT (`HS256`).
3. **Inicialización de Inventario (Inventory Service):**
   - El administrador ajusta el stock de `"Entrada Conferencia"` a exactamente `1` unidad para preparar la prueba de estrés concurrente.
4. **Prueba de Concurrencia y Exclusión Mutua en Stock (Inventory Service):**
   - Se disparan simultáneamente (usando `Promise.all`) dos compras concurrentes a `checkout-service` (`POST /api/comprar`) compitiendo por la única entrada existente.
   - **Resultado Verificado:** Exactamente una compra resulta exitosa (`200 OK`) y la otra es rechazada (`409 Conflict` por recurso bloqueado o `400 Bad Request` por stock agotado).
   - Se consulta el stock final en MongoDB para constatar que quedó exactamente en `0`, sin sobreventas ni números negativos.
5. **Validación de Reglas de Seguridad (RBAC y Propiedad de Recurso):**
   - Un usuario con rol `USER` intenta modificar el stock mediante `POST /api/inventario/stock` y recibe `HTTP 403 Forbidden`.
   - Un usuario con rol `USER` intenta acceder a datos de otro usuario y recibe `HTTP 403 Forbidden` (violación de propiedad de recurso).
   - Peticiones sin token o con token alterado son rechazadas con `HTTP 401 Unauthorized`.

Adicionalmente, se incluye en el directorio `tests/` el archivo `tests/pruebas-api.http` para realizar pruebas interactivas mediante la extensión REST Client.
