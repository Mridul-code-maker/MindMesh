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
    activeStepStatuses, liveLogs, running, socketConnected,
    fetchDatasets, uploadDataset, fetchPipelines, updatePipeline,
    runPipeline, fetchRuns, setupSockets, cleanupSockets, setActivePipeline
  } = usePipelineStore();

  const [activeTab, setActiveTab] = useState<'playground' | 'datasets' | 'runs' | 'settings'>('playground');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  
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
  const [angleX, setAngleX] = useState<number>(-0.3);
  const [angleY, setAngleY] = useState<number>(0.4);
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
  }, [initAuth, fetchDatasets, fetchPipelines, fetchRuns]);

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
      setupSockets(pipelines[0].id);
      
      setChatMessages([
        {
          sender: 'agent',
          text: `Welcome, ${user?.name || 'Researcher'}. I am your MindMesh Data Science Agent. Select a dataset, configure nodes, or click one of the suggested cards below to begin.`,
          time: new Date().toLocaleTimeString()
        }
      ]);
    }
    return () => {
      cleanupSockets();
    };
  }, [pipelines, activePipeline, setActivePipeline, setupSockets, cleanupSockets, user]);

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
        let x = x3d * Math.cos(angleY) - z3d * Math.sin(angleY);
        let z = x3d * Math.sin(angleY) + z3d * Math.cos(angleY);
        // X-axis rotation
        let y = y3d * Math.cos(angleX) - z * Math.sin(angleX);
        z = y3d * Math.sin(angleX) + z * Math.cos(angleX);

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
        setAngleY(prev => prev + 0.001);
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
  }, [activeNodes, activeEdges, angleX, angleY, activeStepStatuses, running, selectedNode, darkMode, activeTab]);

  // Drag-to-Rotate handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - startMouse.current.x;
    const dy = e.clientY - startMouse.current.y;

    setAngleY(prev => prev + dx * 0.006);
    setAngleX(prev => prev + dy * 0.006);

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
      setSelectedNode(clicked);
    } else {
      setSelectedNode(null);
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
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 backdrop-blur-md flex flex-col justify-between shrink-0">
        <div>
          {/* Header Branding */}
          <div className="p-6 border-b border-slate-150 dark:border-slate-800/80 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-teal-600 flex items-center justify-center shadow-md shadow-teal-500/20">
              <Activity className="text-white" size={18} />
            </div>
            <div>
              <h2 className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white">
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
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
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
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
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
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
              }`}
            >
              <FileText size={16} />
              <span>Executions History</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-l-2 border-teal-500'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850'
              }`}
            >
              <SettingsIcon size={16} />
              <span>Workspace Settings</span>
            </button>
          </nav>
        </div>

        {/* Footer Profile Controls */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400">
                <UserIcon size={14} />
              </div>
              <div className="truncate w-32">
                <div className="font-extrabold text-[11px] truncate text-slate-800 dark:text-slate-200">{user?.name}</div>
                <div className="text-[9px] text-slate-400 font-semibold">{user?.role} Access</div>
              </div>
            </div>
            
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-1.5 rounded bg-slate-200 dark:bg-slate-850 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              {darkMode ? <Sun size={12} /> : <Moon size={12} />}
            </button>
          </div>

          <button
            onClick={logout}
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
        <header className="h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <h3 className="font-extrabold text-sm tracking-tight text-slate-800 dark:text-slate-100">
              {activeTab === 'playground' && `MindMesh Sandbox Playground — ${activePipeline?.name || 'Workspace'}`}
              {activeTab === 'datasets' && 'Data Ingestion & profiling Registry'}
              {activeTab === 'runs' && 'Historical Pipeline Executions Log'}
              {activeTab === 'settings' && 'Workspace Configuration Console'}
            </h3>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time Connection Status Dot */}
            <div 
              className="flex items-center gap-1.5 px-2.5 h-8.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[10px] font-bold select-none cursor-help"
              title={socketConnected ? 'WebSocket sync channel is active and secure.' : 'WebSocket disconnected. Retrying...'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                socketConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-amber-500 animate-pulse'
              }`} />
              <span className={socketConnected ? 'text-slate-500 dark:text-slate-400' : 'text-amber-500 font-black'}>
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
              <div className="w-full xl:w-96 border-r border-slate-200 dark:border-slate-800 bg-white/30 dark:bg-slate-900/10 flex flex-col shrink-0 min-h-[350px] xl:min-h-0">
                {/* Chat window */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[300px] xl:max-h-none">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3 rounded-xl max-w-[85%] text-xs leading-relaxed ${
                        msg.sender === 'user' 
                          ? 'bg-teal-600 text-white rounded-tr-none' 
                          : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                      <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold mt-1 px-1">{msg.time}</span>
                    </div>
                  ))}

                  {/* Socket Real-time logs tailing */}
                  {liveLogs.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-950 text-slate-300 font-mono text-[9px] p-3 space-y-1.5 animate-in fade-in duration-200">
                      <div className="flex items-center gap-1.5 text-teal-400 font-black uppercase text-[8px] tracking-wider border-b border-slate-900 pb-1 mb-1.5">
                        <Terminal size={10} />
                        WebSocket Pipeline Logger
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {liveLogs.map((log, idx) => (
                          <div key={idx} className="flex gap-2">
                            <span className="text-slate-600 shrink-0">[{log.node}]</span>
                            <span className={log.type === 'error' ? 'text-red-400 font-bold' : log.type === 'warning' ? 'text-amber-400' : 'text-slate-300'}>
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
                <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-850/80 bg-slate-50 dark:bg-slate-900/10 shrink-0">
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
                        className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-teal-500/50 hover:bg-slate-100 dark:hover:bg-slate-850 shrink-0 cursor-pointer transition-all"
                      >
                        {card.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt Message bar */}
                <form onSubmit={handleChatSubmit} className="p-3 border-t border-slate-200 dark:border-slate-850 flex gap-2 bg-white dark:bg-slate-900/20 shrink-0">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask Agent to clean data..."
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-teal-500 text-xs outline-none text-slate-900 dark:text-slate-100"
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
              <div className="flex-1 flex flex-col lg:flex-row relative grid-bg min-w-0">
                {/* 3D Canvas Visualizer */}
                <div className="flex-1 relative min-h-[400px]">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUpOrLeave}
                    onMouseLeave={handleMouseUpOrLeave}
                    onClick={handleCanvasClick}
                    className="w-full h-full min-h-[400px] cursor-grab active:cursor-grabbing block"
                    title="Drag to rotate 3D node network"
                  />

                  {/* 3D Perspective Rotation Tutorial Overlay Tip */}
                  <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-slate-900/60 backdrop-blur border border-slate-800/80 text-[8px] font-bold uppercase tracking-wider text-slate-400 pointer-events-none select-none">
                    Drag mouse to rotate pipeline in 3D
                  </div>
                </div>

                {/* Node Property panel / Slide-out drawer on click */}
                {selectedNode && (
                  <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 backdrop-blur-md p-5 flex flex-col justify-between shrink-0 z-10 animate-in slide-in-from-right duration-250">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-800 pb-3 mb-4">
                        <h4 className="font-extrabold text-xs uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                          {selectedNode.type === 'Ingest' && <Database size={13} />}
                          {selectedNode.type === 'Preprocess' && <Edit3 size={13} />}
                          {selectedNode.type === 'AIModel' && <Brain size={13} />}
                          {selectedNode.type === 'Output' && <BarChart3 size={13} />}
                          Node Configuration
                        </h4>
                        <button 
                          onClick={() => setSelectedNode(null)}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                            Node Label
                          </label>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-850 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
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
                          <div>
                            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                              Predictor Model
                            </label>
                            <select
                              value={selectedNode.properties.modelType || 'RandomForest'}
                              onChange={(e) => saveNodeProperty(selectedNode.id, 'modelType', e.target.value)}
                              className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
                            >
                              <option value="RandomForest">Random Forest Regression</option>
                              <option value="XGBoost">XGBoost Decision Trees</option>
                              <option value="LinearRegression">Multi Linear Regression</option>
                            </select>
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
                      <div className="grid grid-cols-3 gap-4">
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
                      </div>

                      {/* Columns classification detail list */}
                      <div>
                        <h4 className="font-black text-xs uppercase tracking-wider text-slate-400 mb-3">Feature Schema Classification</h4>
                        <div className="flex flex-wrap gap-2">
                          {viewingDataset.columns.map((c: any, i: number) => (
                            <span key={i} className="px-2.5 py-1 rounded bg-slate-950 border border-slate-850 text-[10px] font-bold text-slate-300 flex items-center gap-1.5">
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
                        <div className="overflow-x-auto border border-slate-150 dark:border-slate-850 rounded-xl">
                          <table className="w-full border-collapse text-[10px]">
                            <thead>
                              <tr className="bg-slate-100 dark:bg-slate-950 text-slate-500 font-bold uppercase tracking-wider text-left border-b border-slate-200 dark:border-slate-800">
                                {viewingDataset.columns.map((c: any, i: number) => (
                                  <th key={i} className="px-4 py-2 border-b border-slate-200 dark:border-slate-800">{c.name}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {viewingDataset.preview.map((row: any, rowIdx: number) => (
                                <tr key={rowIdx} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 border-b border-slate-200 dark:border-slate-800">
                                  {viewingDataset.columns.map((c: any, colIdx: number) => (
                                    <td key={colIdx} className="px-4 py-2 font-mono text-slate-300">{row[c.name] ?? ''}</td>
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
                    className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-850 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
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
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/40">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-950 text-slate-500 font-bold uppercase tracking-wider text-left border-b border-slate-200 dark:border-slate-850">
                        <th className="px-4 py-3">Run ID</th>
                        <th className="px-4 py-3">Pipeline</th>
                        <th className="px-4 py-3">Triggered By</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">Execution Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/30 border-b border-slate-200 dark:border-slate-800">
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-500 dark:text-slate-400">{run.id}</td>
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-200">{run.pipeline?.name || 'N/A'}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{run.user?.name || 'N/A'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              run.status === 'Success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {run.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{run.duration}ms</td>
                          <td className="px-4 py-3 text-slate-400 dark:text-slate-500">{new Date(run.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
              
              <div className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 space-y-6">
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-teal-400 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <SettingsIcon size={16} />
                  Workspace Settings
                </h3>

                <div className="space-y-4">
                  {/* Theme Toggle */}
                  <div className="flex items-center justify-between border-b border-slate-150 dark:border-slate-850 pb-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Dark Mode Interface</h4>
                      <p className="text-[10px] text-slate-400 font-medium">Switch between high contrast dark mode and light mode aesthetics.</p>
                    </div>
                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all cursor-pointer"
                    >
                      {darkMode ? 'Switch to Light' : 'Switch to Dark'}
                    </button>
                  </div>

                  {/* Account Metadata */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">Active Session Details</h4>
                    <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850/80 space-y-3 font-mono text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Operator Username:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold">{user?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Operator Email:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-bold">{user?.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Authorization Scope:</span>
                        <span className="text-teal-400 font-extrabold">{user?.role}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Engine API Node:</span>
                        <span className="text-slate-400">{API_BASE}</span>
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
