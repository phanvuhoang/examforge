"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { ExamTemplate } from "@/types";
import { formatDate } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, FileText, Loader2, Trash2 } from "lucide-react";

const createSchema = z.object({
  name: z.string().min(1, "Tên mẫu là bắt buộc"),
  total_points: z.number().min(0),
});

type CreateForm = z.infer<typeof createSchema>;

export default function ExamTemplatesPage() {
  const t = useTranslations();
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { total_points: 10 },
  });

  const fetchTemplates = async () => {
    try {
      const { data } = await api.get("/api/exam-templates");
      setTemplates(Array.isArray(data) ? data : data.items || []);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const onCreateTemplate = async (data: CreateForm) => {
    await api.post("/api/exam-templates", data);
    setIsDialogOpen(false);
    reset();
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/api/exam-templates/${id}`);
    fetchTemplates();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t("templates.title")}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />{t("templates.create")}</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit(onCreateTemplate)}>
              <DialogHeader><DialogTitle>{t("templates.create")}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("templates.name")}</Label>
                  <Input {...register("name")} />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t("templates.totalPoints")}</Label>
                  <Input type="number" step="0.5" {...register("total_points", { valueAsNumber: true })} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit">{t("common.create")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">{t("templates.noTemplates")}</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("templates.name")}</TableHead>
              <TableHead>{t("templates.totalPoints")}</TableHead>
              <TableHead>{t("templates.sections")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((tmpl) => (
              <TableRow key={tmpl.id}>
                <TableCell>
                  <Link href={`/exam-templates/${tmpl.id}`} className="hover:underline font-medium">{tmpl.name}</Link>
                </TableCell>
                <TableCell>{tmpl.total_points}</TableCell>
                <TableCell>{tmpl.sections?.length || 0}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(tmpl.created_at)}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm"><Link href={`/exam-templates/${tmpl.id}`}>{t("common.edit")}</Link></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(tmpl.id)}><Trash2 className="h-4 w-4" /></Button>
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
