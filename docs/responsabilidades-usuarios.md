# Ficha de Definición: User Service (TP5 - Sección 8.1)

| Elemento | Definición |
| :--- | :--- |
| **1. Nombre** | **User & Identity Service (`user-service`)** |
| **2. Responsabilidad principal** | Gestión centralizada de identidades, registro de nuevos usuarios, autenticación mediante hashing seguro y emisión/validación de credenciales JWT para todo el sistema distribuido. |
| **3. Operaciones** | - Registro de nuevos usuarios con rol cliente o administrador.<br>- Autenticación de credenciales (email y password).<br>- Emisión de tokens de acceso JWT (`HS256`).<br>- Consulta de perfiles de usuario.<br>- Baja de cuentas de usuario. |
| **4. Reglas de negocio** | - El DNI y el correo electrónico deben ser estrictamente únicos en la base de datos.<br>- La contraseña debe poseer al menos 6 caracteres y almacenarse hasheada con `bcryptjs` (costo 10 rondas). Nunca se devuelve en respuestas JSON.<br>- Cuentas inactivas (`activo: false`) no pueden iniciar sesión.<br>- **Propiedad del recurso:** Un usuario con rol `USER` solo puede consultar su propio perfil (`sub === :id`). La consulta global o de perfiles ajenos requiere rol `ADMIN`.<br>- El borrado de cuentas está restringido a administradores. |
| **5. Datos propios** | Colección `usuarios` en base de datos independiente MongoDB (`tp6_usuarios` en `users-db:27017`):<br>`{ _id, nombre, apellido, dni, telefono, mail, passwordHash, role, activo }`. |
| **6. Endpoints** | - `GET /health` (Público): Comprobación de estado del servicio.<br>- `POST /auth/register` (Público): Alta de nuevo usuario.<br>- `POST /auth/login` (Público): Login y emisión de token JWT.<br>- `GET /api/usuarios` (Restringido `ADMIN`): Listado global.<br>- `GET /api/usuarios/:id` (Autenticado Propio/ADMIN): Consulta de perfil.<br>- `DELETE /api/usuarios/:id` (Restringido `ADMIN`): Eliminación de usuario. |
| **7. Dependencias** | - Dependencias de microservicios: **Ninguna** (completamente autónomo).<br>- Dependencias de infraestructura: MongoDB (`users-db:27017`). |
| **8. Fuera de alcance** | - Gestión de catálogo de eventos o entradas.<br>- Control de existencias o reservas de stock.<br>- Procesamiento o cobro de transacciones de compra. |
| **9. Justificación** | Al aislar la identidad en un microservicio dedicado, se desacoplan las credenciales y los datos personales sensibles de la lógica de negocio de compras e inventario. Esto permite escalar el mecanismo de autenticación de forma independiente y aplicar políticas de seguridad homogéneas sin contaminar los dominios comerciales. |
