// server/controllers/vehicleController.js
// CRUD for user garage vehicles

const prisma = require('../prisma/client');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// Lazy-load Firebase to avoid crashing when env vars absent in test
let uploadToStorage, deleteFromStorage;
const getFirebase = () => {
  if (!uploadToStorage) {
    ({ uploadToStorage, deleteFromStorage } = require('../services/Firebase'));
  }
  return { uploadToStorage, deleteFromStorage };
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

/**
 * GET /api/vehicles
 * List all vehicles for the authenticated user
 */
const listVehicles = async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ success: true, vehicles });
  } catch (err) {
    console.error('[VehicleController] listVehicles error:', err);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
};

/**
 * POST /api/vehicles
 * Create a new vehicle
 */
const createVehicle = async (req, res) => {
  try {
    const { name, make, model, year, color, type, isDefault } = req.body;

    if (!name || !make || !model) {
      return res.status(400).json({ error: 'name, make, and model are required' });
    }

    // If this will be the default, clear existing default first
    if (isDefault) {
      await prisma.vehicle.updateMany({
        where: { userId: req.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    // Check if user has no vehicles yet — first vehicle is automatically default
    const existingCount = await prisma.vehicle.count({ where: { userId: req.user.id } });
    const shouldBeDefault = isDefault || existingCount === 0;

    const vehicle = await prisma.vehicle.create({
      data: {
        userId: req.user.id,
        name: name.trim(),
        make: make.trim(),
        model: model.trim(),
        year: year ? parseInt(year) : null,
        color: color?.trim() || null,
        type: type || 'motorcycle',
        isDefault: shouldBeDefault,
      },
    });

    res.status(201).json({ success: true, vehicle });
  } catch (err) {
    console.error('[VehicleController] createVehicle error:', err);
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
};

/**
 * PUT /api/vehicles/:id
 * Update an existing vehicle
 */
const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, make, model, year, color, type, isDefault } = req.body;

    const existing = await prisma.vehicle.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Vehicle not found' });

    if (isDefault && !existing.isDefault) {
      await prisma.vehicle.updateMany({
        where: { userId: req.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(make !== undefined && { make: make.trim() }),
        ...(model !== undefined && { model: model.trim() }),
        ...(year !== undefined && { year: year ? parseInt(year) : null }),
        ...(color !== undefined && { color: color?.trim() || null }),
        ...(type !== undefined && { type }),
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    res.json({ success: true, vehicle });
  } catch (err) {
    console.error('[VehicleController] updateVehicle error:', err);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
};

/**
 * DELETE /api/vehicles/:id
 */
const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.vehicle.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Vehicle not found' });

    // Delete photo from storage if present
    if (existing.photoURL) {
      try {
        const { deleteFromStorage: del } = getFirebase();
        // Extract Firebase path from URL if needed — best-effort
        await del(existing.photoURL).catch(() => {});
      } catch {}
    }

    await prisma.vehicle.delete({ where: { id } });

    // If deleted vehicle was default, promote the most recent remaining vehicle
    if (existing.isDefault) {
      const next = await prisma.vehicle.findFirst({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (next) await prisma.vehicle.update({ where: { id: next.id }, data: { isDefault: true } });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[VehicleController] deleteVehicle error:', err);
    res.status(500).json({ error: 'Failed to delete vehicle' });
  }
};

/**
 * POST /api/vehicles/:id/set-default
 */
const setDefaultVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.vehicle.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Vehicle not found' });

    await prisma.vehicle.updateMany({
      where: { userId: req.user.id },
      data: { isDefault: false },
    });
    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: { isDefault: true },
    });

    res.json({ success: true, vehicle });
  } catch (err) {
    console.error('[VehicleController] setDefaultVehicle error:', err);
    res.status(500).json({ error: 'Failed to set default vehicle' });
  }
};

/**
 * POST /api/vehicles/:id/photo
 * Upload / replace vehicle photo
 */
const uploadVehiclePhoto = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.vehicle.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Vehicle not found' });

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Resize to reasonable dimensions
    const processed = await sharp(req.file.buffer)
      .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const filename = `vehicles/${req.user.id}/${id}-${uuidv4()}.jpg`;
    const { uploadToStorage: upload } = getFirebase();
    const photoURL = await upload(processed, filename, 'image/jpeg');

    // Delete old photo
    if (existing.photoURL) {
      const { deleteFromStorage: del } = getFirebase();
      await del(existing.photoURL).catch(() => {});
    }

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: { photoURL },
    });

    res.json({ success: true, vehicle });
  } catch (err) {
    console.error('[VehicleController] uploadVehiclePhoto error:', err);
    res.status(500).json({ error: 'Failed to upload vehicle photo' });
  }
};

module.exports = {
  upload,
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  setDefaultVehicle,
  uploadVehiclePhoto,
};
