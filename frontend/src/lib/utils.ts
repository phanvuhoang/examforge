import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, locale: string = 'vi') {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100) / 100}%`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }
  return html.replace(/<[^>]*>/g, '');
}

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  MC: 'Trắc nghiệm một đáp án',
  MR: 'Trắc nghiệm nhiều đáp án',
  TF: 'Đúng/Sai',
  FITB: 'Điền vào chỗ trống',
  MATCH: 'Nối cặp',
  ORDER: 'Sắp xếp thứ tự',
  NUM: 'Số',
  SA: 'Trả lời ngắn',
  ESSAY: 'Tự luận',
  TEXT: 'Khối văn bản',
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

export const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  hard: 'bg-red-100 text-red-800',
};
