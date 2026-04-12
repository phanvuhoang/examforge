"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { BookOpen, ClipboardList, Users, Activity, Plus, Upload, FileText, Loader2 } from "lucide-react";

interface DashboardData {
  users: number;
  projects: number;
  questions: number;
  exams: number;
  attempts: number;
  ai_generation_jobs: number;
}

const defaultStats: DashboardData = {
  users: 0,
  projects: 0,
  questions: 0,
  exams: 0,
  attempts: 0,
  ai_generation_jobs: 0,
};

export default function DashboardPage() {
  const t = useTranslations();
  const [stats, setStats] = useState<DashboardData>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get("/api/admin/dashboard");
        setStats({
          users: data.users ?? 0,
          projects: data.projects ?? 0,
          questions: data.questions ?? data.total_questions ?? 0,
          exams: data.exams ?? data.total_exams ?? 0,
          attempts: data.attempts ?? data.total_attempts ?? 0,
          ai_generation_jobs: data.ai_generation_jobs ?? 0,
        });
      } catch {
        setStats(defaultStats);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.totalQuestions")}</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.questions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.totalExams")}</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.exams}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.totalAttempts")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.attempts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.quickActions")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild size="sm" className="w-full justify-start">
              <Link href="/projects">
                <Plus className="mr-2 h-4 w-4" />
                {t("dashboard.createProject")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link href="/import">
                <Upload className="mr-2 h-4 w-4" />
                {t("dashboard.importQuestions")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full justify-start">
              <Link href="/exams">
                <FileText className="mr-2 h-4 w-4" />
                {t("dashboard.createExam")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.projects")}</CardTitle>
            <CardDescription>{stats.projects} {t("nav.projects").toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/projects">{t("nav.projects")}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.users")}</CardTitle>
            <CardDescription>{stats.users} {t("nav.users").toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/admin/users">{t("nav.users")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
