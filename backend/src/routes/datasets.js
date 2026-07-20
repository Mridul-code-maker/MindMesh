const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Helper to parse and profile CSV
const profileCSV = (filePath) => {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const lines = fileContent.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { rowCount: 0, columns: [], missingPct: 0 };
  }
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim().replace(/^["']|["']$/g, '')));
  
  let totalCells = headers.length * rows.length;
  let emptyCells = 0;
  
  const columns = headers.map((colName, colIdx) => {
    let type = 'Number';
    for (let r = 0; r < Math.min(rows.length, 50); r++) {
      const val = rows[r][colIdx];
      if (val === undefined || val === '') {
        emptyCells++;
        continue;
      }
      if (isNaN(Number(val))) {
        type = 'String';
        break;
      }
    }
    return { name: colName, type };
  });

  // Calculate missing cells in all rows
  rows.forEach(row => {
    for (let i = 0; i < headers.length; i++) {
      if (row[i] === undefined || row[i] === '') {
        emptyCells++;
      }
    }
  });

  const missingPct = totalCells > 0 ? (emptyCells / totalCells) * 100 : 0;
  
  return {
    rowCount: rows.length,
    columns,
    missingPct: parseFloat(missingPct.toFixed(2))
  };
};

router.use(authenticateToken);

// 1. GET ALL DATASETS
router.get('/', async (req, res, next) => {
  try {
    const datasets = await prisma.dataset.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({
      success: true,
      data: datasets
    });
  } catch (err) {
    next(err);
  }
});

// 2. UPLOAD DATASET
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No dataset file uploaded.'
      });
    }

    const filePath = req.file.path;
    const profile = profileCSV(filePath);

    if (profile.rowCount === 0) {
      fs.unlinkSync(filePath); // delete empty file
      return res.status(400).json({
        success: false,
        message: 'Uploaded CSV file contains no data rows.'
      });
    }

    const newDataset = await prisma.dataset.create({
      data: {
        title: req.body.title || req.file.originalname,
        filename: req.file.filename,
        rowCount: profile.rowCount,
        columns: JSON.stringify(profile.columns),
        missingPct: profile.missingPct,
        userId: req.userId
      }
    });

    // Write Activity Log
    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'Dataset Ingested',
        details: `Ingested dataset "${newDataset.title}" (${newDataset.rowCount} rows)`
      }
    });

    res.status(201).json({
      success: true,
      message: 'Dataset uploaded and profiled successfully.',
      data: newDataset
    });

  } catch (err) {
    next(err);
  }
});

// 3. GET DATASET DETAILS & PREVIEW
router.get('/:id', async (req, res, next) => {
  try {
    const dataset = await prisma.dataset.findUnique({
      where: { id: req.params.id }
    });

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: 'Dataset not found.'
      });
    }

    // Load preview of top 5 rows
    const filePath = path.join(__dirname, '..', '..', 'uploads', dataset.filename);
    let previewRows = [];
    
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n').map(l => l.trim()).filter(Boolean);
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      
      const rows = lines.slice(1, 6).map(line => {
        const cells = line.split(',').map(cell => cell.trim().replace(/^["']|["']$/g, ''));
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = cells[i] || '';
        });
        return obj;
      });
      previewRows = rows;
    }

    res.json({
      success: true,
      data: {
        ...dataset,
        columns: JSON.parse(dataset.columns),
        preview: previewRows
      }
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
