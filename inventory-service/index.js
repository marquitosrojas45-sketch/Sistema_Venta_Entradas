
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// Verificar que el servicio esté funcionando
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'inventory-service',
    status: 'ok'
  });
});

// Consultar las entradas del inventario
app.get('/inventory', (req, res) => {
  res.json({
    message: 'Listado de entradas disponibles',
    entries: []
  });
});

app.listen(PORT, () => {
  console.log(`Inventory Service escuchando en el puerto ${PORT}`);
});
