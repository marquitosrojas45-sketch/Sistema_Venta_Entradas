# Guía Rápida del `README.md` (TP7 - Entrega Final)

Índice limpio para ubicar rápido cada tema dentro de [`README.md`](README.md) según su número de línea.

---

### `Línea 1` — Título del Proyecto (TP7 - Entrega Final)
Nombre del sistema, materia y universidad.

---

### `Línea 6` — 1. Integrantes del Grupo y Responsabilidades
Qué parte del proyecto hizo cada integrante (**Marcos**, **Nahuel** y **Lisandro**).

---

### `Línea 13` — 2. Descripción General de la Arquitectura
Resumen de los pilares del sistema distribuido: Database-per-service, exclusión mutua, seguridad stateless y resiliencia.
* **`Línea 16`** → **Pilares del Sistema:** Los 4 fundamentos de diseño.
* **`Línea 22`** → **Stack Tecnológico:** Node.js 20 LTS, Express, MongoDB 7, Redis 7, JWT, Bcrypt, Docker Compose, Winston y Swagger.

---

### `Línea 32` — 3. Matriz de Microservicios, Puertos y Responsabilidades
Tabla comparativa de los 3 microservicios (`User`, `Inventory` y `Checkout`), sus puertos (`3000`, `3001`, `3002`), sus bases de datos y sus endpoints principales.

---

### `Línea 42` — 4. Control de Concurrencia: Lock Distribuido en Redis
Explicación de por qué **Inventory Service** es el dueño del stock y del bloqueo en Redis.
* **`Línea 44`** → **Principio de Propiedad del Dato (*Data Ownership*):** Justificación arquitectónica de encapsular Redis en Inventario.
* **`Línea 49`** → **Diagrama del Flujo de Compra y Exclusión Mutua:** Esquema visual paso a paso de cómo fluye la compra.
* **`Línea 82`** → **¿Por qué se libera el Lock con un Script Lua?:** Explicación de cómo evitar borrar el lock de otro proceso de forma atómica.

---

### `Línea 95` — 5. Seguridad Distribuida: JWT, Bcrypt y Matriz RBAC
Todo el esquema de seguridad implementado en el TP7:
* **`Línea 97`** → **5.1. Criptografía y Autenticación Stateless:** Hashing con Bcrypt (10 rondas), tokens JWT (`HS256`) y propagación de contexto hacia Inventario.
* **`Línea 102`** → **5.2. Matriz de Control de Acceso por Roles (RBAC):** Tabla completa indicando qué endpoints son **Públicos**, cuáles son para clientes (**USER**) y cuáles son exclusivos para administradores (**ADMIN**) + regla Anti-IDOR.

---

### `Línea 121` — 6. Comunicación Interna y Red Docker (`backend-net`)
Tabla de URLs de conexión dentro de la red privada bridge de Docker versus ejecución local.
* **`Línea 133`** → **Variables de Entorno sin IPs fijas:** Explicación de por qué no hay IPs fijas ni `localhost` hardcodeado en el código JS (`process.env`).

---

### `Línea 138` — 7. Estrategia de Disponibilidad, Resiliencia y Fallos Parciales
Cómo arrancan los contenedores en orden y cómo responden si algo falla.
* **`Línea 140`** → **7.1. Healthchecks y Orden de Arranque:** Ningún servicio arranca hasta que su base de datos y Redis estén listos (`service_healthy`).
* **`Línea 143`** → **7.2. Timeout y Códigos HTTP Semánticos:** Corte a los 3 segundos con `AbortController` (`503`), bloqueo por compra simultánea (`409`), stock agotado (`400`), etc.
* **`Línea 154`** → **7.3. Manejo de Fallos Parciales:** Análisis del corte de red tras descontar stock, y mitigación con Idempotencia (`Idempotency-Key`) y Patrón Saga.

---

### `Línea 161` — 8. Persistencia y Volúmenes de Docker
Cómo se guardan los usuarios y el catálogo en `users_mongo_data` e `inventory_mongo_data`.
* **`Línea 167`** → **Comandos de ciclo de vida:** Diferencia entre `docker compose down` (conserva datos) y `docker compose down -v` (reinicio limpio de laboratorio).

---

### `Línea 173` — 9. Instalación y Puesta en Marcha
Pasos prácticos para levantar el sistema completo:
* **`Línea 179`** → Configurar entorno (`cp .env.example .env`).
* **`Línea 184`** → Levantar los 6 contenedores (`docker compose up -d --build`).
* **`Línea 189`** → Verificar estado saludable (`docker compose ps`).
* **`Línea 195`** → Enlaces directos a los portales interactivos de **Swagger UI** (`:3000`, `:3001` y `:3002`).

---

### `Línea 202` — 10. Suite de Pruebas Reproducibles Automatizadas
Cómo ejecutar las pruebas automáticas con `npm test` (o `node tests/test-reproducible.js`).
* **`Línea 211`** → **Qué valida la suite (22 pruebas automáticas):** Verificación de healthchecks, registro y login JWT, concurrencia real con `Promise.all` (1 compra exitosa, 1 rechazada y stock en 0), stock agotado y reglas de seguridad RBAC.
