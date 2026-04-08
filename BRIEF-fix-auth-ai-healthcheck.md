# BRIEF-fix-auth-ai-healthcheck.md

Fix 3 lỗi sau trong ExamForge AI. Đọc kỹ từng phần, implement chính xác, rồi xoá file này và push.

---

## Bug 1 — Login xong ~10 giây lại bị logout (session loop)

### Root cause
`ACCESS_TOKEN_EXPIRE_MINUTES = 30` trong `config.py` — nhưng đó là giá trị default, không phải lỗi.  
Vấn đề thực sự: `dashboard/layout.tsx` có `useEffect` gọi `fetchUser()` mỗi lần render nếu `!user`.  
Nếu `/api/auth/me` trả lỗi bất kỳ (network hiccup, race condition khi token chưa kịp set vào header) → `catch` set `isAuthenticated: false` → layout redirect về `/login`.

**Cụ thể:**
1. `auth-store.ts` → `fetchUser()`: nếu `/api/auth/me` fail → `set({ user: null, isAuthenticated: false })` → **logout ngay lập tức**
2. `api.ts` interceptor: đọc token từ `localStorage['auth-storage']` theo path `state.accessToken` — nhưng Zustand `persist` có thể chưa hydrate xong khi request đầu tiên được gửi (Next.js SSR/hydration timing issue)
3. `dashboard/layout.tsx`: `useEffect` chỉ check `isAuthenticated` và `!user` — nếu store chưa hydrate → `isAuthenticated = false` → redirect ngay

### Fix

**File: `frontend/src/stores/auth-store.ts`**
- Thêm field `_hasHydrated: boolean` (default `false`)
- Dùng `onRehydrateStorage` callback của zustand persist để set `_hasHydrated = true` khi hydration xong
- `fetchUser()`: KHÔNG set `isAuthenticated: false` khi lỗi — chỉ set `user: null`. Chỉ logout nếu response là 401 (token thực sự invalid):
```ts
fetchUser: async () => {
  try {
    const { data } = await api.get('/api/auth/me');
    set({ user: data, isAuthenticated: true });
  } catch (error: any) {
    // Only clear auth if server explicitly says unauthorized
    if (error?.response?.status === 401) {
      set({ user: null, isAuthenticated: false, accessToken: null, refreshToken: null });
    }
    // Network errors, 5xx, etc → keep session alive, user may retry
  }
},
```

**File: `frontend/src/app/(dashboard)/layout.tsx`**
- Import `_hasHydrated` từ auth store
- Không redirect cho đến khi `_hasHydrated === true`
- Thêm retry logic: nếu `isAuthenticated` nhưng `!user` → thử `fetchUser()` với delay nhỏ, KHÔNG redirect ngay
```tsx
useEffect(() => {
  if (!_hasHydrated) return; // Wait for hydration
  if (!isAuthenticated) {
    router.push('/login');
    return;
  }
  if (!user) {
    fetchUser();
  }
}, [_hasHydrated, isAuthenticated, user, fetchUser, router]);

if (!_hasHydrated || (!isAuthenticated && !user)) {
  // Show loading spinner, don't redirect yet
  return <div className="flex h-screen items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>;
}
```

**File: `frontend/src/lib/api.ts`**
- Tăng `ACCESS_TOKEN_EXPIRE_MINUTES` default trong `config.py` từ 30 lên **1440** (24 giờ) — user không cần refresh mỗi 30 phút
- Đảm bảo refresh flow không redirect về login trừ khi refresh token cũng fail

**File: `backend/config.py`**
- Đổi `ACCESS_TOKEN_EXPIRE_MINUTES: int = 30` → `ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440`  
  (24 giờ — phù hợp cho web app thông thường, user không bị kick mỗi 30 phút)

---

## Bug 2 — App không nhận `AI_DEFAULT_MODEL` từ env var

### Root cause
`config.py` dùng `pydantic_settings` với `model_config = {"env_file": ".env", ...}`.  
Pydantic-settings đọc env vars OK — nhưng `AI_DEFAULT_PROVIDER` và `AI_DEFAULT_MODEL` default là `openrouter` và `qwen/qwen3-235b-a22b-2507`.

Khi Coolify set env var `AI_DEFAULT_MODEL=anthropic/claude-sonnet-4-20250514`, pydantic-settings **phải** pick it up.

**Vấn đề thực sự:** `provider.py` → `call_ai()`:
```python
provider = provider or settings.AI_DEFAULT_PROVIDER
model = model or settings.AI_DEFAULT_MODEL
```
Điều này đúng. Nhưng khi `attempt_provider != provider` trong fallback chain → dùng `default_model` từ `PROVIDER_CONFIGS` hardcoded, **không dùng** `settings.AI_DEFAULT_MODEL`.

Thêm vào đó: nếu `AI_DEFAULT_PROVIDER=anthropic` nhưng `ANTHROPIC_API_KEY` không set (chỉ set `ANTHROPIC_BASE_URL`) → `_get_provider_key("anthropic")` trả về `None` → skip provider → fallback sang openrouter → openrouter cần `OPENROUTER_API_KEY`.

### Fix

**File: `backend/config.py`**
- Thêm alias support: `AI_DEFAULT_MODEL` có thể nhận format `provider/model` (e.g. `anthropic/claude-sonnet-4-20250514`) và tự parse:
```python
@property  
def ai_provider_and_model(self) -> tuple[str, str]:
    """Parse AI_DEFAULT_MODEL if it contains provider prefix like 'anthropic/model-name'"""
    model = self.AI_DEFAULT_MODEL
    provider = self.AI_DEFAULT_PROVIDER
    if '/' in model and not model.startswith('gpt') and not model.startswith('claude'):
        # Format: "provider/model" e.g. "openrouter/qwen/qwen3-235b"
        # But openrouter models have slashes too, so check if first part is a known provider
        known_providers = {'openai', 'anthropic', 'openrouter', 'deepseek', 'google', 'ollama'}
        parts = model.split('/', 1)
        if parts[0] in known_providers:
            provider = parts[0]
            model = parts[1]
    return provider, model
```

**File: `backend/ai/provider.py`** → `call_ai()`:
- Sửa để dùng `settings.ai_provider_and_model` thay vì raw `settings.AI_DEFAULT_PROVIDER` + `settings.AI_DEFAULT_MODEL`
- Fix `_get_provider_key("anthropic")`: nếu `ANTHROPIC_BASE_URL` set (claudible) → treat as available even if key có thể là bất kỳ string nào (claudible dùng `ANTHROPIC_API_KEY` làm auth token)
- Log rõ provider + model đang dùng khi startup:
```python
logger.info(f"AI Default: provider={settings.AI_DEFAULT_PROVIDER}, model={settings.AI_DEFAULT_MODEL}")
```

**File: `backend/main.py`**
- Trong startup event / lifespan, log ra AI config để dễ debug:
```python
logger.info(f"AI config: provider={settings.AI_DEFAULT_PROVIDER}, model={settings.AI_DEFAULT_MODEL}")
```

---

## Bug 3 — Remove custom HEALTHCHECK trong Dockerfile (gây lỗi Coolify deploy)

### Root cause
Coolify có health check riêng configured qua UI. Khi Dockerfile có `HEALTHCHECK` instruction và Coolify cũng set health check → conflict/timeout gây deploy fail.

### Fix

**File: `Dockerfile`**
- Xoá hoàn toàn block:
```
# ---- Health check ----
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
    CMD curl -f http://localhost:8000/api/health || exit 1
```
- Giữ lại `curl` trong apt-get install (vẫn cần cho debug), chỉ xoá HEALTHCHECK instruction
- Coolify sẽ dùng health check riêng của nó (hoặc không check nếu không config)

---

## Summary checklist

- [ ] `backend/config.py`: `ACCESS_TOKEN_EXPIRE_MINUTES` 30 → 1440
- [ ] `frontend/src/stores/auth-store.ts`: thêm `_hasHydrated`, fix `fetchUser` không logout khi lỗi non-401
- [ ] `frontend/src/app/(dashboard)/layout.tsx`: wait for hydration trước khi redirect
- [ ] `backend/ai/provider.py` + `config.py`: fix AI_DEFAULT_MODEL/PROVIDER env var resolution + logging
- [ ] `Dockerfile`: xoá HEALTHCHECK instruction

Sau khi implement xong: xoá file `BRIEF-fix-auth-ai-healthcheck.md` này, commit và push lên GitHub.
