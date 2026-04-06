import { create } from 'zustand';
import { Question, SSEEvent, GenerationConfig } from '@/types';
import api from '@/lib/api';

interface GenerationState {
  isGenerating: boolean;
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  streamedQuestions: Question[];
  totalGenerated: number;
  error: string | null;
  jobId: string | null;
  eventSource: EventSource | null;

  startGeneration: (projectId: string, config: GenerationConfig) => Promise<void>;
  stopGeneration: () => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>()((set, get) => ({
  isGenerating: false,
  currentStep: 0,
  totalSteps: 5,
  stepLabel: '',
  streamedQuestions: [],
  totalGenerated: 0,
  error: null,
  jobId: null,
  eventSource: null,

  startGeneration: async (projectId, config) => {
    set({
      isGenerating: true,
      currentStep: 0,
      stepLabel: 'Đang khởi tạo...',
      streamedQuestions: [],
      totalGenerated: 0,
      error: null,
    });

    try {
      const { data } = await api.post(`/api/projects/${projectId}/generate-questions`, config);
      const jobId = data.job_id;
      set({ jobId });

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const es = new EventSource(`${apiUrl}/api/jobs/${jobId}/stream`);
      set({ eventSource: es });

      es.onmessage = (event) => {
        try {
          const parsed: SSEEvent = JSON.parse(event.data);
          switch (parsed.type) {
            case 'progress':
              set({
                currentStep: parsed.step,
                totalSteps: parsed.total,
                stepLabel: parsed.label,
              });
              break;
            case 'question':
              set((state) => ({
                streamedQuestions: [...state.streamedQuestions, parsed.question],
              }));
              break;
            case 'done':
              set({
                isGenerating: false,
                totalGenerated: parsed.total_generated,
                stepLabel: 'Hoàn thành!',
              });
              es.close();
              set({ eventSource: null });
              break;
            case 'error':
              set({
                isGenerating: false,
                error: parsed.message,
              });
              es.close();
              set({ eventSource: null });
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        set({
          isGenerating: false,
          error: 'Mất kết nối với máy chủ. Vui lòng thử lại.',
        });
        es.close();
        set({ eventSource: null });
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Có lỗi xảy ra';
      set({ isGenerating: false, error: message });
    }
  },

  stopGeneration: () => {
    const { eventSource } = get();
    if (eventSource) {
      eventSource.close();
    }
    set({
      isGenerating: false,
      eventSource: null,
      stepLabel: 'Đã dừng',
    });
  },

  reset: () => {
    const { eventSource } = get();
    if (eventSource) eventSource.close();
    set({
      isGenerating: false,
      currentStep: 0,
      totalSteps: 5,
      stepLabel: '',
      streamedQuestions: [],
      totalGenerated: 0,
      error: null,
      jobId: null,
      eventSource: null,
    });
  },
}));
