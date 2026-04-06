"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { ExamTemplate, TemplateSection } from "@/types";
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from "@/lib/utils";
import { ArrowLeft, Plus, Trash2, Save, Loader2, GripVertical } from "lucide-react";

const QUESTION_TYPES = ["MC", "MR", "TF", "FITB", "MATCH", "ORDER", "NUM", "SA", "ESSAY", "TEXT"];

export default function TemplateEditorPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<ExamTemplate | null>(null);
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [name, setName] = useState("");
  const [totalPoints, setTotalPoints] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const { data } = await api.get(`/api/exam-templates/${templateId}`);
        setTemplate(data);
        setName(data.name);
        setTotalPoints(data.total_points);
        setSections(data.sections || []);
      } catch {
        router.push("/exam-templates");
      } finally {
        setLoading(false);
      }
    };
    fetchTemplate();
  }, [templateId, router]);

  const addSection = () => {
    setSections([
      ...sections,
      {
        id: `new-${Date.now()}`,
        template_id: templateId,
        name: `Phần ${sections.length + 1}`,
        intro_html: null,
        question_type_filter: [],
        tag_filter: [],
        difficulty_filter: [],
        question_count: 10,
        points_per_question: 1,
        randomize: true,
        fixed_question_ids: [],
        display_order: sections.length,
      },
    ]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: string, value: unknown) => {
    setSections(sections.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/exam-templates/${templateId}`, {
        name,
        total_points: totalPoints,
        sections: sections.map((s, i) => ({ ...s, display_order: i })),
      });
      router.push("/exam-templates");
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/exam-templates")}><ArrowLeft className="h-5 w-5" /></Button>
        <h2 className="text-3xl font-bold tracking-tight">{t("templates.title")}: {name}</h2>
      </div>

      <Card>
        <CardHeader><CardTitle>Thông tin mẫu</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("templates.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("templates.totalPoints")}</Label>
              <Input type="number" step="0.5" value={totalPoints} onChange={(e) => setTotalPoints(parseFloat(e.target.value))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">{t("templates.sections")}</h3>
        <Button onClick={addSection}><Plus className="mr-2 h-4 w-4" />{t("templates.addSection")}</Button>
      </div>

      {sections.map((section, index) => (
        <Card key={section.id || index}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <GripVertical className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">{section.name || `Phần ${index + 1}`}</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeSection(index)}><Trash2 className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("templates.sectionName")}</Label>
                <Input value={section.name} onChange={(e) => updateSection(index, "name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("templates.questionCount")}</Label>
                <Input type="number" value={section.question_count} onChange={(e) => updateSection(index, "question_count", parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>{t("templates.pointsPerQuestion")}</Label>
                <Input type="number" step="0.5" value={section.points_per_question} onChange={(e) => updateSection(index, "points_per_question", parseFloat(e.target.value) || 0)} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={section.randomize} onCheckedChange={(v) => updateSection(index, "randomize", v)} />
                <Label>{t("templates.randomize")}</Label>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>{t("templates.questionTypeFilter")}</Label>
              <div className="flex flex-wrap gap-2">
                {QUESTION_TYPES.map((type) => (
                  <div key={type} className="flex items-center gap-1">
                    <Checkbox
                      checked={section.question_type_filter.includes(type)}
                      onCheckedChange={(checked) => {
                        const filters = checked
                          ? [...section.question_type_filter, type]
                          : section.question_type_filter.filter((t) => t !== type);
                        updateSection(index, "question_type_filter", filters);
                      }}
                    />
                    <Label className="text-xs">{QUESTION_TYPE_LABELS[type]}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("templates.difficultyFilter")}</Label>
              <div className="flex gap-4">
                {["easy", "medium", "hard"].map((diff) => (
                  <div key={diff} className="flex items-center gap-1">
                    <Checkbox
                      checked={section.difficulty_filter.includes(diff)}
                      onCheckedChange={(checked) => {
                        const filters = checked
                          ? [...section.difficulty_filter, diff]
                          : section.difficulty_filter.filter((d) => d !== diff);
                        updateSection(index, "difficulty_filter", filters);
                      }}
                    />
                    <Label className="text-xs">{DIFFICULTY_LABELS[diff]}</Label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push("/exam-templates")}>{t("common.cancel")}</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />{t("common.save")}
        </Button>
      </div>
    </div>
  );
}
