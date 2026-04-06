"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import api from "@/lib/api";
import { ExamAnalytics, Attempt } from "@/types";
import { formatDate, formatDuration, formatPercent } from "@/lib/utils";
import { ArrowLeft, Loader2, Download, BarChart3, Users, Clock, Target, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";

export default function ExamResultsPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const examId = params.id as string;

  const [analytics, setAnalytics] = useState<ExamAnalytics | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [gradingDialog, setGradingDialog] = useState<{ responseId: string; open: boolean } | null>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [analyticsRes, attemptsRes] = await Promise.all([
          api.get(`/api/exams/${examId}/analytics`).catch(() => ({ data: null })),
          api.get(`/api/exams/${examId}/results`).catch(() => ({ data: [] })),
        ]);
        setAnalytics(analyticsRes.data);
        setAttempts(Array.isArray(attemptsRes.data) ? attemptsRes.data : attemptsRes.data.items || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [examId]);

  const handleExport = async () => {
    try {
      const response = await api.get(`/api/exams/${examId}/results/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `results-${examId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      // ignore
    }
  };

  const handleGrade = async () => {
    if (!gradingDialog) return;
    try {
      await api.put(`/api/responses/${gradingDialog.responseId}/grade`, {
        score_override: parseFloat(gradeScore),
        feedback_html: gradeFeedback,
      });
      setGradingDialog(null);
      setGradeScore("");
      setGradeFeedback("");
    } catch {
      // ignore
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/exams")}><ArrowLeft className="h-5 w-5" /></Button>
        <h2 className="text-3xl font-bold tracking-tight">{t("results.analytics")}</h2>
        <div className="ml-auto">
          <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" />{t("results.exportResults")}</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("results.attempts")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{analytics?.total_attempts || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("results.averageScore")}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatPercent(analytics?.average_score || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("results.medianScore")}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatPercent(analytics?.median_score || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("results.passRate")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatPercent(analytics?.pass_rate || 0)}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="distribution">
        <TabsList>
          <TabsTrigger value="distribution">{t("results.scoreDistribution")}</TabsTrigger>
          <TabsTrigger value="questions">{t("results.perQuestion")}</TabsTrigger>
          <TabsTrigger value="timeline">{t("results.timeline")}</TabsTrigger>
          <TabsTrigger value="attempts">{t("results.attempts")}</TabsTrigger>
          <TabsTrigger value="grading">{t("results.gradingQueue")}</TabsTrigger>
        </TabsList>

        <TabsContent value="distribution" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("results.scoreDistribution")}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.score_distribution || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))">
                      {(analytics?.score_distribution || []).map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("results.perQuestion")}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Câu hỏi</TableHead>
                    <TableHead>{t("results.pctCorrect")}</TableHead>
                    <TableHead>{t("results.avgScore")}</TableHead>
                    <TableHead>{t("results.discrimination")}</TableHead>
                    <TableHead>{t("results.avgTime")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(analytics?.per_question_stats || []).map((stat) => (
                    <TableRow key={stat.exam_question_id}>
                      <TableCell className="max-w-xs">
                        <p className="line-clamp-1 text-sm">{stat.question_text}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={stat.pct_correct >= 70 ? "default" : stat.pct_correct >= 40 ? "secondary" : "destructive"}>
                          {formatPercent(stat.pct_correct)}
                        </Badge>
                      </TableCell>
                      <TableCell>{stat.avg_score.toFixed(2)}</TableCell>
                      <TableCell>{stat.discrimination_index.toFixed(2)}</TableCell>
                      <TableCell>{stat.avg_time_seconds.toFixed(0)}s</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Time heatmap */}
              {analytics?.per_question_stats && analytics.per_question_stats.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold mb-4">Thời gian trung bình mỗi câu (giây)</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.per_question_stats.sort((a, b) => b.avg_time_seconds - a.avg_time_seconds)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="question_text" tick={false} />
                        <YAxis />
                        <Tooltip formatter={(value: number) => [`${value.toFixed(0)}s`, "Thời gian TB"]} />
                        <Bar dataKey="avg_time_seconds" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("results.timeline")}</CardTitle></CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics?.attempt_timeline || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attempts" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("results.attempts")} ({attempts.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Thí sinh</TableHead>
                    <TableHead>{t("results.score")}</TableHead>
                    <TableHead>{t("results.timeTaken")}</TableHead>
                    <TableHead>Kết quả</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attempts.map((attempt) => (
                    <TableRow key={attempt.id}>
                      <TableCell>{attempt.identifier_text || attempt.user_id || "Ẩn danh"}</TableCell>
                      <TableCell className="font-medium">{attempt.score_pct !== null ? `${attempt.score_pct.toFixed(1)}%` : "-"}</TableCell>
                      <TableCell>{attempt.time_taken_sec ? formatDuration(attempt.time_taken_sec) : "-"}</TableCell>
                      <TableCell>
                        {attempt.passed !== null && (
                          <Badge variant={attempt.passed ? "default" : "destructive"}>
                            {attempt.passed ? t("results.passed") : t("results.failed")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(attempt.started_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grading" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("results.gradingQueue")}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Các câu hỏi tự luận cần chấm điểm thủ công sẽ hiển thị ở đây.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Grading Dialog */}
      <Dialog open={gradingDialog?.open || false} onOpenChange={(open) => !open && setGradingDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("results.grade")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("results.score")}</label>
              <Input type="number" step="0.5" value={gradeScore} onChange={(e) => setGradeScore(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("results.feedback")}</label>
              <Textarea value={gradeFeedback} onChange={(e) => setGradeFeedback(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradingDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleGrade}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
