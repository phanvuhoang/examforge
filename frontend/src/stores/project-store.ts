import { create } from 'zustand';
import api from '@/lib/api';
import { Project } from '@/types';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<void>;
  createProject: (data: { name: string; description?: string }) => Promise<Project>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  currentProject: null,
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/api/projects');
      set({ projects: Array.isArray(data) ? data : data.items || [] });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchProject: async (id: string) => {
    set({ isLoading: true });
    try {
      const { data } = await api.get(`/api/projects/${id}`);
      set({ currentProject: data });
    } finally {
      set({ isLoading: false });
    }
  },

  createProject: async (projectData) => {
    const { data } = await api.post('/api/projects', projectData);
    set((state) => ({ projects: [...state.projects, data] }));
    return data;
  },

  updateProject: async (id, projectData) => {
    const { data } = await api.put(`/api/projects/${id}`, projectData);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? data : p)),
      currentProject: state.currentProject?.id === id ? data : state.currentProject,
    }));
  },

  deleteProject: async (id) => {
    await api.delete(`/api/projects/${id}`);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }));
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}));
