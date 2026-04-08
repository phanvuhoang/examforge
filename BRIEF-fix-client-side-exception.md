# BRIEF-fix-client-side-exception.md

## Root Cause

App báo "Application error: a client-side exception" vì `next-intl` setup thiếu `middleware.ts`.

`src/app/layout.tsx` gọi `getLocale()` và `getMessages()` từ `next-intl/server`. Với cấu hình `getRequestConfig` trong `i18n.ts`, next-intl cần request context để biết locale — nhưng không có `middleware.ts` để inject context đó → `getLocale()` throw error → Next.js ErrorBoundary bắt → hiển thị "Application error: client-side exception".

---

## Fix 1 — Tạo `frontend/src/middleware.ts`

Tạo file mới `frontend/src/middleware.ts`:

```ts
import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['vi'],
  defaultLocale: 'vi',
  localePrefix: 'never', // Không thêm /vi/ vào URL
});

export const config = {
  // Match tất cả paths trừ static files và API
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
```

---

## Fix 2 — Đơn giản hóa `frontend/src/app/layout.tsx`

Thay vì dùng `getLocale()` + `getMessages()` (cần request context), hardcode locale vì app chỉ dùng tiếng Việt:

```tsx
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
```

**Lý do chọn Fix 2:** App chỉ có 1 locale (vi), không cần middleware phức tạp. Hardcode đơn giản, không có SSR context dependency, tránh toàn bộ vấn đề.

**Nếu muốn giữ middleware (Fix 1)**, thêm Fix 1 VÀ giữ nguyên layout.tsx. Cả hai cách đều work.

**Khuyến cáo: Dùng Fix 2** (đơn giản hơn, ít phụ thuộc hơn).

---

## Fix 3 — Đồng thời: bỏ `async` trong layout nếu dùng Fix 2

Nếu dùng Fix 2, layout không còn `async` nữa → TypeScript sẽ không còn complain về `await getLocale()` trong non-async function.

Đảm bảo xóa `async` keyword khỏi `export default function RootLayout`.

---

## Fix 4 — Kiểm tra `frontend/src/i18n.ts`

Nếu dùng Fix 2 (hardcode), file `i18n.ts` có thể giữ nguyên nhưng không được dùng. Không cần xóa nhưng cũng không ảnh hưởng.

---

## Summary checklist

- [ ] Tạo `frontend/src/middleware.ts` (Fix 1, optional nếu dùng Fix 2)
- [ ] Sửa `frontend/src/app/layout.tsx`: hardcode locale="vi", messages từ vi.json, bỏ async (Fix 2 — **bắt buộc**)
- [ ] Verify build không có lỗi TypeScript trước khi push

Sau khi xong: xóa brief này, commit, push GitHub.
