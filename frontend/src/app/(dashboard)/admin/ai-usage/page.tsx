"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import api from "@/lib/api";
import { AIUsageStats } from "@/types";
import { Loader2, Coins, Zap, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

export default function AIUsagePage() {
  const t = useTranslations();
  const [stats, setStats] = useState<AIUsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get("/api/admin/ai-usage");
        setStats(data);
      } catch {
        setStats({ total_tokens: 0, total_cost: 0, by_provider: [], by_project: [], timeline: [] });
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">{t("admin.aiUsage.title")}</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.aiUsage.totalTokens")}</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{(stats?.total_tokens || 0).toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.aiUsage.totalCost")}</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">${(stats?.total_cost || 0).toFixed(2)}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("admin.aiUsage.byProvider")}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.by_provider || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="provider" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="tokens" fill="hsl(var(--primary))" name={t("admin.aiUsage.tokens")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("admin.aiUsage.timeline")}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.timeline || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" name={t("admin.aiUsage.tokens")} />
                  <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#f59e0b" name={t("admin.aiUsage.cost")} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("admin.aiUsage.byProject")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dự án</TableHead>
                <TableHead>{t("admin.aiUsage.tokens")}</TableHead>
                <TableHead>{t("admin.aiUsage.cost")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(stats?.by_project || []).map((project) => (
                <TableRow key={project.project_id}>
                  <TableCell className="font-medium">{project.project_name}</TableCell>
                  <TableCell>{project.tokens.toLocaleString()}</TableCell>
                  <TableCell>${project.cost.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
