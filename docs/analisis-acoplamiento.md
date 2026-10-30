# Análisis de Acoplamiento y Matriz de Propiedad de Datos

## 1. Introducción
El sistema de venta de entradas se encuentra descompuesto en tres microservicios autónomos (`user-service`, `inventory-service` y `checkout-service`). El diseño persigue minimizar el acoplamiento y maximizar la cohesión funcional dentro de cada contexto delimitado (*bounded context*).

---

## 2. Matriz de Propiedad de Datos y Persistencia

Cada microservicio debe ser el único dueño de sus estructuras de datos y mecanismos de sincronización. Ningún componente debe acceder directamente a bases de datos o llaves de caché pertenecientes a otro servicio.

| Dato / Recurso | Microservicio Propietario | Motor de Almacenamiento | Modo de Acceso Externo | Justificación Arquitectónica |
| :--- | :---: | :---: | :--- | :--- |
| **Identidades y Perfiles de Usuario** | `user-service` | MongoDB (`tp6_usuarios`) | Exclusivamente a través de la API REST de `user-service` (`/auth/*`, `/api/usuarios/*`). | Protege contraseñas hasheadas (`bcrypt`) y datos personales sensibles. |
| **Catálogo y Existencias de Stock** | `inventory-service` | MongoDB (`tp6_inventario`) | Exclusivamente a través de la API REST de `inventory-service` (`/api/inventario/*`). | Centraliza la regla de negocio de stock no negativo y consistencia de existencias. |
| **Locks Distribuidos de Stock** | `inventory-service` | Redis (`inventory-redis`) | **Uso interno exclusivo de `inventory-service`**. | **Encapsulación de Concurrencia:** Inventory protege su propio dato. El resto de los servicios desconoce Redis. |
| **Sesión y Contexto de Identidad** | *Descentralizado (Stateless)* | Tokens JWT (`HS256`) | Propagación mediante el encabezado HTTP estándar `Authorization: Bearer <token>`. | Evita que cada petición de compra requiera consultar sincrónicamente a `user-service`. |

---

## 3. Matriz de Acoplamiento Concreto

Para evaluar la calidad arquitectónica, se analizan los distintos tipos de acoplamiento existentes entre los componentes:

| Relación | Tipo de Acoplamiento | Nivel | Justificación y Mecanismo |
| :--- | :---: | :---: | :--- |
| **Checkout Service -> Inventory Service** | **De Protocolo y Contrato** | Bajo | Se comunican mediante HTTP REST estándar con payloads JSON bien estructurados. Cambios internos en Inventory no afectan a Checkout mientras se mantenga el contrato. |
| **Checkout Service -> Inventory Service** | **Temporal (Sincrónico)** | Medio | Al ser una llamada HTTP sincrónica bloqueante, Checkout requiere que Inventory esté disponible al momento de la compra. Se mitiga mediante un *timeout* estricto de 3000ms. |
| **Checkout Service -> Redis** | **Inexistente (Desacoplado)** | Nulo | **Corrección aplicada:** Checkout ya no se conecta a Redis ni gestiona locks. La exclusión mutua fue completamente delegada a Inventory Service. |
| **Checkout Service -> User Service** | **Inexistente en tiempo de ejecución** | Nulo | Checkout no consulta la base de datos de usuarios ni realiza llamadas HTTP a User Service; verifica la identidad de forma autónoma mediante la firma simétrica del token JWT. |
| **Inventory Service -> User Service** | **Inexistente en tiempo de ejecución** | Nulo | Inventory valida el token propagado utilizando la clave secreta `JWT_SECRET` sin contactar a User Service. Si User Service cae, Inventory y Checkout continúan operando normalmente. |

---

## 4. Métricas de Acoplamiento: Aferente y Eferente

* **Acoplamiento Aferente ($C_a$):** Número de componentes externos que dependen del servicio (indica responsabilidad).
* **Acoplamiento Eferente ($C_e$):** Número de componentes externos de los que depende el servicio (indica fragilidad).
* **Inestabilidad ($I = \frac{C_e}{C_a + C_e}$):** Valor entre 0 (máxima estabilidad) y 1 (máxima inestabilidad).

| Microservicio | $C_a$ (Aferente) | $C_e$ (Eferente) | Inestabilidad ($I$) | Rol Arquitectónico |
| :--- | :---: | :---: | :---: | :--- |
| **User Service** | 1 (Clientes HTTP) | 0 (No depende de nadie) | **0.00 (Totalmente Estable)** | Componente de infraestructura de identidad base. |
| **Inventory Service** | 2 (Clientes HTTP, Checkout) | 0 (No depende de otros microservicios) | **0.00 (Totalmente Estable)** | Componente central de catálogo y stock. |
| **Checkout Service** | 1 (Clientes HTTP) | 1 (`inventory-service`) | **0.50 (Equilibrado)** | Componente de orquestación transaccional. |

---

## 5. Conclusión de las Mejoras de Acoplamiento
Al transferir la propiedad del lock en Redis desde `checkout-service` hacia `inventory-service`:
1. Se eliminó el acoplamiento de almacenamiento compartido entre Checkout e Inventory.
2. Se evitó la fuga del modelo de concurrencia del stock hacia capas superiores.
3. Se garantizó que cualquier nuevo consumidor del stock quedará protegido por la misma exclusión mutua de forma transparente.
