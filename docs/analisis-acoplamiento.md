# Análisis de Acoplamiento y Matriz de Propiedad de Datos (TP5 - Secciones 5, 7 y 9)

## 1. Inventario de Funcionalidades de la Aplicación Previa (TP5 - Sección 5)

Antes de la migración a microservicios, la aplicación consistía en un monolito REST estructurado de la siguiente forma:

| Funcionalidad / Endpoint | Responsabilidad Actual (Monolito) | Datos Utilizados | Dependencias |
| :--- | :--- | :--- | :--- |
| `POST /api/usuarios` | Registro y persistencia de usuarios en base de datos. | Colección `usuarios` (MongoDB). | Mongoose, Bcrypt/Crypto. |
| `GET /api/usuarios/:id` | Búsqueda y retorno de perfil de usuario. | Colección `usuarios` (MongoDB). | Mongoose. |
| `GET /api/inventario` | Consulta del catálogo y existencias de entradas. | Colección `inventarios` (MongoDB). | Mongoose. |
| `POST /api/comprar` | Validación de existencia, adquisición de lock en Redis y decremento de stock en MongoDB. | Colección `inventarios` (MongoDB) y llaves de bloqueo en Redis. | Redis client, Mongoose, Express. |
| `GET /health` | Comprobación de estado del proceso monolítico. | Estado de conexión a Mongo y Redis. | Drivers de base de datos. |

---

## 2. Identificación de Acoplamientos Relevantes y Propuesta de Desacople (TP5 - Sección 7)

Se identificaron tres situaciones críticas de acoplamiento en la aplicación previa:

| Caso | Acoplamiento Detectado | Problema Generado | Propuesta de Desacople |
| :---: | :--- | :--- | :--- |
| **1** | **Acoplamiento de Persistencia Compartida (Monolito):**<br>El proceso único gestionaba en una misma base de datos las colecciones de usuarios e inventario, accediendo directamente a ellas desde cualquier controlador. | Un fallo o bloqueo de consultas en la colección de usuarios degradaba las transacciones de compra de entradas. Imposibilidad de escalar el catálogo sin escalar el módulo de usuarios. | **Bases de datos independientes por servicio:** `users-db` (`tp6_usuarios`) exclusiva para `user-service` e `inventory-db` (`tp6_inventario`) exclusiva para `inventory-service`. Ningún servicio accede directamente a datos ajenos. |
| **2** | **Fuga de la Concurrencia de Stock hacia Checkout (Devolución TP5/TP6):**<br>En la separación preliminar, `checkout-service` era quien adquiría y liberaba el lock de Redis (`lock:producto:...`), mientras que `inventory-service` era el dueño del dato en MongoDB. | Fuga de abstracción: Checkout conocía detalles internos de concurrencia de inventario (nombres de claves Redis, TTLs, scripts Lua). Si aparecía otro canal de venta (taquilla física, reservas), el stock quedaba desprotegido ante race conditions salvo que duplicaran la lógica de Redis. | **Encapsulación del Lock en Inventory Service:** Al ser el propietario del dato de stock, la exclusión mutua mediante Redis se trasladó íntegramente a `inventory-service` (`PUT /api/inventario/reducir`). Checkout delega vía HTTP y solo procesa el código `409 Conflict`. |
| **3** | **Acoplamiento Temporal y de Identidad en Compras:**<br>Para validar si el comprador estaba activo y autorizado antes de procesar la compra, se requería consultar sincrónicamente el registro de usuarios. | Si el servicio de usuarios se encontraba caído o saturado, se derribaba la capacidad de realizar compras en todo el sistema. | **Autenticación Descentralizada con JWT:** `user-service` valida credenciales y emite un token firmado (`HS256`). `checkout-service` e `inventory-service` verifican criptográficamente el token en memoria sin llamadas sincrónicas ni acoplamiento de red hacia `user-service`. |

---

## 3. Matriz de Propiedad de Datos (TP5 - Sección 9)

Cada conjunto de datos tiene un único microservicio responsable. Ningún servicio puede modificar libremente la información ajena.

| Dato / Recurso | Servicio Propietario | Quién Puede Consultarlo | Quién Puede Modificarlo | Forma de Acceso |
| :--- | :---: | :--- | :--- | :--- |
| **Usuarios y Credenciales** | `user-service` | Clientes autenticados (propio perfil) o `ADMIN` (todos). | Exclusivo `user-service`. | Endpoints HTTP REST: `POST /auth/register`, `POST /auth/login`, `GET /api/usuarios/:id`. |
| **Catálogo de Entradas y Stock** | `inventory-service` | Cualquier cliente o servicio (público). | Exclusivo `inventory-service` (operado por `ADMIN` o reducción por compra). | Endpoints HTTP REST: `GET /api/inventario`, `POST /api/inventario/stock`, `PUT /api/inventario/reducir`. |
| **Locks Distribuidos de Stock (Redis)** | `inventory-service` | **Uso interno exclusivo de `inventory-service`**. | **Exclusivo `inventory-service`**. | Conexión interna a Redis (`SET NX PX` y Lua scripts). Inaccesible para otros microservicios. |
| **Sesión y Claims de Identidad** | *Stateless (Token JWT)* | Cualquier microservicio receptor (`user`, `inventory`, `checkout`). | Exclusivo `user-service` (emisión con `JWT_SECRET`). | Encabezado HTTP estándar: `Authorization: Bearer <token>`. |

---

## 4. Métricas de Acoplamiento Concreto (Aferente, Eferente e Inestabilidad)

* **Acoplamiento Aferente ($C_a$):** Servicios que dependen de este componente.
* **Acoplamiento Eferente ($C_e$):** Servicios de los que este componente depende.
* **Inestabilidad ($I = \frac{C_e}{C_a + C_e}$):** $0$ es máxima estabilidad, $1$ es máxima inestabilidad.

| Microservicio | $C_a$ (Aferente) | $C_e$ (Eferente) | Inestabilidad ($I$) | Evaluación Arquitectónica |
| :--- | :---: | :---: | :---: | :--- |
| **User Service** | 1 (Clientes HTTP externos) | 0 (No depende de ningún microservicio) | **0.00 (Totalmente Estable)** | Componente base de infraestructura de identidad. |
| **Inventory Service** | 2 (Clientes HTTP externos y Checkout) | 0 (No depende de otros microservicios) | **0.00 (Totalmente Estable)** | Componente central del catálogo y del stock con concurrencia encapsulada. |
| **Checkout Service** | 1 (Clientes HTTP externos) | 1 (`inventory-service`) | **0.50 (Equilibrado)** | Orquestador transaccional liviano y desacoplado de Redis. |

---

## 5. Matriz de Acoplamiento por Dimensiones Técnicas

| Relación | Tipo de Acoplamiento | Nivel | Mitigación Implementada |
| :--- | :---: | :---: | :--- |
| **Checkout -> Inventory** | **De Protocolo / Formato** | Bajo | Contratos REST explícitos con serialización JSON estándar. |
| **Checkout -> Inventory** | **Temporal (Sincrónico)** | Medio | Temporizador de *Timeout* explícito de 3000ms con `AbortController`. Respuesta controlada `503` ante indisponibilidad. |
| **Checkout -> Redis** | **De Infraestructura** | **Nulo (Eliminado)** | Se eliminó la dependencia a Redis en Checkout; toda la exclusión mutua se trasladó a Inventory. |
| **Servicios -> User Service** | **De Identidad** | **Nulo en Runtime** | Verificación criptográfica autónoma en memoria mediante tokens JWT (`HS256`) sin consultas entre servicios. |
