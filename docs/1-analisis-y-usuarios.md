# 1. Análisis de Dominio y Límites de Servicio: User Service

## Checklist de Validación de Límites (DDD)

- [x] **¿Cada servicio puede explicarse en una frase clara?**  
  *User Service* administra de forma centralizada la identidad, el registro, la autenticación y las credenciales de los usuarios; *Inventory Service* administra el catálogo de entradas, el stock disponible y la exclusión mutua que lo protege; *Checkout Service* orquesta el flujo transaccional de compras.

- [x] **¿Agrupan datos que cambian juntos?**  
  Sí: el ciclo de vida de los usuarios (altas, bajas, cambios de contraseña, roles) evoluciona con independencia de la disponibilidad o venta de entradas para los eventos.

- [x] **¿Tienen bases de datos independientes?**  
  Sí: cada microservicio administra su propio esquema y motor de base de datos (`users-db` para usuarios, `inventory-db` e `inventory-redis` para inventario). Ningún servicio accede directamente al almacenamiento de otro.

- [x] **¿Se comunican por red (APIs) en lugar de compartir código?**  
  Sí: mediante contratos REST sobre HTTP estandarizados y tokens de seguridad JWT autónomos.

---

## Dominio de Identidad
El microservicio `user-service` es el único componente autorizado para consultar y persistir en la colección `usuarios`. Expone endpoints públicos para registro (`/auth/register`) y autenticación (`/auth/login`), y endpoints protegidos por RBAC para administración (`/api/usuarios`).
