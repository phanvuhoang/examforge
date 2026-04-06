"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjectStore } from "@/stores/project-store";
import api from "@/lib/api";
import { formatDate, QUESTION_TYPE_LABELS, DIFFICULTY_COLORS } from "@/lib/utils";
import { Question, Document as DocType, Exam } from "@/types";
import { FileText, BookOpen, ClipboardList, BarChart3, Upload, Sparkles, Loader2, ArrowLeft, Trash2 } from "lucide-react";

export default function ProjectDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { currentProject, fetchProject, isLoading: projectLoading } = useProjectStore();
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProject(projectId);
    const fetchData = async () => {
      try {
        const [docsRes, questionsRes, examsRes] = await Promise.all([
          api.get(`/api/projects/${projectId}/documents`).catch(() => ({ data: [] })),
          api.get(`/api/questions?project_id=${projectId}&limit=20`).catch(() => ({ data: { items: [] } })),
          api.get(`/api/exams?project_id=${projectId}`).catch(() => ({ data: [] })),
        ]);
        setDocuments(Array.isArray(docsRes.data) ? docsRes.data : docsRes.data.items || []);
        setQuestions(Array.isArray(questionsRes.data) ? questionsRes.data : questionsRes.data.items || []);
        setExams(Array.isArray(examsRes.data) ? examsRes.data : examsRes.data.items || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [projectId, fetchProject]);

  if (projectLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/projects")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-3xl font-bold tracking-tight">{currentProject?.name}</h2>
          {currentProject?.description && (
            <p className="text-muted-foreground mt-1">{currentProject.description}</p>
          )}
        </div>
        <Button asChild>
          <Link href={`/projects/${projectId}/generate`}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t("generation.title")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/projects/${projectId}/documents`}>
            <Upload className="mr-2 h-4 w-4" />
            {t("documents.upload")}
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            {t("projects.tabs.documents")} ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="questions" className="gap-2">
            <BookOpen className="h-4 w-4" />
            {t("projects.tabs.questions")} ({questions.length})
          </TabsTrigger>
          <TabsTrigger value="exams" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            {t("projects.tabs.exams")} ({exams.length})
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            {t("projects.tabs.results")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4">
          {documents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t("documents.noDocuments")}</p>
                <Button asChild className="mt-4">
                  <Link href={`/projects/${projectId}/documents`}>
                    <Upload className="mr-2 h-4 w-4" />
                    {t("documents.upload")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.type")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.filename}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{doc.file_type?.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={doc.status === "ready" ? "default" : doc.status === "error" ? "destructive" : "secondary"}>
                        {doc.status === "ready" ? t("documents.ready") : doc.status === "error" ? t("documents.error") : t("documents.processing")}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(doc.created_at)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={async () => {
                        await api.delete(`/api/documents/${doc.id}`);
                        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="questions" className="mt-4">
          {questions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t("questions.noQuestions")}</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("questions.body")}</TableHead>
                  <TableHead>{t("questions.type")}</TableHead>
                  <TableHead>{t("questions.difficulty")}</TableHead>
                  <TableHead>{t("questions.points")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="max-w-md">
                      <Link href={`/questions/${q.id}/edit`} className="hover:underline">
                        <div className="line-clamp-2" dangerouslySetInnerHTML={{ __html: q.body_html }} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{QUESTION_TYPE_LABELS[q.type] || q.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={DIFFICULTY_COLORS[q.difficulty]}>{q.difficulty}</Badge>
                    </TableCell>
                    <TableCell>{q.points_default}</TableCell>
                    <TableCell>
                      {q.approved ? (
                        <Badge>{t("questions.approved")}</Badge>
                      ) : q.ai_generated ? (
                        <Badge variant="secondary">{t("questions.aiGenerated")}</Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="exams" className="mt-4">
          {exams.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t("exams.noExams")}</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("exams.examTitle")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => (
                  <TableRow key={exam.id}>
                    <TableCell>
                      <Link href={`/exams/${exam.id}`} className="hover:underline font-medium">
                        {exam.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={exam.status === "open" ? "default" : exam.status === "closed" ? "destructive" : "secondary"}>
                        {t(`exams.status.${exam.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(exam.created_at)}</TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/exams/${exam.id}/results`}>
                          <BarChart3 className="mr-2 h-4 w-4" />
                          {t("results.title")}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="results" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("results.analytics")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{t("common.noData")}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
