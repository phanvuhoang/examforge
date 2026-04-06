"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import api from "@/lib/api";
import { Document as DocType } from "@/types";
import { formatDate } from "@/lib/utils";
import { Upload, FileText, Trash2, Loader2, ArrowLeft, CheckCircle, XCircle, Clock } from "lucide-react";

export default function DocumentsPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/projects/${projectId}/documents`);
      setDocuments(Array.isArray(data) ? data : data.items || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        await api.post(`/api/projects/${projectId}/documents`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (progressEvent) => {
            const progress = progressEvent.total
              ? Math.round(((i + progressEvent.loaded / progressEvent.total) / acceptedFiles.length) * 100)
              : 0;
            setUploadProgress(progress);
          },
        });
      } catch {
        // ignore individual failures
      }
    }

    setUploading(false);
    setUploadProgress(0);
    fetchDocuments();
  }, [projectId, fetchDocuments]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
      "image/*": [".png", ".jpg", ".jpeg"],
    },
    maxSize: 50 * 1024 * 1024,
  });

  const handleDelete = async (docId: string) => {
    await api.delete(`/api/documents/${docId}`);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "ready": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error": return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-yellow-500 animate-spin" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/projects/${projectId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">{t("documents.title")}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("documents.upload")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm font-medium">{t("common.dragDrop")}</p>
            <p className="text-xs text-muted-foreground mt-2">{t("documents.uploadDesc")}</p>
          </div>

          {uploading && (
            <div className="mt-4">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-sm text-muted-foreground mt-2">{t("common.processing")} {uploadProgress}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("documents.noDocuments")}</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.type")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">{doc.filename}</TableCell>
                <TableCell><Badge variant="outline">{doc.file_type?.toUpperCase()}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {statusIcon(doc.status)}
                    <Badge variant={doc.status === "ready" ? "default" : doc.status === "error" ? "destructive" : "secondary"}>
                      {t(`documents.${doc.status}`)}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>{doc.chunk_count}</TableCell>
                <TableCell>{formatDate(doc.created_at)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
