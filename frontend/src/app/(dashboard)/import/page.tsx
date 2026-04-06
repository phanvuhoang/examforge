"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import api from "@/lib/api";
import { Project, Question } from "@/types";
import { QUESTION_TYPE_LABELS, stripHtml } from "@/lib/utils";
import { Upload, FileSpreadsheet, Loader2, CheckCircle, ArrowRight } from "lucide-react";

type Step = "upload" | "preview" | "complete";

export default function ImportPage() {
  const t = useTranslations();
  const [step, setStep] = useState<Step>("upload");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [previewQuestions, setPreviewQuestions] = useState<Question[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const { data } = await api.get("/api/projects");
        setProjects(Array.isArray(data) ? data : data.items || []);
      } catch {
        setProjects([]);
      }
    };
    fetchProjects();
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!selectedProject || acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", selectedProject);

    try {
      const { data } = await api.post("/api/questions/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const questions = Array.isArray(data) ? data : data.questions || [];
      setPreviewQuestions(questions);
      setSelectedQuestions(new Set(questions.map((_: unknown, i: number) => i)));
      setStep("preview");
    } catch {
      // ignore
    }
  }, [selectedProject]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
  });

  const handleImport = async () => {
    setImporting(true);
    try {
      const selected = previewQuestions.filter((_, i) => selectedQuestions.has(i));
      await api.post("/api/questions/import", {
        project_id: selectedProject,
        questions: selected,
        confirm: true,
      });
      setImportedCount(selected.length);
      setStep("complete");
    } catch {
      // ignore
    } finally {
      setImporting(false);
    }
  };

  const toggleQuestion = (index: number) => {
    setSelectedQuestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) newSet.delete(index);
      else newSet.add(index);
      return newSet;
    });
  };

  const selectAll = () => setSelectedQuestions(new Set(previewQuestions.map((_, i) => i)));
  const deselectAll = () => setSelectedQuestions(new Set());

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold tracking-tight">{t("import.title")}</h2>

      {/* Steps indicator */}
      <div className="flex items-center gap-4">
        {["upload", "preview", "complete"].map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-2 ${step === s ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {i + 1}
              </div>
              <span className="text-sm font-medium capitalize">{s === "upload" ? t("import.uploadFile") : s === "preview" ? t("import.preview") : t("common.success")}</span>
            </div>
            {i < 2 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </React.Fragment>
        ))}
      </div>

      {step === "upload" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{t("import.selectProject")}</CardTitle></CardHeader>
            <CardContent>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger><SelectValue placeholder="Chọn dự án..." /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("import.uploadFile")}</CardTitle></CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                  !selectedProject ? "opacity-50 pointer-events-none" : isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                }`}
              >
                <input {...getInputProps()} />
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm font-medium">{t("common.dragDrop")}</p>
                <p className="text-xs text-muted-foreground mt-2">{t("import.supportedFormats")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Đã nhận diện {previewQuestions.length} câu hỏi</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>{t("import.selectAll")}</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>{t("import.deselectAll")}</Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox checked={selectedQuestions.size === previewQuestions.length} onCheckedChange={(v) => v ? selectAll() : deselectAll()} /></TableHead>
                <TableHead>#</TableHead>
                <TableHead>Nội dung</TableHead>
                <TableHead>Loại</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewQuestions.map((q, i) => (
                <TableRow key={i}>
                  <TableCell><Checkbox checked={selectedQuestions.has(i)} onCheckedChange={() => toggleQuestion(i)} /></TableCell>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="max-w-md"><p className="line-clamp-2 text-sm">{stripHtml(q.body_html)}</p></TableCell>
                  <TableCell><Badge variant="outline">{QUESTION_TYPE_LABELS[q.type]}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setStep("upload"); setPreviewQuestions([]); }}>{t("common.back")}</Button>
            <Button onClick={handleImport} disabled={importing || selectedQuestions.size === 0}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("import.importSelected")} ({selectedQuestions.size})
            </Button>
          </div>
        </div>
      )}

      {step === "complete" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">{t("common.success")}</h3>
            <p className="text-muted-foreground">Đã nhập {importedCount} câu hỏi thành công</p>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => { setStep("upload"); setPreviewQuestions([]); setImportedCount(0); }}>Nhập thêm</Button>
              <Button asChild><a href="/questions">Xem ngân hàng câu hỏi</a></Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
