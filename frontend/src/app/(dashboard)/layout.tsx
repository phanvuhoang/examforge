"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuthStore } from "@/stores/auth-store";

function DashboardContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
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
  const { isAuthenticated, user, fetchUser, _hasHydrated } = useAuthStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    // Fetch user data if not loaded yet
    if (!user) {
      fetchUser().finally(() => {
        setIsReady(true);
      });
    } else {
      setIsReady(true);
    }
  }, [_hasHydrated, isAuthenticated, user, fetchUser, router]);

  // Waiting for zustand to hydrate from localStorage
  if (!_hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Not authenticated — redirecting to login
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Authenticated but still loading user data
  if (!isReady && !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="flex h-screen items-center justify-center">
          <p>Có lỗi xảy ra. Vui lòng tải lại trang.</p>
        </div>
      }
    >
      <DashboardContent>{children}</DashboardContent>
    </ErrorBoundary>
  );
}
