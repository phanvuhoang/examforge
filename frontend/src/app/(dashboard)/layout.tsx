"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuthStore } from "@/stores/auth-store";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold text-destructive">Có lỗi xảy ra</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              {this.state.error?.message || "Đã xảy ra lỗi không xác định"}
            </p>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    // Pure client-side auth check — read directly from localStorage
    // This avoids any zustand hydration timing issues
    const checkAuth = () => {
      try {
        const stored = localStorage.getItem("auth-storage");
        if (stored) {
          const parsed = JSON.parse(stored);
          const hasToken = !!parsed?.state?.accessToken;
          const isAuth = !!parsed?.state?.isAuthenticated;
          if (hasToken && isAuth) {
            setIsAuthed(true);
            setAuthChecked(true);
            return;
          }
        }
      } catch {
        // ignore parse errors
      }
      // Not authenticated — redirect to login (but only once)
      if (!redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/login");
      }
      setAuthChecked(true);
    };

    checkAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Also trigger fetchUser to populate the zustand store
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (isAuthed && !user) {
      fetchUser();
    }
  }, [isAuthed, user, fetchUser]);

  if (!authChecked || !isAuthed) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
