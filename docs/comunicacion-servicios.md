# Comunicación entre microservicios

## 1. Introducción

El sistema de venta de entradas utiliza una arquitectura basada en microservicios, donde cada componente tiene responsabilidades específicas y puede comunicarse con otros mediante interfaces definidas.

En este documento se describe la comunicación prevista entre `user-service`, `checkout-service` e `inventory-service`.

## 2. Tecnología de comunicación

Se propone utilizar API REST sobre HTTP para intercambiar información entre los servicios.

Los mensajes pueden utilizar JSON como formato de intercambio de datos.

Cada microservicio debe exponer endpoints documentados y responder con códigos HTTP apropiados.

## 3. Servicios involucrados

### User Service

Responsable de las funcionalidades relacionadas con los usuarios.

Actualmente dispone de un endpoint de verificación de estado:

- `GET /health`

### Checkout Service

Responsable del proceso de compra de entradas.

Como parte del flujo de compra, podría consultar la información del usuario y solicitar la verificación de disponibilidad del inventario.

### Inventory Service

Responsable de las consultas y operaciones relacionadas con la disponibilidad de entradas.

Actualmente dispone de los siguientes endpoints:

- `GET /health`: verifica que el servicio esté funcionando.
- `GET /inventory`: devuelve una lista inicial vacía de entradas.

El servicio de inventario se ejecuta localmente en el puerto `3003`, salvo que se configure otro valor mediante la variable de entorno `PORT`.

## 4. Flujo de comunicación propuesto

Un posible flujo de compra sería:

1. El cliente inicia una compra a través de `checkout-service`.
2. `checkout-service` valida la información necesaria para procesar la solicitud.
3. Se consulta a `inventory-service` para verificar la disponibilidad de las entradas.
4. Si corresponde, se registra o actualiza la disponibilidad del inventario.
5. Se informa el resultado de la operación al cliente.

Este flujo es una propuesta de diseño. La validación de usuarios, la reserva de entradas y la confirmación de compras todavía deben verificarse o implementarse según las funcionalidades reales del proyecto.

## 5. Manejo de errores

La comunicación entre servicios debe contemplar situaciones como:

- Servicio de destino no disponible.
- Tiempo de espera agotado.
- Solicitud con datos inválidos.
- Recurso inexistente.
- Disponibilidad insuficiente de entradas.

Los servicios deben devolver respuestas claras y utilizar códigos HTTP adecuados.

## 6. Buenas prácticas

- Definir contratos claros para cada endpoint.
- Utilizar JSON de manera consistente.
- Evitar dependencias innecesarias entre los servicios.
- Configurar las direcciones y los puertos mediante variables de entorno cuando corresponda.
- Registrar errores que faciliten el diagnóstico.
- Evitar confirmar una compra si no se pudo garantizar la disponibilidad de las entradas.

## 7. Estado actual y trabajo pendiente

El servicio de inventario cuenta con un servidor Express y endpoints iniciales para comprobar su funcionamiento y consultar el inventario.

Queda pendiente desarrollar la gestión real de las entradas, definir las operaciones necesarias para reservar o actualizar su disponibilidad e integrar esas operaciones con el proceso de compra.

También se debe verificar el contrato de comunicación efectivo de los otros microservicios para asegurar que la documentación refleje la implementación final.

## 8. Conclusión

La comunicación mediante API REST permite establecer una interfaz clara entre los microservicios y mantener separadas sus responsabilidades.

La definición de contratos estables, el manejo de errores y la coordinación de las operaciones de compra e inventario son aspectos fundamentales para lograr un sistema confiable.