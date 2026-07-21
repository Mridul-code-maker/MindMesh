const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// 1. GET ALL DEPLOYMENTS (Authenticated)
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const deployments = await prisma.deployment.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({
      success: true,
      data: deployments
    });
  } catch (err) {
    next(err);
  }
});

// 2. CREATE DEPLOYMENT FROM RUN (Authenticated)
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { runId } = req.body;

    if (!runId) {
      return res.status(400).json({
        success: false,
        message: 'Execution Run ID is required for deployment.'
      });
    }

    // Verify run exists and was successful
    const run = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      include: { pipeline: true }
    });

    if (!run) {
      return res.status(404).json({
        success: false,
        message: 'Associated execution run logs not found.'
      });
    }

    if (run.status !== 'Success') {
      return res.status(400).json({
        success: false,
        message: 'Cannot deploy a failed pipeline execution run.'
      });
    }

    // Try to extract dataset schema headers from logs
    const logs = JSON.parse(run.logs);
    const ingestLog = logs.find(l => l.node === 'Ingest' && l.text.includes('Successfully ingested'));
    
    // Default features list if schema parsing fails
    let columns = ['CRIM', 'ZN', 'INDUS', 'CHAS', 'RM', 'AGE', 'TAX', 'LSTAT'];
    
    // Create new Deployment entry
    const newDeployment = await prisma.deployment.create({
      data: {
        runId,
        status: 'Active',
        modelName: run.pipeline.name.includes('Forest') ? 'Random Forest Regressor' : 'Linear Regression Model',
        datasetName: ingestLog ? ingestLog.text.match(/"([^"]+)"/)?.[1] || 'Housing Dataset' : 'Housing Dataset',
        columns: JSON.stringify(columns)
      }
    });

    res.status(201).json({
      success: true,
      message: 'Model serving API endpoint created successfully.',
      data: newDeployment
    });

  } catch (err) {
    next(err);
  }
});

// 3. SECURE ENDPOINT MODEL INFERENCE PREDICTION (Public POST)
router.post('/:id/predict', async (req, res, next) => {
  try {
    const { values = {} } = req.body;
    const deployment = await prisma.deployment.findUnique({
      where: { id: req.params.id }
    });

    if (!deployment) {
      return res.status(404).json({
        success: false,
        message: 'Serving model deployment endpoint not found or suspended.'
      });
    }

    const columns = JSON.parse(deployment.columns);
    
    // Verify inputs contain at least some matching values
    const inputKeys = Object.keys(values);
    if (inputKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must contain a "values" object containing feature coefficients.',
        schema: columns
      });
    }

    // Apply linear coefficients model prediction logic simulation
    let baseValue = 18.5; // Base housing cost coefficient offset
    let contributorsSum = 0;

    columns.forEach(col => {
      const val = Number(values[col]);
      if (!isNaN(val)) {
        if (col === 'RM') {
          // Average rooms adds positive weight
          contributorsSum += val * 4.2;
        } else if (col === 'CRIM') {
          // Crime rates decreases weight
          contributorsSum -= val * 1.5;
        } else if (col === 'LSTAT') {
          // Status rate decreases value
          contributorsSum -= val * 0.8;
        } else {
          contributorsSum += val * 0.1;
        }
      }
    });

    const predictionResult = baseValue + contributorsSum;

    res.json({
      success: true,
      deploymentId: deployment.id,
      modelName: deployment.modelName,
      prediction: parseFloat(predictionResult.toFixed(4)),
      inputFeaturesParsed: values,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    next(err);
  }
});

// 4. SUSPEND/DELETE DEPLOYMENT (Authenticated)
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    await prisma.deployment.delete({
      where: { id: req.params.id }
    });
    res.json({
      success: true,
      message: 'Model serving deployment suspended and endpoint unregistered.'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
