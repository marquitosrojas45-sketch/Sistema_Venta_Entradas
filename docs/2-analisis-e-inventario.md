# 2. Análisis de Dominio y Límites de Servicio: Inventory Service

## Justificación Arquitectónica de Límites
El microservicio `inventory-service` encapsula el catálogo de productos y entradas disponibles. Su propósito de negocio es garantizar la integridad del inventario ante múltiples compras concurrentes.

---

## Principio de Propiedad del Dato y Encapsulación del Lock
En una arquitectura basada en microservicios y Domain-Driven Design (DDD), el componente propietario del dato es el único que debe controlar cómo se lee, modifica y sincroniza dicho recurso:
* **El dato:** Stock de entradas almacenado en la colección `inventarios` de MongoDB.
* **El mecanismo de concurrencia:** Bloqueo distribuido (*distributed lock*) administrado en Redis (`lock:producto:<nombre>`).

### ¿Por qué el lock pertenece a Inventory Service y no a Checkout Service?
1. **Bajo Acoplamiento:** Si `checkout-service` adquiriera el lock, conocería detalles internos de concurrencia del inventario (convenciones de claves de Redis, TTLs, scripts Lua). Esto generaría un acoplamiento indebido de datos y concurrencia.
2. **Encapsulación y Reusabilidad:** Si en el futuro existieran otros canales de venta o servicios que reduzcan stock (por ejemplo, venta en taquilla física, reservas corporativas, devoluciones), todos deberán pasar por la API de `inventory-service`. Al encapsular el lock dentro de `inventory-service`, la exclusión mutua está garantizada para cualquier cliente sin duplicar lógica de bloqueo.
3. **Consistencia Transaccional:** La adquisición del lock, el decremento en MongoDB y la liberación del lock ocurren dentro del mismo límite de servicio (*bounded context*).

---

## Flujo de Reducción Concurrente
1. Entrada de la solicitud `PUT /api/inventario/reducir` con JWT propagado.
2. Intentar adquirir el lock en Redis: `SET lock:producto:Entrada_Conferencia <UUID> NX PX 5000`.
3. Si la clave ya existe (retorno nulo): responder inmediatamente `HTTP 409 Conflict`.
4. Si la clave se adquirió:
   - Ejecutar `$inc: { stock: -1 }` condicionado a `stock > 0`.
   - Si se decrementó: retornar `HTTP 200 OK` con el nuevo stock restante.
   - Si no hay suficiente stock: retornar `HTTP 400 Bad Request`.
5. En bloque `finally`: ejecutar script Lua atómico para liberar el lock solo si coincide el `<UUID>`.
