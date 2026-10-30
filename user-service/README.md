# User & Identity Service (`user-service`)

## Descripción
Microservicio encargado de la gestión integral de identidades, registro de clientes, autenticación y control de acceso basado en roles (RBAC). Actúa como la Autoridad de Emisión de Tokens JWT para todo el sistema distribuido.

## Tecnologías Principales
* **Node.js y Express.js**
* **MongoDB con Mongoose:** Persistencia de usuarios en base de datos independiente `tp6_usuarios`.
* **Bcryptjs:** Hashing unidireccional con sal de contraseñas (10 rondas de costo).
* **JsonWebToken:** Emisión de tokens firmados digitalmente (`HS256`) con tiempo de expiración configurable.
* **Winston:** Registro estructurado de eventos de autenticación y auditoría.
* **Swagger UI:** Documentación interactiva OpenAPI 3.0 en `/api-docs`.

## Puerto
* Por defecto: `3000` (configurable mediante `PORT`).

## Variables de Entorno
* `PORT`: Puerto de escucha del servidor HTTP (3000).
* `MONGODB_URI`: URL de conexión a MongoDB (`mongodb://users-db:27017/tp6_usuarios`).
* `JWT_SECRET`: Clave simétrica para la firma y verificación de tokens.
* `JWT_EXPIRES_IN`: Tiempo de validez del token emitido (ej. `1h`).
* `BCRYPT_ROUNDS`: Rondas de costo criptográfico para hashing (por defecto `10`).

## Endpoints Principales
* `GET /health`: Healthcheck público de estado de salud.
* `POST /auth/register`: Registro de nuevo usuario (público).
* `POST /auth/login`: Autenticación y obtención de JWT (público).
* `GET /api/usuarios`: Listado de todos los usuarios (solo `ADMIN`).
* `GET /api/usuarios/:id`: Perfil del usuario (solo el propio usuario `USER` o cualquier `ADMIN`).
* `DELETE /api/usuarios/:id`: Baja permanente de cuenta (solo `ADMIN`).
