import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';
import messages from '../../messages/vi.json';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });

export const metadata: Metadata = {
  title: 'ExamForge AI - Nền tảng Đề thi & Ngân hàng Câu hỏi AI',
  description: 'Tạo đề thi, ngân hàng câu hỏi tự động bằng AI. Hỗ trợ 10 loại câu hỏi, nhập/xuất Excel, phân tích kết quả.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={inter.className}>
        <NextIntlClientProvider locale="vi" messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
