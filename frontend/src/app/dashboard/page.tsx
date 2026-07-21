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
    fetchDeployments, deployModel, suspendDeployment, addNode, deleteNode, addEdge
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
  const [spinSpeed, setSpinSpeed] = useState<'off' | 'slow' | 'fast'>('slow');
  const isDragging = useRef<boolean>(false);
  const startMouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const animationFrameId = useRef<number | null>(null);

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

  // Trigonometric 3D Projection & Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeTab !== 'playground' || activeNodes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

      // 1. Calculate projected 3D nodes coordinates
      const projectedNodes: ProjectedNode[] = activeNodes.map(node => {
        // Fetch 3D coords or assign default layout in 3D coordinate space
        let x3d = 0;
        let y3d = 0;
        let z3d = 0;

        if (node.type === 'Ingest') { x3d = -160; y3d = -30; z3d = 0; }
        else if (node.type === 'Preprocess') { x3d = -50; y3d = 40; z3d = 60; }
        else if (node.type === 'AIModel') { x3d = 50; y3d = -40; z3d = -60; }
        else if (node.type === 'Output') { x3d = 160; y3d = 30; z3d = 0; }

        // Y-axis rotation
        let x = x3d * Math.cos(angleY.current) - z3d * Math.sin(angleY.current);
        let z = x3d * Math.sin(angleY.current) + z3d * Math.cos(angleY.current);
        // X-axis rotation
        let y = y3d * Math.cos(angleX.current) - z * Math.sin(angleX.current);
        z = y3d * Math.sin(angleX.current) + z * Math.cos(angleX.current);

        // Perspective Division scaling
        const scale = fov / (fov + z);
        const screenX = centerX + x * scale;
        const screenY = centerY + y * scale;

        return {
          ...node,
          screenX,
          screenY,
          projectedZ: z,
          scale
        };
      });

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
        const width = 120 * node.scale;
        const height = 55 * node.scale;
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
        
        // Dynamic fills depending on status
        if (status === 'Success') {
          ctx.fillStyle = darkMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)';
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
        } else if (status === 'Failed') {
          ctx.fillStyle = darkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)';
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        } else if (selectedNode?.id === node.id) {
          ctx.fillStyle = darkMode ? 'rgba(13, 148, 136, 0.15)' : 'rgba(13, 148, 136, 0.08)';
          ctx.strokeStyle = 'rgba(13, 148, 136, 0.9)';
        } else {
          ctx.fillStyle = darkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)';
          ctx.strokeStyle = darkMode ? 'rgba(51, 65, 85, 0.8)' : 'rgba(226, 232, 240, 0.8)';
        }
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Node Title text
        ctx.fillStyle = darkMode ? '#f8fafc' : '#0f172a';
        ctx.font = `bold ${Math.max(8, Math.round(9 * node.scale))}px var(--font-outfit)`;
        ctx.fillText(node.label, rx + 8 * node.scale, ry + 18 * node.scale);

        // Node Type text
        ctx.fillStyle = darkMode ? '#94a3b8' : '#64748b';
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
          ctx.fillStyle = 'rgba(13, 148, 136, 0.15)';
          ctx.fill();
          ctx.fillStyle = '#0d9488';
        } else {
          ctx.fillStyle = darkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(226, 232, 240, 0.5)';
          ctx.fill();
          ctx.fillStyle = darkMode ? '#94a3b8' : '#64748b';
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
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [activeNodes, activeEdges, activeStepStatuses, running, selectedNode, darkMode, activeTab, spinSpeed]);

  // Drag-to-Rotate handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - startMouse.current.x;
    const dy = e.clientY - startMouse.current.y;

    angleY.current += dx * 0.006;
    angleX.current += dy * 0.006;

    startMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUpOrLeave = () => {
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
          <div className={`p-6 border-b flex items-center gap-3 ${darkMode ? 'border-slate-900/80' : 'border-slate-150'}`}>
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
              <div className="h-7 w-7 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400">
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
            className="w-full py-2 rounded-lg bg-red-950/20 hover:bg-red-950/40 text-red-500 text-[10px] font-bold tracking-wide flex items-center justify-center gap-2 border border-red-900/30 transition-all cursor-pointer"
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
            {/* Real-time Connection Status Dot */}
            <div 
              className={`flex items-center gap-1.5 px-2.5 h-8.5 rounded-lg border text-[10px] font-bold select-none cursor-help ${
                darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'
              }`}
              title={socketConnected ? 'WebSocket sync channel is active and secure.' : 'WebSocket disconnected. Retrying...'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                socketConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-amber-500 animate-pulse'
              }`} />
              <span className={`${
                socketConnected 
                  ? (darkMode ? 'text-slate-400' : 'text-slate-650') 
                  : 'text-amber-500 font-black animate-pulse'
              }`}>
                {socketConnected ? 'Sync Active' : 'Offline'}
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
          
          {/* TAB 1: AGENT PLAYGROUND (CHAT + INTERACTIVE NODE GRAPH SPLIT VIEW) */}
          {activeTab === 'playground' && (
            <div className="h-full flex flex-col xl:flex-row min-h-0">
              
              {/* Left Panel: Chat Console & Live Logger */}
              <div className={`w-full xl:w-96 border-r ${
                darkMode ? 'border-slate-900 bg-slate-950/40' : 'border-slate-200 bg-white/30'
              } flex flex-col shrink-0 min-h-[350px] xl:min-h-0`}>
                {/* Chat window */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[300px] xl:max-h-none">
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
                      <div className="flex items-center gap-1.5 text-teal-400 font-black uppercase text-[8px] tracking-wider border-b border-slate-900 pb-1 mb-1.5">
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
                            : 'border-slate-205 bg-white text-slate-700 hover:border-teal-500/30 hover:bg-slate-55'
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
              <div className={`flex-1 flex flex-col lg:flex-row relative min-w-0 ${
                darkMode ? 'bg-slate-950/20' : 'bg-slate-50/10'
              }`}>
                {/* Glowing ambient background blob behind canvas */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none select-none opacity-20">
                  <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-teal-500/10 blur-[120px]" />
                  <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-indigo-500/10 blur-[120px]" />
                </div>

                {/* 3D Canvas Visualizer */}
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
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-teal-400 border-b border-slate-800 pb-1 mb-1.5">
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
                      }}
                      title="Reset Camera Angle"
                      className={`p-1.5 rounded-lg border text-[9px] font-extrabold uppercase tracking-wide flex items-center gap-1 transition-all cursor-pointer ${
                        darkMode 
                          ? 'border-slate-800 hover:bg-slate-850 text-slate-300 hover:text-white' 
                          : 'border-slate-200 hover:bg-slate-100 text-slate-650 hover:text-slate-900'
                      }`}
                    >
                      <RefreshCw size={10} />
                      <span>Reset</span>
                    </button>

                    {/* Speed select deck */}
                    <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-[8px] font-bold">
                      {(['off', 'slow', 'fast'] as const).map(speed => (
                        <button
                          key={speed}
                          onClick={() => setSpinSpeed(speed)}
                          className={`px-2 py-1 rounded-md uppercase tracking-wider transition-all cursor-pointer ${
                            spinSpeed === speed
                              ? 'bg-teal-600 text-white shadow-sm'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {speed}
                        </button>
                      ))}
                    </div>
                  </div>

                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUpOrLeave}
                    onMouseLeave={handleMouseUpOrLeave}
                    onClick={handleCanvasClick}
                    className="w-full h-full min-h-[400px] cursor-grab active:cursor-grabbing block relative z-0"
                    title="Drag to rotate 3D node network"
                  />

                  {/* High-tech Canvas Node Editor Toolbar */}
                  <div className={`absolute bottom-12 right-5 p-2 rounded-xl border flex gap-1.5 items-center ${
                    darkMode ? 'border-slate-800 bg-slate-900/80 text-slate-300' : 'border-slate-205 bg-white/80 text-slate-700'
                  } shadow-md backdrop-blur-md z-10 font-sans text-[10px] font-bold`}>
                    <span className="text-slate-500 mr-1 uppercase text-[8px] tracking-wider font-mono">Editor:</span>
                    
                    {/* Add node dropdown menu toggle */}
                    <div className="relative group">
                      <button className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded-lg flex items-center gap-1 cursor-pointer transition-all">
                        <span>+ Add Node</span>
                      </button>
                      
                      <div className="absolute right-0 bottom-full mb-1.5 w-32 bg-slate-950 border border-slate-800 rounded-lg shadow-xl hidden group-hover:block z-25 p-1 space-y-0.5 animate-in fade-in duration-150">
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
                            className="w-full text-left px-2 py-1.5 rounded text-[8px] hover:bg-slate-800 hover:text-white cursor-pointer text-slate-350 font-bold tracking-wide"
                          >
                            {nodeType}
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
                          : `${darkMode ? 'border-slate-850 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-650'}`
                      }`}
                    >
                      {isConnectingMode ? 'Click Target Node...' : '🔗 Connect Nodes'}
                    </button>

                    {/* Delete selected node */}
                    {selectedNode && (
                      <button
                        onClick={() => {
                          deleteNode(selectedNode.id);
                          setSelectedNode(null);
                        }}
                        className="px-2 py-1 bg-red-950/40 border border-red-900/30 text-red-400 hover:bg-red-900/40 hover:text-white rounded-lg flex items-center gap-1 cursor-pointer transition-all"
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

                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                            Node Label
                          </label>
                          <div className={`text-xs font-bold p-2.5 rounded-lg border ${
                            darkMode 
                              ? 'text-slate-150 bg-slate-900 border-slate-800' 
                              : 'text-slate-800 bg-slate-105 border-slate-200'
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

                            {/* Estimators Range slider */}
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
                                onChange={(e) => saveNodeProperty(selectedNode.id, 'estimators', Number(e.target.value))}
                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                              />
                            </div>

                            {/* Max Depth Slider */}
                            <div>
                              <div className="flex justify-between text-[9px] font-bold uppercase mb-1">
                                <span className="text-slate-400">Max Depth Limit</span>
                                <span className="text-teal-400">{selectedNode.properties.maxDepth || 10}</span>
                              </div>
                              <input 
                                type="range" 
                                min="2" 
                                max="20" 
                                step="1"
                                value={selectedNode.properties.maxDepth || 10}
                                onChange={(e) => saveNodeProperty(selectedNode.id, 'maxDepth', Number(e.target.value))}
                                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                              />
                            </div>

                            {/* Learning Rate Slider */}
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
                    </div>

                    <div className="p-3 bg-teal-950/20 border border-teal-900/30 rounded-xl text-[10px] text-teal-400 leading-normal">
                      <strong>Node Status:</strong> {activeStepStatuses[selectedNode.id] || 'Idle'}
                      <p className="mt-1 text-slate-400 text-[9px]">Configure node fields and click execute. Status reflects current step execution phase.</p>
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
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                        <div>
                          <h3 className="font-extrabold text-lg text-slate-800 dark:text-white">{viewingDataset.title}</h3>
                          <span className="text-[10px] text-slate-400 font-bold font-mono">ID: {viewingDataset.id}</span>
                        </div>
                        <span className="text-xs bg-teal-500/10 text-teal-400 font-extrabold px-3 py-1 rounded-full border border-teal-900/20">
                          Profiled Successfully
                        </span>
                      </div>

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
                            <h4 className={`font-extrabold text-sm uppercase tracking-wide ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Live API Test Client</h4>
                            <p className="text-[10px] text-slate-400 font-medium">Verify deployment predictions with dynamic JSON requests</p>
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 uppercase font-extrabold">POST Endpoint</span>
                        </div>

                        {/* Request Endpoint Path */}
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Target Serving URL</label>
                          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[9px] font-bold text-teal-400 overflow-x-auto select-all">
                            {`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000'}/api/v1/deployments/${selectedDeploymentId}/predict`}
                          </div>
                        </div>

                        {/* Request Body JSON textarea */}
                        <div className="space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">JSON Request Payload</label>
                          <textarea
                            value={testPayload}
                            onChange={(e) => setTestPayload(e.target.value)}
                            rows={6}
                            className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-400 focus:border-teal-500 outline-none"
                          />
                        </div>

                        <button
                          onClick={handleTestPrediction}
                          disabled={testingPredict}
                          className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-teal-500/10 flex items-center justify-center gap-2"
                        >
                          {testingPredict ? 'Executing Inference...' : '⚡ Send Test Inference Request'}
                        </button>

                        {/* Prediction Results block */}
                        {predictionResult && (
                          <div className="space-y-2 animate-in slide-in-from-bottom duration-250">
                            <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Inference response (HTTP 200 OK)</label>
                            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[9px] text-teal-350 overflow-x-auto whitespace-pre-wrap max-h-60 select-all">
                              {JSON.stringify(predictionResult, null, 2)}
                            </pre>
                          </div>
                        )}

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
                    darkMode ? 'border-slate-800' : 'border-slate-150'
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
