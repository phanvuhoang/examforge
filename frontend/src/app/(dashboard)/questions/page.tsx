"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import api from "@/lib/api";
import { Question, QuestionType, Difficulty } from "@/types";
import { QUESTION_TYPE_LABELS, DIFFICULTY_COLORS, DIFFICULTY_LABELS, formatDate, stripHtml } from "@/lib/utils";
import { Search, Plus, Filter, MoreHorizontal, Loader2, BookOpen, Tag, Trash2, CheckCircle, Copy } from "lucide-react";

const QUESTION_TYPES: QuestionType[] = ["MC", "MR", "TF", "FITB", "MATCH", "ORDER", "NUM", "SA", "ESSAY", "TEXT"];

export default function QuestionsPage() {
  const t = useTranslations();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("limit", limit.toString());
      params.append("offset", offset.toString());
      if (searchTerm) params.append("search", searchTerm);
      if (typeFilter !== "all") params.append("type", typeFilter);
      if (difficultyFilter !== "all") params.append("difficulty", difficultyFilter);

      const { data } = await api.get(`/api/questions?${params.toString()}`);
      const items = Array.isArray(data) ? data : data.items || [];
      setQuestions(items);
      setTotal(data.total || items.length);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, typeFilter, difficultyFilter, offset]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)));
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      await api.post("/api/questions/bulk-action", { action, question_ids: ids });
      fetchQuestions();
      setSelectedIds(new Set());
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/api/questions/${id}`);
    fetchQuestions();
  };

  const handleDuplicate = async (id: string) => {
    await api.post(`/api/questions/${id}/duplicate`);
    fetchQuestions();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t("questions.title")}</h2>
        <Button asChild>
          <Link href="/questions/new/edit">
            <Plus className="mr-2 h-4 w-4" />
            {t("questions.create")}
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("common.search") + "..."}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setOffset(0); }}
            className="pl-10"
          />
        </div>

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setOffset(0); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("questions.type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {QUESTION_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={difficultyFilter} onValueChange={(v) => { setDifficultyFilter(v); setOffset(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("questions.difficulty")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            <SelectItem value="easy">{DIFFICULTY_LABELS.easy}</SelectItem>
            <SelectItem value="medium">{DIFFICULTY_LABELS.medium}</SelectItem>
            <SelectItem value="hard">{DIFFICULTY_LABELS.hard}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">Đã chọn {selectedIds.size} câu hỏi</span>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("approve")}>
            <CheckCircle className="mr-1 h-4 w-4" />
            {t("questions.bulkApprove")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleBulkAction("tag")}>
            <Tag className="mr-1 h-4 w-4" />
            {t("questions.bulkTag")}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleBulkAction("delete")}>
            <Trash2 className="mr-1 h-4 w-4" />
            {t("questions.bulkDelete")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">{t("questions.noQuestions")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedIds.size === questions.length && questions.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="min-w-[300px]">{t("questions.body")}</TableHead>
                <TableHead>{t("questions.type")}</TableHead>
                <TableHead>{t("questions.difficulty")}</TableHead>
                <TableHead>{t("questions.points")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead className="w-10">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(q.id)}
                      onCheckedChange={() => toggleSelect(q.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/questions/${q.id}/edit`} className="hover:underline">
                      <p className="line-clamp-2 text-sm">{stripHtml(q.body_html)}</p>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={DIFFICULTY_COLORS[q.difficulty]}>{DIFFICULTY_LABELS[q.difficulty]}</Badge>
                  </TableCell>
                  <TableCell>{q.points_default}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {q.approved && <Badge className="text-xs">{t("questions.approved")}</Badge>}
                      {q.ai_generated && <Badge variant="secondary" className="text-xs">AI</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(q.created_at)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/questions/${q.id}/edit`}>{t("common.edit")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(q.id)}>
                          <Copy className="mr-2 h-4 w-4" />{t("common.duplicate")}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(q.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />{t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {t("common.showing")} {offset + 1}-{Math.min(offset + limit, total)} {t("common.of")} {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
