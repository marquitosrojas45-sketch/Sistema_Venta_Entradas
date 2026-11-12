# Guía de Navegación del `README.md` (Índice por Número de Línea y Tema)

Esta guía sirve como mapa rápido del archivo [`README.md`](file:///c:/xampp/htdocs/ProyectosFacultad/BaseDatos2/programacionDistribuida/tp3/README.md) para ubicar al instante cada tema y subtema por su **número exacto de línea**.

---

## Tabla General de Líneas y Temas

| Líneas en `README.md` | Línea de Inicio | Título del Tema / Sección | Qué contiene |
| :---: | :---: | :--- | :--- |
| **[Líneas 1 - 4](README.md#L1-L4)** | `Línea 1` | **Título Principal del Proyecto** | Nombre del sistema, cátedra y universidad. |
| **[Líneas 6 - 10](README.md#L6-L10)** | `Línea 6` | **1. Integrantes del Grupo** | Responsabilidades de Marcos (`user-service`), Nahuel (`inventory-service`) y Lisandro (`checkout-service`). |
| **[Líneas 13 - 23](README.md#L13-L23)** | `Línea 13` | **2. Descripción General y Evolución de la Arquitectura** | Resumen arquitectónico del sistema distribuido. |
| **[Líneas 16 - 23](README.md#L16-L23)** | `Línea 16` | ↳ *Subtema:* **Stack Tecnológico** | Node.js 20, Express, MongoDB 7, Redis 7, JWT HS256, Bcrypt, Docker Compose, Winston y Swagger. |
| **[Líneas 26 - 33](README.md#L26-L33)** | `Línea 26` | **3. Matriz de Arquitectura y Responsabilidades (TP6 - Hito 1)** | Tabla comparativa de los 3 microservicios: puertos (`3000`, `3001`, `3002`), bases propias, dependencias y endpoints. |
| **[Líneas 36 - 75](README.md#L36-L75)** | `Línea 36` | **4. Cambios Realizados Respecto de la Propuesta del TP5 (Devolución Docente)** | Explicación de por qué el Lock de Redis pasó de `checkout-service` a `inventory-service` (propiedad del dato). |
| **[Líneas 47 - 75](README.md#L47-L75)** | `Línea 47` | ↳ *Subtema:* **Diagrama de Flujo de Compra y Lock** | Diagrama ASCII del recorrido `Cliente -> Checkout -> Inventory -> Redis Mutex / MongoDB`. |
| **[Líneas 79 - 93](README.md#L79-L93)** | `Línea 79` | **5. Comunicación Interna, Red Docker y Resolución de Nombres (TP6 - Sección 12)** | Tabla de URLs en red Docker (`backend-net`) vs. ejecución local. |
| **[Líneas 91 - 93](README.md#L91-L93)** | `Línea 91` | ↳ *Subtema:* **Diferencias entre Ejecución Local y Docker Compose (TP6 - Sección 6.3)** | Uso de variables de entorno (`.env.example`) sin IPs fijas en el código. |
| **[Líneas 96 - 116](README.md#L96-L116)** | `Línea 96` | **6. Estrategia de Inicio, Disponibilidad y Resiliencia (TP6 - Sección 11.1 y 15)** | Orden de arranque y tolerancia a fallos entre contenedores. |
| **[Líneas 98 - 107](README.md#L98-L107)** | `Línea 98` | ↳ *Subtema:* **Healthchecks y Orden de Arranque** | Configuración YAML del `healthcheck` y `depends_on: service_healthy`. |
| **[Líneas 109 - 116](README.md#L109-L116)** | `Línea 109` | ↳ *Subtema:* **Comportamiento ante Indisponibilidad de Dependencias (TP6 - Sección 15.1 y 15.2)** | Timeout de `3000ms` (`AbortController`) y códigos HTTP `503`, `409`, `400` y `404`. |
| **[Líneas 119 - 138](README.md#L119-L138)** | `Línea 119` | **7. Análisis de Fallos Parciales en Operaciones Distribuidas (TP6 - Sección 15.3)** | Respuestas a las 5 preguntas de cátedra: secuencia, cambios de estado, corte de red e inconsistencia parcial. |
| **[Líneas 134 - 138](README.md#L134-L138)** | `Línea 134` | ↳ *Subtema:* **Mecanismos de Mitigación y Compensación** | Claves de Idempotencia (`Idempotency-Key`), Patrón Saga y Colas de Mensajes (RabbitMQ/Kafka). |
| **[Líneas 141 - 160](README.md#L141-L160)** | `Línea 141` | **8. Persistencia y Volúmenes Nombrados (TP6 - Sección 13)** | Volúmenes `users_mongo_data` e `inventory_mongo_data`. |
| **[Líneas 147 - 160](README.md#L147-L160)** | `Línea 147` | ↳ *Subtema:* **Demostración del Escenario de Persistencia** | Pasos con `docker compose down` vs. `docker compose down -v`. |
| **[Líneas 163 - 179](README.md#L163-L179)** | `Línea 163` | **9. Matriz de Control de Acceso y RBAC (TP7)** | Tabla completa de todos los endpoints con permisos para `Público`, `USER` y `ADMIN` + regla de propiedad del recurso. |
| **[Líneas 182 - 226](README.md#L182-L226)** | `Línea 182` | **10. Requisitos de Software, Instalación y Puesta en Marcha** | Guía paso a paso para levantar y detener el sistema. |
| **[Líneas 184 - 193](README.md#L184-L193)** | `Línea 184` | ↳ *Subtema:* **Requisitos Previos y Verificación de Docker** | Comandos `docker --version`, `docker compose version` y `docker info`. |
| **[Líneas 195 - 210](README.md#L195-L210)** | `Línea 195` | ↳ *Subtema:* **Configuración del Entorno y Despliegue con Docker Compose** | `cp .env.example .env`, `docker compose up -d --build` y `docker compose ps`. |
| **[Líneas 212 - 220](README.md#L212-L220)** | `Línea 212` | ↳ *Subtema:* **Detención del Entorno** | Comandos para bajar contenedores conservando o borrando volúmenes. |
| **[Líneas 222 - 226](README.md#L222-L226)** | `Línea 222` | ↳ *Subtema:* **Documentación Interactiva Swagger UI** | Enlaces a `/api-docs` en puertos `3000`, `3001` y `3002`. |
| **[Líneas 229 - 255](README.md#L229-L255)** | `Línea 229` | **11. Pruebas Reproducibles Automatizadas (TP6 - Sección 18)** | Cómo correr `npm test` y qué valida cada una de las 6 fases de prueba. |
| **[Líneas 233 - 238](README.md#L233-L238)** | `Línea 233` | ↳ *Subtema:* **Ejecución de la Suite** | Comando `npm test` / `node tests/test-reproducible.js`. |
| **[Líneas 240 - 255](README.md#L240-L255)** | `Línea 240` | ↳ *Subtema:* **Escenarios Validados en la Suite** | Healthchecks, JWT, concurrencia con `Promise.all`, stock agotado y RBAC. |

---

## Resumen Rápido por Pregunta de Defensa

* **¿Dónde está la tabla de los 3 microservicios y sus puertos?** → **Línea 26** (`## 3. Matriz de Arquitectura y Responsabilidades`).
* **¿Dónde explican el cambio del Lock de Redis hacia Inventory?** → **Línea 36** (`## 4. Cambios Realizados Respecto de la Propuesta del TP5`).
* **¿Dónde está el diagrama de cómo fluye la compra?** → **Línea 47** (dentro de la Sección 4).
* **¿Dónde muestran cómo se conectan los contenedores sin usar `localhost`?** → **Línea 79** (`## 5. Comunicación Interna, Red Docker y Resolución de Nombres`).
* **¿Dónde están los Healthchecks y el Timeout de 3 segundos (`503`)?** → **Línea 96** (`## 6. Estrategia de Inicio, Disponibilidad y Resiliencia`).
* **¿Dónde responden las 5 preguntas de Fallos Parciales, Idempotencia y Saga?** → **Línea 119** (`## 7. Análisis de Fallos Parciales en Operaciones Distribuidas`).
* **¿Dónde explican los volúmenes de MongoDB y `docker compose down -v`?** → **Línea 141** (`## 8. Persistencia y Volúmenes Nombrados`).
* **¿Dónde está la tabla de seguridad RBAC (`USER` vs `ADMIN`)?** → **Línea 163** (`## 9. Matriz de Control de Acceso y RBAC`).
* **¿Dónde están los comandos para levantar todo y abrir Swagger?** → **Línea 182** (`## 10. Requisitos de Software, Instalación y Puesta en Marcha`).
* **¿Dónde se explican las pruebas automatizadas (`npm test`)?** → **Línea 229** (`## 11. Pruebas Reproducibles Automatizadas`).
