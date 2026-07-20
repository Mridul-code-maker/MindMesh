const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticateToken);

// 1. GET ALL RUNS HISTORY
router.get('/', async (req, res, next) => {
  try {
    const runs = await prisma.pipelineRun.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        pipeline: { select: { name: true } },
        user: { select: { name: true } }
      }
    });

    res.json({
      success: true,
      data: runs.map(run => ({
        ...run,
        logs: JSON.parse(run.logs)
      }))
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET SINGLE RUN DETAILS
router.get('/:id', async (req, res, next) => {
  try {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: req.params.id },
      include: {
        pipeline: { select: { name: true } },
        user: { select: { name: true } }
      }
    });

    if (!run) {
      return res.status(404).json({
        success: false,
        message: 'Pipeline run log not found.'
      });
    }

    res.json({
      success: true,
      data: {
        ...run,
        logs: JSON.parse(run.logs)
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
