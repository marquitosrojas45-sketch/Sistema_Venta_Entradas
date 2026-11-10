# Guía de Estudio y Defensa Oral: Preguntas y Temas Clave

Este documento contiene exclusivamente las respuestas detalladas a todos los temas solicitados y a las preguntas de alta probabilidad que los profesores pueden realizar durante la defensa del proyecto de Programación Distribuida.

---

## 1. Docker, Contenedores y Virtualización

### 1.1. ¿Cuál es la diferencia entre una Imagen y un Contenedor?

* **Imagen de Docker (Plantilla Inmutable / Clase):**
  Es un paquete estático, de **solo lectura**, que contiene todo lo necesario para ejecutar un software: el código fuente de la aplicación, el runtime (por ejemplo, Node.js 18), las librerías (`node_modules`), variables de entorno por defecto y archivos de configuración del sistema operativo base (por ejemplo, Alpine Linux). Se construye a partir de un `Dockerfile` mediante un sistema de capas inmutables (*Union File System*).
  * *Analogía en Programación Orientada a Objetos:* Una **Imagen** equivale a una **Clase** o al archivo ejecutable `.exe` guardado en el disco duro.

* **Contenedor de Docker (Instancia en Ejecución / Objeto):**
  Es una **instancia viva y en ejecución** creada a partir de una imagen. Cuando Docker arranca un contenedor, toma las capas de solo lectura de la imagen y les agrega encima una **capa delgada de lectura/escritura (R/W)** temporal en memoria, además de asignarle un espacio de nombres aislado (*Linux Namespaces* para red, procesos PID y puntos de montaje) y límites de recursos (*cgroups* para CPU y RAM).
  * *Analogía en Programación Orientada a Objetos:* Un **Contenedor** equivale a un **Objeto instanciado en memoria RAM** a partir de esa clase (o un proceso activo en el Administrador de Tareas). A partir de **una misma imagen** podemos levantar **múltiples contenedores** idénticos simultáneamente.

---

### 1.2. ¿Cuál es la diferencia entre Virtualización Tradicional (Máquinas Virtuales) y Contenedores (Dockerización)?

| Característica | Virtualización Tradicional (Máquinas Virtuales - VM) | Dockerización / Contenedores |
| :--- | :--- | :--- |
| **Nivel de abstracción** | **Virtualización a nivel de Hardware.** Emula una computadora física completa (CPU, RAM, disco virtual, placa de red). | **Virtualización a nivel de Sistema Operativo.** No emula hardware; aísla procesos de usuario dentro del mismo sistema operativo. |
| **Kernel del Sistema Operativo** | Cada Máquina Virtual ejecuta su **propio Kernel y Sistema Operativo invitado completo** (*Guest OS*: Windows, Ubuntu completo, etc.) sobre un **Hipervisor** (VMware, VirtualBox, Hyper-V, KVM). | Todos los contenedores **comparten el mismo Kernel del Sistema Operativo anfitrión (Host)** utilizando **Namespaces** (aislamiento de vista) y **cgroups** (control de recursos). |
| **Peso en disco** | **Gigabytes (GB)** (por ejemplo, 5 GB a 20 GB por cada VM porque incluye todo el sistema operativo invitado). | **Megabytes (MB)** (por ejemplo, una imagen `node:18-alpine` pesa ~40–60 MB porque solo empaqueta las dependencias de la app). |
| **Tiempo de arranque** | **Lento (minutos):** debe bootear la BIOS virtual, el kernel invitado y todos los servicios del sistema operativo. | **Instantáneo (milisegundos a segundos):** arranca directamente el proceso de la aplicación (`node index.js`). |
| **Consumo de RAM y CPU** | **Alto overhead:** gran parte de la memoria RAM y CPU se desperdicia manteniendo múltiples sistemas operativos duplicados. | **Mínimo overhead (casi nativo):** los recursos se destinan casi al 100% a ejecutar los microservicios. |
| **Aislamiento** | **Aislamiento fuerte por hardware:** si el kernel de una VM sufre un *kernel panic*, las demás VMs siguen funcionando y pueden usar distintos sistemas operativos (ej. Linux sobre Windows). | **Aislamiento a nivel de proceso:** es más ligero y rápido, aunque todos los contenedores comparten el kernel Linux subyacente. |

---

### 1.3. Comandos Esenciales de Docker (Ciclo de Vida Completo)

#### A. Descargar una imagen (`docker pull`)
Descarga una imagen desde un registro remoto (como Docker Hub) hacia la máquina local sin ejecutarla:
```bash
# Descargar la imagen oficial de Redis (versión Alpine ligera)
docker pull redis:7-alpine

# Descargar la imagen oficial de MongoDB
docker pull mongo:6.0

# Ver todas las imágenes descargadas o creadas localmente
docker images
```

#### B. Construir nuestra propia imagen desde un `Dockerfile` (`docker build`)
Empaqueta nuestro código fuente y dependencias en una nueva imagen local:
```bash
# Construir la imagen del servicio de inventario y etiquetarla (-t)
docker build -t inventory-service:1.0 ./inventory-service
```

#### C. Generar y ejecutar un contenedor (`docker run`)
El comando `docker run` **crea** un contenedor nuevo a partir de una imagen y lo **ejecuta** inmediatamente (equivale a `docker create` + `docker start`):
```bash
# Ejecutar Redis en segundo plano (-d), con nombre (--name) y mapeando puerto (-p host:contenedor)
docker run -d --name mi-redis -p 6379:6379 redis:7-alpine

# Ejecutar el microservicio de inventario pasándole variables de entorno (-e) y red (--network)
docker run -d --name inventory-srv -p 3001:3001 \
  --network backend-net \
  -e MONGO_URI=mongodb://inventory-mongo:27017/inventory_db \
  -e REDIS_URL=redis://inventory-redis:6379 \
  inventory-service:1.0
```
*Flags clave de `docker run`:*
* `-d` (*detached*): corre el contenedor en segundo plano sin bloquear la terminal.
* `--name`: asigna un nombre legible al contenedor.
* `-p ANFITRION:CONTENEDOR`: publica un puerto de la máquina física hacia el puerto interno del contenedor.
* `-e CLAVE=VALOR`: inyecta variables de entorno al proceso.
* `-v ruta_host:ruta_contenedor`: monta un volumen persistente para no perder datos si el contenedor se borra.

#### D. Ver contenedores activos e inactivos (`docker ps`)
```bash
# Ver solo los contenedores que están corriendo actualmente
docker ps

# Ver TODOS los contenedores (incluyendo los detenidos o que fallaron)
docker ps -a
```

#### E. Bajar (detener) y levantar un contenedor existente (`docker stop` / `docker start`)
Cuando detenemos un contenedor con `docker stop`, el proceso se apaga pero **el contenedor no se borra** (conserva su configuración y su capa de escritura temporal):
```bash
# Detener (bajar) un contenedor en ejecución enviando señal SIGTERM
docker stop mi-redis

# Volver a levantar un contenedor que estaba detenido
docker start mi-redis

# Reiniciar un contenedor en caliente
docker restart mi-redis
```

#### F. Borrar / eliminar un contenedor (`docker rm`)
Elimina definitivamente la instancia del contenedor y su capa temporal de lectura/escritura (la imagen base sigue intacta):
```bash
# 1. Primero detener el contenedor si está corriendo, y luego borrarlo
docker stop mi-redis
docker rm mi-redis

# 2. O forzar el borrado directo aunque esté corriendo (-f = force)
docker rm -f mi-redis

# Borrar todos los contenedores detenidos para limpiar espacio
docker container prune
```

#### G. Borrar / eliminar una imagen (`docker rmi`)
Elimina la plantilla (imagen) del disco duro local. **Importante:** No se puede borrar una imagen si todavía existe algún contenedor (activo o detenido) creado a partir de ella; primero hay que borrar el contenedor con `docker rm`:
```bash
# Eliminar una imagen por su nombre:tag o IMAGE ID
docker rmi inventory-service:1.0

# Forzar el borrado de una imagen
docker rmi -f inventory-service:1.0
```

#### H. Comandos con `docker compose` (Orquestación de múltiples contenedores)
En nuestro proyecto usamos `docker-compose.yml` para manejar los 7 contenedores (3 microservicios + 3 MongoDB + 1 Redis) con un solo comando:
```bash
# Construir las imágenes y levantar todos los contenedores en segundo plano
docker compose up -d --build

# Ver el estado de los contenedores del proyecto
docker compose ps

# Ver logs en tiempo real de un servicio específico
docker compose logs -f inventory-service

# Detener los contenedores SIN borrarlos
docker compose stop

# Detener y BORRAR los contenedores y la red virtual (conservando los volúmenes de datos)
docker compose down

# Detener y BORRAR contenedores, red Y TAMBIÉN los volúmenes de base de datos (-v)
docker compose down -v
```

---

## 2. Algoritmo de Consenso RAFT y su Aplicación en el Proyecto

### 2.1. ¿Qué es el algoritmo de consenso RAFT?
En un sistema distribuido sin memoria compartida ni reloj global, cuando tenemos múltiples nodos replicados necesitamos que todos se pongan de acuerdo sobre el valor de un dato o el orden de las transacciones incluso si algunos nodos fallan (*Tolerancia a Fallos por Caída / Crash Fault Tolerance*). **RAFT** es un algoritmo de consenso distribuido diseñado como alternativa comprensible a Paxos.

En RAFT, todo nodo se encuentra en uno de **3 estados**:
1. **Leader (Líder):** Es el único nodo que acepta operaciones de escritura de los clientes, las registra en su log y las replica a los seguidores. Envía latidos (*heartbeats*) periódicos para mantener su autoridad.
2. **Follower (Seguidor):** Nodos pasivos que reciben las entradas de log del Líder y responden a sus *heartbeats*. Si un seguidor deja de recibir *heartbeats* durante un tiempo aleatorio (*Election Timeout*, ej. 150–300 ms), asume que el líder cayó y se convierte en Candidato.
3. **Candidate (Candidato):** Incrementa el número de mandato (*Term*), se vota a sí mismo y solicita votos a los demás nodos. Si obtiene el voto de la **mayoría (quórum)** de los nodos ($N/2 + 1$, por ejemplo 2 de 3 nodos, o 3 de 5 nodos), se convierte en el nuevo Líder.

**Fases principales de RAFT:**
* **Elección de Líder (*Leader Election*):** Garantiza que exista como máximo un líder por mandato (*Term*) gracias al requisito de quórum mayoritario y a los timeouts aleatorios que evitan votos divididos (*split votes*).
* **Replicación de Bitácora (*Log Replication*):** El cliente envía un cambio al Líder; el Líder lo escribe en su log como no confirmado (*uncommitted*), lo envía a los Seguidores (`AppendEntries RPC`), y recién cuando la **mayoría de los nodos** confirma haberlo escrito, el Líder aplica el cambio (*commit*) y responde éxito al cliente.

---

### 2.2. ¿Cómo aplicamos RAFT en nuestro proyecto?
En nuestro proyecto, los conceptos de coordinación y consenso con RAFT intervienen en tres niveles clave de la arquitectura:

1. **Capa de Persistencia con MongoDB Replica Sets (Consenso tipo RAFT):**
   Cada uno de nuestros tres microservicios (`user-service`, `inventory-service` y `checkout-service`) persiste su estado en MongoDB. El motor de replicación nativo de MongoDB (*Replica Set*) utiliza un protocolo de consenso basado directamente en **RAFT**:
   * Existe un único nodo **Primary (Líder)** que recibe las escrituras (por ejemplo, el descuento atómico de stock `findOneAndUpdate` en `inventory-service` o la creación de órdenes en `checkout-service`) y las registra en su bitácora de operaciones (*Oplog*).
   * Los nodos **Secondary (Seguidores)** replican asincrónica o sincrónicamente ese *Oplog*.
   * Si el nodo Primary cae, los nodos Secondary detectan la falta de *heartbeats* (por defecto a los 10 segundos en Mongo) y ejecutan una **elección por mayoría (RAFT)** para promover automáticamente un nuevo Primary sin pérdida de datos.

2. **Coordinación de Exclusión Mutua Distribuida (De Nodo Único Redis a Consenso Distribuido):**
   En `inventory-service` implementamos un **Lock Distribuido en Redis** (`SET lock:stock:{id} {ownerId} NX PX 5000` + liberación atómica con Script Lua) para serializar el acceso al stock.
   * Con una única instancia de Redis (`inventory-redis`), Redis actúa como coordinador centralizado rápido en memoria.
   * Si escalamos ese coordinador para eliminar el punto único de fallo (*Single Point of Failure*), se utiliza **Redlock** (quórum sobre $N=5$ nodos Redis independientes donde el cliente debe adquirir el lock en al menos 3 de 5 nodos en un tiempo menor al TTL) o bien un coordinador de locks basado estrictamente en **RAFT** como **etcd** o **HashiCorp Consul**, donde la adquisición del lock `lock:stock:{id}` se persiste mediante el log replicado de RAFT antes de otorgar el permiso al microservicio.

3. **Plano de Control y Orquestación de Contenedores (Docker Swarm / Kubernetes):**
   Al llevar nuestros contenedores definidos en `docker-compose.yml` a un clúster de varios servidores físicos:
   * **Docker Swarm** utiliza internamente **RAFT** entre sus nodos *Manager* para mantener el estado deseado del clúster (qué contenedores deben correr, redes overlay y secretos).
   * **Kubernetes (K8s)** almacena todo el estado del clúster en **etcd**, una base de datos clave-valor distribuida que implementa **RAFT** puro. Si un contenedor de `inventory-service` muere, el consenso RAFT de `etcd` permite que el Control Plane programe un nuevo contenedor en otro nodo sano.

---

## 3. ¿Qué usaríamos para subir nuestro proyecto a Producción (Despliegue Cloud)?

Para pasar de nuestro entorno local de desarrollo (`docker compose` en una sola máquina) a un entorno de **Producción real de alta disponibilidad**, utilizaríamos la siguiente arquitectura e infraestructura:

1. **Registro de Imágenes de Contenedores (*Container Registry*):**
   * Subiríamos las imágenes compiladas de `user-service`, `inventory-service` y `checkout-service` a un registro privado y versionado como **Docker Hub**, **GitHub Container Registry (GHCR)**, **AWS ECR (Elastic Container Registry)** o **Google Artifact Registry**, etiquetándolas con el hash del commit o versión semántica (`v1.0.0` en lugar de `latest`).

2. **Plataforma de Ejecución y Orquestación de Contenedores:**
   * **Opción Serverless de Contenedores (Ideal para escalar de 0 a N automáticamente):** **Google Cloud Run**, **AWS ECS con Fargate** o **Railway / Render**. Ejecutan directamente nuestros contenedores Docker, balancean la carga y escalan horizontalmente según las peticiones por segundo sin tener que administrar servidores Linux manualmente.
   * **Opción Orquestador de Clúster (Control total):** **Kubernetes (AWS EKS, Google GKE o DigitalOcean Kubernetes)**. Desplegaríamos cada microservicio como un `Deployment` con un `HorizontalPodAutoscaler` (HPA) que agregue réplicas cuando la CPU supere el 70%.

3. **Bases de Datos y Caché Administradas (*Managed Services*):**
   * En producción **no es recomendable correr bases de datos dentro de contenedores efímeros locales sin replicación**.
   * **MongoDB Atlas** (o AWS DocumentDB) para las 3 bases de datos (`users_db`, `inventory_db`, `checkout_db`), configurado como un **Replica Set de 3 nodos en distintas zonas de disponibilidad** (aplicando consenso RAFT automático, backups continuos y encriptación en reposo).
   * **Redis Cloud / AWS ElastiCache for Redis** para el lock distribuido de `inventory-service`, con replicación Multi-AZ.

4. **API Gateway, Reverse Proxy y Balanceador de Carga:**
   * Colocaríamos un **API Gateway / Reverse Proxy** al frente (como **NGINX**, **Traefik**, **AWS Application Load Balancer** o **Cloudflare**) que reciba todo el tráfico externo por el puerto `443` (HTTPS con certificados TLS automáticos vía Let's Encrypt), oculte los puertos internos (`3000`, `3001`, `3002`) y enrute `/api/users`, `/api/inventory` y `/api/checkout` hacia las réplicas correspondientes.

5. **Pipeline de Integración y Despliegue Continuo (CI/CD) y Gestión de Secretos:**
   * **GitHub Actions:** Cada vez que hacemos `git push` a la rama `main`, un pipeline automático levanta el entorno, ejecuta nuestra suite [`tests/test-reproducible.js`](file:///c:/xampp/htdocs/ProyectosFacultad/BaseDatos2/programacionDistribuida/tp3/tests/test-reproducible.js), construye las imágenes Docker y las despliega sin tiempo de inactividad (*Rolling Update*).
   * **Gestor de Secretos:** `JWT_SECRET`, credenciales de MongoDB y certificados se inyectan desde **AWS Secrets Manager**, **Google Secret Manager** o **GitHub Secrets**, nunca desde archivos en el repositorio.

---

## 4. Métricas y Escalabilidad (Teoría Completa y Aplicación)

### 4.1. ¿Qué es la Escalabilidad y qué tipos existen?
La **escalabilidad** es la capacidad de un sistema distribuido para manejar un crecimiento en la carga de trabajo (más usuarios concurrentes, más transacciones o mayor volumen de datos) sin degradar sus métricas de rendimiento ni perder disponibilidad.

1. **Escalabilidad Vertical (*Scale Up*):**
   * Consiste en **aumentar los recursos de un único nodo o servidor** (agregar más núcleos de CPU, más memoria RAM o discos NVMe más rápidos).
   * *Ventaja:* Es simple porque no requiere modificar la arquitectura del código.
   * *Desventajas:* Tiene un **límite físico y económico duro** (el costo crece de forma exponencial), requiere tiempo de inactividad para actualizar hardware y mantiene un **Punto Único de Fallo (SPOF)**.

2. **Escalabilidad Horizontal (*Scale Out*):**
   * Consiste en **agregar más nodos o instancias (contenedores)** trabajando en paralelo detrás de un balanceador de carga.
   * *Ventajas:* Es teóricamente ilimitada, permite **elasticidad** (agregar contenedores en horas pico como un *Hot Sale* y apagarlos de noche para ahorrar costos) y brinda **Alta Disponibilidad** (si cae un contenedor, los demás absorben el tráfico).
   * *Requisito arquitectónico clave (Statelessness):* Para que un microservicio escale horizontalmente, debe ser **sin estado en memoria local (*Stateless*)**.
   * *Cómo lo aplicamos en nuestro proyecto:*
     * Nuestros microservicios usan **JWT (JSON Web Tokens)** firmados con `JWT_SECRET` en lugar de sesiones en la memoria RAM del proceso Node.js. Así, cualquier réplica de `inventory-service` o `checkout-service` puede validar cualquier petición.
     * El control de concurrencia del stock no usa variables en memoria de Node.js (un mutex local fallaría si hay 3 contenedores de `inventory-service`), sino un **Lock Distribuido en Redis (`inventory-redis`)** compartido por todas las réplicas de `inventory-service`.

---

### 4.2. Métricas Fundamentales de Rendimiento en Sistemas Distribuidos

Para evaluar y dimensionar un sistema distribuido se miden 5 métricas principales:

#### 1. Latencia (*Latency*) y Tiempo de Respuesta (*Response Time*)
* **Tiempo de Servicio:** Tiempo que tarda el servidor en procesar internamente la petición.
* **Tiempo de Espera (*Queueing Time*):** Tiempo que la petición pasa esperando en cola (por ejemplo, esperando el lock de Redis o una conexión al pool).
* **Latencia / Tiempo de Respuesta Total:** $\text{Tiempo de Espera} + \text{Tiempo de Servicio} + \text{Latencia de Red (RTT)}$.
* **¿Por qué en Sistemas Distribuidos NO alcanza con el Promedio y usamos Percentiles ($P50$, $P95$, $P99$)?**
  El promedio oculta los casos extremos (*outliers*). Si 99 peticiones tardan `10 ms` y 1 petición tarda `5000 ms` (porque agotó su timeout), el promedio da ~`60 ms` y parece excelente, pero el 1% de los clientes tuvo una experiencia crítica.
  * **$P50$ (Mediana):** El 50% de las peticiones responde en menos de este tiempo.
  * **$P95$:** El 95% de las peticiones responde dentro de este umbral (métrica estándar para acuerdos de nivel de servicio - SLA).
  * **$P99$ (*Tail Latency* / Latencia de Cola):** El 1% más lento de las peticiones. En microservicios en cadena (`Checkout -> Inventory`), la latencia de cola se amplifica porque la operación total es tan lenta como el eslabón más lento.

#### 2. Throughput (Rendimiento / Caudal de Procesamiento)
Es la cantidad de operaciones o solicitudes que el sistema completa exitosamente por unidad de tiempo:
* **RPS (*Requests Per Second*):** Peticiones HTTP procesadas por segundo (ej. lecturas de catálogo `GET /api/inventory`).
* **TPS (*Transactions Per Second*):** Transacciones de negocio completas por segundo (ej. compras confirmadas en `POST /api/checkout`).

#### 3. Concurrencia y la Ley de Little (*Little's Law*)
La **concurrencia ($L$)** es la cantidad de peticiones que están siendo procesadas simultáneamente dentro del sistema en un instante dado. La **Ley de Little** relaciona matemáticamente Concurrencia ($L$), Throughput ($\lambda$) y Tiempo medio de respuesta ($W$):
$$L = \lambda \times W$$
* *Ejemplo práctico en nuestro proyecto:* Si nuestro endpoint `POST /api/inventory/reduce` recibe un throughput de $\lambda = 100\text{ peticiones/seg}$ y cada operación (adquirir lock en Redis + actualizar MongoDB + liberar lock) tarda en promedio $W = 0.05\text{ segundos}$ (`50 ms`), entonces en todo momento hay $L = 100 \times 0.05 = 5$ peticiones concurrentes activas.
* Si por una degradación de MongoDB el tiempo de respuesta sube a $W = 2\text{ segundos}$, la concurrencia salta a $L = 100 \times 2 = 200$ peticiones simultáneas retenidas en memoria, lo que puede saturar el servidor si no aplicamos **Timeouts cortos y Fail-Fast**.

#### 4. Saturación y Punto de Quiebre (*Knee Point*)
Es el nivel de utilización de un recurso limitado (CPU al 100%, memoria RAM llena, pool de conexiones a MongoDB agotado o contención sobre el lock de un mismo producto en Redis).
* Mientras la carga está por debajo de la capacidad máxima, el *Throughput* crece linealmente y la *Latencia* se mantiene baja y constante.
* Al superar el **Punto de Quiebre (*Saturation Point*)**, las colas crecen exponencialmente: la latencia se dispara hacia el infinito y el throughput real cae por timeouts y reintentos (*Thrashing*).
* *Nuestra defensa contra la saturación:* En `inventory-service`, el lock de Redis usa modo **Fail-Fast** (`SET ... NX PX 5000`). Si otro proceso ya tiene bloqueado ese producto, no dejamos al hilo bloqueado en una cola infinita consumiendo RAM; respondemos inmediatamente `409 Conflict` en menos de `5 ms` para proteger la estabilidad del servidor.

#### 5. Tasa de Errores (*Error Rate*) y Disponibilidad (*Availability*)
* **Tasa de Errores:** Porcentaje de respuestas fallidas sobre el total de peticiones. Es fundamental distinguir entre:
  * **Errores 4xx (Cliente / Regla de Negocio):** `400 Bad Request` (stock agotado), `401 Unauthorized`, `403 Forbidden`, `409 Conflict` (colisión de concurrencia controlada). Indican que el sistema está sano y protegiendo sus invariantes.
  * **Errores 5xx (Fallo del Servidor / Infraestructura):** `500 Internal Server Error`, `503 Service Unavailable`. Indican degradación real de un nodo o dependencia.
* **Disponibilidad (SLA):** Porcentaje de tiempo en que el sistema está operativo:
  $$\text{Disponibilidad} = \frac{\text{MTBF (Tiempo Medio Entre Fallos)}}{\text{MTBF} + \text{MTTR (Tiempo Medio de Recuperación)}}$$
  * *99.9% ("Tres nueves"):* Permite máximo ~8.76 horas de caída al año.
  * *99.99% ("Cuatro nueves"):* Permite máximo ~52.6 minutos de caída al año.

#### 6. Los 4 Señales de Oro de Monitoreo (Google SRE) y Método RED
Si los profesores preguntan *"¿Qué métricas monitorearían en producción?"*, la respuesta estándar de la industria es:
1. **Latencia** (discriminando peticiones exitosas de fallidas, en percentiles $P50$, $P95$, $P99$).
2. **Tráfico / Throughput** (RPS / TPS).
3. **Errores** (tasa de respuestas `5xx` y timeouts).
4. **Saturación** (uso de CPU, RAM, disco y tiempo de espera del lock en Redis).

---

## 5. Seguridad del Sistema del Lado del Servidor (Server-Side Security)

Para asegurar nuestro sistema distribuido del lado del servidor aplicamos una estrategia de **Defensa en Profundidad (*Defense in Depth*)** en múltiples capas:

1. **Cifrado de Transporte (HTTPS / TLS):**
   * Las comunicaciones se cifran mediante TLS/SSL (implementado en el servidor con módulo `https` y certificado digital `.pfx` / TLS en el Gateway) para evitar ataques de intercepción (*Man-in-the-Middle* / *Sniffing*) donde un atacante en la red pueda leer contraseñas o robar tokens JWT en tránsito.

2. **Hashing Criptográfico de Contraseñas con `bcrypt`:**
   * En `user-service` **jamás se guardan contraseñas en texto plano**. Se utiliza `bcryptjs` con un factor de costo (*salt rounds* = 10) que agrega una sal aleatoria única por usuario. Incluso si un atacante obtuviera un volcado de `users_db`, no podría revertir los hashes ni usar *Rainbow Tables*.

3. **Autenticación Stateless con JWT (JSON Web Tokens - HS256):**
   * Al iniciar sesión en `/api/users/login`, el servidor firma un token JWT con una clave secreta del servidor (`JWT_SECRET`) y un tiempo de expiración (`expiresIn: '2h'`).
   * Si un cliente intenta modificar el payload del token (por ejemplo, cambiar `"role": "customer"` a `"role": "admin"`), la firma criptográfica HMAC-SHA256 deja de coincidir y el middleware `verifyToken` rechaza la petición con `401 Unauthorized`.

4. **Autorización Basada en Roles (RBAC) y Propiedad del Recurso (Anti-IDOR):**
   * **Autenticación (`401 Unauthorized`):** Verifica *quién eres* (token válido).
   * **Autorización (`403 Forbidden`):** Verifica *qué tienes permiso de hacer*.
   * Aplicamos el **Principio de Menor Privilegio**:
     * Un cliente (`customer`) puede ver productos y comprar, pero recibe `403 Forbidden` si intenta crear productos (`POST /api/inventory`) o listar todos los usuarios.
     * **Prevención de IDOR (*Insecure Direct Object Reference*):** En `GET /api/checkout/user/:userId`, validamos en el servidor que `req.user.id === req.params.userId` (o que sea `admin`). Así impedimos que un usuario autenticado cambie el ID en la URL para espiar las compras de otro cliente.

5. **Propagación Segura de Identidad entre Microservicios (Confianza Cero):**
   * Aunque `inventory-service` se comunique internamente con `checkout-service`, **no confía ciegamente en peticiones sin credenciales**. `checkout-service` propaga el encabezado `Authorization: Bearer <token>` original del usuario hacia `inventory-service`, el cual vuelve a verificar criptográficamente el JWT antes de descontar stock.

6. **Aislamiento de Red e Infraestructura en Docker:**
   * Todos los contenedores se comunican dentro de una red virtual bridge privada (`backend-net`).
   * En producción, los contenedores de bases de datos (`user-mongo`, `inventory-mongo`, `checkout-mongo`) y de caché (`inventory-redis`) **no publican puertos al exterior** (no llevan `-p` hacia Internet); solo son alcanzables desde adentro de `backend-net` por los microservicios autorizados.

7. **Protección de Secretos y Exclusión en Control de Versiones:**
   * Las claves privadas (`JWT_SECRET`), certificados (`.pfx`, `.pem`, `.key`), variables de entorno (`.env`) y bitácoras (`logs/`) están excluidos en [`.gitignore`](file:///c:/xampp/htdocs/ProyectosFacultad/BaseDatos2/programacionDistribuida/tp3/.gitignore) y `.dockerignore` para evitar fugas de credenciales en el repositorio o dentro de las imágenes Docker.

8. **Validación de Entradas y Operaciones Atómicas parametrizadas (Prevención de Inyección):**
   * Se valida que `quantity` sea un entero positivo mayor a cero (evitando el ataque clásico donde un usuario envía `quantity: -5` para "comprar" unidades negativas y sumarse stock o saldo).
   * Se utilizan esquemas estrictos de Mongoose para prevenir inyecciones NoSQL.

---

## 6. Preguntas de Alta Probabilidad de los Profesores sobre Nuestro Proyecto

### Pregunta 1: ¿Por qué el Lock de Redis está en `inventory-service` y NO en `checkout-service`?
**Respuesta:**
Por el principio de **Propiedad del Dato (*Data Ownership*) y Encapsulamiento** en arquitectura de microservicios (corregido específicamente a partir de la devolución de los TP5 y TP6):
1. `inventory-service` es el **único propietario de la base de datos de productos y stock (`inventory_db`)**.
2. Si el lock estuviera en `checkout-service`, la protección sería incompleta: si mañana agregamos otro servicio (por ejemplo, un servicio de ventas mayoristas o un ajuste manual de depósito) que llame a `POST /api/inventory/reduce`, podría descontar stock puenteando el lock de `checkout-service`.
3. Además, poner Redis en `checkout-service` generaba **acoplamiento de infraestructura**: obligaba a `checkout-service` a conocer detalles internos de cómo se sincroniza el inventario.
4. Al encapsular `inventory-redis` dentro de `inventory-service`, **cualquier petición** que intente modificar el stock pasa obligatoriamente por el lock distribuido (`lock:stock:{productId}`), garantizando la invariante `stock >= 0` en un único lugar.

---

### Pregunta 2: ¿Por qué para liberar el lock en Redis usan un Script Lua y no simplemente un `redis.del(lockKey)`?
**Respuesta:**
Porque hacer un `DEL` directo o un `GET` seguido de `DEL` desde Node.js genera una **condición de carrera (*Race Condition*)** si ocurre una pausa larga en el proceso:
1. Supongamos que el Proceso A adquiere el lock con un TTL de `5000 ms` (`PX 5000`), pero sufre una pausa de red o de Garbage Collection y tarda `6000 ms`.
2. A los `5000 ms`, el lock de A expira automáticamente en Redis (gracias al TTL que evita *deadlocks*).
3. A los `5100 ms`, el Proceso B adquiere legítimamente el lock para ese mismo producto con su propio `ownerId`.
4. A los `6000 ms`, el Proceso A se despierta y, si ejecutara `DEL` a ciegas, **le borraría el lock activo al Proceso B**, rompiendo la exclusión mutua.
5. Si hiciera primero un `GET` en Node.js y luego un `DEL`, justo entre el `GET` y el `DEL` el lock podría expirar.
Por eso ejecutamos un **Script Lua** dentro de Redis (`if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`). Como Redis ejecuta los scripts Lua de forma **100% atómica y single-threaded**, verificamos que el `ownerId` coincida y borramos la clave en un único paso indivisible.

---

### Pregunta 3: Si ya tienen el Lock Distribuido en Redis, ¿por qué además usan `findOneAndUpdate` con `{ stock: { $gte: quantity } }` en MongoDB?
**Respuesta:**
Por **Defensa en Profundidad** ante dos escenarios reales en sistemas distribuidos:
1. **Primera barrera (Redis Lock - Fail Fast):** Filtra en memoria RAM (`< 2 ms`) las ráfagas de peticiones concurrentes sobre un mismo producto, devolviendo `409 Conflict` inmediatamente sin golpear ni saturar el disco de MongoDB.
2. **Segunda barrera (Operación Atómica en MongoDB):** En un sistema distribuido, los relojes pueden desfasarse (*clock drift*) o un proceso puede demorarse más que el TTL del lock en Redis. Al ejecutar en MongoDB `Product.findOneAndUpdate({ _id: productId, stock: { $gte: quantity } }, { $inc: { stock: -quantity } })`, el motor de almacenamiento WiredTiger de MongoDB toma un bloqueo a nivel de documento y verifica atómicamente que el stock sea suficiente antes de restar. Esto garantiza que **jamás pueda quedar stock negativo (`stock < 0`)** bajo ninguna circunstancia.

---

### Pregunta 4: ¿Qué pasa en el sistema si se cae el contenedor `user-service`? ¿Se cae todo el sistema o los usuarios que ya tenían su token JWT pueden seguir comprando?
**Respuesta:**
Los usuarios que **ya habían iniciado sesión y poseen un token JWT válido pueden seguir consultando el inventario y realizando compras en `checkout-service` con total normalidad**, aunque `user-service` esté completamente caído.
* **¿Por qué?** Porque implementamos **autenticación stateless con JWT**. Ni `checkout-service` ni `inventory-service` necesitan hacer peticiones HTTP a `user-service` para validar un token; cada microservicio valida localmente la firma criptográfica del JWT usando la clave compartida `JWT_SECRET` y lee de su payload el `id` y el `role` del usuario.
* Lo único que deja de funcionar mientras `user-service` está caído es el registro de nuevos usuarios (`/register`) y la emisión de nuevos tokens (`/login`). Esto demuestra un **bajo acoplamiento temporal** entre `user-service` y el flujo crítico de compra.

---

### Pregunta 5: ¿Qué pasa si `checkout-service` logra descontar el stock en `inventory-service`, pero justo un milisegundo después se corta la red o falla el guardado de la orden en `checkout-mongo`? (Fallos Parciales)
**Respuesta:**
Ese es el problema clásico de las **transacciones distribuidas sin commit de dos fases (2PC)**: se produjo un efecto secundario en `inventory-service` (el stock bajó), pero la orden no llegó a registrarse en `checkout-service` o el cliente recibió un error de timeout y no sabe si su compra se procesó.
Para resolverlo en una arquitectura de microservicios existen dos mecanismos complementarios:
1. **Clave de Idempotencia (`Idempotency-Key`):** El cliente genera un UUID único por intención de compra y lo envía en el header. Si la red se corta en la respuesta y el cliente reintenta con el mismo UUID, el servidor detecta que la operación ya fue ejecutada y devuelve el resultado previo sin volver a descontar stock dos veces.
2. **Patrón Saga (Transacción Compensatoria):** Una Saga divide la transacción distribuida en una secuencia de transacciones locales. Si el Paso 1 (`POST /api/inventory/reduce`) tiene éxito pero el Paso 2 (`Order.save()` en `checkout-mongo`) falla, el orquestador (`checkout-service`) ejecuta automáticamente una **acción compensatoria** (`POST /api/inventory/compensate` o incrementar nuevamente el stock en `+quantity`) para deshacer el efecto del Paso 1 y alcanzar **consistencia eventual**.

---

### Pregunta 6: ¿Cómo se relaciona este proyecto con el Teorema CAP?
**Respuesta:**
El **Teorema CAP (Brewer)** establece que ante una **Partición de Red ($P$)** en un sistema distribuido, se debe elegir entre **Consistencia ($C$)** y **Disponibilidad ($A$)**:
* En el flujo de descuento de stock y compra (`inventory-service` + `checkout-service`), nuestro sistema prioriza la **Consistencia ($CP$)**:
  * Si `inventory-redis` o `inventory-mongo` no están disponibles o hay una partición de red entre `checkout-service` e `inventory-service`, preferimos **rechazar la operación devolviendo `503 Service Unavailable` o `409 Conflict`** antes que permitir que se venda un producto cuyo stock real no pudimos verificar ni bloquear (lo que provocaría sobreventa / *overselling*).
* En cambio, la validación de identidad mediante JWT prioriza la **Disponibilidad ($AP$)** frente a caídas de `user-service`, ya que los demás servicios pueden seguir operando con los tokens emitidos previamente.

---

### Pregunta 7: ¿Por qué en Docker Compose usamos nombres como `http://inventory-service:3001` o `redis://inventory-redis:6379` en lugar de `localhost`?
**Respuesta:**
Porque cada contenedor de Docker posee su **propio espacio de nombres de red (*Network Namespace*) aislado**, con su propia interfaz de loopback (`127.0.0.1` / `localhost`).
* Si dentro del contenedor `checkout-service` hiciéramos una petición a `http://localhost:3001`, el contenedor intentaría conectarse al puerto `3001` **de sí mismo** (donde no corre el inventario) y daría error `ECONNREFUSED`.
* Al conectar todos los contenedores a la red definida por el usuario `backend-net` en `docker-compose.yml`, el **servidor DNS interno embebido de Docker** resuelve automáticamente el nombre de cada servicio (`inventory-service`, `inventory-redis`, `inventory-mongo`) a la dirección IP privada interna actual de ese contenedor dentro de la red virtual.

---

### Pregunta 8: ¿Qué diferencia semántica hay entre los códigos HTTP `400`, `401`, `403`, `409` y `503` que devuelve el proyecto?
**Respuesta:**
* **`400 Bad Request`:** La petición tiene datos inválidos o viola una regla de negocio sobre el estado actual (por ejemplo, intentar comprar `quantity: 10` cuando solo quedan `2` unidades disponibles: *"Stock insuficiente"*).
* **`401 Unauthorized`:** Fallo de **Autenticación**. El cliente no envió un token JWT, el token expiró o su firma criptográfica es inválida.
* **`403 Forbidden`:** Fallo de **Autorización**. El servidor sabe perfectamente quién es el usuario (el JWT es válido), pero su rol (`customer`) no tiene permisos para esa acción (ej. crear un producto de catálogo) o intenta acceder a órdenes de otro usuario (protección Anti-IDOR).
* **`409 Conflict`:** Conflicto de **Concurrencia**. El recurso está siendo modificado en ese mismo instante por otra transacción que posee el lock distribuido en Redis (`lock:stock:{productId}`). Indica al cliente que puede reintentar la operación unos milisegundos después.
* **`503 Service Unavailable`:** Fallo parcial o degradación de **Infraestructura**. Por ejemplo, `checkout-service` está vivo pero no pudo comunicarse con `inventory-service` por timeout (`3000 ms`) o caída del contenedor, o `inventory-service` tiene su servidor Redis desconectado.
