# Comunicación entre Microservicios (TP5 - Sección 10 y TP6 - Sección 15)

## 1. Matriz de Comunicaciones entre Servicios (TP5 - Sección 10)

| Origen | Destino | Necesidad de Negocio | Método / Endpoint | Datos Intercambiados | Respuesta Esperada |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cliente HTTP** | `user-service` | Registro y autenticación de clientes. | `POST /auth/register`<br>`POST /auth/login` | Credenciales en JSON (`nombre`, `dni`, `mail`, `password`). | `201 Created` (usuario) o `200 OK` (con `accessToken` JWT). |
| **Cliente HTTP** | `inventory-service` | Consulta pública de eventos y entradas disponibles. | `GET /api/inventario` | Ninguno (parámetros de consulta opcionales). | `200 OK` (array JSON con productos y existencias). |
| **Cliente HTTP** | `checkout-service` | Solicitud de compra de entradas para un evento. | `POST /api/comprar` | Header `Authorization: Bearer <token>`, Body: `{ "producto": "..." }`. | `200 OK` (confirmación de compra con stock restante) o error semántico (`409`, `400`). |
| **`checkout-service`** | **`inventory-service`** | Delegación de la reducción concurrente de stock propagando identidad. | `PUT /api/inventario/reducir` | Header `Authorization: Bearer <token>`, Body: `{ "producto": "..." }`. | `200 OK` (stock reducido), `409 Conflict` (recurso bloqueado) o `400 Bad Request` (stock agotado). |

---

## 2. Análisis Crítico de las Comunicaciones (TP5 - Sección 10)

1. **¿Es realmente necesario que un servicio conozca al otro?**
   - Sí: `checkout-service` requiere conocer la API de `inventory-service` porque no debe duplicar la persistencia ni manipular el stock directamente.
   - En cambio, `inventory-service` **no necesita conocer a `checkout-service`**, lo que garantiza un acoplamiento unidireccional y bajo.
   - Ninguno de los dos necesita contactar a `user-service` durante una compra gracias a la validación autónoma de la firma del token JWT (`HS256`).
2. **¿Se está duplicando una regla de negocio que debería tener un único propietario?**
   - No: la regla de que el stock no puede ser negativo y el mecanismo de bloqueo en Redis pertenecen de forma única y exclusiva a `inventory-service`. `checkout-service` no valida existencias ni aplica bloqueos.
3. **¿La información solicitada podría pertenecer al servicio que la necesita?**
   - No: mantener existencias dentro de `checkout-service` violaría los límites de dominio, ya que el catálogo de eventos y la disponibilidad son requeridos por múltiples canales (consultas públicas, administración, compras).
4. **¿El contrato entre servicios puede expresarse sin conocer detalles internos de implementación?**
   - Sí: el contrato HTTP REST `PUT /api/inventario/reducir` solicita la reducción de una unidad de un producto y responde el estado resultante sin exponer si `inventory-service` utiliza MongoDB, Redis, PostgreSQL o un script Lua.
5. **¿Qué ocurre con el caso de uso si el servicio destino no se encuentra disponible?**
   - Si `inventory-service` se encuentra caído o no responde dentro del temporizador de 3000ms, `checkout-service` captura el error de red o timeout y devuelve un código **`HTTP 503 Service Unavailable`** controlado, evitando fallar con un error 500 no capturado.

---

## 3. Trazado de Casos de Uso Principales (TP5 - Sección 10.1 y TP6 - Sección 7)

### Caso de Uso 1: Proceso de Compra Concurrente de Entradas
```
 Cliente HTTP
      │
   1. │ POST /api/comprar (Bearer JWT)
      ▼
┌────────────────────────────────────────┐
│           CHECKOUT SERVICE             │
│  - Valida criptográficamente el JWT    │
│  - Activa Timeout de 3000ms            │
└───────────────────┬────────────────────┘
                 2. │ PUT /api/inventario/reducir (Bearer JWT propagado)
                    ▼
┌────────────────────────────────────────────────────────┐
│               INVENTORY SERVICE                        │
│  - Valida token propagado y rol (USER/ADMIN)           │
│  - Adquiere Lock en Redis: lock:producto:Entrada...    │
│  - Descuenta en MongoDB atómicamente ($inc: -1)        │
│  - Libera Lock en Redis mediante Lua Script            │
└───────────────────┬────────────────────────────────────┘
                 3. │ HTTP 200 OK { stockRestante: 0 }
                    ▼
┌────────────────────────────────────────┐
│           CHECKOUT SERVICE             │
└───────────────────┬────────────────────┘
                 4. │ HTTP 200 OK (Compra exitosa)
                    ▼
               Cliente HTTP
```

### Caso de Uso 2: Registro e Inicio de Sesión de Usuario
```
 Cliente HTTP
      │
   1. │ POST /auth/register (Datos personales + Password)
      ▼
┌────────────────────────────────────────┐
│             USER SERVICE               │
│  - Hashea contraseña con Bcrypt (10r)  │
│  - Persiste usuario en users-db        │
└───────────────────┬────────────────────┘
                 2. │ HTTP 201 Created
                    ▼
   3. │ POST /auth/login (Mail + Password)
      ▼
┌────────────────────────────────────────┐
│             USER SERVICE               │
│  - Compara hash con Bcrypt             │
│  - Genera JWT firmado con HS256        │
└───────────────────┬────────────────────┘
                 4. │ HTTP 200 OK { accessToken: "eyJ..." }
                    ▼
               Cliente HTTP
```

---

## 4. Semántica de Errores entre Microservicios (TP6 - Sección 15.2)

| Situación Remota | Código HTTP | Tratamiento en el Consumidor (`checkout-service`) |
| :--- | :---: | :--- |
| **Recurso Inexistente** | `404 Not Found` | Error funcional: se propaga al cliente indicando que el producto solicitado no existe en catálogo. No se transforma en 503. |
| **Conflicto de Concurrencia** | `409 Conflict` | Conflicto de negocio: se propaga al cliente indicando que el recurso está retenido temporalmente por otra transacción, habilitando reintento. |
| **Stock Agotado** | `400 Bad Request` | Regla de negocio: se informa al cliente que no existen localidades disponibles. |
| **Timeout / Red Rechazada** | *Sin respuesta válida* | Falla de infraestructura: tras expirar los 3000ms se responde `HTTP 503 Service Unavailable`. |
| **Fallo Remoto Inesperado** | `5xx` | Indisponibilidad interna: se registra en los logs de Winston y se responde `HTTP 503 Service Unavailable`. |

---

## 5. Análisis de Fallos Parciales en Operaciones Distribuidas (TP6 - Sección 15.3)

Respondiendo a las 5 preguntas requeridas por la consigna:

1. **¿Qué servicios participan y en qué orden se realizan las operaciones?**
   - Participan `checkout-service` (orquestador de compra) e `inventory-service` (propietario del stock y del lock de Redis).
   - Orden: 1) Cliente invoca Checkout -> 2) Checkout invoca Inventory -> 3) Inventory adquiere lock en Redis -> 4) Inventory descuenta stock en MongoDB -> 5) Inventory libera lock -> 6) Inventory responde 200 OK a Checkout -> 7) Checkout responde 200 OK al cliente.
2. **¿Qué cambios de estado produce cada etapa?**
   - Etapa 3: Clave `lock:producto:...` creada en Redis con TTL de 5000ms.
   - Etapa 4: Documento en colección `inventarios` pasa de `stock: N` a `stock: N-1`.
   - Etapa 5: Clave de Redis eliminada atómicamente por Lua script.
3. **¿Qué sucede si falla cada una de las etapas posteriores a una operación ya confirmada?**
   - Si la red cae entre la Etapa 5 y 6 (luego de descontar en MongoDB y liberar el lock): `checkout-service` no recibe la confirmación a tiempo, aborta por *timeout* a los 3000ms y responde `HTTP 503` al cliente.
4. **¿Si el sistema puede quedar en un estado parcialmente actualizado o inconsistente?**
   - **Sí:** En el escenario anterior se produce una inconsistencia temporal distribuida: el stock se redujo efectivamente en `inventory-service`, pero el cliente recibió un mensaje de fallo de conexión.
5. **¿Qué información sería necesaria para detectar, recuperar o compensar la operación en una evolución futura?**
   - **Claves de Idempotencia (*Idempotency Keys*):** El cliente genera un UUID transaccional único por intento de compra. Si `checkout-service` reintenta la llamada ante un timeout, `inventory-service` comprueba si el UUID ya fue procesado y devuelve la confirmación previa sin descontar nuevamente.
   - **Patrón Saga (Transacciones Compensatorias):** Al detectarse un error de timeout, `checkout-service` publica un evento compensatorio (`revertir_reserva`) para que `inventory-service` devuelva la unidad al stock.
   - **Colas de Mensajes Asincrónicas (RabbitMQ / Kafka):** Migrar de llamadas HTTP directas a una cola transaccional con garantías de entrega *at-least-once*.
