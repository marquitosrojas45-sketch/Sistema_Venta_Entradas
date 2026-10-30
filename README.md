# Sistema Distribuido de Venta de Entradas (TP1 - TP7)
**Cátedra de Programación Distribuida - Licenciatura en Sistemas de Información - Universidad Champagnat**

---

## 1. Integrantes del Grupo
* **Marcos:** Microservicio de Identidad (`user-service`), persistencia de usuarios, hashing seguro con `bcryptjs`, emisión de tokens JWT y configuración de Docker Compose.
* **Nahuel:** Microservicio de Catálogo y Stock (`inventory-service`), **encapsulación de concurrencia y lock de stock en Redis**, persistencia en MongoDB y control de acceso RBAC.
* **Lisandro:** Microservicio de Transacciones (`checkout-service`), orquestación del proceso de compra, propagación de credenciales JWT, manejo de fallos parciales, resiliencia y suite de pruebas reproducibles.

---

## 2. Descripción General y Evolución de la Arquitectura
El sistema implementa una arquitectura distribuida basada en microservicios contenerizados para la gestión y venta concurrente de entradas a eventos. Evolucionó desde un monolito inicial hacia componentes independientes, con persistencia políglota aislada, exclusión mutua distribuida, autenticación *stateless* mediante JSON Web Tokens (JWT) y control de acceso basado en roles (RBAC).

### Stack Tecnológico:
* **Runtime:** Node.js (v20 LTS), Express.js.
* **Bases de Datos:** MongoDB 7 (instancias lógicamente aisladas: `tp6_usuarios` y `tp6_inventario`).
* **Concurrencia y Bloqueos Distribuidos:** Redis 7 (gestión de mutex y locks atómicos `SET NX PX` con liberación segura vía scripts Lua).
* **Seguridad:** Criptografía simétrica JWT (`HS256`), contraseñas hasheadas con `bcryptjs` (10 rondas), RBAC (`USER` y `ADMIN`).
* **Orquestación:** Docker y Docker Compose (v2) con healthchecks nativos y red tipo bridge (`backend-net`).
* **Observabilidad:** Logging estructurado con Winston, documentación OpenAPI 3.0 con Swagger UI.

---

## 3. Matriz de Arquitectura y Responsabilidades (TP6 - Hito 1)

| Microservicio | Puerto Host | Puerto Interno | Responsabilidad de Dominio | Datos Propios / Almacenamiento | Dependencias Técnicas | Endpoints Principales |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| **User Service** | `3000` | `3000` | Gestión centralizada de identidades, registro de clientes, emisión de JWT y administración de perfiles. | MongoDB propia (`users-db:27017/tp6_usuarios`). | Ninguna (autónomo). | `POST /auth/register`<br>`POST /auth/login`<br>`GET /api/usuarios`<br>`GET /api/usuarios/:id` |
| **Inventory Service** | `3001` | `3001` | Catálogo de eventos, existencias y **control estricto de concurrencia de stock**. | MongoDB (`inventory-db:27017/tp6_inventario`) y **Locks en Redis** (`inventory-redis:6379`). | Redis (`redis:6379`), Mongo (`inventory-db:27017`). | `GET /api/inventario`<br>`POST /api/inventario/stock`<br>`PUT /api/inventario/reducir` |
| **Checkout Service** | `3002` | `3002` | Orquestación transaccional de compras, propagación de contexto JWT y manejo de fallos parciales. | *Stateless* (sin persistencia directa). | `inventory-service` (vía HTTP/REST interno). | `POST /api/comprar`<br>`GET /health` |

---

## 4. Cambios Realizados Respecto de la Propuesta del TP5 (Devolución Docente)

> [!IMPORTANT]
> **Corrección Arquitectónica Clave (Devoluciones TP5 y TP6):**
> En versiones previas, `checkout-service` era el encargado de conectarse a Redis y retener el lock del producto antes de invocar a `inventory-service`. Esto violaba el principio de responsabilidad única y propiedad del dato: **si Inventory Service es el dueño de la persistencia del stock, cualquier mecanismo de concurrencia que proteja dicho stock debe encapsularse dentro de Inventory Service**.
>
> **Ajustes implementados:**
> 1. `inventory-service` es ahora el único componente conectado a Redis (`redis:6379`). Adquiere el lock temporal (`lock:producto:...`) con TTL de 5000ms al procesar `PUT /api/inventario/reducir`, descuenta atómicamente en MongoDB y libera el lock mediante un script Lua seguro.
> 2. `checkout-service` quedó completamente desacoplado de Redis; delega la compra vía HTTP REST hacia `inventory-service` y propaga limpiamente las respuestas (incluyendo `409 Conflict` cuando el lock está ocupado por otra transacción).
> 3. En `docker-compose.yml`, el contenedor Redis quedó vinculado exclusivamente como dependencia de `inventory-service`.

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

## 5. Comunicación Interna, Red Docker y Resolución de Nombres (TP6 - Sección 12)

Los contenedores se comunican dentro de la red tipo bridge `backend-net` utilizando la resolución DNS nativa provista por Docker Compose:

| Origen | Destino | URL en Docker Compose | URL en Ejecución Local |
| :--- | :--- | :--- | :--- |
| **PC del desarrollador** | Cualquier servicio publicado | `http://localhost:<puerto_host>` | `http://localhost:<puerto_host>` |
| **`checkout-service`** | `inventory-service` | `http://inventory-service:3001` | `http://localhost:3001` |
| **`user-service`** | Base de datos de usuarios | `mongodb://users-db:27017/tp6_usuarios` | `mongodb://127.0.0.1:27017/tp6_usuarios` |
| **`inventory-service`** | Base de datos de inventario | `mongodb://inventory-db:27017/tp6_inventario` | `mongodb://127.0.0.1:27017/tp6_inventario` |
| **`inventory-service`** | Coordinador de Locks (Redis) | `redis://redis:6379` | `redis://127.0.0.1:6379` |

### Diferencias entre Ejecución Local y Docker Compose (TP6 - Sección 6.3):
El código fuente no posee IPs fijas ni `localhost` codificado. Toda variación de direccionamiento entre el entorno de desarrollo local y Docker Compose se resuelve externamente mediante las variables de entorno documentadas en `.env.example`.

---

## 6. Estrategia de Inicio, Disponibilidad y Resiliencia (TP6 - Sección 11.1 y 15)

### Healthchecks y Orden de Arranque:
Cada servicio expone su endpoint `/health` y define un healthcheck en Docker Compose:
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "fetch('http://localhost:<puerto>/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
  interval: 10s
  timeout: 5s
  retries: 3
```
Las dependencias utilizan `depends_on` con la condición `service_healthy`. Esto garantiza que los microservicios no intenten atender peticiones hasta que sus bases de datos y brokers de concurrencia se encuentren listos para operar.

### Comportamiento ante Indisponibilidad de Dependencias (TP6 - Sección 15.1 y 15.2):
* **Timeout Explícito:** `checkout-service` aplica un temporizador de 3000ms mediante `AbortController` al invocar a `inventory-service`.
* **Semántica de Errores Controlada:**
  * Si `inventory-service` cae o se agota el timeout, `checkout-service` captura la excepción y responde al cliente con **`HTTP 503 Service Unavailable`** (distinguiendo fallas de dependencias de un error genérico 500).
  * Si el lock en Redis está retenido por otra compra concurrente, `inventory-service` responde `409 Conflict`, y Checkout propaga **`HTTP 409 Conflict`** al cliente para habilitar un reintento.
  * Si el stock es 0, responde **`HTTP 400 Bad Request`** (`Stock insuficiente`).
  * Si el producto no existe, responde **`HTTP 404 Not Found`**.

---

## 7. Análisis de Fallos Parciales en Operaciones Distribuidas (TP6 - Sección 15.3)

Se analizan formalmente las 5 preguntas requeridas por la cátedra:

1. **¿Qué servicios participan y en qué orden se realizan las operaciones?**
   - Participan `checkout-service` (orquestador) e `inventory-service` (dueño de stock y locks).
   - Secuencia: 1) Cliente solicita compra a Checkout -> 2) Checkout valida JWT y llama a Inventory -> 3) Inventory adquiere lock en Redis -> 4) Inventory descuenta stock en MongoDB -> 5) Inventory libera lock en Redis -> 6) Inventory responde 200 OK a Checkout -> 7) Checkout confirma 200 OK al cliente.
2. **¿Qué cambios de estado produce cada etapa?**
   - Etapa 3: Clave `lock:producto:...` creada en Redis con TTL de 5 segundos.
   - Etapa 4: Documento en MongoDB pasa de `stock: 1` a `stock: 0`.
   - Etapa 5: Clave de Redis eliminada atómicamente por script Lua.
3. **¿Qué sucede si falla una etapa posterior a una operación ya confirmada?**
   - Si ocurre un corte de red o caída entre la Etapa 5 y 6 (tras haber decrementado en MongoDB pero antes de que la respuesta HTTP llegue a Checkout), `checkout-service` agota los 3000ms de timeout y responde `HTTP 503 Service Unavailable` al cliente.
4. **¿El sistema puede quedar en un estado parcialmente actualizado o inconsistente?**
   - **Sí:** El stock quedó descontado en la base de datos de inventario, pero el cliente recibió un fallo de comunicación.
5. **¿Qué información y mecanismos serían necesarios para mitigar o compensar en una evolución futura?**
   - **Claves de Idempotencia (*Idempotency Keys*):** El cliente genera un UUID único (`Idempotency-Key`). Ante un reintento por timeout, `inventory-service` detecta el UUID procesado y devuelve la confirmación original sin duplicar el descuento.
   - **Patrón Saga (Transacciones Compensatorias):** Al detectarse un timeout en Checkout, el orquestador envía un mensaje compensatorio (`POST /api/inventario/reponer`) para reintegrar el stock.
   - **Colas de Mensajes Asincrónicas:** Implementar RabbitMQ o Apache Kafka con confirmaciones de acuse de recibo (*ACK*) durables.

---

## 8. Persistencia y Volúmenes Nombrados (TP6 - Sección 13)

Las bases de datos utilizan volúmenes administrados por Docker para garantizar que los datos sobrevivan al ciclo de vida de los contenedores:
* `users_mongo_data`: Mantiene persistentes los usuarios, roles y contraseñas.
* `inventory_mongo_data`: Mantiene persistente el catálogo y las existencias de stock.

### Demostración del Escenario de Persistencia:
1. Iniciar el entorno: `docker compose up -d`
2. Crear un usuario o cargar stock en el sistema.
3. Detener y recrear los contenedores:
   ```bash
   docker compose down
   docker compose up -d
   ```
4. Consultar los endpoints y verificar que los datos continúan intactos.
5. **Diferencia con `-v`:** Para reiniciar deliberadamente el estado del laboratorio borrando todos los datos de prueba, se utiliza:
   ```bash
   docker compose down -v
   ```

---

## 9. Matriz de Control de Acceso y RBAC (TP7)

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

## 10. Requisitos de Software, Instalación y Puesta en Marcha

### Requisitos Previos:
* **Docker Desktop** (con soporte para WSL 2 en Windows) o Docker Engine en Linux.
* **Node.js LTS** (v18 o v20) para la ejecución opcional de las pruebas automatizadas desde el host.

### Verificación de Docker:
```bash
docker --version
docker compose version
docker info
```

### Configuración del Entorno:
Copiar el archivo de variables de entorno de ejemplo:
```bash
cp .env.example .env
```

### Despliegue con Docker Compose:
Construir las imágenes e iniciar todos los servicios en segundo plano:
```bash
docker compose up -d --build
```

Comprobar que los contenedores se encuentren en estado `healthy`:
```bash
docker compose ps
```

### Detención del Entorno:
* Detener conservando los datos persistentes:
  ```bash
  docker compose down
  ```
* Detener eliminando volúmenes de datos:
  ```bash
  docker compose down -v
  ```

### Documentación Interactiva Swagger UI:
* **User Service:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
* **Inventory Service:** [http://localhost:3001/api-docs](http://localhost:3001/api-docs)
* **Checkout Service:** [http://localhost:3002/api-docs](http://localhost:3002/api-docs)

---

## 11. Pruebas Reproducibles Automatizadas (TP6 - Sección 18)

Para certificar de forma fehaciente que el sistema cumple con todas las validaciones de negocio, concurrencia y seguridad:

### Ejecución de la Suite:
En la terminal de la raíz del proyecto, ejecutar:
```bash
npm test
# o bien: node tests/test-reproducible.js
```

### Escenarios Validados en la Suite:
1. **Healthchecks de Infraestructura:** Comprobación de que `user-service`, `inventory-service` (Mongo + Redis) y `checkout-service` responden favorablemente.
2. **Registro y Login JWT:** Creación de usuarios con roles `ADMIN` y `USER`, y obtención de tokens de acceso criptográficos.
3. **Inicialización de Datos de Prueba:** El administrador fija el stock de `"Entrada Conferencia"` en exactamente `1` unidad para preparar la prueba de estrés.
4. **Prueba de Concurrencia y Exclusión Mutua en Stock:**
   - Se disparan dos compras simultáneas mediante `Promise.all` compitiendo por la única entrada disponible.
   - **Resultado comprobado:** Una petición completa la compra (`200 OK`) y la otra es rechazada (`409 Conflict` por recurso bloqueado o `400 Bad Request` por stock agotado).
   - Se verifica que el stock final en MongoDB es exactamente `0`, demostrando que **no se produce sobreventa ni números negativos**.
5. **Compra con Stock Agotado:** Petición posterior que confirma la respuesta `400 Bad Request` con mensaje de stock insuficiente.
6. **Validación de Seguridad RBAC:**
   - Intento de modificación de stock por un `USER` -> Rechazado con `403 Forbidden`.
   - Compra sin token o con token falso -> Rechazado con `401 Unauthorized`.
   - Consulta de perfil de otro usuario por un `USER` -> Rechazado con `403 Forbidden` (regla de propiedad de recurso).
   - Consulta del propio perfil por el usuario creador -> Exitoso con `200 OK`.

Adicionalmente, se incluye el archivo [`tests/pruebas-api.http`](file:///c:/xampp/htdocs/ProyectosFacultad/BaseDatos2/programacionDistribuida/tp3/tests/pruebas-api.http) para realizar pruebas interactivas individuales con cualquier cliente REST.
