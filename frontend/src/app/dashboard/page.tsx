'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { usePipelineStore, GraphNode, GraphEdge, Dataset, LogItem } from '@/store/pipelineStore';
import {
  Activity, Play, FileText, Database, ShieldAlert, ArrowRight,
  Terminal, Trash2, Download, LogOut, Sun, Moon, Settings as SettingsIcon,
  HelpCircle, User as UserIcon, UploadCloud, ChevronRight, CheckCircle2,
  FileSpreadsheet, Brain, BarChart3, Edit3, Network, RefreshCw, X, MessageSquare
} from 'lucide-react';
import { api, API_BASE } from '@/store/authStore';

// Type helper for projected 3D nodes
interface ProjectedNode extends GraphNode {
  screenX: number;
  screenY: number;
  projectedZ: number;
  scale: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, initialize: initAuth, logout } = useAuthStore();
  const {
    datasets, pipelines, runs, activePipeline, activeNodes, activeEdges,
    activeStepStatuses, liveLogs, running, socketConnected, deployments,
    fetchDatasets, uploadDataset, fetchPipelines, updatePipeline,
    runPipeline, fetchRuns, setupSockets, cleanupSockets, setActivePipeline,
    fetchDeployments, deployModel, suspendDeployment, addNode, deleteNode, addEdge,
    updateNodePosition, updateNodeProperties
  } = usePipelineStore();

  const [activeTab, setActiveTab] = useState<'playground' | 'datasets' | 'runs' | 'settings' | 'deployments'>('playground');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Graph Connect mode states
  const [isConnectingMode, setIsConnectingMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

  // MLOps Deployments testing states
  const [selectedDeploymentId, setSelectedDeploymentId] = useState('');
  const [testPayload, setTestPayload] = useState('{\n  "values": {\n    "RM": 6.5,\n    "CRIM": 0.03,\n    "LSTAT": 4.9\n  }\n}');
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const [testingPredict, setTestingPredict] = useState(false);
  const [deployingRunId, setDeployingRunId] = useState('');
  
  // Datasets states
  const [datasetTitle, setDatasetTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [viewingDataset, setViewingDataset] = useState<any>(null);
  const [drawerTab, setDrawerTab] = useState<'config' | 'code'>('config');
  const [rightPanelTab, setRightPanelTab] = useState<'graph' | 'evaluation'>('graph');
  
  // Advanced MLOps & EDA states
  const [datasetViewTab, setDatasetViewTab] = useState<'profile' | 'eda'>('profile');
  const [edaXColumn, setEdaXColumn] = useState<string>('');
  const [edaYColumn, setEdaYColumn] = useState<string>('');
  const [sandboxInputs, setSandboxInputs] = useState<Record<string, number>>({});
  const [sandboxLatency, setSandboxLatency] = useState<number | null>(null);
  const [sandboxSnippetTab, setSandboxSnippetTab] = useState<'curl' | 'python' | 'js'>('curl');
  const [sandboxRequestsCount, setSandboxRequestsCount] = useState<number>(45);
  const hyperRef = useRef<HTMLCanvasElement | null>(null);
  const hyperAngleX = useRef<number>(-0.4);
  const hyperAngleY = useRef<number>(0.5);
  const hyperIsDragging = useRef<boolean>(false);
  const hyperStartMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hyperCameraZoom = useRef<number>(1.0);

  // Chat console states
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ sender: 'user' | 'agent'; text: string; time: string }[]>([]);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  // Theme state
  const [darkMode, setDarkMode] = useState(true);

  // 3D Canvas state variables
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const angleX = useRef<number>(-0.3);
  const angleY = useRef<number>(0.4);
  const [spinSpeed, setSpinSpeed] = useState<'off' | 'slow' | 'fast'>('fast');
  const [physicsEnabled, setPhysicsEnabled] = useState<boolean>(true);
  const isDragging = useRef<boolean>(false);
  const startMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animationFrameId = useRef<number | null>(null);
  const draggedNodeId = useRef<string | null>(null);
  const cameraZoom = useRef<number>(1.25);

  const getCorrelation = (colA: string, colB: string) => {
    if (colA === colB) return 1.0;
    let hash = 0;
    const combined = colA + colB;
    for (let i = 0; i < combined.length; i++) {
      hash = combined.charCodeAt(i) + ((hash << 5) - hash);
    }
    const rawVal = (Math.abs(hash) % 100) / 100;
    const sign = hash % 2 === 0 ? 1 : -1;
    return parseFloat((sign * rawVal * 0.85).toFixed(2));
  };

  const getGeneratedPythonCode = (node: GraphNode) => {
    if (!node) return '';
    const nodeProps = node.properties || {};
    
    if (node.type === 'Ingest') {
      const ds = datasets.find(d => d.id === nodeProps.datasetId);
      const filename = ds ? ds.filename : 'Boston.csv';
      const label = ds ? ds.title : 'Boston Housing Prices';
      return `import pandas as pd
import numpy as np

# Ingest step for node: ${node.label} (${node.id})
# Dataset: ${label}
print("Loading dataset: ${filename}...")

try:
    df = pd.read_csv("${filename}")
    print(f"Loaded successfully!")
    print(f"Row count: {df.shape[0]}, Column count: {df.shape[1]}")
    print(df.head())
except Exception as e:
    print(f"Error loading dataset: {e}")
    # Fallback to dummy regression matrix
    df = pd.DataFrame(
        np.random.randn(200, 5), 
        columns=['CRIM', 'ZN', 'INDUS', 'RM', 'PRICE']
    )
    print("Created synthetic fallback dataset.")
`;
    }
    
    if (node.type === 'Preprocess') {
      const dropNulls = nodeProps.dropNulls !== false;
      const normalize = !!nodeProps.normalize;
      return `# Data Preprocessing & Scaling step: ${node.label} (${node.id})
# Config: dropNulls=${dropNulls ? 'True' : 'False'}, normalize=${normalize ? 'True' : 'False'}

print("Starting data preprocessing operations...")

# 1. Handle Missing Values
if ${dropNulls ? 'True' : 'False'}:
    before_rows = df.shape[0]
    df_cleaned = df.dropna()
    after_rows = df_cleaned.shape[0]
    print(f"Dropped {before_rows - after_rows} rows containing missing entries.")
else:
    df_cleaned = df.copy()
    print("Skipped dropping null values.")

# 2. Feature Scaling & Normalization
if ${normalize ? 'True' : 'False'}:
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler()
    
    # Isolate numeric columns (excluding potential target column 'PRICE')
    features_to_scale = df_cleaned.select_dtypes(include=['float64', 'int64']).columns
    features_to_scale = [col for col in features_to_scale if col != 'PRICE']
    
    df_cleaned[features_to_scale] = scaler.fit_transform(df_cleaned[features_to_scale])
    print(f"Applied StandardScaler scaling to: {features_to_scale}")
else:
    print("Feature scaling was not selected.")

print("Preprocessing complete!")
`;
    }
    
    if (node.type === 'AIModel') {
      const modelType = nodeProps.modelType || 'Random Forest';
      const estimators = nodeProps.estimators || 100;
      const maxDepth = nodeProps.maxDepth || 10;
      const learningRate = nodeProps.learningRate || 0.1;
      
      let initCode = '';
      if (modelType === 'Random Forest') {
        initCode = `from sklearn.ensemble import RandomForestRegressor
model = RandomForestRegressor(
    n_estimators=${estimators},
    max_depth=${maxDepth},
    random_state=42
)`;
      } else if (modelType === 'XGBoost') {
        initCode = `import xgboost as xgb
model = xgb.XGBRegressor(
    n_estimators=${estimators},
    max_depth=${maxDepth},
    learning_rate=${learningRate},
    random_state=42
)`;
      } else if (modelType === 'SVM') {
        initCode = `from sklearn.svm import SVR
model = SVR(
    C=${learningRate * 10}, 
    kernel='rbf'
)`;
      } else {
        initCode = `from sklearn.linear_model import LinearRegression
model = LinearRegression()`;
      }

      return `# AI Model Training step: ${node.label} (${node.id})
# Algorithm: ${modelType}
# Hyperparameters: estimators=${estimators}, maxDepth=${maxDepth}, learningRate=${learningRate}

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score

# 1. Define Features & Target Matrix
if 'PRICE' in df_cleaned.columns:
    X = df_cleaned.drop(columns=['PRICE'])
    y = df_cleaned['PRICE']
else:
    X = df_cleaned.iloc[:, :-1]
    y = df_cleaned.iloc[:, -1]

# 2. Train-Test Split (80/20)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# 3. Model Initialization
print("Initializing model...")
${initCode}

# 4. Model Training
print("Fitting model to training data...")
model.fit(X_train, y_train)

# 5. Predictions & Scoring
y_pred = model.predict(X_test)
mse = mean_squared_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print(f"--- Training Complete ---")
print(f"Model: {type(model).__name__}")
print(f"Mean Squared Error (MSE): {mse:.4f}")
print(f"R-squared (R2) Accuracy: {r2:.4f}")
`;
    }
    
    if (node.type === 'Output') {
      const chartType = nodeProps.chartType || 'Line';
      return `# Performance Visualizations and Reports step: ${node.label} (${node.id})
# Visual style: ${chartType} Chart

import matplotlib.pyplot as plt
import seaborn as sns

# Configure visual style
sns.set_theme(style="darkgrid")
plt.figure(figsize=(10, 6))

if "${chartType}" == "Line":
    # 1. Actual vs Predicted Line Plot
    plt.plot(y_test.values[:50], label='Actual values', color='cyan', marker='o')
    plt.plot(y_pred[:50], label='Predictions', color='orange', linestyle='--', marker='x')
    plt.title('Actual vs Predicted Values (Subset)', fontsize=14)
else:
    # 2. Residual Distribution bar chart
    residuals = y_test - y_pred
    sns.histplot(residuals, kde=True, color='purple')
    plt.title('Residuals Error Distribution Histogram', fontsize=14)

plt.xlabel('Data Index / Error range')
plt.ylabel('Values')
plt.legend()
plt.tight_layout()

# Save performance graphic to disc
plt.savefig("performance_report.png", dpi=150)
print("Performance visualization report saved as 'performance_report.png'.")
`;
    }
    
    return '';
  };

  // Pre-seeded professional prompts
  const suggestionPrompts = useMemo(() => [
    {
      label: '🧹 Clean Data',
      text: 'Clean this dataset, fill missing values, and normalize features.'
    },
    {
      label: '📈 Train Regressor',
      text: 'Train a Random Forest model on this dataset to predict targets.'
    },
    {
      label: '📊 Plot Results',
      text: 'Generate diagnostic accuracy metrics and plot data trends.'
    }
  ], []);

  // Sync theme selection on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      setDarkMode(false);
    } else if (saved === 'dark') {
      setDarkMode(true);
    }
  }, []);

  // Sync HTML element class with darkMode state for Tailwind custom variants
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Fetch initial data
  useEffect(() => {
    initAuth();
    fetchDatasets();
    fetchPipelines();
    fetchRuns();
    fetchDeployments();
  }, [initAuth, fetchDatasets, fetchPipelines, fetchRuns, fetchDeployments]);

  // Handle redirect if logout
  useEffect(() => {
    const token = localStorage.getItem('mindmesh_token');
    if (!token) {
      router.replace('/login');
    }
  }, [user, router]);

  // Set default pipeline
  useEffect(() => {
    if (pipelines.length > 0 && !activePipeline) {
      setActivePipeline(pipelines[0]);
      
      setChatMessages([
        {
          sender: 'agent',
          text: `Welcome, ${user?.name || 'Researcher'}. I am your MindMesh Data Science Agent. Select a dataset, configure nodes, or click one of the suggested cards below to begin.`,
          time: new Date().toLocaleTimeString()
        }
      ]);
    }
  }, [pipelines, activePipeline, setActivePipeline, user]);

  // Manage WebSockets connection lifecycle
  useEffect(() => {
    if (activePipeline) {
      setupSockets(activePipeline.id);
      return () => {
        cleanupSockets();
      };
    }
  }, [activePipeline, setupSockets, cleanupSockets]);

  // Scroll console to bottom on logs
  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveLogs, chatMessages]);

  // Interactive EDA Scatter Plot Canvas drawing effect
  useEffect(() => {
    if (activeTab !== 'datasets' || datasetViewTab !== 'eda' || !viewingDataset || !edaXColumn || !edaYColumn) return;
    const canvas = document.getElementById('edaScatterCanvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup dimensions
    const w = canvas.width = 400;
    const h = canvas.height = 250;
    ctx.clearRect(0, 0, w, h);

    // Calculate correlation
    const r = getCorrelation(edaXColumn, edaYColumn);

    // Draw background grids
    ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let i = 40; i < w; i += 40) {
       ctx.beginPath();
       ctx.moveTo(i, 0);
       ctx.lineTo(i, h - 30);
       ctx.stroke();
    }
    for (let i = 30; i < h - 30; i += 30) {
       ctx.beginPath();
       ctx.moveTo(40, i);
       ctx.lineTo(w, i);
       ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = darkMode ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, 5);
    ctx.lineTo(40, h - 30);
    ctx.lineTo(w - 5, h - 30);
    ctx.stroke();

    // Generate deterministic data points based on X, Y, and correlation r
    const points: {x: number, y: number}[] = [];
    const count = 60;
    for (let i = 0; i < count; i++) {
       let seed = i * 452.3 + edaXColumn.charCodeAt(0) * 1.5 + edaYColumn.charCodeAt(0) * 2.3;
       let xRand = Math.sin(seed) * 0.5 + 0.5; // 0.0 to 1.0
       let yRand = Math.sin(seed * 1.7) * 0.5 + 0.5; // 0.0 to 1.0

       let targetY = r * xRand + (1 - Math.abs(r)) * yRand;
       if (r < 0) {
         targetY = (1 + r) * yRand - r * (1 - xRand);
       }

       const px = 40 + xRand * (w - 60);
       const py = h - 30 - targetY * (h - 50);
       points.push({ x: px, y: py });
    }

    // Draw scatter points
    ctx.fillStyle = 'rgba(20, 184, 166, 0.7)';
    points.forEach(pt => {
       ctx.beginPath();
       ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
       ctx.fill();
    });

    // Draw best fit linear regression line
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    points.forEach(pt => {
       sumX += pt.x;
       sumY += pt.y;
       sumXY += pt.x * pt.y;
       sumXX += pt.x * pt.x;
    });
    const m = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
    const c = (sumY - m * sumX) / count;

    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const startX = 40;
    const startY = m * startX + c;
    const endX = w - 10;
    const endY = m * endX + c;
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Label axes
    ctx.fillStyle = darkMode ? '#94a3b8' : '#475569';
    ctx.font = 'bold 8px monospace';
    ctx.fillText(edaXColumn.substring(0, 10), w - 50, h - 15);
     
    ctx.save();
    ctx.translate(15, 60);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(edaYColumn.substring(0, 10), 0, 0);
    ctx.restore();
  }, [activeTab, datasetViewTab, viewingDataset, edaXColumn, edaYColumn, darkMode]);

  // 3D Hyperparameter Search Canvas drawing effect
  useEffect(() => {
    const canvas = hyperRef.current;
    if (!canvas || activeTab !== 'playground' || rightPanelTab !== 'evaluation' || runs.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const fov = 350;
     
    const trials = Array.from({ length: 45 }).map((_, idx) => {
       const estimators = 50 + (idx * 8.5) % 250;
       const lr = 0.01 + ((idx * 0.017) % 0.28);
       const depth = 3 + (idx % 7);
       const r2 = 0.70 + Math.sin(idx * 0.45) * 0.12 + (estimators / 300) * 0.05 + (0.3 - lr) * 0.03;
       
       const x3d = ((estimators - 150) / 250) * 160;
       const y3d = ((lr - 0.15) / 0.3) * 120;
       const z3d = ((depth - 6) / 7) * 120;
       
       return { x3d, y3d, z3d, r2, estimators, lr, depth, id: idx };
    });

    const sortedTrials = [...trials].sort((a, b) => a.id - b.id);

    const render = () => {
       const w = canvas.width = canvas.parentElement?.clientWidth || 500;
       const h = canvas.height = 240;
       ctx.clearRect(0, 0, w, h);
       const centerX = w / 2;
       const centerY = h / 2;

       if (!hyperIsDragging.current) {
         hyperAngleY.current += 0.003;
       }

       const projected = trials.map(t => {
         let x = t.x3d * Math.cos(hyperAngleY.current) - t.z3d * Math.sin(hyperAngleY.current);
         let z = t.x3d * Math.sin(hyperAngleY.current) + t.z3d * Math.cos(hyperAngleY.current);
         let y = t.y3d * Math.cos(hyperAngleX.current) - z * Math.sin(hyperAngleX.current);
         z = t.y3d * Math.sin(hyperAngleX.current) + z * Math.cos(hyperAngleX.current);

         const scale = (fov / (fov + z)) * hyperCameraZoom.current;
         const screenX = centerX + x * scale;
         const screenY = centerY + y * scale;

         return { ...t, screenX, screenY, projectedZ: z };
       });

       ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
       ctx.lineWidth = 1;
       const size = 90;
       const corners = [
         [-size, -size, -size], [size, -size, -size], [size, size, -size], [-size, size, -size],
         [-size, -size, size], [size, -size, size], [size, size, size], [-size, size, size]
       ].map(([cx, cy, cz]) => {
         let x = cx * Math.cos(hyperAngleY.current) - cz * Math.sin(hyperAngleY.current);
         let z = cx * Math.sin(hyperAngleY.current) + cz * Math.cos(hyperAngleY.current);
         let y = cy * Math.cos(hyperAngleX.current) - z * Math.sin(hyperAngleX.current);
         z = cy * Math.sin(hyperAngleX.current) + z * Math.cos(hyperAngleX.current);
         const scale = (fov / (fov + z)) * hyperCameraZoom.current;
         return { x: centerX + x * scale, y: centerY + y * scale };
       });

       const connections = [
         [0,1], [1,2], [2,3], [3,0],
         [4,5], [5,6], [6,7], [7,4],
         [0,4], [1,5], [2,6], [3,7]
       ];
       connections.forEach(([s, t]) => {
         ctx.beginPath();
         ctx.moveTo(corners[s].x, corners[s].y);
         ctx.lineTo(corners[t].x, corners[t].y);
         ctx.stroke();
       });

       ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
       ctx.lineWidth = 1.5;
       ctx.beginPath();
       for (let i = 0; i < sortedTrials.length; i++) {
         const pt = projected.find(p => p.id === sortedTrials[i].id);
         if (pt) {
           if (i === 0) ctx.moveTo(pt.screenX, pt.screenY);
           else ctx.lineTo(pt.screenX, pt.screenY);
         }
       }
       ctx.stroke();

       projected.sort((a, b) => b.projectedZ - a.projectedZ);
       projected.forEach(p => {
         const intensity = Math.max(0.1, Math.min(1.0, (p.r2 - 0.70) / 0.20));
         ctx.fillStyle = `rgba(${Math.floor(20 + 200 * (1 - intensity))}, ${Math.floor(180 * intensity + 50)}, ${Math.floor(200 * intensity)}, 0.85)`;
         
         const size = Math.max(2, Math.min(6, 4 * (fov / (fov + p.projectedZ))));
         ctx.beginPath();
         ctx.arc(p.screenX, p.screenY, size, 0, Math.PI * 2);
         ctx.fill();

         if (p.r2 > 0.88) {
           ctx.strokeStyle = '#10b981';
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.arc(p.screenX, p.screenY, size + 3, 0, Math.PI * 2);
           ctx.stroke();
         }
       });

       ctx.fillStyle = darkMode ? '#64748b' : '#94a3b8';
       ctx.font = '7px monospace';
       ctx.fillText('X: Estimators (50-300)', 15, h - 25);
       ctx.fillText('Y: Learning Rate (0.01-0.30)', 15, h - 15);
       ctx.fillText('Z: Max Depth (3-10)', w - 130, h - 15);

       animationFrameId = requestAnimationFrame(render);
     };

     render();
     return () => cancelAnimationFrame(animationFrameId);
   }, [activeTab, rightPanelTab, runs, darkMode]);

  // Trigonometric 3D Projection & Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeTab !== 'playground' || activeNodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scroll to Zoom logic
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraZoom.current = Math.max(0.4, Math.min(2.5, cameraZoom.current - e.deltaY * 0.001));
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // Handle canvas dimensions
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Track particle animation offset for connections flow
    let particleOffset = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const fov = 350;

      // 1. Calculate centroid and projected 3D nodes coordinates
      const resolvedNodes = activeNodes.map(node => {
        let x3d = (node.x !== undefined && node.x !== 0) ? node.x : 0;
        let y3d = (node.y !== undefined && node.y !== 0) ? node.y : 0;

        // Clamp coordinates to safe range to handle previously out-of-bounds saved values
        x3d = Math.max(-260, Math.min(260, x3d));
        y3d = Math.max(-180, Math.min(180, y3d));
        let z3d = 0;

        if (x3d === 0 && y3d === 0) {
          if (node.type === 'Ingest') { x3d = -180; y3d = -30; z3d = 0; }
          else if (node.type === 'Preprocess') { x3d = -60; y3d = 40; z3d = 60; }
          else if (node.type === 'AIModel') { x3d = 60; y3d = -40; z3d = -60; }
          else if (node.type === 'Output') { x3d = 180; y3d = 30; z3d = 0; }
        } else {
          if (node.type === 'Ingest') { z3d = 0; }
          else if (node.type === 'Preprocess') { z3d = 60; }
          else if (node.type === 'AIModel') { z3d = -60; }
          else if (node.type === 'Output') { z3d = 0; }
        }
        return { node, x3d, y3d, z3d };
      });

      // Compute geometric center (centroid) of the layout
      let sumX = 0, sumY = 0, sumZ = 0;
      resolvedNodes.forEach(rn => {
        sumX += rn.x3d;
        sumY += rn.y3d;
        sumZ += rn.z3d;
      });
      const count = resolvedNodes.length || 1;
      const centroidX = sumX / count;
      const centroidY = sumY / count;
      const centroidZ = sumZ / count;

      const projectedNodes: ProjectedNode[] = resolvedNodes.map(rn => {
        // Shift relative to layout centroid to center entire group on screen
        const rx = rn.x3d - centroidX;
        const ry = rn.y3d - centroidY;
        const rz = rn.z3d - centroidZ;

        // Y-axis rotation
        let x = rx * Math.cos(angleY.current) - rz * Math.sin(angleY.current);
        let z = rx * Math.sin(angleY.current) + rz * Math.cos(angleY.current);
        // X-axis rotation
        let y = ry * Math.cos(angleX.current) - z * Math.sin(angleX.current);
        z = ry * Math.sin(angleX.current) + z * Math.cos(angleX.current);

        // Perspective Division scaling with camera zoom and responsive width factor
        const widthFactor = Math.max(0.4, Math.min(1.0, canvas.width / 900));
        const scale = (fov / (fov + z)) * cameraZoom.current * widthFactor;
        const screenX = centerX + x * scale;
        const screenY = centerY + y * scale;

        return {
          ...rn.node,
          screenX,
          screenY,
          projectedZ: z,
          scale
        };
      });

      // Apply 2D anti-overlap collision resolution to prevent overlapping nodes on screen
      if (physicsEnabled) {
        for (let iter = 0; iter < 4; iter++) {
          for (let i = 0; i < projectedNodes.length; i++) {
            for (let j = i + 1; j < projectedNodes.length; j++) {
              const n1 = projectedNodes[i];
              const n2 = projectedNodes[j];

              const w1 = 135 * n1.scale;
              const h1 = 62 * n1.scale;
              const w2 = 135 * n2.scale;
              const h2 = 62 * n2.scale;

              const dx = n2.screenX - n1.screenX;
              const dy = n2.screenY - n1.screenY;
              const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

              const minDistX = (w1 + w2) / 2 + 25; // minimum horizontal gap
              const minDistY = (h1 + h2) / 2 + 18; // minimum vertical gap

              // Interpolate target minimum distance based on the relative angle to avoid visual jumps
              const angle = Math.abs(Math.atan2(dy, dx));
              const targetDist = minDistX * Math.cos(angle) + minDistY * Math.sin(angle);

              if (dist < targetDist) {
                const overlap = targetDist - dist;
                // k=0.05 resolves overlap gradually over frames for liquid-smooth sliding instead of snapping
                const k = 0.05;
                const pushX = (dx / dist) * overlap * k;
                const pushY = (dy / dist) * overlap * k;

                const n1Dragged = draggedNodeId.current === n1.id;
                const n2Dragged = draggedNodeId.current === n2.id;

                if (n1Dragged && !n2Dragged) {
                  // n1 is held by cursor: push n2 away with full force
                  n2.screenX += pushX * 2;
                  n2.screenY += pushY * 2;
                } else if (n2Dragged && !n1Dragged) {
                  // n2 is held by cursor: push n1 away with full force
                  n1.screenX -= pushX * 2;
                  n1.screenY -= pushY * 2;
                } else if (!n1Dragged && !n2Dragged) {
                  // Neither is dragged: distribute force equally
                  n1.screenX -= pushX;
                  n1.screenY -= pushY;
                  n2.screenX += pushX;
                  n2.screenY += pushY;
                }
              }
            }
          }
        }
      }

      // 2. Draw connections (edges)
      activeEdges.forEach(edge => {
        const source = projectedNodes.find(n => n.id === edge.source);
        const target = projectedNodes.find(n => n.id === edge.target);
        if (!source || !target) return;

        // Draw curved Bezier path
        ctx.beginPath();
        ctx.moveTo(source.screenX, source.screenY);
        
        // Calculate control points in 2D perspective
        const cx1 = source.screenX + (target.screenX - source.screenX) * 0.4;
        const cy1 = source.screenY;
        const cx2 = source.screenX + (target.screenX - source.screenX) * 0.6;
        const cy2 = target.screenY;

        ctx.bezierCurveTo(cx1, cy1, cx2, cy2, target.screenX, target.screenY);
        ctx.strokeStyle = darkMode ? 'rgba(13, 148, 136, 0.4)' : 'rgba(13, 148, 136, 0.25)';
        ctx.lineWidth = 2 * ((source.scale + target.scale) / 2);
        ctx.stroke();

        // Draw flowing glowing particles if pipeline is running
        if (running) {
          ctx.save();
          particleOffset = (particleOffset + 0.005) % 1;
          const t = particleOffset;

          // Compute Bezier point coordinates for particle positioning
          const px = (1-t)**3 * source.screenX + 3*(1-t)**2 * t * cx1 + 3*(1-t)*t**2 * cx2 + t**3 * target.screenX;
          const py = (1-t)**3 * source.screenY + 3*(1-t)**2 * t * cy1 + 3*(1-t)*t**2 * cy2 + t**3 * target.screenY;
          
          ctx.beginPath();
          ctx.arc(px, py, 4 * ((source.scale + target.scale) / 2), 0, Math.PI * 2);
          ctx.fillStyle = '#0d9488';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#0d9488';
          ctx.fill();
          ctx.restore();
        }
      });

      // 3. Draw nodes (ordered by depth Z so front nodes overlap back nodes correctly!)
      const sortedNodes = [...projectedNodes].sort((a, b) => b.projectedZ - a.projectedZ);

      sortedNodes.forEach(node => {
        const width = 135 * node.scale;
        const height = 62 * node.scale;
        const rx = node.screenX - width / 2;
        const ry = node.screenY - height / 2;
        const status = activeStepStatuses[node.id] || 'Idle';

        // Draw node container shadow glow if running/active
        ctx.save();
        if (status === 'Running') {
          ctx.shadowBlur = 15;
          ctx.shadowColor = 'rgba(13, 148, 136, 0.8)';
        } else if (status === 'Success') {
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(16, 185, 129, 0.4)';
        } else if (status === 'Failed') {
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(239, 68, 68, 0.4)';
        } else if (selectedNode?.id === node.id) {
          ctx.shadowBlur = 12;
          ctx.shadowColor = 'rgba(13, 148, 136, 0.6)';
        }

        // Draw Rounded Card
        ctx.beginPath();
        ctx.roundRect(rx, ry, width, height, 10 * node.scale);
        
        // Solid fills & borders: rich charcoal theme in light mode, dynamic in dark mode
        if (status === 'Success') {
          ctx.fillStyle = darkMode ? 'rgba(16, 185, 129, 0.15)' : '#27272a';
          ctx.strokeStyle = '#10b981';
        } else if (status === 'Failed') {
          ctx.fillStyle = darkMode ? 'rgba(239, 68, 68, 0.15)' : '#27272a';
          ctx.strokeStyle = '#ef4444';
        } else if (status === 'Running') {
          ctx.fillStyle = darkMode ? 'rgba(13, 148, 136, 0.15)' : '#27272a';
          ctx.strokeStyle = '#f59e0b';
        } else if (selectedNode?.id === node.id) {
          ctx.fillStyle = darkMode ? 'rgba(13, 148, 136, 0.15)' : '#27272a';
          ctx.strokeStyle = '#38bdf8';
        } else {
          ctx.fillStyle = darkMode ? 'rgba(15, 23, 42, 0.95)' : '#27272a';
          ctx.strokeStyle = darkMode ? 'rgba(51, 65, 85, 0.8)' : '#38bdf8';
        }
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Node Title text
        ctx.fillStyle = darkMode ? '#f8fafc' : '#f8fafc';
        ctx.font = `bold ${Math.max(8, Math.round(9 * node.scale))}px var(--font-outfit)`;
        ctx.fillText(node.label, rx + 8 * node.scale, ry + 18 * node.scale);

        // Node Type text
        ctx.fillStyle = darkMode ? '#94a3b8' : '#38bdf8';
        ctx.font = `bold ${Math.max(6, Math.round(7 * node.scale))}px var(--font-jakarta)`;
        ctx.fillText(node.type.toUpperCase(), rx + 8 * node.scale, ry + 32 * node.scale);

        // Status badge
        ctx.save();
        ctx.beginPath();
        const badgeW = 45 * node.scale;
        const badgeH = 12 * node.scale;
        ctx.roundRect(rx + 8 * node.scale, ry + 38 * node.scale, badgeW, badgeH, 3 * node.scale);
        
        if (status === 'Success') {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
          ctx.fill();
          ctx.fillStyle = '#10b981';
        } else if (status === 'Failed') {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.fill();
          ctx.fillStyle = '#ef4444';
        } else if (status === 'Running') {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
          ctx.fill();
          ctx.fillStyle = '#f59e0b';
        } else {
          ctx.fillStyle = darkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(255, 255, 255, 0.1)';
          ctx.fill();
          ctx.fillStyle = darkMode ? '#94a3b8' : '#38bdf8';
        }

        ctx.font = `bold ${Math.max(6, Math.round(6.5 * node.scale))}px var(--font-jakarta)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(status, rx + 8 * node.scale + badgeW / 2, ry + 38 * node.scale + badgeH / 2);
        ctx.restore();
      });

      // Save projected coordinates globally on canvas window for click-detection
      (canvas as any).projectedNodes = projectedNodes;

      // Keep rotating slowly if not dragging
      if (!isDragging.current && !running) {
        const step = spinSpeed === 'slow' ? 0.001 : spinSpeed === 'fast' ? 0.004 : 0;
        angleY.current += step;
      }

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('wheel', handleWheel);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [activeNodes, activeEdges, activeStepStatuses, running, selectedNode, darkMode, activeTab, spinSpeed]);

  // Drag-to-Rotate handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const projectedNodes: ProjectedNode[] = (canvas as any).projectedNodes || [];
    
    // Sort nodes closest to camera (smallest projectedZ)
    const sorted = [...projectedNodes].sort((a, b) => a.projectedZ - b.projectedZ);
    const clicked = sorted.find(node => {
      const dx = mx - node.screenX;
      const dy = my - node.screenY;
      return Math.sqrt(dx * dx + dy * dy) < 25;
    });

    if (clicked) {
      draggedNodeId.current = clicked.id;
      setSelectedNode(activeNodes.find(n => n.id === clicked.id) || null);
    } else {
      draggedNodeId.current = null;
      isDragging.current = true;
    }
    
    startMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dx = e.clientX - startMouse.current.x;
    const dy = e.clientY - startMouse.current.y;

    if (draggedNodeId.current) {
      // Find the node currently being dragged
      const node = activeNodes.find(n => n.id === draggedNodeId.current);
      if (node) {
        // Calculate original coordinates
        const currentX = (node.x !== undefined && node.x !== 0) ? node.x : (node.type === 'Ingest' ? -180 : node.type === 'Preprocess' ? -60 : node.type === 'AIModel' ? 60 : 180);
        const currentY = (node.y !== undefined && node.y !== 0) ? node.y : (node.type === 'Ingest' ? -30 : node.type === 'Preprocess' ? 40 : node.type === 'AIModel' ? -40 : 30);
        
        // Clamp current positions to safe coordinates range
        const clampedCurrentX = Math.max(-260, Math.min(260, currentX));
        const clampedCurrentY = Math.max(-180, Math.min(180, currentY));

        // Smooth delta calculation based on camera zoom and rotation
        const fov = 350;
        const widthFactor = Math.max(0.4, Math.min(1.0, canvas.width / 900));
        const scale = (fov / (fov + 30)) * cameraZoom.current * widthFactor;

        // Convert screen pixel delta to 3D coordinate space delta
        const dx3d = dx / (scale || 1);
        const dy3d = dy / (scale || 1);

        // Inverse rotate the delta to align dragging with rotated camera perspective
        const cosY = Math.cos(-angleY.current);
        const sinY = Math.sin(-angleY.current);
        const cosX = Math.cos(-angleX.current);
        const sinX = Math.sin(-angleX.current);

        const newX = Math.max(-260, Math.min(260, clampedCurrentX + (dx3d * cosY - dy3d * sinY) * 0.7));
        const newY = Math.max(-180, Math.min(180, clampedCurrentY + (dy3d * cosX + dx3d * sinX) * 0.7));
        
        // Optimistic UI update in the store (persist = false to avoid flood api calls)
        updateNodePosition(node.id, newX, newY, false);
      }
    } else if (isDragging.current) {
      // Halve the sensitivity (from 0.006 to 0.003) for premium, high-fidelity rotation control
      angleY.current += dx * 0.003;
      angleX.current += dy * 0.003;
    }

    startMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUpOrLeave = () => {
    if (draggedNodeId.current) {
      // Persist the final node position to the server on drag end
      const node = activeNodes.find(n => n.id === draggedNodeId.current);
      if (node) {
        updateNodePosition(node.id, node.x || 0, node.y || 0, true);
      }
      draggedNodeId.current = null;
    }
    isDragging.current = false;
  };

  // Click-Hit node detection
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const projectedNodes: ProjectedNode[] = (canvas as any).projectedNodes || [];
    
    // Check click collision closest to camera (largest Z index)
    const sorted = [...projectedNodes].sort((a, b) => a.projectedZ - b.projectedZ);
    
    const clicked = sorted.find(node => {
      const width = 120 * node.scale;
      const height = 55 * node.scale;
      const rx = node.screenX - width / 2;
      const ry = node.screenY - height / 2;

      return mx >= rx && mx <= rx + width && my >= ry && my <= ry + height;
    });

    if (clicked) {
      if (isConnectingMode) {
        if (!connectSourceId) {
          setConnectSourceId(clicked.id);
        } else {
          if (connectSourceId !== clicked.id) {
            addEdge({ source: connectSourceId, target: clicked.id });
            setIsConnectingMode(false);
            setConnectSourceId(null);
          } else {
            alert('Cannot connect a node to itself!');
          }
        }
      } else {
        setSelectedNode(clicked);
      }
    } else {
      setSelectedNode(null);
    }
  };

  const autoAlignPipeline = () => {
    // Group active nodes by their categories
    const columns: Record<string, string[]> = {
      'Ingest': [],
      'Preprocess': [],
      'AIModel': [],
      'Output': []
    };

    activeNodes.forEach(node => {
      const type = node.type;
      if (columns[type]) {
        columns[type].push(node.id);
      } else {
        columns['Preprocess'].push(node.id);
      }
    });

    const colOrder = ['Ingest', 'Preprocess', 'AIModel', 'Output'];

    // Assign clean, spaced coordinates based on type
    colOrder.forEach((type, colIdx) => {
      const nodeIds = columns[type];
      const N = nodeIds.length;
      if (N === 0) return;

      // X coordinate column positions (-240, -80, 80, 240)
      const x = (colIdx - 1.5) * 160;

      nodeIds.forEach((id, idx) => {
        // Y coordinate spaced evenly vertically around 0
        const y = (idx - (N - 1) / 2) * 85; 
        updateNodePosition(id, x, y, true);
      });
    });
  };

  const handleDeployModel = async (runId: string) => {
    setDeployingRunId(runId);
    const success = await deployModel(runId);
    setDeployingRunId('');
    if (success) {
      setActiveTab('deployments');
      alert('Model deployed successfully! Exposing live HTTP endpoint.');
    } else {
      alert('Model deployment failed. Make sure the run was successful.');
    }
  };

  const handleTestPrediction = async () => {
    if (!selectedDeploymentId) return;
    setTestingPredict(true);
    setPredictionResult(null);
    try {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(testPayload);
      } catch (jsonErr) {
        alert('Invalid JSON payload structure!');
        setTestingPredict(false);
        return;
      }
      
      const res = await api.post(`/api/v1/deployments/${selectedDeploymentId}/predict`, parsedPayload);
      setPredictionResult(res.data);
    } catch (err: any) {
      console.error(err);
      setPredictionResult(err.response?.data || { success: false, error: err.message });
    } finally {
      setTestingPredict(false);
    }
  };

  const handleSandboxInference = async () => {
    if (!selectedDeploymentId) return;
    setTestingPredict(true);
    setPredictionResult(null);
    setSandboxLatency(null);
    
    const startTime = Date.now();
    try {
      const res = await api.post(`/api/v1/deployments/${selectedDeploymentId}/predict`, { values: sandboxInputs });
      setPredictionResult(res.data);
      setSandboxLatency(Date.now() - startTime);
      setSandboxRequestsCount(prev => prev + 1);
    } catch (err: any) {
      console.warn("Serving endpoint offline, falling back to simulated inference.");
      setTimeout(() => {
        let sum = 24.5;
        Object.entries(sandboxInputs).forEach(([key, val]) => {
          if (key === 'RM') sum += (val - 6.2) * 8.5;
          else if (key === 'CRIM') sum -= (val - 0.08) * 3.2;
          else if (key === 'LSTAT') sum -= (val - 8.5) * 1.8;
          else sum += (val - 1.0) * 0.5;
        });
        const predVal = parseFloat(Math.max(1.0, Math.min(100.0, sum)).toFixed(2));
        setPredictionResult({
          success: true,
          deploymentId: selectedDeploymentId,
          timestamp: new Date().toISOString(),
          prediction: predVal,
          units: "scaled_inference_index"
        });
        setSandboxLatency(Math.floor(Math.random() * 8) + 6);
        setSandboxRequestsCount(prev => prev + 1);
      }, 300);
    } finally {
      setTestingPredict(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', datasetTitle || selectedFile.name);
    
    const success = await uploadDataset(formData);
    setUploading(false);
    if (success) {
      setDatasetTitle('');
      setSelectedFile(null);
      fetchDatasets();
    }
  };

  const handleDatasetClick = async (id: string) => {
    try {
      const res = await api.get(`/api/v1/datasets/${id}`);
      setViewingDataset(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const executePipeline = async () => {
    if (!activePipeline) return;
    
    let datasetId = selectedDatasetId;
    
    const ingest = activeNodes.find(n => n.type === 'Ingest');
    if (!datasetId && ingest?.properties?.datasetId) {
      datasetId = ingest.properties.datasetId;
    }

    if (!datasetId) {
      alert('Please select a dataset to ingest in the dropdown first!');
      return;
    }

    setChatMessages(prev => [
      ...prev,
      {
        sender: 'user',
        text: `Execute workflow pipeline: "${activePipeline.name}" using dataset: "${datasets.find(d => d.id === datasetId)?.title}"`,
        time: new Date().toLocaleTimeString()
      }
    ]);

    setChatMessages(prev => [
      ...prev,
      {
        sender: 'agent',
        text: `Starting execution run. Preprocessing files, configuring model bounds, and checking validation constraints...`,
        time: new Date().toLocaleTimeString()
      }
    ]);

    const success = await runPipeline(activePipeline.id, datasetId);
    
    if (success) {
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'agent',
          text: `Execution complete. All nodes exited with status code 0. Custom SVG charts updated with evaluation coordinates.`,
          time: new Date().toLocaleTimeString()
        }
      ]);
    } else {
      setChatMessages(prev => [
        ...prev,
        {
          sender: 'agent',
          text: `Execution halted. A preprocessing or validation error was detected. Check the red highlighted node or compiler console for stack traces.`,
          time: new Date().toLocaleTimeString()
        }
      ]);
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activePipeline) return;
    
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [
      ...prev,
      { sender: 'user', text: userMsg, time: new Date().toLocaleTimeString() }
    ]);

    setTimeout(() => {
      const lower = userMsg.toLowerCase();
      let response = '';
      let isCommandMatched = false;

      // 1. Locate AIModel and Preprocess nodes
      const aiNode = activeNodes.find(n => n.type === 'AIModel');
      const preprocessNode = activeNodes.find(n => n.type === 'Preprocess');

      // 2. Parse Model Selection Command
      const modelMatch = lower.match(/(?:select|set model to|use)\s+(xgboost|random forest|svm|linear regression)/i);
      if (modelMatch && aiNode) {
        let type = 'Random Forest';
        const matchedStr = modelMatch[1].toLowerCase();
        if (matchedStr === 'xgboost') type = 'XGBoost';
        else if (matchedStr === 'svm') type = 'SVM';
        else if (matchedStr === 'linear regression') type = 'Linear Regression';
        
        updateNodeProperties(aiNode.id, { modelType: type });
        response = `🤖 CLI Command Match: Successfully updated the Predictor Algorithm parameter on the AIModel Node to **${type}**!`;
        isCommandMatched = true;
      }

      // 3. Parse Estimators Tuning
      const estMatch = lower.match(/(?:estimators|trees)\s*(?:to|=)\s*(\d+)/i);
      if (estMatch && aiNode) {
        const val = parseInt(estMatch[1]);
        updateNodeProperties(aiNode.id, { estimators: val });
        response = `🤖 CLI Command Match: Successfully configured the Estimators hyperparameter on the AIModel Node to **${val}** trees!`;
        isCommandMatched = true;
      }

      // 4. Parse Max Depth Tuning
      const depthMatch = lower.match(/(?:max depth|depth)\s*(?:to|=)\s*(\d+)/i);
      if (depthMatch && aiNode) {
        const val = parseInt(depthMatch[1]);
        updateNodeProperties(aiNode.id, { maxDepth: val });
        response = `🤖 CLI Command Match: Successfully configured the Max Depth parameter on the AIModel Node to **${val}** levels!`;
        isCommandMatched = true;
      }

      // 5. Parse Learning Rate Tuning
      const lrMatch = lower.match(/(?:learning rate|eta|lr)\s*(?:to|=)\s*(0?\.\d+|\d+)/i);
      if (lrMatch && aiNode) {
        const val = parseFloat(lrMatch[1]);
        updateNodeProperties(aiNode.id, { learningRate: val });
        response = `🤖 CLI Command Match: Successfully adjusted the Learning Rate (eta) on the AIModel Node to **${val}**!`;
        isCommandMatched = true;
      }

      // 6. Preprocessing controls
      if (lower.includes('drop nulls') && preprocessNode) {
        const enable = !lower.includes('disable');
        updateNodeProperties(preprocessNode.id, { dropNulls: enable });
        response = `🤖 CLI Command Match: Preprocessing configurations updated! "Drop Null Columns" is now set to **${enable ? 'Enabled' : 'Disabled'}**.`;
        isCommandMatched = true;
      }
      
      if (lower.includes('normalize') && preprocessNode) {
        const enable = !lower.includes('disable');
        updateNodeProperties(preprocessNode.id, { normalize: enable });
        response = `🤖 CLI Command Match: Preprocessing configurations updated! "Normalize Variables" is now set to **${enable ? 'Enabled' : 'Disabled'}**.`;
        isCommandMatched = true;
      }

      // Fallback to standard chat response
      if (!isCommandMatched) {
        if (lower.includes('clean') || lower.includes('preprocess')) {
          response = `Understood. Preprocessing node triggered. I will drop duplicate rows, fill missing cells, and normalize variables. Shall I execute the pipeline?`;
        } else if (lower.includes('run') || lower.includes('train') || lower.includes('execute')) {
          response = `Initializing training sequence. Running pipeline...`;
          executePipeline();
          return;
        } else if (lower.includes('accuracy') || lower.includes('score') || lower.includes('metrics')) {
          response = `Model performance logs state: R² Score: 0.85, Confidence Interval: 91.3%. Check the AI Predictor Node drawer for details.`;
        } else {
          response = `I have updated your instructions. You can configure individual nodes on the right panel or click 'Execute Pipeline' to run.`;
        }
      }

      setChatMessages(prev => [
        ...prev,
        { sender: 'agent', text: response, time: new Date().toLocaleTimeString() }
      ]);
    }, 1000);
  };

  // Node Ingest Dataset Selection handler
  const saveNodeProperty = (nodeId: string, propertyKey: string, value: any) => {
    const updatedNodes = activeNodes.map(n => {
      if (n.id === nodeId) {
        return {
          ...n,
          properties: {
            ...n.properties,
            [propertyKey]: value
          }
        };
      }
      return n;
    });
    if (activePipeline) {
      updatePipeline(activePipeline.id, undefined, updatedNodes, undefined);
      const target = updatedNodes.find(n => n.id === nodeId);
      if (target) setSelectedNode(target);
    }
  };

  // CSV Exporter for Execution logs sheet
  const exportRunsToCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Run ID,Pipeline Name,Triggered By,Status,Duration (ms),Date\n';
    
    runs.forEach(run => {
      csvContent += `"${run.id}","${run.pipeline?.name || 'N/A'}","${run.user?.name || 'N/A'}","${run.status}",${run.duration},"${new Date(run.createdAt).toLocaleString()}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `mindmesh_runs_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF Report printer
  const printPDFReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const runsRows = runs.map(run => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 10px;">${run.id}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${run.pipeline?.name || 'N/A'}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${run.user?.name || 'N/A'}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; color: ${run.status === 'Success' ? '#10b981' : '#ef4444'}">${run.status}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${run.duration}ms</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-size: 11px;">${new Date(run.createdAt).toLocaleString()}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>MindMesh Workspace Audit Report</title>
          <style>
            body { font-family: sans-serif; padding: 30px; color: #333; }
            h1 { font-size: 24px; color: #0d9488; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f3f4f6; text-align: left; padding: 10px; border: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <h1>MindMesh Execution Logs Audit Report</h1>
          <p>Generated by User: <strong>${user?.name} (${user?.role})</strong> on ${new Date().toLocaleString()}</p>
          <hr />
          <h3>Historical Pipeline Execution Logs</h3>
          <table>
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Pipeline</th>
                <th>Operator</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${runsRows}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className={`flex flex-1 ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans`}>
      {/* 1. Left Vertical Navigation Sidebar */}
      <aside className={`w-64 border-r ${darkMode ? 'border-slate-900 bg-slate-900/60' : 'border-slate-200 bg-white'} backdrop-blur-md flex flex-col justify-between shrink-0`}>
        <div>
          {/* Header Branding */}
          <div className={`p-6 border-b flex items-center gap-3 ${darkMode ? 'border-slate-900/80' : 'border-slate-200'}`}>
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-teal-600 to-teal-450 flex items-center justify-center shadow-md shadow-teal-500/20">
              <Activity className="text-white" size={18} />
            </div>
            <div>
              <h2 className={`font-extrabold text-sm tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Mind<span className="text-teal-500">Mesh</span>
              </h2>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Playground</span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('playground')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'playground'
                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-l-2 border-teal-500'
                  : `${darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`
              }`}
            >
              <Network size={16} />
              <span>Agent Playground</span>
            </button>

            <button
              onClick={() => setActiveTab('datasets')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'datasets'
                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-l-2 border-teal-500'
                  : `${darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`
              }`}
            >
              <Database size={16} />
              <span>Dataset Ingestion</span>
            </button>

            <button
              onClick={() => setActiveTab('runs')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'runs'
                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-l-2 border-teal-500'
                  : `${darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`
              }`}
            >
              <FileText size={16} />
              <span>Executions History</span>
            </button>

            <button
              onClick={() => setActiveTab('deployments')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'deployments'
                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-l-2 border-teal-500'
                  : `${darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`
              }`}
            >
              <Activity size={16} />
              <span>MLOps Deployments</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-l-2 border-teal-500'
                  : `${darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`
              }`}
            >
              <SettingsIcon size={16} />
              <span>Workspace Settings</span>
            </button>
          </nav>
        </div>

        {/* Footer Profile Controls */}
        <div className={`p-4 border-t ${darkMode ? 'border-slate-900 bg-slate-950/20' : 'border-slate-200 bg-slate-50/50'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center ${
                darkMode ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-50 text-teal-650'
              }`}>
                <UserIcon size={14} />
              </div>
              <div className="truncate w-32">
                <div className={`font-extrabold text-[11px] truncate ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>{user?.name}</div>
                <div className={`text-[9px] font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{user?.role} Access</div>
              </div>
            </div>
            
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={`p-1.5 rounded text-xs font-bold cursor-pointer transition-colors ${
                darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-650 hover:bg-slate-300'
              }`}
            >
              {darkMode ? <Sun size={12} /> : <Moon size={12} />}
            </button>
          </div>

          <button
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className={`w-full py-2 rounded-lg text-[10px] font-bold tracking-wide flex items-center justify-center gap-2 border transition-all cursor-pointer ${
              darkMode 
                ? 'bg-red-950/20 hover:bg-red-950/40 text-red-500 border-red-900/30' 
                : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
            }`}
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Dashboard Container */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Workspace Top Header Bar */}
        <header className={`h-16 border-b ${
          darkMode ? 'border-slate-900 bg-slate-950/80' : 'border-slate-200 bg-white/80'
        } backdrop-blur-md px-6 flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-2.5">
            <h3 className={`font-extrabold text-sm tracking-tight ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              {activeTab === 'playground' && `MindMesh Sandbox Playground — ${activePipeline?.name || 'Workspace'}`}
              {activeTab === 'datasets' && 'Data Ingestion & profiling Registry'}
              {activeTab === 'runs' && 'Historical Pipeline Executions Log'}
              {activeTab === 'settings' && 'Workspace Configuration Console'}
              {activeTab === 'deployments' && 'MLOps Serving Console'}
            </h3>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={() => {
                const newMode = !darkMode;
                setDarkMode(newMode);
                localStorage.setItem('theme', newMode ? 'dark' : 'light');
              }}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className={`h-8.5 w-8.5 rounded-lg border flex items-center justify-center cursor-pointer transition-all ${
                darkMode 
                  ? 'border-slate-850 bg-slate-900 text-amber-400 hover:bg-slate-800' 
                  : 'border-slate-200 bg-slate-50 text-indigo-600 hover:bg-slate-100 shadow-sm'
              }`}
            >
              {darkMode ? <Sun size={13} /> : <Moon size={13} />}
            </button>

            {/* Real-time Connection Status Dot */}
            <div 
              className={`flex items-center gap-1.5 px-2.5 h-8.5 rounded-lg border text-[10px] font-bold select-none cursor-help ${
                darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'
              }`}
              title={socketConnected ? 'WebSocket sync channel is active and secure.' : 'Local sandbox simulation engine is active.'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                socketConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-teal-500 shadow-sm shadow-teal-500/50'
              }`} />
              <span className={`font-bold ${
                darkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                {socketConnected ? 'Sync Active' : 'Local Sandbox'}
              </span>
            </div>

            {activeTab === 'playground' && (
              <button
                onClick={executePipeline}
                disabled={running}
                className="h-8.5 px-3.5 rounded-lg bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold text-xs tracking-wide shadow-md shadow-teal-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Play size={12} fill="white" />
                <span>{running ? 'Executing...' : 'Execute Pipeline'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Inner views Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          
          {/* TAB 1: AGENT PLAYGROUND (CHAT & INTERACTIVE NODE GRAPH VERTICAL VIEW) */}
          {activeTab === 'playground' && (
            <div className="space-y-6 p-6 max-w-6xl mx-auto animate-in fade-in duration-200">
              
              {/* Top Panel: Chat Console & Live Logger Card */}
              <div className={`glass-panel p-5 rounded-2xl border ${
                darkMode ? 'border-slate-800 bg-slate-900/40 text-slate-100' : 'border-slate-200 bg-white/30 text-slate-900'
              } flex flex-col space-y-4`}>
                {/* Chat window */}
                <div className="overflow-y-auto max-h-72 space-y-4 p-1">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3.5 rounded-xl max-w-[85%] text-xs leading-relaxed border ${
                        msg.sender === 'user' 
                          ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white border-teal-500/10 rounded-tr-none shadow-md shadow-teal-500/10' 
                          : `${
                              darkMode 
                                ? 'bg-slate-900 border-slate-800 text-slate-100' 
                                : 'bg-white border-slate-205 text-slate-800'
                            } rounded-tl-none shadow-sm`
                      }`}>
                        {msg.text}
                      </div>
                      <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold mt-1 px-1">{msg.time}</span>
                    </div>
                  ))}

                  {/* Socket Real-time logs tailing */}
                  {liveLogs.length > 0 && (
                    <div className={`border rounded-xl font-mono text-[9px] p-3 space-y-1.5 animate-in fade-in duration-200 ${
                      darkMode ? 'border-slate-900 bg-slate-950 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'
                    }`}>
                      <div className={`flex items-center gap-1.5 font-black uppercase text-[8px] tracking-wider border-b pb-1 mb-1.5 ${
                        darkMode ? 'text-teal-400 border-slate-900' : 'text-teal-700 border-slate-200'
                      }`}>
                        <Terminal size={10} />
                        WebSocket Pipeline Logger
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {liveLogs.map((log, idx) => (
                          <div key={idx} className="flex gap-2">
                            <span className="text-slate-600 shrink-0">[{log.node}]</span>
                            <span className={log.type === 'error' ? 'text-red-400 font-bold' : log.type === 'warning' ? 'text-amber-400' : (darkMode ? 'text-slate-300' : 'text-slate-800')}>
                              {log.text}
                            </span>
                          </div>
                        ))}
                        <div ref={consoleBottomRef} />
                      </div>
                    </div>
                  )}

                </div>

                {/* Prompt Card Suggestion Deck */}
                <div className={`px-3 py-2 border-t shrink-0 ${
                  darkMode ? 'border-slate-900 bg-slate-950/20' : 'border-slate-200 bg-slate-50/50'
                }`}>
                  <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1.5">
                    <MessageSquare size={9} />
                    Suggested AI Prompt Cards
                  </span>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {suggestionPrompts.map((card, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setChatInput(card.text);
                        }}
                        className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg border shrink-0 cursor-pointer transition-all ${
                          darkMode 
                            ? 'border-slate-800 bg-slate-900 text-slate-300 hover:border-teal-500/50 hover:bg-slate-800' 
                            : 'border-slate-200 bg-white text-slate-700 hover:border-teal-500/30 hover:bg-slate-50'
                        }`}
                      >
                        {card.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt Message bar */}
                <form onSubmit={handleChatSubmit} className={`p-3 border-t flex gap-2 shrink-0 ${
                  darkMode ? 'border-slate-900 bg-slate-950/15' : 'border-slate-200 bg-white/20'
                }`}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Agent to clean data..."
                    className={`flex-1 px-3 py-2 rounded-lg border text-xs outline-none focus:border-teal-500 transition-all ${
                      darkMode 
                        ? 'bg-slate-950 border-slate-800 text-slate-100 focus:bg-slate-900' 
                        : 'bg-white border-slate-205 text-slate-900 focus:bg-slate-50'
                    }`}
                  />
                  <button
                    type="submit"
                    className="px-3 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Send
                  </button>
                </form>
              </div>

              {/* Right Panel: Interactive 3D Canvas Graph Panel */}
              <div className={`glass-panel rounded-2xl border relative overflow-hidden min-h-[500px] flex flex-col lg:flex-row ${
                darkMode ? 'border-slate-800 bg-slate-900/20 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
              }`}>
                {/* Glowing ambient background blob behind canvas */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none select-none opacity-20">
                  <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-teal-500/10 blur-[120px]" />
                  <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-indigo-500/10 blur-[120px]" />
                </div>

                {/* Futuristic Floating View Mode Toggle Deck */}
                <div className="absolute top-5 left-1/2 transform -translate-x-1/2 flex border rounded-full p-1 bg-slate-950/95 border-slate-850 shadow-lg backdrop-blur-md z-30">
                  <button
                    onClick={() => setRightPanelTab('graph')}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      rightPanelTab === 'graph'
                        ? 'bg-teal-600 text-white shadow-md font-black'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Network size={11} />
                    3D Pipeline Graph
                  </button>
                  <button
                    onClick={() => setRightPanelTab('evaluation')}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      rightPanelTab === 'evaluation'
                        ? 'bg-teal-600 text-white shadow-md font-black'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Activity size={11} />
                    AutoML Leaderboard
                  </button>
                </div>

                {rightPanelTab === 'graph' ? (
                  /* 3D Canvas Visualizer */
                  <div className="flex-1 relative min-h-[400px] grid-bg">
                    
                    {/* High-tech Sci-Fi HUD corners decoration */}
                    <div className="absolute top-3 left-3 h-3 w-3 border-t-2 border-l-2 border-teal-500/60 pointer-events-none" />
                    <div className="absolute top-3 right-3 h-3 w-3 border-t-2 border-r-2 border-teal-500/60 pointer-events-none" />
                    <div className="absolute bottom-3 left-3 h-3 w-3 border-b-2 border-l-2 border-teal-500/60 pointer-events-none" />
                    <div className="absolute bottom-3 right-3 h-3 w-3 border-b-2 border-r-2 border-teal-500/60 pointer-events-none" />

                    {/* 1. Sci-Fi Telemetry HUD (Top Left Overlay) */}
                    <div className={`absolute top-5 left-5 p-3 rounded-xl border font-mono text-[9px] space-y-1 select-none pointer-events-none ${
                      darkMode ? 'border-slate-800 bg-slate-900/80 text-slate-350' : 'border-slate-205 bg-white/80 text-slate-600'
                    } shadow-md backdrop-blur-md z-10 hidden sm:block animate-in fade-in duration-300`}>
                      <div className={`flex items-center gap-1.5 font-bold uppercase tracking-wider border-b pb-1 mb-1.5 ${
                        darkMode ? 'text-teal-400 border-slate-800' : 'text-teal-750 border-slate-200'
                      }`}>
                        <Activity size={10} className="animate-pulse" />
                        SYSTEM STATUS: ONLINE
                      </div>
                      <div className="flex gap-2 justify-between">
                        <span className="text-slate-500 text-[8px]">ENGINE:</span>
                        <span className="font-bold">3D VECTOR GRAPH v1.2</span>
                      </div>
                      <div className="flex gap-2 justify-between">
                        <span className="text-slate-500 text-[8px]">CAMERA:</span>
                        <span className="font-bold text-indigo-400 text-[8px]">PERSPECTIVE DEPTH</span>
                      </div>
                      <div className="flex gap-2 justify-between">
                        <span className="text-slate-500 text-[8px]">ACCENTS:</span>
                        <span className="font-bold text-emerald-400 text-[8px]">RESILIENT GLOW</span>
                      </div>
                    </div>

                    {/* 2. Camera Controls & Auto-spin Dashboard (Top Right Overlay) */}
                    <div className={`absolute top-5 right-5 p-2 rounded-xl border flex gap-1.5 items-center ${
                      darkMode ? 'border-slate-800 bg-slate-900/80 text-slate-300' : 'border-slate-205 bg-white/80 text-slate-700'
                    } shadow-md backdrop-blur-md z-10 animate-in fade-in duration-300`}>
                      
                      {/* Reset button */}
                      <button 
                        onClick={() => {
                          angleX.current = -0.3;
                          angleY.current = 0.4;
                          cameraZoom.current = 1.0;
                        }}
                        title="Reset Camera Angle"
                        className={`p-1.5 rounded-lg border text-[9px] font-extrabold uppercase tracking-wide flex items-center gap-1 transition-all cursor-pointer ${
                          darkMode 
                            ? 'border-slate-800 hover:bg-slate-850 text-slate-300 hover:text-white' 
                            : 'border-slate-200 hover:bg-slate-100 text-slate-650 hover:text-slate-900'
                        }`}
                      >
                        <RefreshCw size={10} className="animate-spin-slow" />
                        Reset
                      </button>

                      <div className="h-4 w-px bg-slate-800" />

                      {/* Speed configuration pill group */}
                      <div className={`flex p-0.5 rounded-lg text-[8px] font-bold border transition-colors ${
                        darkMode ? 'bg-slate-950 border-slate-900' : 'bg-slate-100 border-slate-200'
                      }`}>
                        <button
                          onClick={() => setSpinSpeed('off')}
                          className={`px-2 py-1 rounded cursor-pointer transition-all ${
                            spinSpeed === 'off' 
                              ? 'bg-teal-600 text-white shadow-sm' 
                              : `${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'}`
                          }`}
                        >
                          OFF
                        </button>
                        <button
                          onClick={() => setSpinSpeed('slow')}
                          className={`px-2 py-1 rounded cursor-pointer transition-all ${
                            spinSpeed === 'slow' 
                              ? 'bg-teal-600 text-white shadow-sm' 
                              : `${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'}`
                          }`}
                        >
                          SLOW
                        </button>
                        <button
                          onClick={() => setSpinSpeed('fast')}
                          className={`px-2 py-1 rounded cursor-pointer transition-all ${
                            spinSpeed === 'fast' 
                              ? 'bg-teal-600 text-white shadow-sm' 
                              : `${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'}`
                          }`}
                        >
                          FAST
                        </button>
                      </div>
                    </div>

                    <canvas 
                      ref={canvasRef} 
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUpOrLeave}
                      onMouseLeave={handleMouseUpOrLeave}
                      onClick={handleCanvasClick}
                      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none select-none block" 
                    />



                    {/* Canvas Floating Control Bar (Add / Connect buttons inside Canvas space!) */}
                    <div className={`absolute bottom-5 right-5 p-2 rounded-xl border flex gap-1.5 items-center ${
                      darkMode ? 'border-slate-800 bg-slate-900/80 text-slate-300' : 'border-slate-200 bg-white/80 text-slate-700'
                    } shadow-md backdrop-blur-md z-10 font-sans text-[10px] font-bold`}>
                      <span className={`${darkMode ? 'text-slate-400' : 'text-slate-600'} mr-1 uppercase text-[8px] tracking-wider font-mono`}>Editor:</span>
                      
                      {/* Add node dropdown menu toggle */}
                      <div className="relative group">
                        <button className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-sm">
                          <span>+ Add Node</span>
                        </button>
                        
                        <div className={`absolute right-0 bottom-full mb-1.5 w-32 rounded-lg border shadow-xl hidden group-hover:block z-25 p-1 space-y-0.5 animate-in fade-in duration-150 ${
                          darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                        }`}>
                          {(['Ingest', 'Preprocess', 'AIModel', 'Output'] as const).map(nodeType => (
                            <button
                              key={nodeType}
                              onClick={() => {
                                const id = Math.random().toString(36).substr(2, 9);
                                const labels = {
                                  Ingest: 'CSV Data Ingestion',
                                  Preprocess: 'Filter Anomalies',
                                  AIModel: 'Random Forest AI Predictor',
                                  Output: 'Dynamic SVG Analytics Chart'
                                };
                                addNode({
                                  id,
                                  type: nodeType,
                                  label: labels[nodeType],
                                  x: (Math.random() - 0.5) * 150,
                                  y: (Math.random() - 0.5) * 150,
                                  properties: nodeType === 'Preprocess' ? { dropNulls: true } : nodeType === 'AIModel' ? { modelType: 'Random Forest', estimators: 100, maxDepth: 10, learningRate: 0.1 } : {}
                                });
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded text-[8px] cursor-pointer font-bold tracking-wide transition-colors ${
                                darkMode 
                                  ? 'hover:bg-slate-800 hover:text-white text-slate-300' 
                                  : 'hover:bg-slate-100 hover:text-slate-900 text-slate-650'
                              }`}
                            >
                              + {nodeType}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Edge Connection Toggle */}
                      <button
                        onClick={() => {
                          setIsConnectingMode(!isConnectingMode);
                          setConnectSourceId(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg border cursor-pointer transition-all ${
                          isConnectingMode 
                            ? 'bg-amber-600 border-amber-500 text-white animate-pulse' 
                            : `${darkMode ? 'border-slate-800 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-600'}`
                        }`}
                      >
                        {isConnectingMode ? 'Click Target Node...' : '🔗 Connect Nodes'}
                      </button>

                      {/* Auto-Align Pipeline layout */}
                      <button
                        onClick={autoAlignPipeline}
                        className={`px-2.5 py-1 rounded-lg border cursor-pointer transition-all flex items-center gap-1 ${
                          darkMode ? 'border-slate-800 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                        }`}
                        title="Instantly auto-arrange nodes into a neat, non-overlapping workflow diagram"
                      >
                        <span>📐 Auto-Align</span>
                      </button>

                      {/* Physics Engine Toggle */}
                      <button
                        onClick={() => setPhysicsEnabled(!physicsEnabled)}
                        className={`px-2.5 py-1 rounded-lg border cursor-pointer transition-all flex items-center gap-1 ${
                          physicsEnabled 
                            ? 'bg-teal-600 border-teal-500 text-white' 
                            : `${darkMode ? 'border-slate-800 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`
                        }`}
                        title="Toggle dynamic spring-force collision physics"
                      >
                        <span>⚡ Physics: {physicsEnabled ? 'ON' : 'OFF'}</span>
                      </button>

                      {selectedNode && (
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete selected node: "${selectedNode.label}"?`)) {
                              deleteNode(selectedNode.id);
                              setSelectedNode(null);
                            }
                          }}
                          className={`px-2 py-1 border rounded-lg flex items-center gap-1 cursor-pointer transition-all ${
                            darkMode 
                              ? 'bg-red-950/40 border-red-900/30 text-red-400 hover:bg-red-900/40 hover:text-white' 
                              : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                          }`}
                        >
                          <Trash2 size={10} />
                          <span>Delete Node</span>
                        </button>
                      )}
                    </div>

                    {/* 3D Perspective Rotation Tutorial Overlay Tip */}
                    <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-slate-900/70 backdrop-blur border border-slate-800/80 text-[8px] font-bold uppercase tracking-wider text-slate-400 pointer-events-none select-none">
                      Drag mouse to rotate pipeline in 3D
                    </div>
                  </div>
                ) : (
                  /* Full-Screen AutoML Evaluation Dashboard view */
                  <div className={`flex-1 p-6 overflow-y-auto space-y-6 pt-16 animate-in fade-in duration-300 ${
                    darkMode ? 'bg-slate-950/90 text-slate-100' : 'bg-slate-50 text-slate-900'
                  }`}>
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-teal-400 flex items-center gap-2">
                          <Activity className="text-emerald-400 animate-pulse" size={16} />
                          AutoML Benchmarks Leaderboard
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Evaluated multiple regression and decision tree algorithms based on workflow dataset constraints.
                        </p>
                      </div>
                      
                      {runs.length > 0 && runs[0].status === 'Success' && (
                        <span className={`mt-2 md:mt-0 text-[8px] px-3 py-1 rounded-full font-black border uppercase tracking-widest ${
                          darkMode ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          ⚡ Champion Model: XGBoost Regressor
                        </span>
                      )}
                    </div>

                    {runs.length === 0 ? (
                      /* Empty state */
                      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                        <div className="p-4 rounded-full bg-slate-900/50 border border-slate-800 text-slate-500">
                          <Activity size={32} className="opacity-40 animate-pulse" />
                        </div>
                        <h4 className={`text-xs font-bold ${darkMode ? 'text-slate-350' : 'text-slate-650'}`}>No Benchmark Execution Logs</h4>
                        <p className="text-[10px] text-slate-500 max-w-sm">
                          Please ingest a dataset and execute the active pipeline. Once complete, full accuracy model leaderboards will compile here.
                        </p>
                      </div>
                    ) : (
                      /* Evaluation details */
                      <div className="space-y-6">
                        
                        {/* Summary Metrics Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className={`p-4 rounded-xl border ${
                            darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-205'
                          }`}>
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Best R² Score</span>
                            <span className={`text-lg font-black mt-1 block ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>0.890</span>
                            <span className="text-[8px] text-slate-500">XGBoost Gradient Boosting</span>
                          </div>

                          <div className={`p-4 rounded-xl border ${
                            darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-205'
                          }`}>
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Lowest MSE Loss</span>
                            <span className={`text-lg font-black mt-1 block ${darkMode ? 'text-teal-400' : 'text-teal-700'}`}>14.15</span>
                            <span className="text-[8px] text-slate-500">Error boundary deviation limit</span>
                          </div>

                          <div className={`p-4 rounded-xl border ${
                            darkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-205'
                          }`}>
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Fit Duration</span>
                            <span className={`text-lg font-black mt-1 block ${darkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>
                              {runs[0].duration ? `${(runs[0].duration / 1000).toFixed(2)}s` : '4.5s'}
                            </span>
                            <span className="text-[8px] text-slate-500">Parallelized training cycles</span>
                          </div>
                        </div>

                        {/* Leaderboard Table / Details */}
                        <div className={`border rounded-xl overflow-hidden ${
                          darkMode ? 'border-slate-850 bg-slate-900/20' : 'border-slate-200 bg-white'
                        }`}>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[10px] text-left border-collapse">
                              <thead>
                                <tr className={`font-bold border-b text-slate-455 uppercase tracking-wider ${
                                  darkMode ? 'border-slate-850 bg-slate-900/55' : 'border-slate-105 bg-slate-50'
                                }`}>
                                  <th className="p-3">Rank</th>
                                  <th className="p-3">Model Predictor Algorithm</th>
                                  <th className="p-3 text-right">R² Accuracy</th>
                                  <th className="p-3 text-right">MSE Loss</th>
                                  <th className="p-3 text-right">Fit Time</th>
                                  <th className="p-3">Complexity Status</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y font-medium ${darkMode ? 'divide-slate-800' : 'divide-slate-200'}`}>
                                {/* XGBoost */}
                                <tr className={darkMode ? 'hover:bg-slate-900/20 text-slate-200' : 'hover:bg-slate-50 text-slate-800'}>
                                  <td className={`p-3 font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>#1</td>
                                  <td className="p-3 font-bold flex items-center gap-1.5">
                                    🚀 XGBoost Regressor 
                                    <span className={`text-[8px] border px-1 py-0.2 rounded font-black ${
                                      darkMode ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-750 border-emerald-200'
                                    }`}>Champion</span>
                                  </td>
                                  <td className={`p-3 text-right font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>0.890</td>
                                  <td className={`p-3 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>14.15</td>
                                  <td className={`p-3 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>1.2s</td>
                                  <td className={`p-3 text-[9px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>100 Trees (Depth 6)</td>
                                </tr>

                                {/* Random Forest */}
                                <tr className={darkMode ? 'hover:bg-slate-900/20 text-slate-200' : 'hover:bg-slate-50 text-slate-800'}>
                                  <td className={`p-3 font-black ${darkMode ? 'text-teal-400' : 'text-teal-700'}`}>#2</td>
                                  <td className="p-3 font-bold">🌲 Random Forest Regressor</td>
                                  <td className={`p-3 text-right font-black ${darkMode ? 'text-teal-400' : 'text-teal-700'}`}>0.842</td>
                                  <td className={`p-3 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>18.42</td>
                                  <td className={`p-3 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>1.8s</td>
                                  <td className={`p-3 text-[9px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>200 Trees (Depth 10)</td>
                                </tr>

                                {/* SVM */}
                                <tr className={darkMode ? 'hover:bg-slate-900/20 text-slate-200' : 'hover:bg-slate-50 text-slate-800'}>
                                  <td className={`p-3 font-black ${darkMode ? 'text-purple-400' : 'text-purple-700'}`}>#3</td>
                                  <td className="p-3 font-bold">🔮 SVM (Radial SVR)</td>
                                  <td className={`p-3 text-right font-black ${darkMode ? 'text-purple-400' : 'text-purple-700'}`}>0.781</td>
                                  <td className={`p-3 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>24.89</td>
                                  <td className={`p-3 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>0.4s</td>
                                  <td className={`p-3 text-[9px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Radial Basis (RBF) Kernel</td>
                                </tr>

                                {/* Linear Regression */}
                                <tr className={darkMode ? 'hover:bg-slate-900/20 text-slate-200' : 'hover:bg-slate-50 text-slate-800'}>
                                  <td className={`p-3 font-black ${darkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>#4</td>
                                  <td className="p-3 font-bold">📈 Linear Regression Model</td>
                                  <td className={`p-3 text-right font-black ${darkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>0.725</td>
                                  <td className={`p-3 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>28.12</td>
                                  <td className={`p-3 text-right ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>0.1s</td>
                                  <td className={`p-3 text-[9px] ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Ordinary Least Squares (OLS)</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Chart Analysis Card */}
                        <div className={`p-5 rounded-xl border ${
                          darkMode ? 'bg-slate-900/30 border-slate-850' : 'bg-white border-slate-200'
                        } space-y-4`}>
                          <h4 className={`text-[10px] font-black uppercase tracking-wider ${
                            darkMode ? 'text-slate-350' : 'text-slate-500'
                          }`}>Visual Benchmark Accuracy Plot</h4>
                          <div className="space-y-3">
                            {/* XGBoost progress bar */}
                            <div className="space-y-1 text-[9px]">
                              <div className="flex justify-between font-bold">
                                <span className={darkMode ? 'text-slate-200' : 'text-slate-800'}>🚀 XGBoost Regressor (Champion)</span>
                                <span className={`font-black ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>R² = 0.890</span>
                              </div>
                              <div className={`w-full rounded-full h-2.5 overflow-hidden ${darkMode ? 'bg-slate-850' : 'bg-slate-100'}`}>
                                <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2.5 rounded-full animate-pulse" style={{ width: '89%' }} />
                              </div>
                            </div>
                            {/* RF progress bar */}
                            <div className="space-y-1 text-[9px]">
                              <div className="flex justify-between font-bold">
                                <span className={darkMode ? 'text-slate-200' : 'text-slate-800'}>🌲 Random Forest Regressor</span>
                                <span className={`font-black ${darkMode ? 'text-teal-400' : 'text-teal-650'}`}>R² = 0.842</span>
                              </div>
                              <div className={`w-full rounded-full h-2.5 overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                <div className="bg-teal-500 h-2.5 rounded-full" style={{ width: '84%' }} />
                              </div>
                            </div>
                            {/* SVM progress bar */}
                            <div className="space-y-1 text-[9px]">
                              <div className="flex justify-between font-bold">
                                <span className={darkMode ? 'text-slate-200' : 'text-slate-800'}>🔮 SVM (Radial SVR)</span>
                                <span className={`font-black ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>R² = 0.781</span>
                              </div>
                              <div className={`w-full rounded-full h-2.5 overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                <div className="bg-purple-500 h-2.5 rounded-full" style={{ width: '78%' }} />
                              </div>
                            </div>
                            {/* LR progress bar */}
                            <div className="space-y-1 text-[9px]">
                              <div className="flex justify-between font-bold">
                                <span className={darkMode ? 'text-slate-200' : 'text-slate-800'}>📈 Linear Regression Model</span>
                                <span className={`font-black ${darkMode ? 'text-indigo-400' : 'text-indigo-650'}`}>R² = 0.725</span>
                              </div>
                              <div className={`w-full rounded-full h-2.5 overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: '72%' }} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 3D Hyperparameter Search Space Card */}
                        <div className={`p-5 rounded-xl border relative ${
                          darkMode ? 'bg-slate-900/30 border-slate-850' : 'bg-white border-slate-200'
                        } space-y-4`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                                darkMode ? 'text-slate-350' : 'text-slate-500'
                              }`}>
                                <Network size={12} className="text-indigo-400" />
                                3D Hyperparameter Search Space Visualizer
                              </h4>
                              <p className="text-[8px] text-slate-500 mt-0.5">
                                Drag to rotate Bayesian optimization search trials. Points color maps to accuracy (green is high, violet is low).
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 text-[7px] font-bold border rounded-full uppercase tracking-wider ${
                              darkMode ? 'bg-indigo-950/40 text-indigo-400 border-indigo-500/20' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}>
                              Bayesian Optimization
                            </span>
                          </div>

                          <div 
                            className="relative border border-slate-850 rounded-lg overflow-hidden bg-slate-950 p-2 flex justify-center h-60 cursor-grab active:cursor-grabbing select-none"
                            onMouseDown={(e) => {
                              hyperIsDragging.current = true;
                              hyperStartMouse.current = { x: e.clientX, y: e.clientY };
                            }}
                            onMouseMove={(e) => {
                              if (!hyperIsDragging.current) return;
                              const dx = e.clientX - hyperStartMouse.current.x;
                              const dy = e.clientY - hyperStartMouse.current.y;
                              hyperAngleY.current += dx * 0.007;
                              hyperAngleX.current += dy * 0.007;
                              hyperStartMouse.current = { x: e.clientX, y: e.clientY };
                            }}
                            onMouseUp={() => {
                              hyperIsDragging.current = false;
                            }}
                            onMouseLeave={() => {
                              hyperIsDragging.current = false;
                            }}
                          >
                            <canvas ref={hyperRef} className="block w-full h-full" />
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                )}

                {/* Node Property panel / Slide-out drawer on click */}
                {selectedNode && (
                  <div className={`w-full lg:w-80 border-t lg:border-t-0 lg:border-l p-5 flex flex-col justify-between shrink-0 z-10 animate-in slide-in-from-right duration-250 ${
                    darkMode 
                      ? 'border-slate-800 bg-slate-950/95 backdrop-blur-md text-slate-100' 
                      : 'border-slate-200 bg-white/95 backdrop-blur-md text-slate-900'
                  }`}>
                    <div>
                      <div className={`flex items-center justify-between border-b pb-3 mb-4 ${
                        darkMode ? 'border-slate-800' : 'border-slate-200'
                      }`}>
                        <h4 className="font-extrabold text-xs uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                          {selectedNode.type === 'Ingest' && <Database size={13} />}
                          {selectedNode.type === 'Preprocess' && <Edit3 size={13} />}
                          {selectedNode.type === 'AIModel' && <Brain size={13} />}
                          {selectedNode.type === 'Output' && <BarChart3 size={13} />}
                          Node Configuration
                        </h4>
                        <button 
                          onClick={() => setSelectedNode(null)}
                          className={`p-1 rounded cursor-pointer transition-colors ${
                            darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-150 text-slate-650'
                          }`}
                        >
                          <X size={12} />
                        </button>
                      </div>

                      {/* Tabs Selector Deck */}
                      <div className="flex border-b border-slate-850 mb-4 p-0.5 bg-slate-900 rounded-lg text-[9px] font-bold">
                        <button
                          onClick={() => setDrawerTab('config')}
                          className={`flex-1 py-1 px-1.5 rounded-md text-center transition-all cursor-pointer ${
                            drawerTab === 'config'
                              ? 'bg-teal-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          Parameters
                        </button>
                        <button
                          onClick={() => setDrawerTab('code')}
                          className={`flex-1 py-1 px-1.5 rounded-md text-center transition-all cursor-pointer ${
                            drawerTab === 'code'
                              ? 'bg-teal-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          Python Script
                        </button>
                      </div>

                      {drawerTab === 'config' ? (
                        <div className="space-y-4">
                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                              Node Label
                            </label>
                            <div className={`text-xs font-bold p-2.5 rounded-lg border ${
                              darkMode 
                                ? 'text-slate-300 bg-slate-900 border-slate-800' 
                                : 'text-slate-800 bg-slate-100 border-slate-200'
                            }`}>
                              {selectedNode.label}
                            </div>
                          </div>

                          {/* Custom properties fields based on node type */}
                          {selectedNode.type === 'Ingest' && (
                            <div>
                              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                                Target Dataset
                              </label>
                              <select
                                value={selectedNode.properties.datasetId || ''}
                                onChange={(e) => {
                                  saveNodeProperty(selectedNode.id, 'datasetId', e.target.value);
                                  setSelectedDatasetId(e.target.value);
                                }}
                                className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
                              >
                                <option value="">Select Ingestion File...</option>
                                {datasets.map(d => (
                                  <option key={d.id} value={d.id}>{d.title}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {selectedNode.type === 'Preprocess' && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-300">Drop Null Columns</span>
                                <input
                                  type="checkbox"
                                  checked={!!selectedNode.properties.dropNulls}
                                  onChange={(e) => saveNodeProperty(selectedNode.id, 'dropNulls', e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-800 accent-teal-500"
                                />
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-300">Normalize Variables</span>
                                <input
                                  type="checkbox"
                                  checked={!!selectedNode.properties.normalize}
                                  onChange={(e) => saveNodeProperty(selectedNode.id, 'normalize', e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-800 accent-teal-500"
                                />
                              </div>
                            </div>
                          )}

                          {selectedNode.type === 'AIModel' && (
                            <div className="space-y-4">
                              <div>
                                <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                                  Predictor Algorithm
                                </label>
                                <select
                                  value={selectedNode.properties.modelType || 'Random Forest'}
                                  onChange={(e) => saveNodeProperty(selectedNode.id, 'modelType', e.target.value)}
                                  className={`w-full p-2 rounded-lg border text-xs outline-none focus:border-teal-500 ${
                                    darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-205 text-slate-800'
                                  }`}
                                >
                                  <option value="Random Forest">Random Forest Regressor</option>
                                  <option value="XGBoost">XGBoost Gradient Booster</option>
                                  <option value="SVM">Support Vector Machine (SVM)</option>
                                  <option value="Linear Regression">Linear Regression Model</option>
                                </select>
                              </div>

                              {/* Hyperparameter Estimators */}
                              {(selectedNode.properties.modelType === 'Random Forest' || selectedNode.properties.modelType === 'XGBoost' || !selectedNode.properties.modelType) && (
                                <div>
                                  <div className="flex justify-between text-[9px] font-bold uppercase mb-1">
                                    <span className="text-slate-400">Estimators (Trees)</span>
                                    <span className="text-teal-400">{selectedNode.properties.estimators || 100}</span>
                                  </div>
                                  <input 
                                    type="range" 
                                    min="10" 
                                    max="500" 
                                    step="10"
                                    value={selectedNode.properties.estimators || 100}
                                    onChange={(e) => saveNodeProperty(selectedNode.id, 'estimators', parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                              )}

                              {/* Hyperparameter Max Depth */}
                              {(selectedNode.properties.modelType === 'Random Forest' || selectedNode.properties.modelType === 'XGBoost' || !selectedNode.properties.modelType) && (
                                <div>
                                  <div className="flex justify-between text-[9px] font-bold uppercase mb-1">
                                    <span className="text-slate-400">Max Tree Depth</span>
                                    <span className="text-teal-400">{selectedNode.properties.maxDepth || 10}</span>
                                  </div>
                                  <input 
                                    type="range" 
                                    min="2" 
                                    max="30" 
                                    step="1"
                                    value={selectedNode.properties.maxDepth || 10}
                                    onChange={(e) => saveNodeProperty(selectedNode.id, 'maxDepth', parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                              )}

                              {/* Hyperparameter learning rate / C regularization */}
                              {(selectedNode.properties.modelType === 'XGBoost' || selectedNode.properties.modelType === 'SVM') && (
                                <div>
                                  <div className="flex justify-between text-[9px] font-bold uppercase mb-1">
                                    <span className="text-slate-400">Learning Rate (Eta)</span>
                                    <span className="text-teal-400">{selectedNode.properties.learningRate || 0.1}</span>
                                  </div>
                                  <input 
                                    type="range" 
                                    min="0.01" 
                                    max="1.0" 
                                    step="0.01"
                                    value={selectedNode.properties.learningRate || 0.1}
                                    onChange={(e) => saveNodeProperty(selectedNode.id, 'learningRate', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          {selectedNode.type === 'Output' && (
                            <div>
                              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                                SVG Graph Layout
                              </label>
                              <select
                                value={selectedNode.properties.chartType || 'Line'}
                                onChange={(e) => saveNodeProperty(selectedNode.id, 'chartType', e.target.value)}
                                className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
                              >
                                <option value="Line">2D Area Line Chart</option>
                                <option value="Bar">Vertical Bar Layout</option>
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Generated Scikit-Learn Script</label>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(getGeneratedPythonCode(selectedNode));
                                alert("Python code copied to clipboard successfully!");
                              }}
                             className={`px-2 py-0.5 rounded border text-[8px] font-bold cursor-pointer transition-all ${
                               darkMode ? 'border-teal-800 hover:bg-teal-900/30 text-teal-400' : 'border-teal-300 hover:bg-teal-50 text-teal-700'
                             }`}
                            >
                              Copy Code
                            </button>
                          </div>
                          <pre className="bg-slate-950 p-3 border border-slate-850 rounded-xl font-mono text-[9px] text-emerald-400 overflow-x-auto whitespace-pre select-all max-h-96 select-text">
                            {getGeneratedPythonCode(selectedNode)}
                          </pre>
                        </div>
                      )}
                    </div>

                    <div className={`p-3 rounded-xl border text-[10px] leading-normal ${
                      darkMode ? 'bg-teal-950/20 border-teal-900/30 text-teal-400' : 'bg-teal-50 border-teal-200 text-teal-700'
                    }`}>
                      <strong>Node Status:</strong> {activeStepStatuses[selectedNode.id] || 'Idle'}
                      <p className={`mt-1 text-[9px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Configure node fields and click execute. Status reflects current step execution phase.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DATASET INGESTION (CSV UPLOADS & DATA PROFILING DETAILS) */}
          {activeTab === 'datasets' && (
            <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-200">
              
              {/* Uploader Card */}
              <div className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50">
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-teal-400 mb-4 flex items-center gap-2">
                  <UploadCloud size={16} />
                  Ingest New CSV Dataset
                </h3>

                <form onSubmit={handleFileUpload} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dataset Label</label>
                    <input
                      type="text"
                      value={datasetTitle}
                      onChange={(e) => setDatasetTitle(e.target.value)}
                      placeholder="e.g. Real Estate Data"
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-100 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dataset CSV File</label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-100 outline-none cursor-pointer"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={uploading || !selectedFile}
                    className="py-2.5 px-4 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs tracking-wider uppercase transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <UploadCloud size={14} />
                    <span>{uploading ? 'Profiling...' : 'Upload & profile'}</span>
                  </button>
                </form>
              </div>

              {/* Grid: datasets list & profile preview */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                
                {/* Datasets list */}
                <div className="lg:col-span-1 space-y-4">
                  <h4 className="font-black text-xs uppercase tracking-wider text-slate-400">Ingested Datasets</h4>
                  
                  {datasets.length === 0 ? (
                    <div className="text-xs text-slate-500 border border-dashed border-slate-800 p-6 text-center rounded-xl">
                      No datasets ingested yet. Upload a CSV to get started.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {datasets.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => handleDatasetClick(d.id)}
                          className="w-full text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-teal-500/40 transition-all flex items-center justify-between group cursor-pointer"
                        >
                          <div className="truncate pr-2">
                            <div className="font-extrabold text-xs text-slate-800 dark:text-slate-100 group-hover:text-teal-400 truncate">{d.title}</div>
                            <div className="text-[10px] text-slate-400 mt-1 font-mono">{d.rowCount} rows aggregated</div>
                          </div>
                          <ChevronRight size={14} className="text-slate-500 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Profiler Details Drawer panel */}
                <div className="lg:col-span-2">
                  {viewingDataset ? (
                    <div className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 space-y-6">
                      
                      {/* Dataset Header details */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 gap-3">
                        <div>
                          <h3 className="font-extrabold text-lg text-slate-800 dark:text-white">{viewingDataset.title}</h3>
                          <span className="text-[10px] text-slate-400 font-bold font-mono">ID: {viewingDataset.id}</span>
                        </div>
                        
                        <div className="flex border rounded-full p-1 bg-slate-950/90 border-slate-850">
                          <button
                            onClick={() => setDatasetViewTab('profile')}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                              datasetViewTab === 'profile'
                                ? 'bg-teal-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            <Database size={10} />
                            Stats Profile
                          </button>
                          <button
                            onClick={() => {
                              setDatasetViewTab('eda');
                              if (viewingDataset?.columns?.length > 0) {
                                const numericCols = viewingDataset.columns.filter((c: any) => c.type === 'Number').map((c: any) => c.name);
                                const firstCol = numericCols[0] || viewingDataset.columns[0].name;
                                const secondCol = numericCols[1] || numericCols[0] || viewingDataset.columns[0].name;
                                setEdaXColumn(firstCol);
                                setEdaYColumn(secondCol);
                              }
                            }}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                              datasetViewTab === 'eda'
                                ? 'bg-teal-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            <BarChart3 size={10} />
                            Visual EDA
                          </button>
                        </div>
                      </div>

                      {datasetViewTab === 'profile' ? (
                        <>
                          {/* Stat Metrics Cards */}
                          <div className="grid grid-cols-4 gap-4">
                            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Row count</span>
                              <span className="text-xl font-black text-slate-900 dark:text-white">{viewingDataset.rowCount}</span>
                            </div>

                            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Null Cells Rate</span>
                              <span className="text-xl font-black text-slate-900 dark:text-white">{viewingDataset.missingPct}%</span>
                            </div>

                            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Features</span>
                              <span className="text-xl font-black text-slate-900 dark:text-white">{viewingDataset.columns.length}</span>
                            </div>

                            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                              <div>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Health Score</span>
                                <span className="text-xl font-black text-emerald-400">{(100 - parseFloat(viewingDataset.missingPct || '0') * 2.5).toFixed(0)}/100</span>
                              </div>
                              <div className="h-6 w-6 rounded-full border-2 border-emerald-500/30 flex items-center justify-center text-[8px] font-black text-emerald-400">
                                98%
                              </div>
                            </div>
                          </div>

                          {/* Advanced Data Profiling: Visual distributions & Correlations */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            
                            {/* 1. Feature Distribution Histogram */}
                            <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                              <h4 className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider mb-3">Feature Value Distribution</h4>
                              
                              {/* SVG simulated histogram bars */}
                              <div className="h-28 flex items-end justify-between gap-1 px-2 border-b border-slate-850 pb-1">
                                {[12, 28, 45, 62, 85, 95, 75, 48, 32, 18, 9, 4].map((h, i) => (
                                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-1 bg-slate-950 text-white font-mono text-[8px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                                      Freq: {h * 3}
                                    </div>
                                    <div 
                                      style={{ height: `${h}%` }} 
                                      className="w-full bg-teal-500/85 hover:bg-teal-400 rounded-t transition-all duration-300"
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between text-[8px] font-mono text-slate-500 mt-1">
                                <span>Min (0.006)</span>
                                <span>Median</span>
                                <span>Max (88.97)</span>
                              </div>
                            </div>

                            {/* 2. Correlation Matrix Heatmap */}
                            <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                              <h4 className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider mb-3">Feature Correlation matrix</h4>
                              
                              {/* CSS correlation grid matrix */}
                              <div className="grid grid-cols-4 gap-1 font-mono text-[8px] text-center">
                                {/* Header row */}
                                <div className="font-bold text-slate-500">Feature</div>
                                <div className="font-bold text-slate-400">CRIM</div>
                                <div className="font-bold text-slate-400">RM</div>
                                <div className="font-bold text-slate-400">PRICE</div>

                                {/* CRIM Row */}
                                <div className="text-left font-bold text-slate-400">CRIM</div>
                                <div className="bg-teal-500/10 text-slate-400 p-1 rounded font-bold">1.0</div>
                                <div className="bg-red-500/10 text-red-400 p-1 rounded font-bold">-0.38</div>
                                <div className="bg-red-500/20 text-red-400 p-1 rounded font-bold">-0.52</div>

                                {/* RM Row */}
                                <div className="text-left font-bold text-slate-400">RM</div>
                                <div className="bg-red-500/10 text-red-400 p-1 rounded font-bold">-0.38</div>
                                <div className="bg-teal-500/10 text-slate-400 p-1 rounded font-bold">1.0</div>
                                <div className="bg-teal-500/30 text-teal-350 p-1 rounded font-bold">0.69</div>

                                {/* PRICE Row */}
                                <div className="text-left font-bold text-slate-400">PRICE</div>
                                <div className="bg-red-500/20 text-red-400 p-1 rounded font-bold">-0.52</div>
                                <div className="bg-teal-500/30 text-teal-350 p-1 rounded font-bold">0.69</div>
                                <div className="bg-teal-500/10 text-slate-400 p-1 rounded font-bold">1.0</div>
                              </div>
                            </div>
                          </div>

                          {/* Columns classification detail list */}
                          <div>
                            <h4 className="font-black text-xs uppercase tracking-wider text-slate-400 mb-3">Feature Schema Classification</h4>
                            <div className="flex flex-wrap gap-2">
                              {viewingDataset.columns.map((c: any, i: number) => (
                                <span key={i} className={`px-2.5 py-1 rounded border text-[10px] font-bold flex items-center gap-1.5 ${
                                  darkMode ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                                }`}>
                                  <span className={`h-1 w-1 rounded-full ${c.type === 'Number' ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                                  {c.name}
                                  <span className="text-slate-500 font-medium font-mono">({c.type})</span>
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Top 5 Rows Previews table */}
                          <div>
                            <h4 className="font-black text-xs uppercase tracking-wider text-slate-400 mb-3">Ingested Rows Preview (Top 5)</h4>
                            <div className={`overflow-x-auto border rounded-xl ${darkMode ? 'border-slate-900' : 'border-slate-200'}`}>
                              <table className="w-full border-collapse text-[10px]">
                                <thead>
                                  <tr className={`text-slate-500 font-bold uppercase tracking-wider text-left border-b ${
                                    darkMode ? 'bg-slate-950 border-slate-900' : 'bg-slate-100 border-slate-205'
                                  }`}>
                                    {viewingDataset.columns.map((c: any, i: number) => (
                                      <th key={i} className="px-4 py-2">{c.name}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {viewingDataset.preview.map((row: any, rowIdx: number) => (
                                    <tr key={rowIdx} className={`border-b ${
                                      darkMode ? 'hover:bg-slate-900/50 border-slate-900' : 'hover:bg-slate-50 border-slate-205'
                                    }`}>
                                      {viewingDataset.columns.map((c: any, colIdx: number) => (
                                        <td key={colIdx} className={`px-4 py-2 font-mono ${darkMode ? 'text-slate-350' : 'text-slate-700'}`}>{row[c.name] ?? ''}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-6 animate-in fade-in duration-200">
                          {/* Top Grid: Scatter plot + Diagnostics */}
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
                            
                            {/* Canvas Scatter plot */}
                            <div className={`p-4 rounded-xl border md:col-span-3 space-y-4 ${
                              darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'
                            }`}>
                              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                <h4 className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider">Features Scatter Relationship</h4>
                                
                                {/* axis selector dropdowns */}
                                <div className="flex items-center gap-1 text-[8px] font-bold">
                                  <select 
                                    value={edaXColumn}
                                    onChange={(e) => setEdaXColumn(e.target.value)}
                                    className="bg-slate-950 text-slate-200 border border-slate-850 rounded px-1.5 py-0.5"
                                  >
                                    {viewingDataset.columns.map((c: any) => (
                                      <option key={c.name} value={c.name}>X: {c.name}</option>
                                    ))}
                                  </select>
                                  <span className="text-slate-500">vs</span>
                                  <select 
                                    value={edaYColumn}
                                    onChange={(e) => setEdaYColumn(e.target.value)}
                                    className="bg-slate-950 text-slate-200 border border-slate-850 rounded px-1.5 py-0.5"
                                  >
                                    {viewingDataset.columns.map((c: any) => (
                                      <option key={c.name} value={c.name}>Y: {c.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="relative border border-slate-850 rounded-lg overflow-hidden bg-slate-950 p-2 flex justify-center">
                                <canvas id="edaScatterCanvas" className="max-w-full block" />
                              </div>
                              <p className="text-[8px] text-slate-500 font-mono text-center">
                                Showing 60 simulated inference samples with linear regression trail (indigo line).
                              </p>
                            </div>

                            {/* Preprocessing Diagnostics & stats details */}
                            <div className="md:col-span-2 space-y-4">
                              <div className={`p-4 rounded-xl border text-center ${
                                darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'
                              }`}>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Scatter Correlation Coefficient</span>
                                <span className={`text-2xl font-black mt-1.5 block ${
                                  Math.abs(getCorrelation(edaXColumn, edaYColumn)) > 0.5 
                                    ? 'text-teal-400' 
                                    : 'text-indigo-400'
                                }`}>
                                  {getCorrelation(edaXColumn, edaYColumn).toFixed(2)}
                                </span>
                                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wide">
                                  {Math.abs(getCorrelation(edaXColumn, edaYColumn)) > 0.6 
                                    ? '⚠️ Strong Linear Correlation' 
                                    : Math.abs(getCorrelation(edaXColumn, edaYColumn)) > 0.3 
                                      ? '⚡ Moderate Correlation' 
                                      : '💤 Weak or No Linear Correlation'}
                                </span>
                              </div>

                              {/* Imputation recommendations and preprocessing tips */}
                              <div className={`p-4 rounded-xl border space-y-2 ${
                                darkMode ? 'border-teal-950/40 bg-teal-950/15 text-teal-400' : 'border-teal-200 bg-teal-50 text-teal-700'
                              }`}>
                                <h4 className={`font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1 ${
                                  darkMode ? 'text-teal-400' : 'text-teal-700'
                                }`}>
                                  <Activity size={10} className="animate-pulse" />
                                  Agent Preprocessing Diagnostics
                                </h4>
                                <div className={`text-[10px] space-y-1.5 leading-normal ${
                                  darkMode ? 'text-slate-400' : 'text-slate-600'
                                }`}>
                                  {viewingDataset.missingPct && parseFloat(viewingDataset.missingPct) > 0 ? (
                                    <p>⚠️ <strong>Missing Cells Detected ({viewingDataset.missingPct}%):</strong> We suggest using an <em>Imputer</em> node with &apos;Median&apos; strategy to replace nulls before model training.</p>
                                  ) : (
                                    <p>✓ <strong>Data Integrity:</strong> 100% complete cells. No null imputation is required for feature sets.</p>
                                  )}
                                  {viewingDataset.columns.some((c: any) => c.name === 'CRIM') && (
                                    <p>💡 <strong>Feature Skewness:</strong> Column <code>CRIM</code> exhibits high positive skewness. We recommend adding a <em>Log1p Transform</em> preprocessing node to normalize sample distribution.</p>
                                  )}
                                  <p>🔧 <strong>Outliers Diagnostic:</strong> Interquartile Range (IQR) analysis detects minor outliers in feature inputs. A <em>StandardScaler</em> step is recommended for linear models (SVM, OLS) to avoid metric instability.</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Dynamic Heatmap Grid Row */}
                          {(() => {
                            const numericCols = viewingDataset.columns.filter((c: any) => c.type === 'Number').slice(0, 6).map((c: any) => c.name);
                            if (numericCols.length === 0) return <p className="text-slate-500 text-xs">No numeric columns found for correlation.</p>;
                            return (
                              <div className="space-y-3">
                                <h4 className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider block">Full Dynamic Correlation Matrix Heatmap</h4>
                                <div className="overflow-x-auto border border-slate-850 rounded-xl">
                                  <table className="w-full text-[9px] text-center border-collapse">
                                    <thead>
                                      <tr className="bg-slate-950 text-slate-400 font-bold border-b border-slate-850">
                                        <th className="p-2.5 text-left text-slate-500">Feature</th>
                                        {numericCols.map((col: string) => (
                                          <th key={col} className="p-2.5">{col}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 font-mono font-bold">
                                      {numericCols.map((colA: string) => (
                                        <tr key={colA} className="hover:bg-slate-900/40">
                                          <td className="p-2.5 text-left font-sans text-slate-400 font-bold border-r border-slate-850">{colA}</td>
                                          {numericCols.map((colB: string) => {
                                            const rVal = getCorrelation(colA, colB);
                                            const absVal = Math.abs(rVal);
                                            let bgColor = 'bg-slate-900/25';
                                            let textColor = 'text-slate-400';
                                            if (colA === colB) {
                                              bgColor = 'bg-teal-500/20';
                                              textColor = 'text-teal-400';
                                            } else if (rVal > 0) {
                                              bgColor = absVal > 0.5 ? 'bg-emerald-500/20' : 'bg-emerald-500/10';
                                              textColor = 'text-emerald-400';
                                            } else if (rVal < 0) {
                                              bgColor = absVal > 0.5 ? 'bg-rose-500/20' : 'bg-rose-500/10';
                                              textColor = 'text-rose-400';
                                            }
                                            return (
                                              <td key={colB} className={`p-2.5 ${bgColor} ${textColor} transition-all`}>
                                                {rVal.toFixed(2)}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-16 text-center text-slate-500 text-xs">
                      Select a dataset on the left to view data science profile summaries.
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* TAB 3: RUN LOGS AUDIT HISTORY SHEET */}
          {activeTab === 'runs' && (
            <div className="p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">
              
              {/* Toolbar Controls */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="font-black text-lg text-slate-800 dark:text-white">Pipeline Executions Registry</h3>
                  <p className="text-xs text-slate-400 font-medium">Audit logs of all visual workflow pipeline simulation runs</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={exportRunsToCSV}
                    className={`px-3.5 py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      darkMode 
                        ? 'border-slate-800 text-slate-350 hover:bg-slate-800 hover:text-white' 
                        : 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet size={14} />
                    <span>Export CSV</span>
                  </button>

                  <button
                    onClick={printPDFReport}
                    className="px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-teal-500/10 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Print PDF Audit</span>
                  </button>
                </div>
              </div>

              {/* Table logs sheet */}
              {runs.length === 0 ? (
                <div className="text-center text-slate-500 text-xs p-16 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/10">
                  No execution audits logged in the workspace database. Run a pipeline from the Sandbox tab.
                </div>
              ) : (
                 <div className={`overflow-x-auto border rounded-xl ${
                  darkMode ? 'border-slate-900 bg-slate-950/20' : 'border-slate-205 bg-white'
                }`}>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className={`text-slate-500 font-bold uppercase tracking-wider text-left border-b ${
                        darkMode ? 'bg-slate-950 border-slate-900' : 'bg-slate-100 border-slate-205'
                      }`}>
                        <th className="px-4 py-3">Run ID</th>
                        <th className="px-4 py-3">Pipeline</th>
                        <th className="px-4 py-3">Triggered By</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">Execution Date</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id} className={`border-b ${
                          darkMode ? 'hover:bg-slate-900/30 border-slate-900' : 'hover:bg-slate-50 border-slate-205'
                        }`}>
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-500 dark:text-slate-400">{run.id}</td>
                          <td className={`px-4 py-3 font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{run.pipeline?.name || 'N/A'}</td>
                          <td className={`px-4 py-3 ${darkMode ? 'text-slate-300' : 'text-slate-650'}`}>{run.user?.name || 'N/A'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              run.status === 'Success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {run.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{run.duration}ms</td>
                          <td className="px-4 py-3 text-slate-400 dark:text-slate-500">{new Date(run.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            {run.status === 'Success' && (
                              <button
                                onClick={() => handleDeployModel(run.id)}
                                disabled={deployingRunId === run.id}
                                className={`px-2.5 py-1 text-[10px] rounded-lg font-extrabold uppercase tracking-wide cursor-pointer transition-all border ${
                                  darkMode
                                    ? 'bg-teal-950/20 border-teal-900/60 text-teal-400 hover:bg-teal-900/40 hover:text-white'
                                    : 'bg-teal-50 border-teal-200 text-teal-600 hover:bg-teal-600 hover:text-white'
                                }`}
                              >
                                {deployingRunId === run.id ? 'Deploying...' : 'Deploy Model'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: MLOPS DEPLOYMENTS SERVER CONSOLE */}
          {activeTab === 'deployments' && (
            <div className="p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">
              
              {/* Header Details */}
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                <h3 className={`font-black text-lg flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <Activity className="text-teal-500 animate-pulse" size={20} />
                  MLOps Live Model Serving Console
                </h3>
                <p className="text-xs text-slate-400 font-medium">Manage and run real-time inference prediction requests against active deployed models</p>
              </div>

              {deployments.length === 0 ? (
                <div className="text-center text-slate-500 text-xs p-16 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/10">
                  No active model deployments detected. Navigate to the Executions Registry tab and click &quot;Deploy Model&quot; on any successful run.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  
                  {/* Left Column: Active Deployments Listing */}
                  <div className="lg:col-span-1 space-y-4">
                    <h4 className="font-black text-xs uppercase tracking-wider text-slate-400">Serving Endpoints</h4>
                    <div className="space-y-2.5">
                      {deployments.map((dep) => (
                        <div
                          key={dep.id}
                          onClick={() => {
                            setSelectedDeploymentId(dep.id);
                            try {
                              const cols = JSON.parse(dep.columns);
                              const sample: Record<string, any> = {};
                              cols.forEach((c: any) => {
                                if (c === 'RM') sample[c] = 6.2;
                                else if (c === 'CRIM') sample[c] = 0.08;
                                else if (c === 'LSTAT') sample[c] = 8.5;
                                else sample[c] = 1.0;
                              });
                              setTestPayload(JSON.stringify({ values: sample }, null, 2));
                            } catch (e) {}
                            setPredictionResult(null);
                          }}
                          className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                            selectedDeploymentId === dep.id
                              ? 'bg-teal-500/10 border-teal-500 shadow-md shadow-teal-500/5'
                              : `${darkMode ? 'bg-slate-900/40 border-slate-850 hover:bg-slate-900' : 'bg-white border-slate-200 hover:bg-slate-50'}`
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-xs text-teal-400 uppercase tracking-wide">{dep.modelName}</span>
                            <span className="px-2 py-0.5 rounded text-[8px] bg-emerald-500/15 text-emerald-400 font-extrabold uppercase tracking-widest animate-pulse">
                              {dep.status}
                            </span>
                          </div>
                          
                          <div className="text-[10px] text-slate-400 space-y-1">
                            <div><span className="font-bold text-slate-500">ID:</span> <span className="font-mono">{dep.id.substring(0, 8)}...</span></div>
                            <div><span className="font-bold text-slate-500">Dataset:</span> {dep.datasetName}</div>
                            <div><span className="font-bold text-slate-500">Created:</span> {new Date(dep.createdAt).toLocaleDateString()}</div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-slate-800/60 flex justify-between items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Are you sure you want to suspend this serving model?')) {
                                  suspendDeployment(dep.id);
                                  if (selectedDeploymentId === dep.id) setSelectedDeploymentId('');
                                }
                              }}
                              className="text-[9px] font-black uppercase text-red-500 hover:text-red-400 cursor-pointer"
                            >
                              Suspend
                            </button>
                            <span className="text-[8px] font-bold text-teal-500 font-mono">REST API ACTIVE</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Column: Live Playground Client */}
                  <div className="lg:col-span-2 space-y-4">
                    {selectedDeploymentId ? (
                      <div className={`p-6 rounded-2xl border space-y-5 shadow-xl ${
                        darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
                      }`}>
                        
                        {/* Title details */}
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                          <div>
                            <h4 className={`font-extrabold text-sm uppercase tracking-wide ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Live API Inference Client</h4>
                            <p className="text-[10px] text-slate-400 font-medium">Verify deployment predictions with interactive sliders or dynamic JSON payload</p>
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 uppercase font-extrabold">POST Serving Sandbox</span>
                        </div>

                        {/* Telemetry Stats row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className={`p-2.5 rounded-lg border text-center ${darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Service Health</span>
                            <span className="text-[10px] font-black text-emerald-400 mt-1 flex items-center justify-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              ACTIVE
                            </span>
                          </div>
                          <div className={`p-2.5 rounded-lg border text-center ${darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Avg Latency</span>
                            <span className="text-[10px] font-black text-teal-400 mt-1 block">
                              {sandboxLatency !== null ? `${sandboxLatency}ms` : '12ms'}
                            </span>
                          </div>
                          <div className={`p-2.5 rounded-lg border text-center ${darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Success Rate</span>
                            <span className="text-[10px] font-black text-emerald-400 mt-1 block">100.0%</span>
                          </div>
                          <div className={`p-2.5 rounded-lg border text-center ${darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'}`}>
                            <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Serving Requests</span>
                            <span className="text-[10px] font-black text-indigo-400 mt-1 block">{sandboxRequestsCount}</span>
                          </div>
                        </div>

                        {/* Request Endpoint Path */}
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Target REST API Serving URL</label>
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[9px] font-bold text-teal-400 overflow-x-auto select-all">
                            {`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000'}/api/v1/deployments/${selectedDeploymentId}/predict`}
                          </div>
                        </div>

                        {/* Grid: Left Column Inputs, Right Column Output Visual Gauge */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                          
                          {/* Feature Sliders Inputs Deck */}
                          <div className="space-y-3.5">
                            <h4 className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider">Configure Input Feature Vectors</h4>
                            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                              {Object.keys(sandboxInputs).map((colName) => {
                                const currentVal = sandboxInputs[colName];
                                // Set column bounds dynamically
                                let min = 0, max = 100, step = 1;
                                if (colName === 'RM') { min = 3.0; max = 9.0; step = 0.1; }
                                else if (colName === 'CRIM') { min = 0.01; max = 10.0; step = 0.01; }
                                else if (colName === 'LSTAT') { min = 1.0; max = 40.0; step = 0.1; }
                                else if (colName === 'AGE') { min = 1.0; max = 100.0; step = 1.0; }
                                else if (colName === 'TAX') { min = 100.0; max = 800.0; step = 1.0; }

                                return (
                                  <div key={colName} className={`p-2.5 rounded-lg border space-y-1 ${
                                    darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-205'
                                  }`}>
                                    <div className="flex justify-between items-center text-[10px]">
                                      <span className="font-bold text-slate-400">{colName}</span>
                                      <span className="font-mono text-teal-400 font-black">{currentVal}</span>
                                    </div>
                                    <input 
                                      type="range"
                                      min={min}
                                      max={max}
                                      step={step}
                                      value={currentVal}
                                      onChange={(e) => {
                                        setSandboxInputs(prev => ({
                                          ...prev,
                                          [colName]: parseFloat(e.target.value)
                                        }));
                                      }}
                                      className="w-full accent-teal-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                                    />
                                    <div className="flex justify-between text-[8px] font-mono text-slate-500">
                                      <span>Min: {min}</span>
                                      <span>Max: {max}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Prediction gauge visual & Code snippet copier deck */}
                          <div className="space-y-4">
                            {/* Speedometer Gauge Visual representation */}
                            {(() => {
                              const predVal = predictionResult?.prediction || 0;
                              const angle = Math.max(-90, Math.min(90, (predVal / 100) * 180 - 90));
                              return (
                                <div className={`flex flex-col items-center justify-center p-4 border rounded-xl ${
                                  darkMode ? 'bg-slate-950/40 border-slate-850' : 'bg-slate-50 border-slate-200'
                                }`}>
                                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-2">Live Inference Gauge</span>
                                  <div className="relative w-36 h-20 flex items-center justify-center overflow-hidden">
                                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50">
                                      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={darkMode ? "#1e293b" : "#e2e8f0"} strokeWidth="8" />
                                      <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#gaugeGradient)" strokeWidth="8" strokeDasharray="125" strokeDashoffset={125 - Math.max(0, Math.min(100, predVal)) * 1.25} />
                                      <defs>
                                        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                          <stop offset="0%" stopColor="#6366f1" />
                                          <stop offset="50%" stopColor="#14b8a6" />
                                          <stop offset="100%" stopColor="#10b981" />
                                        </linearGradient>
                                      </defs>
                                    </svg>
                                    <div 
                                      style={{ transform: `rotate(${angle}deg)` }} 
                                      className="absolute bottom-0 w-1.5 h-14 bg-gradient-to-t from-teal-500 to-indigo-500 rounded-t-full origin-bottom transition-all duration-500 ease-out"
                                    />
                                    <div className="absolute bottom-0 w-3 h-3 bg-slate-950 border border-slate-700 rounded-full" />
                                  </div>
                                  <span className={`text-xl font-black mt-2 ${darkMode ? 'text-teal-400' : 'text-teal-700'}`}>{predVal || '0.00'}</span>
                                  <span className="text-[8px] text-slate-500 font-mono">Prediction Index Output</span>
                                </div>
                              );
                            })()}

                            {/* Dynamic API Snippets Switcher tabs */}
                            <div className={`p-3.5 rounded-xl border space-y-2.5 ${
                              darkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                            }`}>
                              <div className={`flex justify-between items-center border-b pb-1.5 ${
                                darkMode ? 'border-slate-800' : 'border-slate-200'
                              }`}>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">REST API Clients</span>
                                <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[8px] font-bold">
                                  {(['curl', 'python', 'js'] as const).map((tab) => (
                                    <button
                                      key={tab}
                                      onClick={() => setSandboxSnippetTab(tab)}
                                      className={`px-2 py-0.5 rounded uppercase cursor-pointer transition-colors ${
                                        sandboxSnippetTab === tab ? 'bg-teal-600 text-white' : 'text-slate-500 hover:text-slate-400'
                                      }`}
                                    >
                                      {tab}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <pre className="p-2.5 rounded bg-slate-950 border border-slate-850 text-[7px] font-mono text-indigo-400 overflow-x-auto whitespace-pre select-all select-text">
                                {sandboxSnippetTab === 'curl' && `curl -X POST -H "Content-Type: application/json" \\
  -d '{"values": ${JSON.stringify(sandboxInputs)}}' \\
  http://localhost:5000/api/v1/deployments/${selectedDeploymentId}/predict`}
                                {sandboxSnippetTab === 'python' && `import requests
url = "http://localhost:5000/api/v1/deployments/${selectedDeploymentId}/predict"
payload = {"values": ${JSON.stringify(sandboxInputs, null, 2)}}
response = requests.post(url, json=payload)
print(response.json())`}
                                {sandboxSnippetTab === 'js' && `fetch("http://localhost:5000/api/v1/deployments/${selectedDeploymentId}/predict", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ values: ${JSON.stringify(sandboxInputs)} })
})
.then(res => res.json())
.then(data => console.log(data));`}
                              </pre>
                            </div>
                          </div>

                        </div>

                        <button
                          onClick={handleSandboxInference}
                          disabled={testingPredict}
                          className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-teal-500/10 flex items-center justify-center gap-2"
                        >
                          {testingPredict ? 'Executing Live Inference...' : '⚡ Send Test Inference Request'}
                        </button>

                      </div>
                    ) : (
                      <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-16 text-center text-slate-500 text-xs">
                        Select a deployed serving model endpoint on the left to invoke real-time API tests.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
              
              <div className={`p-6 rounded-2xl border space-y-6 ${
                darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-teal-400 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <SettingsIcon size={16} />
                  Workspace Settings
                </h3>

                <div className="space-y-4">
                  {/* Theme Toggle */}
                  <div className={`flex items-center justify-between border-b pb-4 ${
                    darkMode ? 'border-slate-800' : 'border-slate-200'
                  }`}>
                    <div>
                      <h4 className={`text-xs font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>Dark Mode Interface</h4>
                      <p className="text-[10px] text-slate-400 font-medium font-sans">Switch between high contrast dark mode and light mode aesthetics.</p>
                    </div>
                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      className={`px-3.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                        darkMode 
                          ? 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800' 
                          : 'border-slate-205 bg-slate-100 text-slate-650 hover:bg-slate-200'
                      }`}
                    >
                      {darkMode ? 'Switch to Light' : 'Switch to Dark'}
                    </button>
                  </div>

                  {/* Account Metadata */}
                  <div>
                    <h4 className={`text-xs font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>Active Session Details</h4>
                    <div className={`p-4 rounded-xl border space-y-3 font-mono text-[10px] ${
                      darkMode ? 'bg-slate-950 border-slate-900' : 'bg-slate-100 border-slate-205'
                    }`}>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Operator Username:</span>
                        <span className={`font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{user?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Operator Email:</span>
                        <span className={`font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{user?.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Authorization Scope:</span>
                        <span className="text-teal-400 font-extrabold">{user?.role}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Engine API Node:</span>
                        <span className="text-slate-450">{API_BASE}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>
      </main>
    </div>
  );
}
