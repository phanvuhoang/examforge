"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "system-ui, sans-serif",
          gap: "16px",
        }}>
          <h2 style={{ fontSize: "24px", fontWeight: "bold" }}>Có lỗi xảy ra</h2>
          <p style={{ color: "#666" }}>{error.message}</p>
          <button
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              backgroundColor: "#0070f3",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Thử lại
          </button>
        </div>
      </body>
    </html>
  );
}
