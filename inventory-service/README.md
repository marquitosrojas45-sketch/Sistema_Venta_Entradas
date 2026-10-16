# Inventory Service — Sistema de Venta de Entradas

## Descripción

Microservicio encargado de gestionar el inventario de entradas disponibles para el sistema de venta de entradas.

## Tecnologías

- Node.js
- Express
- API REST

## Puerto

El servicio utiliza el puerto `3003` de forma predeterminada. Puede configurarse mediante la variable de entorno `PORT`.

## Instalación

Desde la carpeta `inventory-service`, ejecutar:

```bash
npm install
```

## Ejecución

Para iniciar el servicio:

```bash
npm start
```

## Endpoints disponibles

### GET /health

Verifica que el servicio esté funcionando.

Respuesta esperada:

```json
{
  "status": "Inventory Service is running"
}
```

### GET /inventory

Devuelve una respuesta inicial con una lista vacía de entradas.

Respuesta esperada:

```json
{
  "message": "Listado de entradas disponibles",
  "entries": []
}
```

## Estado actual

El servicio cuenta con un servidor Express y dos endpoints de prueba. La gestión persistente del inventario, las operaciones de actualización de disponibilidad y la integración con los demás microservicios quedan pendientes de implementación.

## Ejecución local

URL base: `http://localhost:3003`
