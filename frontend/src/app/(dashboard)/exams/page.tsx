"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import { Exam, ExamTemplate } from "@/types";
import { formatDate } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, ClipboardList, Loader2, ExternalLink, BarChart3, Copy } from "lucide-react";
import { toast } from "@/lib/use-toast";

const createExamSchema = z.object({
  title: z.string().min(1, "Tiêu đề là bắt buộc"),
  template_id: z.string().optional(),
});

type CreateExamForm = z.infer<typeof createExamSchema>;

export default function ExamsPage() {
  const t = useTranslations();
  const [exams, setExams] = useState<Exam[]>([]);
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CreateExamForm>({
    resolver: zodResolver(createExamSchema),
  });

  const fetchExams = async () => {
    try {
      const [examsRes, templatesRes] = await Promise.all([
        api.get("/api/exams"),
        api.get("/api/exam-templates").catch(() => ({ data: [] })),
      ]);
      setExams(Array.isArray(examsRes.data) ? examsRes.data : examsRes.data.items || []);
      setTemplates(Array.isArray(templatesRes.data) ? templatesRes.data : templatesRes.data.items || []);
    } catch {
      setExams([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExams(); }, []);

  const onCreateExam = async (data: CreateExamForm) => {
    try {
      if (data.template_id) {
        await api.post("/api/exams/generate", {
          template_id: data.template_id,
          title: data.title,
          settings_json: {},
        });
      } else {
        await api.post("/api/exams/generate", {
          title: data.title,
          settings_json: {},
        });
      }
      setIsDialogOpen(false);
      reset();
      fetchExams();
    } catch {
      // ignore
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/t/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Đã sao chép liên kết!" });
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case "open": return "default" as const;
      case "closed": return "destructive" as const;
      case "scheduled": return "secondary" as const;
      default: return "outline" as const;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t("exams.title")}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />{t("exams.create")}</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit(onCreateExam)}>
              <DialogHeader><DialogTitle>{t("exams.create")}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("exams.examTitle")}</Label>
                  <Input {...register("title")} />
                  {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
                </div>
                {templates.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t("exams.createFromTemplate")}</Label>
                    <Select onValueChange={(v) => setValue("template_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Chọn mẫu (tùy chọn)" /></SelectTrigger>
                      <SelectContent>
                        {templates.map((tmpl) => (
                          <SelectItem key={tmpl.id} value={tmpl.id}>{tmpl.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit">{t("common.create")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">{t("exams.noExams")}</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("exams.examTitle")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("exams.shareLink")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exams.map((exam) => (
              <TableRow key={exam.id}>
                <TableCell>
                  <Link href={`/exams/${exam.id}`} className="hover:underline font-medium">{exam.title}</Link>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(exam.status)}>{t(`exams.status.${exam.status}`)}</Badge>
                </TableCell>
                <TableCell>
                  {exam.token ? (
                    <Button variant="ghost" size="sm" onClick={() => copyLink(exam.token!)}>
                      <Copy className="mr-1 h-3 w-3" />
                      /t/{exam.token.substring(0, 8)}...
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(exam.created_at)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm"><Link href={`/exams/${exam.id}`}>{t("common.edit")}</Link></Button>
                    <Button asChild variant="outline" size="sm"><Link href={`/exams/${exam.id}/results`}><BarChart3 className="mr-1 h-3 w-3" />{t("results.title")}</Link></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
