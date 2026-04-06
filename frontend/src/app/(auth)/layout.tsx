import React from "react";
import { GraduationCap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <GraduationCap className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold">ExamForge AI</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
