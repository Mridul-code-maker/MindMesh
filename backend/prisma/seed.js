const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning existing MindMesh database records...');
  await prisma.user.deleteMany({});
  await prisma.dataset.deleteMany({});
  await prisma.pipeline.deleteMany({});
  await prisma.pipelineRun.deleteMany({});
  await prisma.activityLog.deleteMany({});

  // Generate a large 500-row CSV dataset dynamically in the uploads folder
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }
  const csvPath = path.join(uploadsDir, 'Boston.csv');
  
  let csvContent = 'id,house_size,rooms,distance_miles,price_k\n';
  for (let i = 1; i <= 500; i++) {
    const size = Math.floor(1000 + Math.random() * 3000);
    const rooms = Math.floor(2 + (size / 800) + Math.random() * 2);
    const distance = parseFloat((0.2 + Math.random() * 15).toFixed(1));
    const price = Math.floor((size * 0.15) + (rooms * 20) - (distance * 3) + Math.random() * 50);
    csvContent += `${i},${size},${rooms},${distance},${price}\n`;
  }
  fs.writeFileSync(csvPath, csvContent);
  console.log('Generated a 500-row Boston.csv in uploads.');

  // Create pre-seeded accounts with realistic names
  const passwordHash = await bcrypt.hash('Mridul123!', 10);
  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@mindmesh.com',
      passwordHash,
      name: 'Mridul Sharma',
      role: 'Admin'
    }
  });

  const member = await prisma.user.create({
    data: {
      email: 'member@mindmesh.com',
      passwordHash,
      name: 'Ananya Roy',
      role: 'Member'
    }
  });

  // Pre-register this 500-row dataset in the database
  const dataset = await prisma.dataset.create({
    data: {
      title: 'Boston Housing Prices',
      filename: 'Boston.csv',
      rowCount: 500,
      columns: JSON.stringify([
        { name: 'id', type: 'Number' },
        { name: 'house_size', type: 'Number' },
        { name: 'rooms', type: 'Number' },
        { name: 'distance_miles', type: 'Number' },
        { name: 'price_k', type: 'Number' }
      ]),
      missingPct: 0.00,
      userId: admin.id
    }
  });

  // Seed default pipeline
  const defaultNodes = [
    { id: 'node-1', type: 'Ingest', label: 'CSV Data Upload', x: 60, y: 110, properties: { datasetId: dataset.id } },
    { id: 'node-2', type: 'Preprocess', label: 'Drop Empty Rows', x: 230, y: 190, properties: { dropNulls: true, normalize: true } },
    { id: 'node-3', type: 'AIModel', label: 'Random Forest AI Predictor', x: 400, y: 110, properties: { modelType: 'RandomForest' } },
    { id: 'node-4', type: 'Output', label: 'Dynamic SVG Analytics Chart', x: 570, y: 190, properties: { chartType: 'Line' } }
  ];

  const defaultEdges = [
    { source: 'node-1', target: 'node-2' },
    { source: 'node-2', target: 'node-3' },
    { source: 'node-3', target: 'node-4' }
  ];

  const pipeline = await prisma.pipeline.create({
    data: {
      name: 'Real Estate Price Predictor Pipeline',
      nodes: JSON.stringify(defaultNodes),
      edges: JSON.stringify(defaultEdges),
      userId: admin.id
    }
  });

  // Seed historical pipeline runs with realistic, professional operator names
  const run1Logs = [
    { time: new Date().toISOString(), node: 'System', text: 'Initializing MindMesh Pipeline runtime engine...', type: 'info' },
    { time: new Date().toISOString(), node: 'Ingest', text: 'Ingested dataset: "Boston Housing Prices" (500 rows loaded)', type: 'info' },
    { time: new Date().toISOString(), node: 'Preprocess', text: 'Preprocess node completed. Dropped 0 rows.', type: 'info' },
    { time: new Date().toISOString(), node: 'AIModel', text: 'Model training successful. Accuracy = 92.4%', type: 'info' },
    { time: new Date().toISOString(), node: 'Output', text: 'Dynamic chart coordinates compiled.', type: 'info' }
  ];

  await prisma.pipelineRun.create({
    data: {
      pipelineId: pipeline.id,
      userId: admin.id,
      status: 'Success',
      duration: 3450,
      logs: JSON.stringify(run1Logs),
      createdAt: new Date(Date.now() - 3600000)
    }
  });

  await prisma.pipelineRun.create({
    data: {
      pipelineId: pipeline.id,
      userId: member.id,
      status: 'Success',
      duration: 3200,
      logs: JSON.stringify(run1Logs),
      createdAt: new Date(Date.now() - 7200000)
    }
  });

  // Create activity logs with realistic names
  await prisma.activityLog.create({
    data: {
      userId: admin.id,
      action: 'Dataset Preloaded',
      details: 'Preloaded 500-row real estate dataset into the workspace.'
    }
  });

  await prisma.activityLog.create({
    data: {
      userId: member.id,
      action: 'Pipeline Executed',
      details: 'Ananya Roy triggered a pricing regression pipeline execution.'
    }
  });

  console.log('MindMesh database seeded with 500-row CSV and realistic logs.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
