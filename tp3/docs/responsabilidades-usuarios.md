# Responsabilidades del Microservicio de Usuarios (User Service)

## 1. ¿Qué problema o necesidad del sistema resuelve?
Se encarga de gestionar de forma centralizada la identidad, el registro, la autenticación y los datos de perfil de los usuarios del sistema, desacoplando esta lógica del resto de los dominios de la aplicación.

## 2. ¿Qué operaciones realiza?
* Registro de nuevos usuarios.
* Autenticación y emisión/validación de credenciales.
* Consulta y actualización de datos de perfil del usuario.
* Administración de roles o permisos básicos.

## 3. ¿Qué reglas de negocio contiene?
* Validación de unicidad para el correo electrónico del usuario.
* Requisitos de complejidad y seguridad para las contraseñas (almacenadas con hashing seguro).
* Restricción de que un usuario solo puede modificar su propio perfil a menos que posea privilegios de administrador.

## 4. Datos propios administrados
* Credenciales de acceso (email, password hasheada).
* Información de perfil (nombre, apellido, fecha de alta, estado de la cuenta).