"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { DashboardStats } from "@/types";
import { formatDate } from "@/lib/utils";
import { BookOpen, ClipboardList, Users, Activity, Plus, Upload, FileText, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const t = useTranslations();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get("/api/admin/dashboard");
        setStats(data);
      } catch {
        setStats({
          total_questions: 0,
          total_exams: 0,
          total_attempts: 0,
          recent_activity: [],
        });
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
            <div className="text-2xl font-bold">{stats?.total_questions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.totalExams")}</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_exams || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.totalAttempts")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_attempts || 0}</div>
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

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
          <CardDescription>
            {t("dashboard.title")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats?.recent_activity && stats.recent_activity.length > 0 ? (
            <div className="space-y-4">
              {stats.recent_activity.map((activity, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(activity.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
