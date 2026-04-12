import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
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
  // Force dynamic rendering — prevents Next.js from caching pages as static HTML.
  // Without this, static pages get served with s-maxage=31536000 and after redeploy,
  // stale cached HTML references JS chunks from the old build → white screen.
  headers();

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
