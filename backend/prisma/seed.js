const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning existing MindMesh database records...');
  await prisma.user.deleteMany({});
  await prisma.dataset.deleteMany({});
  await prisma.pipeline.deleteMany({});
  await prisma.pipelineRun.deleteMany({});
  await prisma.activityLog.deleteMany({});

  console.log('Seeding database metrics...');

  // Create pre-seeded accounts
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

  console.log(`Seeded Users: ${admin.email} (Admin), ${member.email} (Member)`);

  // Create initial workflow pipeline template
  const defaultNodes = [
    { id: 'node-1', type: 'Ingest', label: 'CSV Data Upload', x: 60, y: 150, properties: { datasetId: '' } },
    { id: 'node-2', type: 'Preprocess', label: 'Drop Empty Rows', x: 230, y: 150, properties: { dropNulls: true, normalize: true } },
    { id: 'node-3', type: 'AIModel', label: 'Random Forest AI Predictor', x: 400, y: 150, properties: { modelType: 'RandomForest' } },
    { id: 'node-4', type: 'Output', label: 'Dynamic SVG Analytics Chart', x: 570, y: 150, properties: { chartType: 'Line' } }
  ];

  const defaultEdges = [
    { source: 'node-1', target: 'node-2' },
    { source: 'node-2', target: 'node-3' },
    { source: 'node-3', target: 'node-4' }
  ];

  await prisma.pipeline.create({
    data: {
      name: 'Real Estate Price Predictor Pipeline',
      nodes: JSON.stringify(defaultNodes),
      edges: JSON.stringify(defaultEdges),
      userId: admin.id
    }
  });

  console.log('Default MindMesh pipeline seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
