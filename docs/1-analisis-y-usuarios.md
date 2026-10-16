## Checklist de Validación de Límites

- [x] **¿Cada servicio puede explicarse en una frase clara?**  
  Sí. (*User Service* administra perfiles, autenticación y credenciales de usuario; *Checkout Service* gestiona compras y generación de entradas; *Catalog/Events Service* administra los eventos y stock disponible).

- [x] **¿Agrupan datos que cambian juntos?**  
  Sí (por ejemplo, el módulo de usuarios gestiona únicamente credenciales y datos de perfil, mientras que el stock y la disponibilidad de entradas cambian de forma independiente en su respectivo servicio).

- [x] **¿Tienen bases de datos independientes?**  
  Sí, cada microservicio gestiona sus colecciones/tablas lógicas y almacenamiento en memoria o caché (como Redis) de forma aislada, sin compartir acceso directo a bases de datos de otros servicios.

- [x] **¿Se comunican por red (APIs) en lugar de compartir código?**  
  Sí, mediante peticiones HTTP/REST estructuradas y contratos de API bien definidos entre los microservicios.