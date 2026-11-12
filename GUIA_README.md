# Guía Rápida del `README.md`

Índice limpio para ubicar rápido cada tema dentro de [`README.md`](README.md) según su número de línea.

---

### `Línea 1` — Título del Proyecto
Nombre del sistema, materia y universidad.

---

### `Línea 6` — 1. Integrantes del Grupo
Qué parte del proyecto hizo cada integrante (**Marcos**, **Nahuel** y **Lisandro**).

---

### `Línea 13` — 2. Descripción General y Evolución de la Arquitectura
Resumen de qué hace el sistema y cómo está armado.
* **`Línea 16`** → **Stack Tecnológico:** Node.js, Express, MongoDB, Redis, JWT, Bcrypt, Docker, Winston y Swagger.

---

### `Línea 26` — 3. Matriz de Arquitectura y Responsabilidades
Tabla resumen de los 3 microservicios (`User`, `Inventory` y `Checkout`), sus puertos (`3000`, `3001`, `3002`), sus bases de datos y sus endpoints.

---

### `Línea 36` — 4. Cambios Realizados Respecto del TP5 (Propiedad del Lock en Redis)
Explicación de por qué **Inventory Service** es el único dueño del stock y del bloqueo en Redis.
* **`Línea 47`** → **Diagrama del Flujo de Compra:** Esquema visual desde el cliente hasta Redis y MongoDB.

---

### `Línea 79` — 5. Comunicación Interna y Red Docker (`backend-net`)
Tabla que muestra cómo se conectan los contenedores entre sí por nombre de servicio.
* **`Línea 91`** → **Diferencia entre Local y Docker:** Uso de variables de entorno (`.env`) para no escribir IPs fijas en el código.

---

### `Línea 96` — 6. Estrategia de Inicio, Disponibilidad y Resiliencia
Cómo arrancan los contenedores en orden y cómo responden si algo falla.
* **`Línea 98`** → **Healthchecks y Orden de Arranque:** Ningún servicio arranca hasta que su base de datos esté lista.
* **`Línea 109`** → **Timeouts y Códigos de Error:** Corte a los 3 segundos (`503`), bloqueo por compra simultánea (`409`), sin stock (`400`) y no encontrado (`404`).

---

### `Línea 119` — 7. Análisis de Fallos Parciales
Qué pasa si se corta la red justo después de descontar una entrada (las 5 preguntas del práctico).
* **`Línea 134`** → **Cómo solucionarlo a futuro:** Claves de Idempotencia, Patrón Saga y Colas de Mensajes.

---

### `Línea 141` — 8. Persistencia de Datos y Volúmenes Docker
Cómo se guardan los usuarios y el stock para que no se borren al apagar los contenedores.
* **`Línea 147`** → **Prueba de Persistencia:** Diferencia entre `docker compose down` (conserva datos) y `docker compose down -v` (borra todo).

---

### `Línea 163` — 9. Matriz de Seguridad y Permisos por Rol (RBAC)
Tabla de todos los endpoints indicando cuáles son **Públicos**, cuáles son para clientes (**USER**) y cuáles son exclusivos para administradores (**ADMIN**).

---

### `Línea 182` — 10. Instalación, Comandos y Puesta en Marcha
Todos los comandos para levantar y usar el proyecto:
* **`Línea 188`** → Verificar Docker instalado.
* **`Línea 195`** → Crear archivo `.env`.
* **`Línea 201`** → Levantar el sistema (`docker compose up -d --build`).
* **`Línea 212`** → Apagar el sistema (`docker compose down`).
* **`Línea 222`** → Links directos a **Swagger UI** (`:3000`, `:3001`, `:3002`).

---

### `Línea 229` — 11. Pruebas Automatizadas (`npm test`)
Explicación de las pruebas automáticas del sistema.
* **`Línea 233`** → Comando para ejecutarlas (`npm test`).
* **`Línea 240`** → Qué comprueba cada uno de los 6 tests (salud de contenedores, login JWT, compra simultánea sin sobreventa, stock agotado y bloqueo de intrusos).
