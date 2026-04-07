"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useAuthStore } from "@/stores/auth-store";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, user, fetchUser, _hasHydrated } = useAuthStore();

  useEffect(() => {
    // Rehydrate store từ localStorage khi client mount
    useAuthStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!_hasHydrated) return; // chờ hydration xong
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!user) {
      fetchUser();
    }
  }, [isAuthenticated, user, fetchUser, router, _hasHydrated]);

  // Chưa hydrate xong → spinner (không redirect vội)
  if (!_hasHydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

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
