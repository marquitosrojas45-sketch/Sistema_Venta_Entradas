const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'User Service is running' });
});

app.listen(PORT, () => {
  console.log(`User Service escuchando en el puerto ${PORT}`);
});