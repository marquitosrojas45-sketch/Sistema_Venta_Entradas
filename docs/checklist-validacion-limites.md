# Checklist de Validación de Límites Propuestos (TP5 - Sección 12)

A continuación se evalúa la separación arquitectónica de los tres microservicios utilizando el checklist de límites funcionales y Domain-Driven Design (DDD):

---

## 1. User & Identity Service (`user-service`)

| Criterio de Validación | Estado | Justificación del Grupo |
| :--- | :---: | :--- |
| **¿Puede explicarse su responsabilidad en una frase clara?** | [x] | Administra de forma centralizada las identidades, credenciales, autenticación y perfiles de los usuarios del sistema. |
| **¿Agrupa reglas de negocio relacionadas entre sí?** | [x] | Unicidad de mail/DNI, hashing seguro de contraseñas (`bcrypt`), emisión y expiración de tokens JWT, y reglas de propiedad de perfil. |
| **¿Posee un conjunto de datos/decisiones sobre los que es responsable?** | [x] | Colección `usuarios` en `tp6_usuarios` y decisiones sobre validez de credenciales y roles (`USER` o `ADMIN`). |
| **¿No fue creado solo por existir una tabla o controlador?** | [x] | Corresponde al subdominio transversal de Identidad y Seguridad (IAM), desacoplado del negocio transaccional. |
| **¿Su interfaz pública no expone detalles internos?** | [x] | Expone contratos REST para registro, login y perfiles; no expone detalles de MongoDB ni del algoritmo de hashing. |
| **¿Puede modificarse internamente sin exigir cambios en otros?** | [x] | Se puede modificar el costo de salt de bcrypt o la base de datos interna sin alterar a `inventory-service` ni a `checkout-service`. |
| **¿No duplica reglas de negocio de otro servicio?** | [x] | Es la única autoridad que valida contraseñas y emite tokens de acceso en todo el ecosistema. |
| **¿Las dependencias con otros servicios son necesarias y justificadas?** | [x] | Posee acoplamiento eferente nulo ($C_e = 0$): no depende de ningún otro microservicio. |
| **¿Puede explicar qué queda explícitamente fuera del servicio?** | [x] | Queda fuera el catálogo de eventos, el stock de entradas, el cobro y las órdenes de compra. |

---

## 2. Inventory & Stock Service (`inventory-service`)

| Criterio de Validación | Estado | Justificación del Grupo |
| :--- | :---: | :--- |
| **¿Puede explicarse su responsabilidad en una frase clara?** | [x] | Administra el catálogo de eventos, las existencias de entradas y la exclusión mutua distribuida que protege dicho stock. |
| **¿Agrupa reglas de negocio relacionadas entre sí?** | [x] | Validación de stock no negativo, control de concurrencia mediante locks en Redis, y reposición de existencias exclusiva de administradores. |
| **¿Posee un conjunto de datos/decisiones sobre los que es responsable?** | [x] | Colección `inventarios` en `tp6_inventario` y claves temporales de bloqueo en Redis (`lock:producto:...`). |
| **¿No fue creado solo por existir una tabla o controlador?** | [x] | Representa el dominio central de existencias de entradas, común a múltiples canales de venta potenciales. |
| **¿Su interfaz pública no expone detalles internos?** | [x] | Expone `PUT /api/inventario/reducir` recibiendo únicamente el nombre del producto; no expone cómo gestiona el lock en Redis ni el motor de base de datos. |
| **¿Puede modificarse internamente sin exigir cambios en otros?** | [x] | El mecanismo de concurrencia (Redis, TTL, scripts Lua) puede ajustarse o migrarse internamente sin requerir modificaciones en `checkout-service`. |
| **¿No duplica reglas de negocio de otro servicio?** | [x] | Es la única autoridad con potestad para verificar si hay stock suficiente y aplicar decrementos. |
| **¿Las dependencias con otros servicios son necesarias y justificadas?** | [x] | No depende de otros microservicios ($C_e = 0$). Valida criptográficamente el JWT propagado de manera autónoma. |
| **¿Puede explicar qué queda explícitamente fuera del servicio?** | [x] | Queda fuera la autenticación de usuarios, el hashing de credenciales, la pasarela de pagos y la orquestación del flujo de compra. |

---

## 3. Checkout & Transaction Service (`checkout-service`)

| Criterio de Validación | Estado | Justificación del Grupo |
| :--- | :---: | :--- |
| **¿Puede explicarse su responsabilidad en una frase clara?** | [x] | Orquesta transaccionalmente el proceso de compra de entradas actuando como fachada segura entre el cliente y los servicios internos. |
| **¿Agrupa reglas de negocio relacionadas entre sí?** | [x] | Validación de rol de comprador, propagación del contexto de seguridad JWT, políticas de timeout y manejo de fallos parciales. |
| **¿Posee un conjunto de datos/decisiones sobre los que es responsable?** | [x] | Decide si una compra procede o se rechaza en base a las respuestas de las etapas orquestadas. |
| **¿No fue creado solo por existir una tabla o controlador?** | [x] | Representa el caso de uso transaccional de compra (*Use Case Orchestrator*), separando la interacción con el cliente del almacenamiento de datos. |
| **¿Su interfaz pública no expone detalles internos?** | [x] | Expone `POST /api/comprar`; oculta la topología interna y la llamada hacia `inventory-service`. |
| **¿Puede modificarse internamente sin exigir cambios en otros?** | [x] | Se pueden agregar pasos intermedios (ej. verificación de medio de pago, notificaciones) sin alterar a `inventory-service` ni a `user-service`. |
| **¿No duplica reglas de negocio de otro servicio?** | [x] | No duplica el control de stock ni administra locks de bajo nivel; delega íntegramente la validación a `inventory-service`. |
| **¿Las dependencias con otros servicios son necesarias y justificadas?** | [x] | Depende únicamente de `inventory-service` para verificar y descontar stock durante el proceso de compra. |
| **¿Puede explicar qué queda explícitamente fuera del servicio?** | [x] | Queda fuera la persistencia de usuarios, emisión de tokens y almacenamiento directo de existencias de entradas. |
