# Ficha Técnica y Responsabilidades: User Service

## 1. Misión del Microservicio
Gestionar de forma centralizada la identidad, el registro, la autenticación y los perfiles de los usuarios del sistema, desacoplando la seguridad del resto de los dominios de la aplicación.

## 2. Límites de Dominio y Responsabilidades
* **Gestión de Cuentas e Identidad:** Registro de clientes y almacenamiento seguro de sus datos personales.
* **Autenticación y Criptografía:** Validación de credenciales con algoritmos de hashing seguro (`bcryptjs` con costo de 10 rondas) y emisión de tokens de acceso firmados digitalmente (`JWT` con algoritmo `HS256`).
* **Control de Acceso Basado en Roles (RBAC):** Asignación y verificación de roles (`USER` y `ADMIN`).
* **Propiedad del Recurso:** Restricción estricta para que un usuario estándar únicamente pueda acceder a su propia información de perfil (`sub === :id`).
* **Administración de Cuentas:** Capacidad exclusiva para administradores de listar todos los usuarios y dar de baja cuentas.

## 3. Reglas de Negocio
1. Cada usuario debe poseer un DNI y un correo electrónico únicos en el sistema (índices únicos en MongoDB).
2. Las contraseñas deben contener al menos 6 caracteres y nunca almacenarse en texto plano.
3. El campo `passwordHash` se excluye automáticamente de cualquier serialización JSON devuelta por la API.
4. Las cuentas marcadas como inactivas (`activo: false`) no pueden iniciar sesión.
5. El token JWT emitido incluye los *claims* estándar: `sub` (ID de usuario), `role` (USER/ADMIN), `iss` (user-service), `iat` (fecha de emisión) y `exp` (vencimiento).

## 4. Datos Propios Administrados
* **Base de Datos NoSQL Propietaria:** MongoDB (`tp6_usuarios` en `users-db:27017`).
  * Colección `usuarios`: `{ nombre, apellido, dni, telefono, mail, passwordHash, role, activo }`.

## 5. Acoplamiento y Dependencias
* **Acoplamiento Eferente (Hacia afuera):**
  * Ninguno. `user-service` es completamente autónomo y no se comunica con `inventory-service` ni con `checkout-service`.
  * Dependencias de infraestructura: MongoDB (`users-db:27017`).
* **Acoplamiento Aferente (Hacia adentro):**
  * Clientes externos (consumo de autenticación y perfiles).

## 6. Endpoints Expuestos

| Método | Endpoint | Nivel de Acceso | Descripción | Códigos HTTP |
| :---: | :--- | :--- | :--- | :--- |
| `GET` | `/health` | Público | Comprueba la disponibilidad del servicio y su base de datos. | `200` |
| `POST` | `/auth/register` | Público | Registro de nuevos usuarios con rol USER o ADMIN. | `201`, `400`, `409`, `500` |
| `POST` | `/auth/login` | Público | Autenticación de credenciales y emisión de token JWT. | `200`, `400`, `401`, `403`, `500` |
| `GET` | `/api/usuarios` | Restringido (`ADMIN`) | Listado global de todos los usuarios registrados. | `200`, `401`, `403`, `500` |
| `GET` | `/api/usuarios/:id` | Propietario / ADMIN | Consulta de perfil (propiedad del recurso: `USER` solo su ID, `ADMIN` cualquiera). | `200`, `400`, `401`, `403`, `404`, `500` |
| `DELETE` | `/api/usuarios/:id` | Restringido (`ADMIN`) | Eliminación permanente de una cuenta de usuario. | `204`, `400`, `401`, `403`, `404`, `500` |
