# Contratos de Comunicación entre Microservicios

## 1. Introducción
Este documento especifica los contratos formales de comunicación HTTP/REST entre los tres microservicios del sistema de venta de entradas, incluyendo esquemas de solicitud, respuestas, propagación de credenciales JWT y códigos de estado HTTP.

---

## 2. Mapa de Puertos y Direccionamiento

| Microservicio | Puerto Host | Host Interno Docker | Base URL Interna |
| :--- | :---: | :---: | :--- |
| **User Service** | `3000` | `user-service:3000` | `http://user-service:3000` |
| **Inventory Service** | `3001` | `inventory-service:3001` | `http://inventory-service:3001` |
| **Checkout Service** | `3002` | `checkout-service:3002` | `http://checkout-service:3002` |

---

## 3. Contratos de API

### A. User Service (`port 3000`)

#### 1. Registro de Usuario: `POST /auth/register`
* **Acceso:** Público.
* **Request Body:**
  ```json
  {
    "nombre": "Carlos",
    "apellido": "Gómez",
    "dni": "33445566",
    "telefono": "2619998888",
    "mail": "carlos@email.com",
    "password": "MiClaveSegura123",
    "role": "USER"
  }
  ```
* **Respuestas:**
  * `201 Created`: Usuario creado (sin exponer `passwordHash`).
  * `400 Bad Request`: Datos obligatorios faltantes o contraseña menor a 6 caracteres.
  * `409 Conflict`: DNI o mail duplicado en el sistema.

#### 2. Inicio de Sesión: `POST /auth/login`
* **Acceso:** Público.
* **Request Body:**
  ```json
  {
    "mail": "carlos@email.com",
    "password": "MiClaveSegura123"
  }
  ```
* **Respuestas:**
  * `200 OK`: Retorna token JWT de acceso:
    ```json
    {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "tokenType": "Bearer",
      "expiresIn": "1h",
      "usuario": { "id": "67...", "mail": "carlos@email.com", "role": "USER" }
    }
    ```
  * `401 Unauthorized`: Credenciales inválidas.
  * `403 Forbidden`: Cuenta deshabilitada.

---

### B. Inventory Service (`port 3001`)

#### 1. Consulta de Catálogo: `GET /api/inventario`
* **Acceso:** Público.
* **Respuestas:**
  * `200 OK`: Array de productos con stock actual:
    ```json
    [
      { "_id": "67...", "producto": "Entrada Conferencia", "stock": 5 }
    ]
    ```

#### 2. Actualización de Stock (Reposición): `POST /api/inventario/stock`
* **Acceso:** Restringido (`ADMIN`). Requiere header `Authorization: Bearer <token>`.
* **Request Body:**
  ```json
  {
    "producto": "Entrada Conferencia",
    "stock": 10
  }
  ```
* **Respuestas:**
  * `200 OK`: Stock actualizado correctamente.
  * `401 Unauthorized`: Token ausente o expirado.
  * `403 Forbidden`: El rol no es ADMIN.
  * `400 Bad Request`: Parámetros inválidos.

#### 3. Reducción Concurrente de Stock: `PUT /api/inventario/reducir`
* **Acceso:** Autenticado (`USER`, `ADMIN`). Requiere header `Authorization: Bearer <token>`.
* **Request Body:**
  ```json
  {
    "producto": "Entrada Conferencia"
  }
  ```
* **Comportamiento Interno:** Adquiere lock temporal en Redis (`lock:producto:...`), decrementa stock atómicamente y libera el lock.
* **Respuestas:**
  * `200 OK`:
    ```json
    {
      "mensaje": "Stock reducido correctamente",
      "producto": "Entrada Conferencia",
      "stockRestante": 4,
      "usuarioAutenticado": "67..."
    }
    ```
  * `409 Conflict`: Lock temporal retenido por otra transacción simultánea:
    ```json
    { "error": "El recurso esta bloqueado por otra transaccion en curso en Inventario." }
    ```
  * `400 Bad Request`: `{ "error": "Stock insuficiente" }`.
  * `404 Not Found`: `{ "error": "Producto no encontrado" }`.
  * `401 Unauthorized` / `403 Forbidden`: Token ausente o rol insuficiente.

---

### C. Checkout Service (`port 3002`)

#### 1. Proceso de Compra: `POST /api/comprar`
* **Acceso:** Autenticado (`USER`, `ADMIN`). Requiere header `Authorization: Bearer <token>`.
* **Request Body:**
  ```json
  {
    "producto": "Entrada Conferencia"
  }
  ```
* **Propagación:** Invoca `PUT http://inventory-service:3001/api/inventario/reducir` propagando el mismo token de autorización y con un timeout de 3000ms.
* **Respuestas:**
  * `200 OK`: Compra completada con éxito.
  * `409 Conflict`: La compra no pudo completarse debido a que otra transacción concurrente retiene el lock en inventario.
  * `400 Bad Request`: Stock insuficiente para el producto indicado.
  * `401 / 403`: Error de credenciales o permisos insuficientes.
  * `503 Service Unavailable`: Timeout o caída de red al comunicarse con `inventory-service`.
