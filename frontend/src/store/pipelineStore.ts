import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { api, API_BASE } from './authStore';

export interface Dataset {
  id: string;
  title: string;
  filename: string;
  rowCount: number;
  columns: { name: string; type: string }[];
  missingPct: number;
  createdAt: string;
}

export interface GraphNode {
  id: string;
  type: 'Ingest' | 'Preprocess' | 'AIModel' | 'Output';
  label: string;
  x: number;
  y: number;
  properties: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface Pipeline {
  id: string;
  name: string;
  nodes: string; // JSON string
  edges: string; // JSON string
  createdAt: string;
  updatedAt: string;
}

export interface LogItem {
  time: string;
  node: string;
  text: string;
  type: 'info' | 'warning' | 'error';
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: 'Success' | 'Failed' | 'Running';
  duration: number;
  logs: LogItem[];
  createdAt: string;
  pipeline?: { name: string };
  user?: { name: string };
}

interface PipelineState {
  datasets: Dataset[];
  pipelines: Pipeline[];
  runs: PipelineRun[];
  activePipeline: Pipeline | null;
  activeNodes: GraphNode[];
  activeEdges: GraphEdge[];
  activeStepStatuses: Record<string, 'Idle' | 'Running' | 'Success' | 'Failed'>;
  liveLogs: LogItem[];
  running: boolean;
  socket: Socket | null;
  socketConnected: boolean;
  deployments: any[];
  
  fetchDatasets: () => Promise<void>;
  uploadDataset: (formData: FormData) => Promise<boolean>;
  fetchPipelines: () => Promise<void>;
  createPipeline: (name: string, nodes: GraphNode[], edges: GraphEdge[]) => Promise<Pipeline | null>;
  updatePipeline: (id: string, name?: string, nodes?: GraphNode[], edges?: GraphEdge[]) => Promise<boolean>;
  runPipeline: (id: string, datasetId: string) => Promise<boolean>;
  fetchRuns: () => Promise<void>;
  setupSockets: (pipelineId: string) => void;
  cleanupSockets: () => void;
  setActivePipeline: (pipeline: Pipeline | null) => void;
  fetchDeployments: () => Promise<void>;
  deployModel: (runId: string) => Promise<boolean>;
  suspendDeployment: (id: string) => Promise<boolean>;
  addNode: (node: GraphNode) => void;
  deleteNode: (nodeId: string) => void;
  addEdge: (edge: GraphEdge) => void;
  updateNodePosition: (nodeId: string, x: number, y: number, persist?: boolean) => void;
  updateNodeProperties: (nodeId: string, properties: any) => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  datasets: [],
  pipelines: [],
  runs: [],
  activePipeline: null,
  activeNodes: [],
  activeEdges: [],
  activeStepStatuses: {},
  liveLogs: [],
  running: false,
  socket: null,
  socketConnected: false,
  deployments: [],

  fetchDeployments: async () => {
    try {
      const res = await api.get('/api/v1/deployments');
      set({ deployments: res.data.data });
    } catch (err) {
      console.error('Failed to load deployments:', err);
    }
  },

  deployModel: async (runId) => {
    try {
      await api.post('/api/v1/deployments', { runId });
      get().fetchDeployments();
      return true;
    } catch (err) {
      console.error('Failed to deploy model:', err);
      return false;
    }
  },

  suspendDeployment: async (id) => {
    try {
      await api.delete(`/api/v1/deployments/${id}`);
      get().fetchDeployments();
      return true;
    } catch (err) {
      console.error('Failed to suspend deployment:', err);
      return false;
    }
  },

  fetchDatasets: async () => {
    try {
      const res = await api.get('/api/v1/datasets');
      set({ datasets: res.data.data });
    } catch (err) {
      console.error('Failed to load datasets:', err);
    }
  },

  uploadDataset: async (formData) => {
    try {
      await api.post('/api/v1/datasets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      get().fetchDatasets();
      return true;
    } catch (err) {
      console.error('Dataset upload failed:', err);
      return false;
    }
  },

  fetchPipelines: async () => {
    try {
      const res = await api.get('/api/v1/pipelines');
      set({ pipelines: res.data.data });
    } catch (err) {
      console.error('Failed to load pipelines:', err);
    }
  },

  createPipeline: async (name, nodes, edges) => {
    try {
      const res = await api.post('/api/v1/pipelines', {
        name,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges)
      });
      get().fetchPipelines();
      return res.data.data;
    } catch (err) {
      console.error('Failed to create pipeline:', err);
      return null;
    }
  },

  updatePipeline: async (id, name, nodes, edges) => {
    try {
      const body: any = {};
      if (name !== undefined) body.name = name;
      if (nodes !== undefined) body.nodes = JSON.stringify(nodes);
      if (edges !== undefined) body.edges = JSON.stringify(edges);

      await api.patch(`/api/v1/pipelines/${id}`, body);
      get().fetchPipelines();
      return true;
    } catch (err) {
      console.error('Failed to update pipeline:', err);
      return false;
    }
  },

  runPipeline: async (id, datasetId) => {
    set({ running: true, liveLogs: [], activeStepStatuses: {} });
    try {
      // Re-fetch pipeline nodes to setup their initial visual state to Idle
      const pipeline = get().pipelines.find(p => p.id === id);
      if (pipeline) {
        const nodes: GraphNode[] = JSON.parse(pipeline.nodes);
        const initialStatuses: Record<string, any> = {};
        nodes.forEach(n => {
          initialStatuses[n.id] = 'Idle';
        });
        set({ activeStepStatuses: initialStatuses });
      }

      const res = await api.post(`/api/v1/pipelines/${id}/run`, { datasetId });
      set({ running: false });
      get().fetchRuns();
      return res.data.success;
    } catch (err) {
      console.error('Execution run failed:', err);
      set({ running: false });
      return false;
    }
  },

  fetchRuns: async () => {
    try {
      const res = await api.get('/api/v1/runs');
      set({ runs: res.data.data });
    } catch (err) {
      console.error('Failed to load executions history:', err);
    }
  },

  setupSockets: (pipelineId) => {
    const existingSocket = get().socket;
    if (existingSocket) return;

    // Establish WebSocket connection
    const socket = io(API_BASE, {
      transports: ['polling', 'websocket'],
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 10,
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log('WebSocket channel secure. Monitoring run ID:', pipelineId);
      set({ socketConnected: true });
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      set({ socketConnected: false });
    });

    socket.on('disconnect', (reason) => {
      console.warn('WebSocket disconnected:', reason);
      set({ socketConnected: false });
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    // Listen to real-time step animations
    socket.on(`run_step_${pipelineId}`, (data: { nodeId: string; status: 'Running' | 'Success' | 'Failed'; details: any }) => {
      set((state) => {
        const statuses = { ...state.activeStepStatuses };
        
        if (data.nodeId === 'all') {
          // If 'all' fails, turn all steps to Failed
          Object.keys(statuses).forEach(k => {
            if (statuses[k] === 'Running' || statuses[k] === 'Idle') {
              statuses[k] = 'Failed';
            }
          });
        } else {
          statuses[data.nodeId] = data.status;
        }

        return { activeStepStatuses: statuses };
      });
    });

    // Listen to real-time log outputs
    socket.on(`run_log_${pipelineId}`, (logItem: LogItem) => {
      set((state) => ({
        liveLogs: [...state.liveLogs, logItem]
      }));
    });

    set({ socket });
  },

  cleanupSockets: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, socketConnected: false });
    }
  },

  setActivePipeline: (pipeline) => {
    if (pipeline) {
      const nodes = JSON.parse(pipeline.nodes);
      const edges = JSON.parse(pipeline.edges);
      set({ activePipeline: pipeline, activeNodes: nodes, activeEdges: edges });
    } else {
      set({ activePipeline: null, activeNodes: [], activeEdges: [] });
    }
  },

  addNode: (node) => {
    const { activePipeline, activeNodes, activeEdges, updatePipeline } = get();
    if (!activePipeline) return;
    const newNodes = [...activeNodes, node];
    set({ activeNodes: newNodes });
    updatePipeline(activePipeline.id, undefined, newNodes, activeEdges);
  },

  deleteNode: (nodeId) => {
    const { activePipeline, activeNodes, activeEdges, updatePipeline } = get();
    if (!activePipeline) return;
    const newNodes = activeNodes.filter(n => n.id !== nodeId);
    const newEdges = activeEdges.filter(e => e.source !== nodeId && e.target !== nodeId);
    set({ activeNodes: newNodes, activeEdges: newEdges });
    updatePipeline(activePipeline.id, undefined, newNodes, newEdges);
  },

  addEdge: (edge) => {
    const { activePipeline, activeNodes, activeEdges, updatePipeline } = get();
    if (!activePipeline) return;
    const exists = activeEdges.some(e => e.source === edge.source && e.target === edge.target);
    if (exists) return;
    const newEdges = [...activeEdges, edge];
    set({ activeEdges: newEdges });
    updatePipeline(activePipeline.id, undefined, activeNodes, newEdges);
  },

  updateNodePosition: (nodeId, x, y, persist = false) => {
    const { activePipeline, activeNodes, activeEdges, updatePipeline } = get();
    if (!activePipeline) return;
    const newNodes = activeNodes.map(n => n.id === nodeId ? { ...n, x, y } : n);
    set({ activeNodes: newNodes });
    if (persist) {
      updatePipeline(activePipeline.id, undefined, newNodes, activeEdges);
    }
  },

  updateNodeProperties: (nodeId, properties) => {
    const { activePipeline, activeNodes, activeEdges, updatePipeline } = get();
    if (!activePipeline) return;
    const newNodes = activeNodes.map(n => n.id === nodeId ? { ...n, properties: { ...n.properties, ...properties } } : n);
    set({ activeNodes: newNodes });
    updatePipeline(activePipeline.id, undefined, newNodes, activeEdges);
  },
}));
