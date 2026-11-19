# Sistema Distribuido de Venta de Entradas (TP7 - Entrega Final)
**Cátedra de Programación Distribuida - Licenciatura en Sistemas de Información - Universidad Champagnat**

---

## 1. Integrantes del Grupo y Responsabilidades
* **Marcos:** Microservicio de Identidad (`user-service`), persistencia de usuarios en MongoDB (`users-db`), hashing seguro de contraseñas con `bcryptjs`, autenticación *stateless*, emisión de tokens JWT (`HS256`) y configuración de Docker Compose.
* **Nahuel:** Microservicio de Catálogo y Stock (`inventory-service`), **encapsulación de concurrencia y lock de stock en Redis** (`inventory-redis`), liberación atómica con Scripts Lua, persistencia en MongoDB (`inventory-db`) y control de acceso por roles (RBAC).
* **Lisandro:** Microservicio de Transacciones (`checkout-service`), orquestación del proceso de compra, propagación de credenciales JWT hacia Inventario, timeouts (`AbortController`), resiliencia ante fallos parciales y suite de pruebas reproducibles automatizadas.

---

## 2. Descripción General de la Arquitectura
El sistema implementa una arquitectura distribuida basada en **microservicios contenerizados con Docker Compose**, diseñada para la venta concurrente de entradas a eventos de alta demanda evitando sobreventas (*overselling*) y caídas en cascada.

### Pilares del Sistema:
1. **Database-per-Service:** Cada microservicio gestiona exclusivamente su propia base de datos (MongoDB `tp6_usuarios` e `tp6_inventario`), garantizando un bajo acoplamiento de datos.
2. **Exclusión Mutua Distribuida en el Propietario del Dato:** `inventory-service` centraliza la gestión del stock y encapsula su propio coordinador de locks en Redis (`SET NX PX 5000` + Script Lua) para serializar compras simultáneas en milisegundos.
3. **Seguridad Stateless con JWT y RBAC:** Autenticación sin sesiones en memoria RAM. Cada microservicio valida criptográficamente el token JWT recibido y aplica control de accesos basado en roles (`USER` y `ADMIN`).
4. **Resiliencia y Aislamiento de Red:** Comunicación interna en red privada de Docker (`backend-net`) con timeouts explícitos de 3000ms y códigos de estado semánticos (`200`, `400`, `401`, `403`, `404`, `409`, `503`).

### Stack Tecnológico:
* **Runtime & Framework:** Node.js (v20 LTS), Express.js.
* **Bases de Datos:** MongoDB 7 (contenedores `users-db` e `inventory-db`).
* **Concurrencia en Memoria:** Redis 7 Alpine (`inventory-redis`).
* **Seguridad:** JSON Web Tokens (`HS256`), contraseñas hasheadas con `bcryptjs` (10 rondas de sal), RBAC y control de propiedad de recurso (Anti-IDOR).
* **Infraestructura:** Docker y Docker Compose con healthchecks automáticos y red tipo bridge (`backend-net`).
* **Observabilidad & Docs:** Logs estructurados con Winston y documentación interactiva OpenAPI 3.0 con Swagger UI.

---

## 3. Matriz de Microservicios, Puertos y Responsabilidades

| Microservicio | Puerto Host | Puerto Interno | Responsabilidad de Dominio | Base de Datos / Almacenamiento | Dependencias Técnicas | Endpoints Principales |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| **User Service** | `3000` | `3000` | Gestión de identidades, registro de clientes, login, emisión de JWT y administración de perfiles. | MongoDB propia (`users-db:27017/tp6_usuarios`). | Ninguna (autónomo). | `POST /auth/register`<br>`POST /auth/login`<br>`GET /api/usuarios`<br>`GET /api/usuarios/:id`<br>`DELETE /api/usuarios/:id` |
| **Inventory Service** | `3001` | `3001` | Catálogo de eventos, existencias y **control estricto de concurrencia de stock**. | MongoDB (`inventory-db:27017/tp6_inventario`) y **Locks en Redis** (`inventory-redis:6379`). | Redis (`redis:6379`), Mongo (`inventory-db:27017`). | `GET /api/inventario`<br>`POST /api/inventario/stock`<br>`PUT /api/inventario/reducir` |
| **Checkout Service** | `3002` | `3002` | Orquestación transaccional de compras, propagación de contexto JWT y manejo de fallos parciales. | *Stateless* (sin persistencia directa). | `inventory-service` (vía HTTP/REST interno). | `POST /api/comprar`<br>`GET /health` |

---

## 4. Control de Concurrencia: Lock Distribuido en Redis

### Principio de Propiedad del Dato (*Data Ownership*):
En la arquitectura final, **el Lock de Redis pertenece exclusivamente a `inventory-service`**. Como `inventory-service` es el único dueño de la base de datos de stock, la lógica de exclusión mutua que protege ese dato debe encapsularse adentro de él:
1. `checkout-service` está completamente desacoplado de Redis; solo solicita la reducción de stock vía HTTP REST (`PUT /api/inventario/reducir`).
2. Cualquier petición que intente descontar stock pasa obligatoriamente por el cerrojo distribuido de Redis, garantizando en un único lugar que el stock jamás quede negativo.

### Diagrama del Flujo de Compra y Exclusión Mutua:

```
[ Cliente HTTP ]
       │
       │ POST /api/comprar (Bearer JWT)
       ▼
┌──────────────────────────────────────────────┐
│             CHECKOUT SERVICE (:3002)         │
│  - Valida firma y expiración del JWT         │
│  - Orquesta la compra con Timeout de 3000ms  │
└──────────────────────┬───────────────────────┘
                       │
                       │ PUT /api/inventario/reducir
                       │ Headers: Authorization: Bearer <token>
                       ▼
┌────────────────────────────────────────────────────────┐
│             INVENTORY SERVICE (:3001)                  │
│  - Dueño del catálogo y stock de entradas              │
│  - Valida rol autorizado (USER o ADMIN)                │
│  - 1. Adquiere Lock en Redis (SET NX PX 5000)          │
│       -> Si ocupado: responde 409 Conflict (Fail-Fast) │
│  - 2. Descuenta en MongoDB atómicamente ($inc: -1)     │
│  - 3. Libera Lock en Redis mediante Script Lua seguro  │
└────────────┬─────────────────────────────┬─────────────┘
             │                             │
             ▼                             ▼
     ┌───────────────┐             ┌───────────────┐
     │  Redis Mutex  │             │ Inventory DB  │
     │ (Locks Stock) │             │   (MongoDB)   │
     └───────────────┘             └───────────────┘
```

### ¿Por qué se libera el Lock con un Script Lua?
Para evitar borrar por error el lock de otro proceso si una compra sufre una demora superior al TTL de 5 segundos. El Script Lua evalúa de forma 100% atómica dentro de Redis:
```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```
Solo elimina la clave si el `ownerId` (UUID) coincide con quien la adquirió originalmente.

---

## 5. Seguridad Distribuida: JWT, Bcrypt y Matriz RBAC

### 5.1. Criptografía y Autenticación Stateless
* **Hashing con Bcrypt:** Al registrarse (`POST /auth/register`), la contraseña se hashea con 10 rondas de sal aleatoria. La base de datos nunca almacena contraseñas en texto plano.
* **Tokens JWT (HS256):** Al hacer login (`POST /auth/login`), `user-service` emite un token firmado con `JWT_SECRET`. Los microservicios `checkout-service` e `inventory-service` validan localmente la firma del token sin consultar a la base de usuarios en cada petición (*autenticación stateless*).
* **Propagación del Contexto:** `checkout-service` extrae el token JWT del cliente y lo reenvía en el encabezado `Authorization: Bearer <token>` hacia `inventory-service`.

### 5.2. Matriz de Control de Acceso por Roles (RBAC)

| Servicio | Endpoint | Método | Acceso | Público | USER | ADMIN | Justificación Funcional |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **User Service** | `/health` | `GET` | Público | Sí | Sí | Sí | Healthcheck para monitoreo y Docker Compose. |
| **User Service** | `/auth/register` | `POST` | Público | Sí | Sí | Sí | Registro de nuevos usuarios con hash `bcrypt`. |
| **User Service** | `/auth/login` | `POST` | Público | Sí | Sí | Sí | Login y emisión de token JWT firmado. |
| **User Service** | `/api/usuarios` | `GET` | Restringido | No | No | Sí | Listado global de cuentas, exclusivo administradores. |
| **User Service** | `/api/usuarios/:id` | `GET` | Propietario / ADMIN | No | Sí (Propio) | Sí | **Propiedad del recurso (Anti-IDOR):** un `USER` solo ve su propio perfil. |
| **User Service** | `/api/usuarios/:id` | `DELETE` | Restringido | No | No | Sí | Baja de cuentas de usuario, exclusivo administradores. |
| **Inventory Service** | `/health` | `GET` | Público | Sí | Sí | Sí | Healthcheck y estado de conexión a Mongo y Redis. |
| **Inventory Service** | `/api/inventario` | `GET` | Público | Sí | Sí | Sí | Consulta pública del catálogo y stock disponible. |
| **Inventory Service** | `/api/inventario/stock` | `POST` | Restringido | No | No | Sí | Carga y reposición de existencias exclusiva de `ADMIN`. |
| **Inventory Service** | `/api/inventario/reducir` | `PUT` | Autenticado | No | Sí | Sí | Descuento concurrente de stock con lock en Redis. |
| **Checkout Service** | `/health` | `GET` | Público | Sí | Sí | Sí | Healthcheck de disponibilidad del servicio. |
| **Checkout Service** | `/api/comprar` | `POST` | Autenticado | No | Sí | Sí | Orquestación de compra con propagación de JWT. |

---

## 6. Comunicación Interna y Red Docker (`backend-net`)

Los contenedores se comunican dentro de la red privada bridge `backend-net` utilizando la resolución DNS nativa de Docker Compose:

| Origen | Destino | URL en Docker Compose | URL en Ejecución Local |
| :--- | :--- | :--- | :--- |
| **Host (Navegador / Postman)** | Cualquier servicio publicado | `http://localhost:<puerto>` | `http://localhost:<puerto>` |
| **`checkout-service`** | `inventory-service` | `http://inventory-service:3001` | `http://localhost:3001` |
| **`user-service`** | Base de datos de usuarios | `mongodb://users-db:27017/tp6_usuarios` | `mongodb://127.0.0.1:27017/tp6_usuarios` |
| **`inventory-service`** | Base de datos de inventario | `mongodb://inventory-db:27017/tp6_inventario` | `mongodb://127.0.0.1:27017/tp6_inventario` |
| **`inventory-service`** | Coordinador de Locks (Redis) | `redis://redis:6379` | `redis://127.0.0.1:6379` |

### Variables de Entorno sin IPs fijas:
El código fuente no posee IPs fijas ni `localhost` codificado "a fuego". Toda dirección se parametriza mediante variables de entorno (`process.env`), documentadas en `.env.example`.

---

## 7. Estrategia de Disponibilidad, Resiliencia y Fallos Parciales

### 7.1. Healthchecks y Orden de Arranque:
Cada servicio expone su endpoint `/health` y define un healthcheck en Docker Compose. Las dependencias usan `depends_on` con `condition: service_healthy` para asegurar que ningún microservicio atienda tráfico hasta que sus bases de datos y Redis estén listos.

### 7.2. Timeout y Códigos HTTP Semánticos:
* **Timeout Explícito (3000ms):** `checkout-service` corta la espera ante `inventory-service` a los 3 segundos mediante `AbortController`.
* **Semántica de Respuestas:**
  * **`200 OK` / `201 Created`:** Compra o registro exitoso.
  * **`400 Bad Request`:** Stock agotado (`Stock insuficiente`) o datos inválidos.
  * **`401 Unauthorized`:** Token JWT ausente, vencido o con firma alterada.
  * **`403 Forbidden`:** Rol insuficiente (`USER` intentando modificar stock o ver perfil ajeno).
  * **`404 Not Found`:** Producto o usuario no encontrado.
  * **`409 Conflict`:** Recurso bloqueado en Redis por compra concurrente simultánea.
  * **`503 Service Unavailable`:** Timeout o caída del contenedor de `inventory-service`.

### 7.3. Manejo de Fallos Parciales:
Si ocurre un corte de red luego de que Inventario descontó stock pero antes de que la respuesta llegue a Checkout:
* El cliente recibe `503 Service Unavailable` por timeout controlado en vez de un cuelgue indefinido.
* **Evolución productiva recomendada:** Implementación de **Claves de Idempotencia (`Idempotency-Key`)** para reintentos transparentes y **Patrón Saga** para transacciones compensatorias.

---

## 8. Persistencia y Volúmenes de Docker

Las bases de datos utilizan volúmenes nombrados administrados por Docker para asegurar que la información sobreviva al reinicio de los contenedores:
* `users_mongo_data`: Mantiene persistentes los usuarios registrados y roles.
* `inventory_mongo_data`: Mantiene persistente el catálogo y el stock de entradas.

### Comandos de ciclo de vida:
* Detener conservando los datos: `docker compose down`
* Detener eliminando volúmenes (reinicio de laboratorio limpio): `docker compose down -v`

---

## 9. Instalación y Puesta en Marcha

### Requisitos Previos:
* **Docker Desktop** (con soporte WSL 2 en Windows) o Docker Engine en Linux.
* **Node.js LTS** (v18 o v20) para ejecutar las pruebas automatizadas desde el host.

### 1. Configurar Entorno:
```bash
cp .env.example .env
```

### 2. Levantar los 6 Contenedores:
```bash
docker compose up -d --build
```

### 3. Verificar Estado de Salud:
```bash
docker compose ps
```
*(Todos los contenedores deben figurar en estado `healthy`).*

### 4. Portales Swagger UI Interactivos:
* **User Service:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
* **Inventory Service:** [http://localhost:3001/api-docs](http://localhost:3001/api-docs)
* **Checkout Service:** [http://localhost:3002/api-docs](http://localhost:3002/api-docs)

---

## 10. Suite de Pruebas Reproducibles Automatizadas

Para validar de punta a punta la salud del sistema, la autenticación JWT, la exclusión mutua sin sobreventas y la seguridad RBAC:

```bash
npm test
# o bien: node tests/test-reproducible.js
```

### Qué valida la suite (22 pruebas automáticas):
1. **Healthchecks de Infraestructura:** Comprueba que los 3 microservicios, MongoDB y Redis respondan `200 OK`.
2. **Autenticación y Tokens JWT:** Registra usuarios `ADMIN` y `USER` y valida la emisión de tokens válidos.
3. **Inicialización de Estado:** El administrador fija el stock en exactamente `1` entrada.
4. **Prueba de Concurrencia Real con `Promise.all`:**
   - Dispara 2 compras simultáneas al mismo milisegundo por la única entrada.
   - **Resultado verificado:** Exactamente 1 compra obtiene `200 OK` y la otra es rechazada (`409 Conflict` o `400 Bad Request`).
   - El stock final en MongoDB es exactamente `0` (demostrando cero sobreventas ni números negativos).
5. **Compra con Stock Agotado:** Confirma respuesta `400 Bad Request` ("Stock insuficiente").
6. **Seguridad y RBAC:**
   - Usuario normal intentando modificar stock -> `403 Forbidden`.
   - Petición sin token o con token alterado -> `401 Unauthorized`.
   - Usuario intentando ver perfil de otro cliente -> `403 Forbidden` (regla Anti-IDOR).
   - Usuario consultando su propio perfil -> `200 OK`.

Adicionalmente, se incluye el archivo [`tests/pruebas-api.http`](file:///c:/xampp/htdocs/ProyectosFacultad/BaseDatos2/programacionDistribuida/tp3/tests/pruebas-api.http) para realizar pruebas interactivas individuales desde VS Code (REST Client).
