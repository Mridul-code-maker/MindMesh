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
      transports: ['websocket'],
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
  }
}));
