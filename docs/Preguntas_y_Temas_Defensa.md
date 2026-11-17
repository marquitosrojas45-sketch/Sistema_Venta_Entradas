# Guía de Estudio y Defensa Oral: Preguntas, Vocabulario y Temas Clave

Este documento contiene un **Diccionario en Lenguaje Simple** (para entender cada palabra técnica sin conocimientos previos) seguido de todas las **preguntas y temas de defensa** con el significado de cada término incluido dentro de cada pregunta.

---

## 0. Diccionario Rápido en Lenguaje Simple (Qué significa cada palabra técnica)

Antes de leer las preguntas, acá tenés qué significa cada término en palabras simples y con ejemplos de la vida real:

* **Concurrencia:** Cuando dos o más personas intentan hacer algo **al mismo tiempo** (por ejemplo, dos clientes haciendo clic en "Comprar" en el mismo milisegundo por la última entrada).
* **Condición de Carrera (*Race Condition*):** El error que ocurre cuando dos procesos compiten al mismo tiempo sin orden. Ejemplo: queda `1` entrada; el Cliente A y el Cliente B leen al mismo tiempo que queda `1`, a los dos les da "sí alcanza" y el sistema vende `2` entradas cuando solo había `1` (**sobreventa**).
* **Exclusión Mutua (*Mutex*):** La regla de que **"solo uno puede pasar a la vez"** a modificar un dato sensible (como el stock). Mientras uno está descontando la entrada, los demás esperan o reciben aviso de ocupado.
* **Lock (Cerrojo o Candado):** Es el "pestillo de la puerta del baño". Cuando una petición entra a descontar stock, **cierra el pestillo (toma el Lock)**. Si viene otra petición un milisegundo después, ve la puerta cerrada con llave y no puede entrar hasta que el primero termine y abra el pestillo (**libere el Lock**).
* **Redis:** Es un programa que guarda datos **directamente en la memoria RAM** (en vez del disco duro), por lo que es miles de veces más rápido. En nuestro proyecto **no guarda usuarios ni catálogo permanente** (eso lo hace MongoDB), sino que funciona como el **"portero con los candados (Locks)"** para saber qué producto se está comprando en este instante.
* **TTL (*Time To Live* / Tiempo de Vida):** Es un **temporizador de autodestrucción** que le ponemos al candado (en nuestro proyecto: `5000 ms` = 5 segundos). ¿Para qué sirve? Si el servidor que cerró el candado se apaga o se tilda antes de abrirlo, a los 5 segundos Redis rompe el candado solo para que el producto no quede trabado para siempre (*Deadlock*).
* **Deadlock (Bloqueo Eterno):** Cuando alguien pone un candado, se cae o se cuelga sin abrirlo, y nadie más puede volver a comprar ese producto nunca más. Lo evitamos gracias al **TTL de 5 segundos**.
* **Operación Atómica:** Una acción que se hace **toda entera de un solo golpe indivisible, o no se hace nada** (nadie se puede meter en el medio).
* **Script Lua:** **Lua** es un mini-lenguaje de programación liviano que vive **adentro de Redis**. Un **Script Lua** son 2 o 3 líneas de código que le mandamos a Redis para que las ejecute **de forma atómica (sin que nadie se meta en el medio)**. Lo usamos para decirle a Redis: *"Fijate si este candado es mío y, si es mío, borralo en un solo paso"*.
* **UUID / `ownerId`:** Es un código único al azar (como una patente o huella digital, ej. `a8f3-49b1...`) que inventa cada petición al poner un candado en Redis, para demostrar después que **ella es la verdadera dueña** de ese candado al querer abrirlo.
* **`findOneAndUpdate` (en MongoDB):** Una instrucción de MongoDB que **busca el producto, verifica que tenga stock mayor a 0 (`$gt: 0`) y le resta 1 (`$inc: -1`) en un solo paso atómico**.
* **Stateless (Sin Estado):** Significa que el servidor **no guarda en su memoria RAM quién está conectado**. En vez de anotar en una libreta interna qué usuario inició sesión, el servidor le entrega al usuario un "pase firmado" (**Token JWT**) y el usuario lo muestra en cada pedido.
* **JWT (*JSON Web Token*):** Es como **la pulsera VIP o entrada con sello criptográfico** que te dan en la puerta (`user-service` al hacer Login). Adentro dice tu ID de usuario y tu rol (`USER` o `ADMIN`) y lleva una firma secreta (`HS256`). Con mostrar esa pulsera en `checkout-service` o `inventory-service`, ya saben quién sos sin tener que llamar por teléfono a `user-service`.
* **Hashing (`bcrypt`) y Sal (*Salt*):** Es transformar una contraseña (ej. `"123456"`) en un código irreversible (ej. `"$2b$10$X9k..."`) antes de guardarla en la base de datos. **Nunca se puede volver atrás** de un hash a la contraseña original. La **Sal** es texto aleatorio que se le mezcla antes de encriptar para que dos usuarios con la misma clave tengan hashes totalmente distintos.
* **RBAC (*Role-Based Access Control* / Control de Acceso por Roles):** Dar permisos según el **rol** del usuario. En nuestro proyecto hay dos roles: **`USER`** (cliente común que compra) y **`ADMIN`** (administrador que puede crear o cambiar el stock y borrar usuarios).
* **Propiedad del Recurso (Anti-IDOR):** Regla de seguridad que dice que un usuario común (`USER`) solo puede ver **su propio perfil** (`GET /api/usuarios/:id` cuando `:id` es el suyo), pero si pone el ID de otro cliente en la URL, el servidor lo bloquea con `403 Forbidden`.
* **Fallo Parcial:** En un sistema con varios servidores, cuando **una parte funciona y otra parte falla a mitad de camino** (por ejemplo: `inventory-service` llegó a restar la entrada en su base de datos, pero justo se cortó el cable de red y `checkout-service` nunca se enteró de que salió bien).
* **Idempotencia (`Idempotency-Key`):** Propiedad por la cual si un cliente manda **dos veces seguidas exactamente el mismo pedido** (porque se le cortó Internet y reintentó), el sistema reconoce que ya lo procesó y **no le cobra ni le descuenta dos veces la entrada**.
* **Patrón Saga (Transacción Compensatoria):** Cuando una operación pasa por varios microservicios y falla el último paso, como no se puede hacer un `ROLLBACK` común de una sola base de datos, el sistema ejecuta una **acción inversa ("deshacer")** (por ejemplo: volver a sumar `+1` al stock que había restado).
* **Timeout y `AbortController`:** Un cronómetro máximo de espera (en `checkout-service` es de **3 segundos / `3000 ms`**). Si `inventory-service` no responde en 3 segundos, Checkout corta la llamada para no quedarse colgado esperando para siempre.
* **Healthcheck (Chequeo de Salud):** Un control automático que hace Docker cada 10 segundos llamando a `/health` para saber si un contenedor y su base de datos están vivos y listos para trabajar.

---

## 1. Docker, Contenedores y Virtualización

### 1.1. ¿Cuál es la diferencia entre una Imagen y un Contenedor?

* **Imagen de Docker (El Molde o Receta — Solo Lectura):**
  Es un paquete estático e inmutable (no cambia) que guarda todo lo necesario para que el programa funcione: el código fuente, Node.js, las librerías (`node_modules`) y la configuración base. Se crea a partir del archivo `Dockerfile`.
  * *Ejemplo fácil:* La **Imagen** es el **plano de una casa** o el **instalador `.exe`** guardado en el disco.

* **Contenedor de Docker (El Programa Corriendo en Vivo):**
  Es una **instancia en ejecución** creada a partir de una imagen. Cuando ejecutamos una imagen, Docker le agrega una capa temporal de memoria y la pone a correr como un proceso aislado.
  * *Ejemplo fácil:* El **Contenedor** es la **casa ya construida y habitada** (o la ventana del programa abierto en memoria RAM). A partir de **1 sola Imagen** podemos levantar **10 Contenedores iguales** corriendo al mismo tiempo.

---

### 1.2. ¿Cuál es la diferencia entre Virtualización Tradicional (Máquinas Virtuales) y Contenedores (Dockerización)?

* **¿Qué es el Kernel (Núcleo)?** Es el corazón del Sistema Operativo (Windows o Linux) que maneja el procesador, la memoria RAM y el disco físico.
* **¿Qué es un Hipervisor?** Es el programa (como VirtualBox o VMware) que sirve para crear Máquinas Virtuales falsificando hardware completo.

| Característica | Virtualización Tradicional (Máquinas Virtuales - VM) | Dockerización / Contenedores |
| :--- | :--- | :--- |
| **¿Qué virtualiza?** | **Virtualiza el Hardware completo** (crea una PC ficticia entera con placa madre, disco y RAM virtual). | **Virtualiza a nivel de Sistema Operativo** (solo aísla un proceso o aplicación, sin inventar una PC entera). |
| **Sistema Operativo** | Cada Máquina Virtual instala **su propio Sistema Operativo completo** desde cero (pesa muchos GB). | Todos los contenedores **comparten el mismo Kernel del Sistema Operativo de la máquina física**, sin repetir el sistema operativo. |
| **Peso en disco** | **Gigabytes (5 GB a 20 GB)** por cada Máquina Virtual. | **Megabytes (40 MB a 150 MB)** porque solo lleva la aplicación y sus librerías. |
| **Tiempo de encendido** | **Lento (minutos):** tiene que encender todo un Windows o Linux entero. | **Instantáneo (1 a 2 segundos):** solo arranca el proceso `node index.js`. |
| **Consumo de memoria RAM** | **Muy alto:** desperdicia gigas de RAM manteniendo varios sistemas operativos repetidos. | **Mínimo:** casi toda la RAM va directo a nuestro código. |

---

### 1.3. Comandos Esenciales de Docker (Ciclo de Vida Completo)

#### A. Descargar una imagen (`docker pull`)
Baja el "molde" desde Internet (Docker Hub) a tu computadora, sin ejecutarlo todavía:
```bash
# Descargar la imagen oficial de Redis
docker pull redis:7-alpine

# Descargar la imagen oficial de MongoDB
docker pull mongo:7

# Ver todas las imágenes descargadas en tu PC
docker images
```

#### B. Crear nuestra propia imagen desde nuestro código (`docker build`)
Lee el archivo `Dockerfile` de nuestra carpeta y empaqueta nuestro microservicio en una imagen nueva:
```bash
# Construir la imagen de inventory-service y ponerle nombre (-t)
docker build -t inventory-service:1.0 ./inventory-service
```

#### C. Crear y ejecutar un contenedor (`docker run`)
Toma una imagen, crea un contenedor nuevo y lo deja corriendo:
```bash
# Levantar Redis en segundo plano (-d), con nombre (--name) y abriendo su puerto (-p)
docker run -d --name mi-redis -p 6379:6379 redis:7-alpine
```
*Significado de cada opción de `docker run`:*
* `-d`: lo corre de fondo (*detached*) para que puedas seguir usando la terminal.
* `--name`: le pone un nombre fácil de recordar al contenedor.
* `-p 3001:3001`: conecta el puerto `3001` de tu PC con el puerto `3001` adentro del contenedor.
* `-e CLAVE=VALOR`: le pasa una variable de entorno (como la contraseña o URL de la base).
* `-v`: conecta una carpeta permanente (*Volumen*) para que los datos de la base no se borren al apagar el contenedor.

#### D. Ver qué contenedores están prendidos o apagados (`docker ps`)
```bash
# Ver solo los contenedores que están corriendo ahora
docker ps

# Ver TODOS (incluyendo los que se apagaron)
docker ps -a
```

#### E. Detener (bajar) y volver a prender un contenedor (`docker stop` / `docker start`)
```bash
# Apagar el contenedor (NO lo borra, solo lo pausa/apaga)
docker stop mi-redis

# Volver a prender ese mismo contenedor apagado
docker start mi-redis
```

#### F. Borrar / eliminar un contenedor (`docker rm`)
Destruye el contenedor (la imagen o "molde" sigue guardada en la PC):
```bash
# Primero se detiene y luego se borra
docker stop mi-redis
docker rm mi-redis

# O se fuerza el borrado directo con -f (force)
docker rm -f mi-redis
```

#### G. Borrar / eliminar una imagen (`docker rmi`)
Borra el "molde" del disco duro. *(Nota: primero hay que borrar los contenedores que usen esa imagen con `docker rm`)*:
```bash
docker rmi inventory-service:1.0
```

#### H. Comandos con `docker compose` (El que usamos en nuestro proyecto)
En vez de tirar 6 comandos `docker run` a mano, usamos `docker-compose.yml` para levantar los 6 contenedores del proyecto juntos:
```bash
# Construir imágenes y levantar los 6 contenedores en segundo plano
docker compose up -d --build

# Ver si los 6 contenedores están "healthy" (sanos)
docker compose ps

# Apagar y borrar los contenedores, pero CONSERVANDO los datos de MongoDB
docker compose down

# Apagar y borrar contenedores Y TAMBIÉN borrar los volúmenes de datos (-v)
docker compose down -v
```

---

## 2. Algoritmo de Consenso RAFT (Tema Teórico del TP4 — No incluido en el código del proyecto)

### 2.1. ¿Qué es el algoritmo de consenso RAFT? (Explicado simple)
* **¿Qué significa "Consenso"?** Que varios servidores separados se pongan de acuerdo en cuál es el dato verdadero aunque alguno de ellos se desconecte o falle.
* **¿Cómo funciona RAFT?** Elige a **1 servidor como Líder** y los demás son **Seguidores**:
  1. **Leader (Líder):** Es el único que recibe los cambios de los clientes, los anota en su bitácora (*Log*) y les avisa a los seguidores. Además, manda señales de vida (*Heartbeats* / latidos) todo el tiempo diciendo *"Sigo vivo"*.
  2. **Follower (Seguidor):** Copia lo que le manda el Líder. Si deja de escuchar al Líder por unos milisegundos, asume que el Líder murió y pasa a ser **Candidato**.
  3. **Candidate (Candidato):** Pide votos a sus compañeros. Si consigue el voto de la **mayoría (la mitad más uno, llamado Quórum)**, por ejemplo **2 de 3 servidores** o **3 de 5 servidores**, se convierte en el nuevo Líder.

### 2.2. ¿Se incluye RAFT en el código de nuestro proyecto (TP5, TP6 o TP7)?
* **No.** El **TP4 (Consenso RAFT)** fue un trabajo práctico teórico aparte y **no se programa dentro de nuestro proyecto** (nuestro proyecto va del TP1 $\rightarrow$ TP2 $\rightarrow$ TP3 $\rightarrow$ TP5 $\rightarrow$ TP6 $\rightarrow$ TP7).
* **¿Cómo coordinamos la concurrencia en nuestro proyecto entonces?** En nuestro proyecto usamos el **Lock Distribuido en Redis** (del TP2/TP6) dentro de `inventory-service`.
* **¿Dónde aparecería RAFT si llevamos el proyecto a gran escala?** Adentro de herramientas como **MongoDB Replica Sets** (cuando ponés 3 servidores de MongoDB juntos, ellos usan RAFT por dentro para elegir cuál es el MongoDB principal si uno se apaga) o adentro de **Kubernetes / Docker Swarm**.

---

## 3. ¿Qué usaríamos para subir nuestro proyecto a Producción (En la Nube)?

Si nos preguntan *"Hoy lo tienen corriendo en su notebook con Docker Compose; ¿qué herramientas usarían para subirlo a Internet para miles de usuarios reales?"*:

1. **Dónde guardar las Imágenes Docker (*Container Registry*):**
   * **Docker Hub**, **GitHub Container Registry** o **AWS ECR** (es como el "Google Drive" donde se suben las imágenes compiladas de nuestros 3 microservicios).
2. **Dónde correr los Contenedores de los 3 Microservicios:**
   * **Google Cloud Run**, **AWS ECS (Fargate)** o **Kubernetes**. Estas plataformas toman nuestras imágenes Docker y, si entran 10.000 personas a comprar entradas, crean automáticamente más copias de `checkout-service` e `inventory-service`.
3. **Dónde correr las Bases de Datos y Redis (Servicios Administrados):**
   * **MongoDB Atlas:** En producción no se guarda la base de datos en un contenedor suelto, sino en un servicio en la nube con copias de seguridad automáticas y 3 nodos replicados.
   * **Redis Cloud / AWS ElastiCache:** Un Redis administrado en la nube de alta disponibilidad para los locks de stock.
4. **Puerta de Entrada Segura (API Gateway / Balanceador con HTTPS):**
   * **NGINX**, **Cloudflare** o **AWS Load Balancer** adelante de todo con certificado **HTTPS (puerto 443)** para que nadie desde Internet vea los puertos internos `3000`, `3001` y `3002`.
5. **Automatización de Subida (CI/CD con GitHub Actions):**
   * Configurar **GitHub Actions** para que cada vez que subimos código a GitHub corra automáticamente `npm test` y, si las 22 pruebas pasan, actualice el servidor solo.

---

## 4. Métricas y Escalabilidad (Con Vocabulario Simple)

### 4.1. Escalabilidad Vertical vs. Escalabilidad Horizontal
* **¿Qué es Escalar?** Hacer que el sistema soporte muchísimos más usuarios sin ponerse lento ni caerse.
* **1. Escalabilidad Vertical (*Scale Up* — "Agrandar la misma máquina"):**
  * Ponerle más memoria RAM y un procesador más grande a **un solo servidor**.
  * *Problema:* Llega un límite en que no existe una PC más grande, es carísimo y si esa única máquina se apaga, se cae todo el sistema (*Punto Único de Fallo*).
* **2. Escalabilidad Horizontal (*Scale Out* — "Sumar más máquinas en paralelo"):**
  * En vez de tener 1 contenedor gigante, ponemos **5 o 10 contenedores iguales** trabajando a la par y repartiendo las compras.
  * **¿Por qué nuestro proyecto puede escalar horizontalmente sin problemas?**
    1. Porque usamos **JWT (Stateless)**: ningún contenedor guarda sesiones en su propia memoria, así que cualquier copia puede atender a cualquier usuario.
    2. Porque el **Lock de stock está en Redis (`inventory-redis`)** y no en una variable interna de Node.js: si levantamos 5 copias de `inventory-service`, las 5 consultan al mismo Redis central y ninguna sobrevende.

---

### 4.2. Las Métricas Clave que hay que saber explicar

1. **Latencia (Tiempo de Respuesta):**
   * Es **cuántos milisegundos tarda un pedido** desde que el cliente hace clic en "Comprar" hasta que recibe la respuesta.
   * **¿Por qué medimos Percentiles ($P50, P95, P99$) en vez del Promedio?**
     Porque el promedio miente: si 99 clientes tardan `10 ms` y 1 cliente tarda `5000 ms`, el promedio da `60 ms` y parece que todo anda rápido, pero a ese 1% le anduvo pésimo.
     * **$P95$ (Percentil 95):** Significa que el **95% de los usuarios** recibió respuesta en menos de ese tiempo.
     * **$P99$ (Percentil 99):** Mide a los casos más lentos (el 1% más lento).

2. **Throughput (Caudal o Rendimiento):**
   * Es **cuántas operaciones por segundo** logra atender el sistema (por ejemplo: `200 peticiones por segundo - RPS` o `50 compras por segundo - TPS`).

3. **Concurrencia y la Ley de Little ($L = \lambda \times W$):**
   * **Concurrencia ($L$):** Cuántos pedidos están adentro del servidor **al mismo tiempo**.
   * **Ley de Little:** $\text{Pedidos Simultáneos } (L) = \text{Pedidos por segundo } (\lambda) \times \text{Tiempo que tarda cada pedido } (W)$.
   * *Qué significa en simple:* Si cada compra es rapidísima (`0.05 seg`), hay poquitos pedidos acumulados en memoria. Pero si MongoDB se pone lento (`2 seg` por compra), los pedidos se empiezan a amontonar adentro del servidor como una fila en un peaje y saturan la memoria RAM.

4. **Saturación y Modo *Fail-Fast* (Fallar Rápido):**
   * **Saturación:** Cuando la CPU, la RAM o las conexiones llegan al 100% y se forma una fila interminable de pedidos.
   * **Cómo lo evitamos (*Fail-Fast*):** En `inventory-service`, cuando alguien intenta comprar una entrada que otro usuario está bloqueando en ese mismo milisegundo en Redis, **no lo dejamos haciendo fila en memoria**; le respondemos en el acto (`< 2 ms`) un código **`409 Conflict`** (*"recurso ocupado, intentá de nuevo"*). Así el servidor nunca se satura.

5. **Disponibilidad (SLA):**
   * Es el porcentaje del año que el sistema está encendido y funcionando sin caídas (por ejemplo, **99.9%** significa que en todo el año estuvo caído menos de 9 horas en total).

---

## 5. Seguridad del Sistema del Lado del Servidor

Si preguntan *"¿Qué medidas tomaron en el servidor para que el sistema sea seguro?"*, son estas **7 capas concretas**:

1. **Contraseñas Encriptadas con `bcrypt` (Nunca texto plano):**
   * En `user-service`, al registrarse un usuario, su clave pasa por `bcrypt.hash(password, 10)`. En la base `users-db` solo se guarda el hash irreversible (`passwordHash`). Además, configuramos el esquema para que al devolver un usuario por JSON borre automáticamente el campo `passwordHash`.
2. **Tokens JWT firmados con clave secreta (`HS256`):**
   * Al iniciar sesión (`POST /auth/login`), `user-service` firma un token con `JWT_SECRET` y vencimiento (`1h`). Si alguien intenta tocar el contenido del token para cambiarse el rol de `USER` a `ADMIN`, la firma se invalida y los servidores lo rechazan con **`401 Unauthorized`**.
3. **Permisos por Rol (`RBAC` — `USER` vs. `ADMIN`):**
   * Diferenciamos **Autenticación** (*¿quién sos?* -> `401`) de **Autorización** (*¿tenés permiso para hacer esto?* -> `403`).
   * Solo el rol **`ADMIN`** puede cargar o modificar stock (`POST /api/inventario/stock`), ver la lista de todos los usuarios o borrar cuentas. Si un **`USER`** lo intenta, rebota con **`403 Forbidden`**.
4. **Propiedad del Recurso (Anti-IDOR):**
   * En `GET /api/usuarios/:id`, el servidor comprueba que el ID del token sea igual al ID buscado (`req.user.sub === req.params.id`) salvo que sea `ADMIN`. Así un cliente no puede espiar los datos de otro cliente cambiando el número en la URL.
5. **Propagación del Token entre Microservicios (Confianza Cero):**
   * Cuando el cliente llama a `checkout-service` (`POST /api/comprar`), Checkout valida el token JWT y **se lo reenvía en el encabezado `Authorization: Bearer <token>` a `inventory-service`**, quien vuelve a validar la firma y el rol antes de descontar la entrada.
6. **Bases de Datos Ocultas en Red Interna de Docker (`backend-net`):**
   * En `docker-compose.yml`, los contenedores `users-db` (MongoDB), `inventory-db` (MongoDB) e `inventory-redis` (Redis) **no tienen puertos abiertos hacia afuera (`ports`)**. Nadie desde afuera puede conectarse directo a las bases; solo pueden hablarles nuestros microservicios desde adentro de la red privada `backend-net`.
7. **Limpieza de Secretos y Certificados (`.gitignore` y `.dockerignore`):**
   * Las claves secretas van en `.env` (no subido a Git) y retiramos del repositorio los certificados `.pfx` y archivos `.log`.

---

## 6. Las 8 Preguntas Clave de los Profesores (Con Vocabulario Explicado en Cada Una)

---

### Pregunta 1: ¿Por qué el Lock de Redis está en `inventory-service` y NO en `checkout-service`?

> **Palabras clave de esta pregunta (qué significa cada cosa):**
> * **Lock (Cerrojo):** Es el bloqueo temporal de 5 segundos que ponemos cuando alguien está comprando una entrada para que otra persona no pueda descontar la misma entrada al mismo tiempo.
> * **Redis (`inventory-redis`):** Es la base de datos ultrarrápida en memoria RAM donde guardamos ese cerrojo (`lock:producto:Entrada_Conferencia`).
> * **`inventory-service`:** Nuestro microservicio que maneja el catálogo y el stock de entradas (puerto `3001`).
> * **`checkout-service`:** Nuestro microservicio que recibe la orden de compra del cliente (puerto `3002`).
> * **Propiedad del Dato (*Data Ownership*) y Encapsulamiento:** Regla de arquitectura que dice que **el servicio que es dueño de un dato (el stock) es el único que debe protegerlo y modificarlo**.

**Respuesta para dar al profesor:**
Porque en una arquitectura de microservicios se debe respetar la **Propiedad del Dato y el Encapsulamiento** (que fue la corrección principal que aplicamos de las devoluciones del TP5 y TP6):
1. **`inventory-service` es el único dueño del stock** (es el dueño de la base `inventory-db`). Por lo tanto, la lógica de concurrencia que protege ese stock tiene que vivir adentro de `inventory-service`.
2. Si el Lock de Redis estuviera en `checkout-service`, `checkout-service` estaría acoplado a cómo funciona por dentro el inventario. Además, si mañana agregamos otro servicio que también llame a `PUT /api/inventario/reducir`, podría descontar stock saltándose el bloqueo de Checkout.
3. Al poner Redis adentro de `inventory-service`, **cualquier pedido que quiera restar stock pasa obligatoriamente por el Lock**, asegurando en un único lugar que el stock jamás quede negativo.

---

### Pregunta 2: ¿Por qué para liberar el lock en Redis usan un Script Lua y no simplemente un `redis.del(lockKey)`?

> **Palabras clave de esta pregunta (qué significa cada cosa):**
> * **Liberar el lock:** Abrir y borrar el candado en Redis cuando ya terminamos de descontar la entrada en MongoDB, para que el siguiente comprador pueda comprar.
> * **`redis.del(lockKey)`:** Es el comando básico de Redis que borra una clave directamente sin preguntar de quién es.
> * **TTL (`5000 ms`):** El tiempo máximo de 5 segundos que dura el candado antes de borrarse solo si el proceso se demora.
> * **`ownerId` (UUID):** El número de identificación único que inventa cada compra al poner su candado (para saber "este candado lo puse yo").
> * **Script Lua:** Una mini-instrucción que se ejecuta **adentro de Redis en un solo paso indivisible (atómico)**. Nuestro script dice: *"Si el candado todavía tiene mi `ownerId`, borralo; si tiene el `ownerId` de otro, no lo toques"*.

**Respuesta para dar al profesor:**
Porque si usáramos un `DEL` común a ciegas, podríamos **borrar por error el candado de otro comprador** si nuestra petición sufrió una demora:
1. Imaginemos que la **Compra A** pone el candado en Redis con un tiempo de vida (TTL) de **5 segundos**, pero por una traba de red tarda **6 segundos** en terminar.
2. A los **5 segundos**, como venció el tiempo, Redis borra automáticamente el candado de A.
3. A los **5.1 segundos**, entra la **Compra B** y pone legítimamente **su propio candado** sobre el mismo producto.
4. A los **6 segundos**, la Compra A termina y, si ejecutara un `redis.del()` común sin mirar de quién es el candado actual, **le borraría el candado activo a la Compra B**, dejando el stock desprotegido.
5. Por eso usamos un **Script Lua** en el bloque `finally`: como Redis ejecuta el Script Lua **en un solo paso atómico**, primero comprueba que el `ownerId` guardado en Redis siga siendo el suyo y recién ahí lo borra.

---

### Pregunta 3: Si ya tienen el Lock en Redis, ¿por qué además usan `findOneAndUpdate` con `{ stock: { $gt: 0 } }` en MongoDB?

> **Palabras clave de esta pregunta (qué significa cada cosa):**
> * **`findOneAndUpdate`:** Función de MongoDB que busca un documento y lo actualiza en **una sola operación atómica** (nadie puede meterse entre la búsqueda y la resta).
> * **`stock: { $gt: 0 }`:** Condición de MongoDB (`$gt` = *Greater Than* / Mayor que cero). Significa: *"Solo restale 1 al stock si en este instante el stock es mayor a 0"*.
> * **`$inc: { stock: -1 }`:** Instrucción de MongoDB que resta `1` unidad al valor actual de `stock`.

**Respuesta para dar al profesor:**
Porque aplicamos **doble barrera de seguridad (Defensa en Profundidad)**:
1. **Primera barrera (El Lock en Redis — Velocidad y Fail-Fast):** Ataja en memoria RAM (`< 1 ms`) a todas las compras simultáneas repetidas y les devuelve `409 Conflict` enseguida, evitando que 500 peticiones al mismo tiempo golpeen y saturen el disco duro de MongoDB.
2. **Segunda barrera (`findOneAndUpdate` con `stock > 0` en MongoDB — Garantía Final):** Si por alguna demora extrema de red el Lock de 5 segundos en Redis llegara a expirar antes de tiempo, la condición atómica `{ stock: { $gt: 0 } }` en MongoDB asegura a nivel de base de datos que **jamás se pueda restar si el stock ya llegó a `0`**, haciendo imposible tener stock negativo.

---

### Pregunta 4: ¿Qué pasa si se cae o se apaga `user-service`? ¿Se cae todo el sistema o los usuarios que ya iniciaron sesión pueden seguir comprando?

> **Palabras clave de esta pregunta (qué significa cada cosa):**
> * **`user-service`:** El microservicio del puerto `3000` donde los usuarios se registran (`/auth/register`) e inician sesión (`/auth/login`).
> * **Token JWT:** El "pase digital firmado" que `user-service` le dio al usuario cuando hizo Login (dura 1 hora).
> * **Verificación Stateless (Sin Estado):** Capacidad que tienen `checkout-service` e `inventory-service` de verificar por su propia cuenta si la firma del JWT es auténtica usando la clave secreta `JWT_SECRET`, sin tener que preguntarle nada a `user-service`.

**Respuesta para dar al profesor:**
**No se cae el sistema de ventas:** todos los usuarios que ya habían iniciado sesión y tienen su **Token JWT vigente pueden seguir viendo el catálogo y comprando entradas con total normalidad** aunque `user-service` esté apagado.
* **¿Por qué?** Porque la autenticación con **JWT es Stateless (sin estado)**. Cuando el cliente manda su compra a `checkout-service`, tanto `checkout-service` como `inventory-service` verifican la firma del token en su propia memoria usando `JWT_SECRET`, sin hacer ninguna llamada de red a `user-service`.
* Lo único que no se va a poder hacer mientras `user-service` esté apagado es registrar usuarios nuevos o hacer logins nuevos.

---

### Pregunta 5: ¿Qué pasa si `checkout-service` manda a descontar la entrada en `inventory-service`, el stock se descuenta bien, pero justo se corta la red antes de que vuelva la respuesta? (Fallos Parciales)

> **Palabras clave de esta pregunta (qué significa cada cosa):**
> * **Fallo Parcial:** Cuando una mitad de la operación se hizo (Inventory ya restó 1 entrada en MongoDB) pero la otra mitad falló (la respuesta `200 OK` se perdió en la red y Checkout cortó por el Timeout de 3 segundos devolviendo `503 Service Unavailable`).
> * **Inconsistencia:** El stock bajó de `1` a `0`, pero el usuario vio un mensaje de error en su pantalla y no sabe si compró o no.
> * **Clave de Idempotencia (`Idempotency-Key`):** Un código único por intento de compra para que, si el usuario vuelve a apretar "Comprar", el sistema no le descuente otra entrada sino que le devuelva el recibo de la que ya se había descontado.
> * **Patrón Saga (Compensación):** Un mecanismo automático donde, si Checkout detecta que la compra falló al final, le manda una orden inversa a Inventory (`reponer +1`) para devolver la entrada al stock.

**Respuesta para dar al profesor:**
Si se corta la red justo después de que `inventory-service` descontó el stock en MongoDB pero antes de que la respuesta llegue a `checkout-service`:
1. **Qué hace hoy nuestro código:** `checkout-service` espera máximo **3 segundos (`3000 ms`)** gracias al `AbortController`. Al no recibir respuesta, corta la espera, anota el fallo en el log de Winston y le responde al cliente **`503 Service Unavailable`** sin que el servidor se cuelgue.
2. **En qué estado queda:** Queda un **fallo parcial** (el stock se descontó en Inventory, pero el cliente recibió error `503`).
3. **Cómo se soluciona en una evolución productiva (lo que pide explicar el TP6):**
   * **Con Idempotencia (`Idempotency-Key`):** El cliente envía un ID único de intento de compra; cuando reintenta tras el error de red, Inventory ve que ese ID ya descontó stock y le confirma el éxito sin volver a restar.
   * **Con el Patrón Saga:** Si la orden no se puede completar en Checkout, se dispara una **transacción compensatoria** que vuelve a sumar `+1` al stock en Inventory.

---

### Pregunta 6: ¿Cómo se relaciona nuestro proyecto con el Teorema CAP?

> **Palabras clave de esta pregunta (qué significa cada cosa):**
> * **Teorema CAP:** Una ley de los sistemas distribuidos que dice que cuando hay un corte de comunicación en la red (**P = Partición**), tenés que elegir entre dos opciones:
>   * **C = Consistencia (*Consistency*):** Preferir que el dato sea 100% exacto siempre (aunque tengas que rechazar la venta hasta estar seguro del stock).
>   * **A = Disponibilidad (*Availability*):** Preferir responder siempre que sí al usuario aunque el dato pueda estar desactualizado.

**Respuesta para dar al profesor:**
* **En el descuento de stock y compras (`inventory-service` + `checkout-service`), nuestro sistema elige Consistencia (`CP`):**
  Si Redis o MongoDB de inventario se desconectan, preferimos **rechazar la compra con `503` o `409`** antes que vender a ciegas una entrada que no sabemos si existe (porque nuestra regla número uno es **cero sobreventas**).
* **En la validación de sesión con JWT, priorizamos Disponibilidad (`AP`):**
  Aunque `user-service` se desconecte, los demás servicios siguen aceptando los tokens JWT válidos emitidos antes del corte para que las ventas no se frenen.

---

### Pregunta 7: ¿Por qué en Docker Compose usamos `http://inventory-service:3001` o `redis://redis:6379` en vez de escribir `localhost`?

> **Palabras clave de esta pregunta (qué significa cada cosa):**
> * **`localhost` (o `127.0.0.1`):** En redes significa **"yo mismo"** (esta misma máquina o este mismo contenedor).
> * **Red `backend-net`:** Es la red virtual privada que creamos en `docker-compose.yml` donde están enchufados nuestros 6 contenedores.
> * **DNS interno de Docker:** Es como la "agenda telefónica automática" de Docker que traduce el nombre de un servicio (ej. `inventory-service`) a la dirección IP interna de ese contenedor.

**Respuesta para dar al profesor:**
Porque cada contenedor de Docker es como una **mini-computadora aislada**. Para un contenedor, la palabra `localhost` significa **"yo mismo"**:
* Si adentro del contenedor `checkout-service` pusiéramos `http://localhost:3001`, Checkout intentaría buscar el inventario **adentro de sí mismo** y fallaría la conexión.
* Como todos los contenedores están unidos a la red `backend-net` de Docker Compose, usamos el **nombre del servicio** (`http://inventory-service:3001`, `redis://redis:6379`, `mongodb://users-db:27017`) y el **DNS interno de Docker** lo dirige automáticamente al contenedor correcto.

---

### Pregunta 8: ¿Qué significa cada uno de los códigos HTTP (`200`, `201`, `400`, `401`, `403`, `404`, `409` y `503`) que devuelve nuestro proyecto?

> **Palabras clave de esta pregunta (qué significa cada cosa):**
> * **Código de estado HTTP:** Es el número de 3 cifras con el que el servidor resume qué pasó con el pedido:
>   * **2xx** = Salió todo bien.
>   * **4xx** = El pedido fue rechazado por culpa de los datos, permisos o colisión del cliente.
>   * **5xx** = Falló o no responde un servidor interno.

**Respuesta para dar al profesor:**
* **`200 OK` / `201 Created`:** Operación exitosa (compra realizada, login correcto o usuario nuevo registrado en `/auth/register`).
* **`400 Bad Request`:** Datos inválidos o **Stock agotado** (intentó comprar cuando `stock` ya es `0`: *"Stock insuficiente"*).
* **`401 Unauthorized` (Fallo de Autenticación — "¿Quién sos?"):** No mandó el Token JWT, el token ya venció o fue adulterado.
* **`403 Forbidden` (Fallo de Autorización — "Sé quién sos, pero no tenés permiso"):** Tiene un token válido de `USER`, pero quiso hacer algo exclusivo de `ADMIN` (como cambiar el stock) o quiso ver el perfil de otro usuario.
* **`404 Not Found`:** El producto o el usuario buscado no existe en la base de datos.
* **`409 Conflict` (Conflicto):** Se usa en dos casos clave:
  1. En **Inventario/Compras**: Otra persona está comprando ese mismo producto en este milisegundo y tiene tomado el **Lock en Redis**.
  2. En **Registro de Usuarios**: Intentó registrarse con un DNI o email que ya existe.
* **`503 Service Unavailable` (Servicio No Disponible):** `checkout-service` está prendido, pero `inventory-service` está caído o tardó más de los **3 segundos de Timeout**.
