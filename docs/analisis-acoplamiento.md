# Análisis de acoplamiento entre microservicios

## 1. Introducción

El sistema de venta de entradas está organizado en microservicios para separar responsabilidades y facilitar el mantenimiento y la evolución de la aplicación.

Entre los componentes identificados se encuentran `user-service`, `checkout-service` e `inventory-service`.

## 2. Responsabilidades de los servicios

- **User Service:** encargado de las funcionalidades relacionadas con los usuarios.
- **Checkout Service:** destinado al proceso de compra de entradas.
- **Inventory Service:** encargado de consultar y gestionar la disponibilidad de entradas.

## 3. Análisis del acoplamiento

El objetivo de una arquitectura basada en microservicios es mantener un bajo acoplamiento entre sus componentes.

Cada servicio debe tener una responsabilidad definida y evitar depender directamente de la implementación interna de los demás.

Se recomienda que la comunicación entre servicios se realice mediante interfaces bien definidas, como API REST, en lugar de acceder directamente al código o a los datos internos de otro servicio.

## 4. Posibles dependencias

Durante el proceso de compra, `checkout-service` podría necesitar consultar a `inventory-service` para verificar la disponibilidad de las entradas.

Asimismo, puede necesitar información de `user-service` para asociar una compra con un usuario.

Estas interacciones representan dependencias funcionales que deben definirse mediante contratos de comunicación claros.

**Nota:** estas dependencias describen las interacciones esperadas por las responsabilidades de los servicios. Deben verificarse con la implementación real del proyecto.

## 5. Riesgos de un acoplamiento elevado

Un acoplamiento elevado puede provocar:

- Cambios en un servicio que obliguen a modificar otros.
- Mayor dificultad para probar los componentes de manera independiente.
- Dependencia de la disponibilidad de otros servicios.
- Mayor complejidad para mantener y desplegar el sistema.

## 6. Recomendaciones

1. Mantener responsabilidades independientes para cada microservicio.
2. Definir endpoints y formatos de respuesta estables.
3. Evitar compartir código interno innecesariamente entre servicios.
4. Gestionar los errores y los tiempos de espera en las comunicaciones.
5. Documentar las dependencias entre los servicios.
6. Verificar la disponibilidad del inventario antes de confirmar una compra.
7. Considerar mecanismos para evitar que dos compras asignen las mismas entradas.

## 7. Conclusión

Una separación clara de responsabilidades y una comunicación basada en contratos bien definidos ayudan a reducir el acoplamiento entre los microservicios.

El servicio de inventario debe ofrecer una interfaz clara para consultar y gestionar la disponibilidad de entradas, facilitando su integración con el proceso de compra.

Las dependencias definitivas deben confirmarse mediante la revisión del código y de la arquitectura implementada en el proyecto.

## Matriz de Propiedad de Datos

La siguiente matriz identifica qué microservicio es propietario de cada colección o estructura de datos, qué servicio puede modificarla y cómo pueden acceder a ella los demás servicios. Cada microservicio debe gestionar sus propios datos y evitar el acceso directo a las bases de datos de otros servicios.

| Dato / Colección | Microservicio Propietario | Modificación | Lectura |
|---|---|---|---|
| Usuarios (MongoDB) | User Service | Exclusiva del User Service | A través de la API del User Service |
| Inventario (MongoDB) | Inventory Service | Exclusiva del Inventory Service | A través de la API del Inventory Service |
| Locks (Redis) | Checkout Service | Exclusiva del Checkout Service | Uso interno del Checkout Service; otros servicios no acceden directamente a los locks |

### Reglas de propiedad de datos

- **User Service:** es responsable de administrar los datos de los usuarios.
- **Inventory Service:** es responsable de administrar las entradas disponibles y su inventario.
- **Checkout Service:** es responsable de gestionar los locks temporales utilizados durante el proceso de compra.
- Los demás microservicios deben consultar los datos mediante las API del servicio propietario, en lugar de acceder directamente a sus bases de datos.
- La comunicación entre servicios debe respetar la propiedad de los datos y reducir el acoplamiento entre componentes.

**Nota:** La matriz describe la arquitectura prevista. Las rutas de API y los mecanismos de persistencia deben coincidir con la implementación real del proyecto.