"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import api from "@/lib/api";
import { Exam, ExamQuestion, ExamSettings } from "@/types";
import { QUESTION_TYPE_LABELS, stripHtml } from "@/lib/utils";
import { toast } from "@/lib/use-toast";
import { ArrowLeft, Save, Loader2, Globe, Copy, Settings, List, Trash2 } from "lucide-react";

const defaultSettings: ExamSettings = {
  pagination: "all_on_one",
  navigation: "free_jump",
  inline_feedback: "none",
  shuffle_questions: true,
  shuffle_options: true,
  time_limit_minutes: null,
  time_per_question_seconds: null,
  max_attempts: null,
  cooldown_minutes: 0,
  browser_security: { disable_copy_paste: false, disable_right_click: false, disable_print: false },
  pass_threshold_pct: 60,
  pass_message: "Chúc mừng bạn đã vượt qua!",
  fail_message: "Bạn chưa đạt, hãy thử lại.",
  result_display: "score",
  review_window: "immediate",
  require_identifier: "name",
  certificate_enabled: false,
  watermark_text: "",
  language: "vi",
};

export default function ExamEditorPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const examId = params.id as string;

  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [title, setTitle] = useState("");
  const [settings, setSettings] = useState<ExamSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const { data } = await api.get(`/api/exams/${examId}`);
        setExam(data);
        setTitle(data.title);
        setSettings({ ...defaultSettings, ...data.settings_json });
        setQuestions(data.questions || []);
      } catch {
        router.push("/exams");
      } finally {
        setLoading(false);
      }
    };
    fetchExam();
  }, [examId, router]);

  const updateSetting = <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateBrowserSecurity = (key: string, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      browser_security: { ...prev.browser_security, [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/exams/${examId}`, { title, settings_json: settings });
      toast({ title: t("common.success") });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    try {
      await api.put(`/api/exams/${examId}/publish`);
      const { data } = await api.get(`/api/exams/${examId}`);
      setExam(data);
      toast({ title: "Đề thi đã được xuất bản!" });
    } catch {
      // ignore
    }
  };

  const handleClose = async () => {
    try {
      await api.put(`/api/exams/${examId}/close`);
      const { data } = await api.get(`/api/exams/${examId}`);
      setExam(data);
      toast({ title: "Đề thi đã đóng!" });
    } catch {
      // ignore
    }
  };

  const copyShareLink = () => {
    if (exam?.token) {
      const url = `${window.location.origin}/t/${exam.token}`;
      navigator.clipboard.writeText(url);
      toast({ title: "Đã sao chép liên kết!" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/exams")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-2xl font-bold border-0 px-0 focus-visible:ring-0 h-auto" />
        </div>
        <div className="flex gap-2">
          {exam?.status === "draft" && (
            <Button onClick={handlePublish} variant="default"><Globe className="mr-2 h-4 w-4" />{t("exams.publish")}</Button>
          )}
          {exam?.status === "open" && (
            <Button onClick={handleClose} variant="destructive">{t("exams.close")}</Button>
          )}
          {exam?.token && (
            <Button variant="outline" onClick={copyShareLink}><Copy className="mr-2 h-4 w-4" />{t("exams.copyLink")}</Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />{t("common.save")}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Badge variant={exam?.status === "open" ? "default" : exam?.status === "closed" ? "destructive" : "secondary"}>
          {t(`exams.status.${exam?.status || "draft"}`)}
        </Badge>
        {exam?.token && <Badge variant="outline">Token: {exam.token.substring(0, 8)}...</Badge>}
      </div>

      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions"><List className="mr-2 h-4 w-4" />{t("exams.questions")}</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="mr-2 h-4 w-4" />{t("exams.settings.title")}</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="mt-4">
          {questions.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Chưa có câu hỏi nào trong đề thi</CardContent></Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Câu hỏi</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Điểm</TableHead>
                  <TableHead>{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((eq, index) => (
                  <TableRow key={eq.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="max-w-md">
                      <p className="line-clamp-2 text-sm">{eq.question ? stripHtml(eq.question.body_html) : "-"}</p>
                    </TableCell>
                    <TableCell><Badge variant="outline">{eq.question ? QUESTION_TYPE_LABELS[eq.question.type] : "-"}</Badge></TableCell>
                    <TableCell>{eq.points_override || eq.question?.points_default || 1}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={async () => {
                        await api.delete(`/api/exam-questions/${eq.id}`).catch(() => {});
                        setQuestions(questions.filter((q) => q.id !== eq.id));
                      }}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("exams.settings.pagination")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("exams.settings.pagination")}</Label>
                  <Select value={settings.pagination} onValueChange={(v) => updateSetting("pagination", v as ExamSettings["pagination"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_on_one">{t("exams.settings.allOnOne")}</SelectItem>
                      <SelectItem value="one_per_page">{t("exams.settings.onePerPage")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("exams.settings.navigation")}</Label>
                  <Select value={settings.navigation} onValueChange={(v) => updateSetting("navigation", v as ExamSettings["navigation"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free_jump">{t("exams.settings.freeJump")}</SelectItem>
                      <SelectItem value="forward_only">{t("exams.settings.forwardOnly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("exams.settings.timeLimit")}</Label>
                  <Input type="number" value={settings.time_limit_minutes ?? ""} onChange={(e) => updateSetting("time_limit_minutes", e.target.value ? parseInt(e.target.value) : null)} placeholder={t("exams.settings.unlimited")} />
                </div>
                <div className="space-y-2">
                  <Label>{t("exams.settings.maxAttempts")}</Label>
                  <Input type="number" value={settings.max_attempts ?? ""} onChange={(e) => updateSetting("max_attempts", e.target.value ? parseInt(e.target.value) : null)} placeholder={t("exams.settings.unlimited")} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Điểm số & Kết quả</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("exams.settings.passingScore")}</Label>
                  <Input type="number" value={settings.pass_threshold_pct} onChange={(e) => updateSetting("pass_threshold_pct", parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("exams.settings.resultDisplay")}</Label>
                  <Select value={settings.result_display} onValueChange={(v) => updateSetting("result_display", v as ExamSettings["result_display"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="score">{t("exams.settings.score")}</SelectItem>
                      <SelectItem value="outline">{t("exams.settings.outline")}</SelectItem>
                      <SelectItem value="correct_indicator">{t("exams.settings.correctIndicator")}</SelectItem>
                      <SelectItem value="show_answer">{t("exams.settings.showAnswer")}</SelectItem>
                      <SelectItem value="show_explanation">{t("exams.settings.showExplanation")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("exams.settings.passMessage")}</Label>
                <Input value={settings.pass_message} onChange={(e) => updateSetting("pass_message", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("exams.settings.failMessage")}</Label>
                <Input value={settings.fail_message} onChange={(e) => updateSetting("fail_message", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("exams.settings.browserSecurity")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t("exams.settings.shuffleQuestions")}</Label>
                <Switch checked={settings.shuffle_questions} onCheckedChange={(v) => updateSetting("shuffle_questions", v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("exams.settings.shuffleOptions")}</Label>
                <Switch checked={settings.shuffle_options} onCheckedChange={(v) => updateSetting("shuffle_options", v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <Label>{t("exams.settings.disableCopyPaste")}</Label>
                <Switch checked={settings.browser_security.disable_copy_paste} onCheckedChange={(v) => updateBrowserSecurity("disable_copy_paste", v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("exams.settings.disableRightClick")}</Label>
                <Switch checked={settings.browser_security.disable_right_click} onCheckedChange={(v) => updateBrowserSecurity("disable_right_click", v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("exams.settings.disablePrint")}</Label>
                <Switch checked={settings.browser_security.disable_print} onCheckedChange={(v) => updateBrowserSecurity("disable_print", v)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tùy chọn khác</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>{t("exams.settings.requireIdentifier")}</Label>
                <Select value={settings.require_identifier} onValueChange={(v) => updateSetting("require_identifier", v as ExamSettings["require_identifier"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Không yêu cầu</SelectItem>
                    <SelectItem value="name">Họ tên</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="student_id">Mã số sinh viên</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>{t("exams.settings.enableCertificate")}</Label>
                <Switch checked={settings.certificate_enabled} onCheckedChange={(v) => updateSetting("certificate_enabled", v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
