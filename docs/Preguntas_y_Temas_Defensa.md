# Guía Definitiva de Preguntas para la Defensa Oral: Vocabulario, Preguntas de Examen y Respuestas Clave

Este documento reúne el **Diccionario en Lenguaje Simple**, todas las **preguntas que solicitaste** y un repertorio completo de **preguntas de alta probabilidad y preguntas trampa** que la mesa examinadora suele hacer en la defensa del proyecto de Programación Distribuida (TP1 al TP7).

---

## 0. Diccionario en Lenguaje Simple (Vocabulario Técnico Traducido)

* **Concurrencia:** Cuando dos o más personas o procesos intentan realizar una acción **al mismo tiempo** (ejemplo: dos usuarios haciendo clic en "Comprar" en el mismo milisegundo compitiendo por la última entrada).
* **Condición de Carrera (*Race Condition*):** El error o anomalía que ocurre cuando dos procesos compiten sin sincronización. Ejemplo: queda `1` entrada disponible; ambos procesos leen que hay `1`, a ambos les da verdadero y el sistema vende `2` entradas, provocando **sobreventa** (*overselling* / stock negativo).
* **Exclusión Mutua (*Mutex*):** La garantía de que **"solo un proceso puede ingresar a la vez"** a consultar y modificar un recurso crítico compartido (el stock de un evento).
* **Lock (Cerrojo o Candado):** Bloqueo temporal que se coloca sobre un recurso. Quien toma el Lock tiene paso exclusivo; cualquier otro proceso que llegue mientras el lock esté tomado es rechazado o debe esperar.
* **Redis:** Motor de datos en **memoria RAM** ultrarrápido (tiempo de respuesta `< 1 ms`). En nuestro proyecto no guarda usuarios ni catálogo permanente, sino que actúa como **coordinador de locks distribuidos en memoria** para serializar las compras.
* **TTL (*Time To Live* / Tiempo de Vida):** Temporizador de autodestrucción asignado al Lock (en nuestro código: `5000 ms` = 5 segundos). Si el contenedor que tomó el lock se cae o sufre un corte eléctrico, a los 5 segundos Redis borra la clave automáticamente, evitando bloqueos eternos.
* **Deadlock (Bloqueo Mutuo / Bloqueo Eterno):** Situación en la que un proceso toma un recurso y nunca lo libera, dejando congelados a todos los demás procesos para siempre. Se evita con el TTL.
* **Operación Atómica:** Acción que se ejecuta **de forma completa, indivisible y sin interrupciones**, o no se ejecuta nada. Ningún otro proceso puede meterse en el medio de una operación atómica.
* **Script Lua:** Mini-código escrito en lenguaje Lua que se ejecuta **directamente dentro del motor de Redis**. Al ser ejecutado por el hilo único de Redis, es **100% atómico**. Lo usamos para verificar que el lock siga perteneciendo a nuestro proceso antes de borrarlo.
* **UUID / `ownerId`:** Identificador único universal aleatorio (ejemplo: `f47ac10b-58cc...`). Cada intento de compra genera su propio `ownerId` para firmar el Lock que solicita en Redis.
* **`findOneAndUpdate` (en MongoDB):** Función de MongoDB que busca un documento, evalúa una condición atómica (ej. `{ stock: { $gt: 0 } }`) y modifica el campo (`{ $inc: { stock: -1 } }`) en un único paso indivisible a nivel de motor de almacenamiento.
* **Stateless (Sin Estado en Memoria):** Principio de arquitectura donde el servidor **no almacena sesiones ni datos del usuario en la memoria RAM del proceso**. Cada petición HTTP debe contener toda la información y credenciales necesarias para procesarse.
* **JWT (*JSON Web Token*):** Credencial compacta y autónoma firmada criptográficamente (`HS256`). Contiene la identidad del usuario (`sub`) y sus permisos (`role`). Permite que cualquier microservicio valide al usuario sin consultar una base de datos central de sesiones.
* **Hashing (`bcrypt`) y Sal (*Salt*):** Transformación criptográfica unidireccional de contraseñas. Es matemáticamente imposible revertir un hash de Bcrypt a la contraseña original. La "sal" es una secuencia aleatoria que se mezcla con la clave antes de hashearla para evitar ataques con tablas precalculadas (*Rainbow Tables*).
* **RBAC (*Role-Based Access Control*):** Control de acceso basado en roles. En el proyecto existen dos roles: **`USER`** (cliente que compra y ve su propio perfil) y **`ADMIN`** (administrador que carga/modifica stock, lista todos los usuarios y da de baja cuentas).
* **Propiedad del Recurso (Anti-IDOR):** Regla de autorización donde se verifica en el servidor que el usuario autenticado solo pueda ver o modificar **sus propios datos** (`req.user.sub === req.params.id`), impidiendo que alguien cambie el ID en la URL para espiar cuentas ajenas.
* **Fallo Parcial:** Situación inherente a los sistemas distribuidos donde **una parte de la transacción tiene éxito y otra parte falla**. Ejemplo: `inventory-service` descuenta la entrada, pero la red se corta antes de que `checkout-service` reciba la confirmación.
* **Idempotencia (`Idempotency-Key`):** Propiedad de una operación por la cual ejecutarla múltiples veces con el mismo identificador produce **exactamente el mismo resultado** sin efectos secundarios duplicados.
* **Patrón Saga (Transacción Compensatoria):** Patrón para transacciones distribuidas donde, si falla un paso posterior, se dispara automáticamente una **acción compensatoria inversa** (ejemplo: sumar `+1` al stock) para devolver el sistema a un estado consistente.
* **Timeout y `AbortController`:** Temporizador de corte forzado (en `checkout-service` es de **3000 ms**). Si un servicio dependiente no contesta en 3 segundos, se cancela la espera para evitar saturar los hilos de ejecución.
* **Healthcheck:** Sonda periódica de monitoreo (cada 10s) que comprueba si un contenedor y sus dependencias técnicas (MongoDB / Redis) están operativos y listos para recibir tráfico (`healthy`).

---

## 1. Bloque: Docker, Contenedores y Virtualización

### Pregunta 1: ¿Cuál es la diferencia entre una Imagen y un Contenedor en Docker?
> **Conceptos clave:**
> * **Imagen:** Plantilla estática, inmutable, empaquetada en capas de solo lectura a partir de un `Dockerfile`. Contiene el código, Node.js, librerías y configuración base.
> * **Contenedor:** Instancia viva en ejecución creada a partir de una imagen. Agrega una capa delgada de lectura/escritura (R/W) en memoria, con aislamiento de procesos (Namespaces) y límites de CPU/RAM (cgroups).

**Respuesta para la mesa:**
Una **Imagen** es el molde o plantilla inmutable de solo lectura que define qué software y dependencias contiene la aplicación. Un **Contenedor** es la instancia viva en ejecución de esa imagen. A partir de una única imagen de `inventory-service` podemos levantar múltiples contenedores idénticos corriendo en paralelo.

---

### Pregunta 2: ¿Cuál es la diferencia entre Virtualización Tradicional (Máquinas Virtuales) y Contenedores (Dockerización)?
> **Conceptos clave:**
> * **Máquina Virtual (VM):** Virtualiza hardware completo sobre un **Hipervisor** (VirtualBox, VMware). Cada VM carga su propio Kernel y Sistema Operativo invitado completo (*Guest OS*).
> * **Contenedor:** Virtualiza a nivel de Sistema Operativo. Todos los contenedores **comparten el mismo Kernel del Sistema Operativo anfitrión (*Host*)**, aislando únicamente los procesos de usuario.

| Característica | Máquina Virtual (Virtualización) | Contenedor (Dockerización) |
| :--- | :--- | :--- |
| **Nivel de virtualización** | Hardware completo (CPU, RAM, disco virtual). | Nivel de Sistema Operativo (espacio de usuario). |
| **Kernel** | Cada VM tiene su propio Kernel independiente. | Todos comparten el Kernel del Host. |
| **Peso en disco** | Gigabytes (5 GB a 20 GB por VM). | Megabytes (40 MB a 150 MB por imagen). |
| **Tiempo de arranque** | Minutos (debe bootear BIOS y SO completo). | Segundos o milisegundos (solo arranca el proceso `node index.js`). |
| **Consumo de recursos** | Alto overhead por sistemas operativos duplicados. | Casi nativo; los recursos se dedican a la aplicación. |

---

### Pregunta 3: ¿Cuáles son los comandos esenciales de Docker para el ciclo de vida de imágenes y contenedores?
> **Conceptos clave:**
> * `docker pull`, `docker build`, `docker run`, `docker ps`, `docker stop`, `docker start`, `docker rm`, `docker rmi`.

**Respuesta para la mesa:**
1. **Descargar una imagen:** `docker pull redis:7-alpine` (descarga la imagen desde Docker Hub a la máquina local).
2. **Construir una imagen propia:** `docker build -t inventory-service:1.0 ./inventory-service` (lee el `Dockerfile` y compila la imagen).
3. **Crear y ejecutar un contenedor:** `docker run -d --name mi-redis -p 6379:6379 redis:7-alpine` (`-d` segundo plano, `--name` nombre, `-p` mapeo de puertos host:contenedor).
4. **Listar contenedores activos y detenidos:** `docker ps` (solo activos) o `docker ps -a` (todos).
5. **Detener y levantar un contenedor existente:** `docker stop mi-redis` (apaga el proceso sin borrar datos) y `docker start mi-redis` (lo vuelve a encender).
6. **Borrar un contenedor:** `docker rm mi-redis` (elimina la instancia; primero debe estar detenido, o usar `-f`).
7. **Borrar una imagen:** `docker rmi redis:7-alpine` (elimina la plantilla del disco; no debe tener contenedores asociados).

---

### Pregunta 4: ¿Qué diferencia hay entre `docker stop` y `docker rm`?
> **Conceptos clave:** Detención del proceso vs. destrucción de la instancia.

**Respuesta para la mesa:**
* `docker stop` envía una señal `SIGTERM` para apagar limpiamente el proceso dentro del contenedor. El contenedor queda apagado pero **sigue existiendo en el disco** con su estado temporal intacto, y puede volver a encenderse con `docker start`.
* `docker rm` **destruye y elimina definitivamente el contenedor** y su capa de escritura temporal.

---

### Pregunta 5: ¿Qué diferencia hay entre `docker compose down` y `docker compose down -v`?
> **Conceptos clave:** Persistencia de volúmenes de datos.

**Respuesta para la mesa:**
* `docker compose down`: Detiene y elimina los contenedores y la red virtual, pero **conserva los volúmenes de datos intactos** (`users_mongo_data` e `inventory_mongo_data`). Al volver a levantar con `docker compose up -d`, los usuarios y el stock siguen estando.
* `docker compose down -v`: Detiene los contenedores y **elimina también los volúmenes persistentes (`-v`)**, borrando todas las bases de datos de MongoDB para reiniciar el laboratorio desde cero.

---

### Pregunta 6: ¿Por qué en `docker-compose.yml` usamos nombres de servicio como `http://inventory-service:3001` y no `localhost`?
> **Conceptos clave:** *Network Namespace* de Docker y resolución DNS interna.

**Respuesta para la mesa:**
Porque cada contenedor tiene su propio espacio de red aislado con su propia interfaz de loopback (`127.0.0.1` / `localhost`). Si `checkout-service` llamara a `http://localhost:3001`, intentaría conectarse a sí mismo y fallaría con `ECONNREFUSED`. Al conectar todos los contenedores a la red `backend-net`, el **servidor DNS interno de Docker** resuelve automáticamente el nombre del servicio (`inventory-service`, `users-db`, `redis`) a la IP privada interna de ese contenedor.

---

### Pregunta 7: ¿Por qué las bases de datos (`users-db`, `inventory-db`, `redis`) no exponen puertos hacia la PC anfitriona en `docker-compose.yml`?
> **Conceptos clave:** Principio de menor privilegio y seguridad perimetral de red.

**Respuesta para la mesa:**
Por seguridad y aislamiento de red. Los únicos contenedores que exponen puertos al host (`ports: - "3000:3000"`, `3001:3001`, `3002:3002`) son los microservicios que atienden a clientes. MongoDB y Redis solo necesitan comunicarse internamente a través de `backend-net`, por lo que **no deben ser accesibles desde fuera de la red de Docker**.

---

## 2. Bloque: Arquitectura de Microservicios y Diseño

### Pregunta 8: ¿Por qué eligieron una arquitectura *Database-per-Service* en vez de compartir una sola base de datos de MongoDB?
> **Conceptos clave:** Desacoplamiento de datos, límites de contexto (Bounded Context) e independencia de despliegue.

**Respuesta para la mesa:**
Si los tres microservicios compartieran una única base de datos, tendríamos un **acoplamiento oculto a nivel de esquema**: un cambio en la colección de usuarios podría romper inventario, y un servicio saturado podría agotar el pool de conexiones de los demás. Con *Database-per-Service*, cada microservicio es el único dueño de sus datos y esquemas, lo que permite escalarlos, modificarlos y desplegarlos de forma 100% independiente.

---

### Pregunta 9: ¿Cómo se relacionan los servicios entre sí si las bases de datos están separadas y no hay *JOINs* relacionales?
> **Conceptos clave:** Desacoplamiento referencial y propagación de identificadores.

**Respuesta para la mesa:**
No se hacen *JOINs* de base de datos entre microservicios. La comunicación se realiza mediante contratos de interfaz HTTP/REST bien definidos:
* `checkout-service` no lee la base de stock; le envía una petición `PUT /api/inventario/reducir` a `inventory-service`.
* La identidad del comprador viaja en el **Token JWT** propagado en el encabezado `Authorization: Bearer <token>`. De esta forma, cada servicio extrae el ID del usuario (`req.user.sub`) sin consultar la base de datos del otro.

---

### Pregunta 10: ¿Qué significa que `checkout-service` sea un servicio *Stateless* (sin estado)?
> **Conceptos clave:** Ausencia de estado local en memoria, escalabilidad horizontal instantánea.

**Respuesta para la mesa:**
Significa que `checkout-service` no guarda sesiones de usuario en variables de Node.js ni posee base de datos propia. Su función es puramente orquestar la transacción: recibe la petición, valida el token JWT criptográficamente en memoria, llama a `inventory-service` y devuelve el resultado. Esto permite levantar 5 o 10 instancias idénticas de `checkout-service` detrás de un balanceador de carga sin preocuparse por sincronizar sesiones.

---

## 3. Bloque: Concurrencia, Redis y Locks Distribuidos

### Pregunta 11: ¿Por qué el Lock de Redis está en `inventory-service` y NO en `checkout-service`?
> **Conceptos clave:** Principio de Propiedad del Dato (*Data Ownership*) y Encapsulamiento.

**Respuesta para la mesa:**
`inventory-service` es el único dueño de la base de datos de stock (`inventory-db`). Si el lock estuviera en `checkout-service`:
1. Violaríamos el encapsulamiento: Checkout tendría que conocer detalles internos de concurrencia de inventario.
2. Si mañana agregamos otro servicio que venda entradas al por mayor o un script de reposición de stock, podrían puentear el lock de Checkout y provocar sobreventas.
Al encapsular el lock en `inventory-service`, **cualquier petición que intente descontar stock debe pasar obligatoriamente por el cerrojo de Redis**, garantizando la consistencia en un único punto.

---

### Pregunta 12: ¿Por qué para liberar el lock en Redis usan un Script Lua y no simplemente un `redis.del(lockKey)`?
> **Conceptos clave:** Atomicidad, expiración de TTL y condición de carrera en la liberación del lock.

**Respuesta para la mesa:**
Si usáramos un `DEL` directo o un `GET` seguido de `DEL` en Node.js, podríamos **borrar por error el lock de otro comprador**:
1. El Proceso A adquiere el lock con un TTL de 5000ms, pero se demora 6000ms por lentitud de red.
2. A los 5000ms, el lock de A expira solo en Redis.
3. A los 5100ms, entra el Proceso B y adquiere legítimamente su propio lock sobre ese producto.
4. A los 6000ms, el Proceso A termina y, si hiciera un `DEL` ciego, le borraría el lock activo al Proceso B.
El **Script Lua** resuelve esto ejecutándose de forma **100% atómica** dentro del hilo de Redis: compara si el `ownerId` guardado en la clave coincide con el de la petición actual, y solo lo borra si coinciden.

---

### Pregunta 13: Si ya tienen el Lock en Redis, ¿por qué además usan `findOneAndUpdate` con `{ stock: { $gt: 0 } }` en MongoDB?
> **Conceptos clave:** Defensa en profundidad (*Defense in Depth*).

**Respuesta para la mesa:**
Porque aplicamos dos barreras complementarias:
1. **Primera barrera (Redis Lock en memoria):** Filtra en memoria RAM (`< 1 ms`) ráfagas masivas de compras sobre la misma entrada y responde inmediatamente `409 Conflict` (modo *Fail-Fast*), protegiendo a MongoDB de saturarse de consultas concurrentes.
2. **Segunda barrera (Operación atómica en MongoDB):** Si por una demora extrema de red el TTL del lock en Redis llegara a expirar, la cláusula `{ stock: { $gt: 0 } }` en MongoDB actúa como reaseguro atómico a nivel de documento, garantizando matemáticamente que **el stock jamás llegue a valores negativos**.

---

### Pregunta 14: ¿Qué pasa si una petición adquiere el Lock en Redis y el contenedor de `inventory-service` se apaga de golpe antes de liberarlo?
> **Conceptos clave:** Prevención de *Deadlocks* mediante TTL (*Time To Live*).

**Respuesta para la mesa:**
No se produce un bloqueo permanente (*deadlock*) gracias al parámetro `PX 5000` (`SET lockKey ownerId NX PX 5000`). Aunque el servidor se apague abruptamente, **Redis destruye la clave automáticamente a los 5 segundos**, liberando el recurso para que los demás compradores puedan continuar.

---

### Pregunta 15: ¿Por qué Redis es ideal para exclusión mutua frente a variables en memoria de Node.js?
> **Conceptos clave:** Procesamiento single-threaded en memoria RAM vs. procesos Node.js aislados.

**Respuesta para la mesa:**
Una variable o mutex en la memoria RAM de Node.js solo funciona si tenemos un único proceso. Si escalamos `inventory-service` a 3 réplicas en contenedores distintos, cada uno tendría su propia memoria y no sabrían qué bloqueó el otro. Redis es un **servicio externo centralizado**, almacena en RAM con latencias sub-milisegundo y procesa comandos de forma **atómica en un solo hilo (*single-threaded*)**, lo que garantiza exclusión mutua real en todo el clúster.

---

## 4. Bloque: Seguridad Distribuida, JWT, Bcrypt y RBAC

### Pregunta 16: ¿Cómo funciona la autenticación con JWT y por qué es superior a las sesiones tradicionales en microservicios?
> **Conceptos clave:** Arquitectura *Stateless* vs. sesiones centralizadas con estado.

**Respuesta para la mesa:**
Con sesiones tradicionales, el servidor guarda los IDs de sesión en memoria RAM o base de datos y envía una cookie. En microservicios, esto obligaría a que todos los servicios consulten continuamente a la base de usuarios para cada petición. Con **JWT**, el token es autónomo (*self-contained*): lleva la identidad y el rol firmados con `JWT_SECRET`. Cualquier microservicio puede verificar criptográficamente la validez del token en memoria en microsegundos, sin llamadas de red adicionales.

---

### Pregunta 17: ¿Los datos dentro de un JWT (payload) están encriptados? ¿Cualquiera puede leerlos?
> **Conceptos clave:** Codificación Base64Url vs. Cifrado criptográfico vs. Firma digital.

**Respuesta para la mesa:**
**No están encriptados, están firmados.** El payload viaja codificado en Base64Url, lo que significa que cualquiera que intercepte el token puede decodificarlo y leer el ID o rol. Lo que brinda seguridad no es el secreto de los datos, sino la **Firma Criptográfica (HMAC-SHA256)**: si un atacante modifica el payload (ej. cambia `"role": "USER"` por `"role": "ADMIN"`), la firma deja de coincidir con el secreto `JWT_SECRET` del servidor y la petición es rechazada con `401 Unauthorized`. Por esta razón, **nunca se deben poner contraseñas ni datos sensibles dentro del payload de un JWT**.

---

### Pregunta 18: ¿Por qué usamos `bcrypt` para contraseñas y no algoritmos rápidos como MD5 o SHA-256?
> **Conceptos clave:** Funciones de derivación de claves lentas (*Key Stretching*), costo computacional y protección contra fuerza bruta con GPUs.

**Respuesta para la mesa:**
SHA-256 y MD5 fueron diseñados para ser extremadamente rápidos, lo que permite a un atacante probar miles de millones de combinaciones por segundo usando placas de video (GPU). **`bcrypt` es un algoritmo deliberadamente lento y configurable** mediante rondas de costo (`BCRYPT_ROUNDS=10`). Además, genera automáticamente una **sal aleatoria (*salt*)** única para cada contraseña, impidiendo ataques con tablas precalculadas (*Rainbow Tables*).

---

### Pregunta 19: ¿Cómo funciona la protección de Propiedad del Recurso (Anti-IDOR) en `GET /api/usuarios/:id`?
> **Conceptos clave:** *Insecure Direct Object Reference* (IDOR) y principio de menor privilegio.

**Respuesta para la mesa:**
En `user-service`, cuando un usuario autenticado consulta `GET /api/usuarios/:id`, el middleware compara el identificador guardado dentro del token JWT con el parámetro de la URL:
```javascript
if (req.user.role !== 'ADMIN' && req.user.sub !== req.params.id) {
    return res.status(403).json({ error: 'Acceso denegado a datos de otro usuario' });
}
```
Si un cliente común (`USER`) cambia el ID en la URL para ver los datos de otro comprador, el servidor detecta que no es el propietario del recurso ni administrador y responde **`403 Forbidden`**.

---

### Pregunta 20: Si los JWT son *stateless*, ¿cómo se revoca un token antes de que expire si a un usuario le roban la cuenta?
> **Conceptos clave:** Listas negras de revocación (*Token Blacklist*) en Redis y expiraciones cortas con *Refresh Tokens*.

**Respuesta para la mesa:**
En arquitecturas productivas se aplican dos técnicas estándar:
1. **Tokens de vida corta + Refresh Token:** El token de acceso expira en 15 minutos y se renueva contra el servidor de autenticación.
2. **Lista negra (*Blacklist*) en Redis:** Al cerrar sesión o reportar robo, el identificador único del token (`jti`) se guarda en Redis con un tiempo de expiración igual al tiempo restante de vida del token. Los microservicios consultan esta lista en memoria RAM y rechazan el token revocado.

---

## 5. Bloque: Resiliencia, Fallos Parciales y Teorema CAP

### Pregunta 21: ¿Qué sucede en el sistema si se cae el contenedor de `user-service`?
> **Conceptos clave:** Desacoplamiento temporal e independencia de fallos gracias a JWT.

**Respuesta para la mesa:**
El flujo crítico de venta de entradas **sigue funcionando con total normalidad**. Los usuarios que ya habían iniciado sesión poseen su token JWT válido, y tanto `checkout-service` como `inventory-service` verifican la firma localmente sin depender de `user-service`. Lo único que se interrumpe transitoriamente es el registro de nuevos usuarios y nuevos inicios de sesión.

---

### Pregunta 22: ¿Qué es un Fallo Parcial y cómo lo gestiona nuestro proyecto?
> **Conceptos clave:** Transacciones distribuidas, timeouts con `AbortController` y respuesta semántica `503`.

**Respuesta para la mesa:**
Ocurre cuando una parte de la operación distribuida tiene éxito pero la siguiente falla o no responde. Por ejemplo: `inventory-service` descuenta la entrada en MongoDB, pero se corta la conexión de red antes de que `checkout-service` reciba la respuesta.
* **Hoy en el proyecto:** `checkout-service` corta la espera a los 3000ms con `AbortController`, no se queda bloqueado indefinidamente y responde al cliente **`503 Service Unavailable`**.
* **Solución productiva para consistencia eventual:** Uso de **Claves de Idempotencia (`Idempotency-Key`)** para reintentar la llamada sin duplicar descuentos, y el **Patrón Saga** para emitir transacciones compensatorias que restituyan el stock si la orden no se concreta.

---

### Pregunta 23: ¿Cómo se posiciona nuestro proyecto frente al Teorema CAP?
> **Conceptos clave:** Consistencia ($C$), Disponibilidad ($A$) y Tolerancia a Particiones ($P$).

**Respuesta para la mesa:**
El Teorema CAP establece que ante una partición de red ($P$), un sistema debe elegir entre Consistencia o Disponibilidad:
* **En el flujo de stock y compra (`inventory-service` + `checkout-service`), priorizamos Consistencia ($CP$):** Si hay una partición con Redis o MongoDB, el sistema prefiere rechazar la venta con `503` o `409` antes que vender sin certeza de stock (prioridad: cero sobreventas).
* **En la autenticación de usuarios con JWT, priorizamos Disponibilidad ($AP$):** Frente a una caída de `user-service`, los demás servicios siguen operando con los tokens ya emitidos.

---

### Pregunta 24: ¿Qué significa cada código HTTP que devuelve el sistema (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `503`)?
> **Conceptos clave:** Semántica de estados HTTP en APIs REST.

**Respuesta para la mesa:**
* **`200 OK` / `201 Created`:** Compra confirmada, login exitoso o nuevo usuario registrado.
* **`400 Bad Request`:** Stock insuficiente (`stock === 0`) o datos mal formados en el cuerpo del JSON.
* **`401 Unauthorized` (Fallo de Autenticación):** Token JWT no enviado, vencido o con firma inválida.
* **`403 Forbidden` (Fallo de Autorización):** El token es válido, pero el rol (`USER`) no tiene permisos para esa acción (ej. cargar stock) o intentó acceder al perfil de otro usuario.
* **`404 Not Found`:** El producto o usuario solicitado no existe.
* **`409 Conflict` (Colisión de concurrencia o datos):** El recurso está siendo modificado en ese instante por otra transacción en Redis, o se intentó registrar un usuario con DNI/email ya existente.
* **`503 Service Unavailable`:** Fallo de infraestructura o timeout de 3 segundos al invocar a un microservicio dependiente.

---

## 6. Bloque: Escalabilidad, Métricas y Despliegue en la Nube

### Pregunta 25: ¿Qué diferencia hay entre Escalabilidad Vertical y Horizontal? ¿Por qué nuestros microservicios escalan horizontalmente?
> **Conceptos clave:** *Scale Up* vs. *Scale Out*, diseño *Stateless* y coordinación externa.

**Respuesta para la mesa:**
* **Escalabilidad Vertical (*Scale Up*):** Agregar más procesador y memoria RAM al mismo servidor físico. Tiene un techo de hardware, es costoso y mantiene un único punto de falla.
* **Escalabilidad Horizontal (*Scale Out*):** Agregar más instancias (contenedores) en paralelo detrás de un balanceador de carga.
* **Nuestros microservicios escalan horizontalmente porque son *Stateless*:** No guardan sesiones locales (usan JWT) y no manejan locks en la memoria del proceso (usan Redis centralizado), permitiendo crear 10 réplicas que se reparten la carga sin colisiones.

---

### Pregunta 26: ¿Por qué en sistemas distribuidos se evalúa la latencia con Percentiles ($P95, P99$) y no con el Promedio?
> **Conceptos clave:** Sesgo del promedio aritmético y latencia de cola (*Tail Latency*).

**Respuesta para la mesa:**
El promedio oculta los casos extremos. Si 99 peticiones tardan 10ms y 1 petición sufre un timeout de 5000ms, el promedio dará 60ms y parecerá aceptable, pero el 1% de los clientes tuvo una experiencia pésima. El **Percentil 95 ($P95$)** garantiza que el 95% de las compras respondieron por debajo de ese umbral, y el **Percentil 99 ($P99$)** audita el peor 1% del sistema.

---

### Pregunta 27: ¿Qué es la Ley de Little ($L = \lambda \times W$) y cómo impacta en nuestro microservicio de compras?
> **Conceptos clave:** Concurrencia ($L$), Throughput ($\lambda$) y Tiempo de respuesta ($W$).

**Respuesta para la mesa:**
La Ley de Little establece que la cantidad de peticiones concurrentes acumuladas en el sistema ($L$) es igual a la tasa de llegada ($\lambda$) multiplicada por el tiempo de servicio ($W$):
$$L = \lambda \times W$$
Si nuestro endpoint recibe 100 peticiones por segundo ($\lambda = 100$) y cada compra tarda 50ms ($W = 0.05$), en promedio hay solo 5 peticiones activas en memoria ($L = 5$). Pero si MongoDB se degrada y tarda 2 segundos ($W = 2$), la cantidad de peticiones retenidas salta a 200, saturando la memoria. Por eso es vital aplicar **timeouts cortos (3000ms) y modo Fail-Fast en Redis**.

---

### Pregunta 28: ¿Qué componentes utilizaríamos para desplegar este proyecto en Producción real en la Nube?
> **Conceptos clave:** Infraestructura Cloud de alta disponibilidad y servicios administrados.

**Respuesta para la mesa:**
1. **Container Registry:** Subir las imágenes Docker a **AWS ECR**, **GitHub Container Registry** o **Google Artifact Registry**.
2. **Cómputo y Orquestación:** Desplegar los contenedores en **Google Cloud Run**, **AWS ECS (Fargate)** o **Kubernetes (EKS/GKE)** con auto-escalado horizontal de réplicas (*HPA*).
3. **Bases de Datos Administradas:** **MongoDB Atlas** configurado como Replica Set multi-zona (con backups automáticos y failover) y **AWS ElastiCache for Redis** para los locks.
4. **API Gateway / Balanceador con TLS:** **NGINX**, **Cloudflare** o **AWS ALB** con terminación HTTPS en puerto 443, ocultando la red privada interna.
5. **CI/CD:** Pipelines de **GitHub Actions** para correr `npm test` automáticamente y desplegar sin tiempo de inactividad (*Rolling Updates*).

---

## 7. Bloque: Algoritmo de Consenso RAFT (Tema Teórico del TP4)

### Pregunta 29: ¿Qué es el algoritmo de consenso RAFT y cuáles son sus estados principales?
> **Conceptos clave:** Consenso distribuido, tolerancia a fallos por caída (*Crash Fault Tolerance*), quórum de mayoría.

**Respuesta para la mesa:**
RAFT es un algoritmo de consenso distribuido diseñado para que un conjunto de nodos mantenga una bitácora de datos idéntica incluso ante la caída de algunos nodos. Cada nodo se encuentra siempre en uno de tres estados:
1. **Leader (Líder):** Atiende escrituras, las anota en su log y las replica a los seguidores enviando latidos continuos (*heartbeats*).
2. **Follower (Seguidor):** Replica pasivamente las entradas del líder. Si no recibe latidos durante un tiempo aleatorio (*Election Timeout*), asume que el líder cayó y se postula.
3. **Candidate (Candidato):** Solicita votos a los demás nodos. Si obtiene la mayoría de los votos (**Quórum**: más del 50%, ej. 2 de 3 nodos), se convierte en el nuevo Líder.

---

### Pregunta 30: ¿Se implementó el algoritmo RAFT en el código del proyecto integrador (TP5, TP6 o TP7)?
> **Conceptos clave:** Delimitación de alcance entre trabajos prácticos.

**Respuesta para la mesa:**
**No.** El algoritmo RAFT fue el tema teórico y de laboratorio simulado del **TP4**. En el proyecto integrador (TP1 a TP7), la coordinación de concurrencia y exclusión mutua se resuelve mediante el **Lock Distribuido en Redis (`SET NX PX 5000` + Script Lua)** encapsulado en `inventory-service`. RAFT está presente conceptualmente en la infraestructura subyacente que usamos (por ejemplo, en cómo los clústeres de MongoDB Replica Sets eligen a su nodo primario y en cómo orquestadores como Docker Swarm o Kubernetes `etcd` mantienen el estado de los nodos).
