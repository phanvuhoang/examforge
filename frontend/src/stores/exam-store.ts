import { create } from 'zustand';
import api from '@/lib/api';
import { Exam, ExamQuestion, Attempt, Response as ExamResponse } from '@/types';

interface ExamState {
  currentExam: Exam | null;
  attempt: Attempt | null;
  questions: ExamQuestion[];
  responses: Record<string, Record<string, unknown>>;
  flaggedQuestions: Set<string>;
  currentQuestionIndex: number;
  timeRemaining: number | null;
  isSubmitting: boolean;
  isLoading: boolean;

  setExam: (exam: Exam) => void;
  startAttempt: (examId: string, identifier?: string, passcode?: string) => Promise<void>;
  setResponse: (examQuestionId: string, answer: Record<string, unknown>) => void;
  toggleFlag: (examQuestionId: string) => void;
  setCurrentQuestion: (index: number) => void;
  saveResponses: () => Promise<void>;
  submitAttempt: () => Promise<void>;
  setTimeRemaining: (seconds: number) => void;
  fetchExamByToken: (token: string) => Promise<Exam>;
  reset: () => void;
}

export const useExamStore = create<ExamState>()((set, get) => ({
  currentExam: null,
  attempt: null,
  questions: [],
  responses: {},
  flaggedQuestions: new Set(),
  currentQuestionIndex: 0,
  timeRemaining: null,
  isSubmitting: false,
  isLoading: false,

  setExam: (exam) => set({ currentExam: exam }),

  startAttempt: async (examId, identifier, passcode) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/api/attempts', {
        exam_id: examId,
        identifier_text: identifier,
        passcode,
      });
      set({
        attempt: data,
        questions: data.questions || [],
        currentQuestionIndex: 0,
        responses: {},
        flaggedQuestions: new Set(),
      });
      const exam = get().currentExam;
      if (exam?.settings_json?.time_limit_minutes) {
        set({ timeRemaining: exam.settings_json.time_limit_minutes * 60 });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  setResponse: (examQuestionId, answer) => {
    set((state) => ({
      responses: { ...state.responses, [examQuestionId]: answer },
    }));
  },

  toggleFlag: (examQuestionId) => {
    set((state) => {
      const newSet = new Set(state.flaggedQuestions);
      if (newSet.has(examQuestionId)) {
        newSet.delete(examQuestionId);
      } else {
        newSet.add(examQuestionId);
      }
      return { flaggedQuestions: newSet };
    });
  },

  setCurrentQuestion: (index) => set({ currentQuestionIndex: index }),

  saveResponses: async () => {
    const { attempt, responses } = get();
    if (!attempt) return;
    const responseArray = Object.entries(responses).map(([examQuestionId, answer]) => ({
      exam_question_id: examQuestionId,
      answer_data_json: answer,
    }));
    if (responseArray.length === 0) return;
    await api.put(`/api/attempts/${attempt.id}/responses`, { responses: responseArray });
  },

  submitAttempt: async () => {
    const { attempt } = get();
    if (!attempt) return;
    set({ isSubmitting: true });
    try {
      await get().saveResponses();
      await api.post(`/api/attempts/${attempt.id}/submit`);
    } finally {
      set({ isSubmitting: false });
    }
  },

  setTimeRemaining: (seconds) => set({ timeRemaining: seconds }),

  fetchExamByToken: async (token) => {
    const { data } = await api.get(`/api/t/${token}`);
    set({ currentExam: data });
    return data;
  },

  reset: () =>
    set({
      currentExam: null,
      attempt: null,
      questions: [],
      responses: {},
      flaggedQuestions: new Set(),
      currentQuestionIndex: 0,
      timeRemaining: null,
      isSubmitting: false,
    }),
}));
