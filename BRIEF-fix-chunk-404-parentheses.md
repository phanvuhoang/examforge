# BRIEF-fix-chunk-404-parentheses.md

## Root Cause — CHÍNH XÁC

App báo "Application error" vì JavaScript chunks không load được.

**Chi tiết kỹ thuật:**
- Next.js App Router dùng route groups: `app/(dashboard)/`, `app/(auth)/`
- Khi build standalone, tạo ra chunks tên như `app/(dashboard)/layout-xxx.js`
- Browser fetch chunk với URL-encoded: `/_next/static/chunks/app/%28dashboard%29/layout-xxx.js`
- Next.js standalone server trả **404** cho URL-encoded path có `%28..%29`
- Nhưng trả **200** cho path có `(..)`  thực sự
- Kết quả: JavaScript không load → "Application error: client-side exception"

**Đã verify:**
```
curl http://container:3000/_next/static/chunks/app/(dashboard)/layout.js    → 200 ✅
curl http://container:3000/_next/static/chunks/app/%28dashboard%29/layout.js → 404 ❌
```

Đây là **bug Next.js standalone server** với parentheses trong static file paths.

---

## Fix — Đổi tên route group để không có `()` trong chunk path

**Cách đơn giản nhất và chắc chắn nhất**: Đổi tên các folder route group.

### Bước 1: Rename folders

```
frontend/src/app/(dashboard)/  →  frontend/src/app/app/
frontend/src/app/(auth)/       →  frontend/src/app/auth/
```

Với Next.js App Router:
- `(dashboard)` là route group — không ảnh hưởng URL
- `app/` hoặc bất kỳ tên nào đều có thể làm route group nếu dùng layout riêng
- **Chú ý:** Khi đổi tên, cần đảm bảo `layout.tsx` và `page.tsx` vẫn export đúng

### Bước 2: Cập nhật imports

Sau khi rename, các file import từ `@/(dashboard)/` hay `@/(auth)/` phải sửa thành `@/app/` và `@/auth/`.

Tìm và thay thế trong toàn bộ `frontend/src/`:
```
(dashboard)  →  app-layout
(auth)       →  auth-layout
```

Hoặc chọn tên khác không có dấu ngoặc.

---

## Fix thay thế — Thêm custom server.js để normalize URL

Nếu không muốn rename folders, thêm custom Next.js server để normalize `%28` → `(` trước khi serve static files:

Tạo file `frontend/server-custom.js`:
```js
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const path = require('path');
const fs = require('fs');

const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ 
  dir: __dirname,
  hostname,
  port,
  customServer: true,
});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      // Decode URL để Next.js serve đúng static chunks với ()
      if (req.url) {
        req.url = decodeURIComponent(req.url);
      }
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
```

Sau đó sửa `supervisord.conf` hoặc `Dockerfile` CMD để chạy `server-custom.js` thay vì `server.js`:
```ini
[program:frontend]
command=bash -c "cd /app && HOSTNAME=0.0.0.0 PORT=3000 exec node server-custom.js"
```

---

## Khuyến cáo

**Dùng Fix thay thế (custom server.js)** — đơn giản hơn, không cần rename toàn bộ folder structure.

1. Tạo `frontend/server-custom.js` (nội dung như trên)
2. Sửa `supervisord.conf`: đổi frontend command dùng `server-custom.js`
3. Không cần sửa bất kỳ file nào khác

**Test sau khi fix:**
```
curl https://examforge.gpt4vn.com/_next/static/chunks/app/%28dashboard%29/layout-xxx.js
# → phải trả 200
```

---

Sau khi xong: xóa brief này, commit, push GitHub.
