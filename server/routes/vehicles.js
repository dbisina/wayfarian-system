// server/routes/vehicles.js

const express = require('express');
const {
  upload,
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  setDefaultVehicle,
  uploadVehiclePhoto,
} = require('../controllers/vehicleController');

const router = express.Router();

// All routes require auth (applied in app.js via authMiddleware before mounting)

router.get('/', listVehicles);
router.post('/', createVehicle);
router.put('/:id', updateVehicle);
router.delete('/:id', deleteVehicle);
router.post('/:id/set-default', setDefaultVehicle);
router.post('/:id/photo', upload.single('vehiclePhoto'), uploadVehiclePhoto);

module.exports = router;
