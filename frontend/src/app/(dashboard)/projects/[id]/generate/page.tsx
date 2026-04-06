"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useGenerationStore } from "@/stores/generation-store";
import { QuestionType, GenerationConfig } from "@/types";
import { QUESTION_TYPE_LABELS, DIFFICULTY_COLORS, stripHtml, cn } from "@/lib/utils";
import { Sparkles, ArrowLeft, Loader2, CheckCircle, XCircle, Zap, StopCircle } from "lucide-react";

const QUESTION_TYPES: QuestionType[] = ["MC", "MR", "TF", "FITB", "MATCH", "ORDER", "NUM", "SA", "ESSAY", "TEXT"];

const generationSchema = z.object({
  question_types: z.array(z.string()).min(1, "Chọn ít nhất 1 loại câu hỏi"),
  count_per_type: z.record(z.number().min(1).max(50)),
  difficulty_distribution: z.object({
    easy: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    hard: z.number().min(0).max(100),
  }),
  language: z.string(),
  include_explanation: z.boolean(),
  ai_provider: z.string().optional(),
  ai_model: z.string().optional(),
});

type GenerationFormData = z.infer<typeof generationSchema>;

const STEP_LABELS = [
  "Truy xuất ngữ cảnh",
  "Tạo câu hỏi",
  "Phân tích chất lượng",
  "Lọc và chọn lọc",
  "Định dạng và lưu",
];

export default function GeneratePage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const {
    isGenerating,
    currentStep,
    totalSteps,
    stepLabel,
    streamedQuestions,
    totalGenerated,
    error,
    startGeneration,
    stopGeneration,
    reset,
  } = useGenerationStore();

  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>(["MC", "TF"]);
  const [countsPerType, setCountsPerType] = useState<Record<string, number>>({ MC: 5, TF: 5 });
  const [difficultyDist, setDifficultyDist] = useState({ easy: 30, medium: 50, hard: 20 });
  const [includeExplanation, setIncludeExplanation] = useState(true);
  const [language, setLanguage] = useState("vi");

  const handleTypeToggle = (type: QuestionType) => {
    setSelectedTypes((prev) => {
      if (prev.includes(type)) {
        const newCounts = { ...countsPerType };
        delete newCounts[type];
        setCountsPerType(newCounts);
        return prev.filter((t) => t !== type);
      }
      setCountsPerType((c) => ({ ...c, [type]: 5 }));
      return [...prev, type];
    });
  };

  const handleGenerate = async () => {
    const config: GenerationConfig = {
      question_types: selectedTypes,
      count_per_type: countsPerType,
      difficulty_distribution: difficultyDist,
      topic_filter: [],
      chapter_filter: [],
      language,
      include_explanation: includeExplanation,
    };
    await startGeneration(projectId, config);
  };

  const progressPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/projects/${projectId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-3xl font-bold tracking-tight">{t("generation.title")}</h2>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Config Form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                {t("generation.questionTypes")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {QUESTION_TYPES.map((type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={`type-${type}`}
                      checked={selectedTypes.includes(type)}
                      onCheckedChange={() => handleTypeToggle(type)}
                      disabled={isGenerating}
                    />
                    <Label htmlFor={`type-${type}`} className="text-sm cursor-pointer">
                      {QUESTION_TYPE_LABELS[type]}
                    </Label>
                  </div>
                ))}
              </div>

              {selectedTypes.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="font-semibold">{t("generation.countPerType")}</Label>
                    {selectedTypes.map((type) => (
                      <div key={type} className="flex items-center gap-3">
                        <span className="text-sm w-40 truncate">{QUESTION_TYPE_LABELS[type]}</span>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={countsPerType[type] || 5}
                          onChange={(e) =>
                            setCountsPerType((prev) => ({ ...prev, [type]: parseInt(e.target.value) || 1 }))
                          }
                          className="w-20"
                          disabled={isGenerating}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("generation.difficulty")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{t("generation.easy")}</Label>
                  <span className="text-sm font-medium">{difficultyDist.easy}%</span>
                </div>
                <Slider
                  value={[difficultyDist.easy]}
                  onValueChange={([v]) => {
                    const remaining = 100 - v;
                    const ratio = difficultyDist.medium + difficultyDist.hard || 1;
                    setDifficultyDist({
                      easy: v,
                      medium: Math.round((difficultyDist.medium / ratio) * remaining),
                      hard: remaining - Math.round((difficultyDist.medium / ratio) * remaining),
                    });
                  }}
                  max={100}
                  step={5}
                  disabled={isGenerating}
                />

                <div className="flex items-center justify-between">
                  <Label>{t("generation.medium")}</Label>
                  <span className="text-sm font-medium">{difficultyDist.medium}%</span>
                </div>
                <Slider
                  value={[difficultyDist.medium]}
                  onValueChange={([v]) => {
                    const remaining = 100 - v;
                    const ratio = difficultyDist.easy + difficultyDist.hard || 1;
                    setDifficultyDist({
                      easy: Math.round((difficultyDist.easy / ratio) * remaining),
                      medium: v,
                      hard: remaining - Math.round((difficultyDist.easy / ratio) * remaining),
                    });
                  }}
                  max={100}
                  step={5}
                  disabled={isGenerating}
                />

                <div className="flex items-center justify-between">
                  <Label>{t("generation.hard")}</Label>
                  <span className="text-sm font-medium">{difficultyDist.hard}%</span>
                </div>
                <Slider
                  value={[difficultyDist.hard]}
                  onValueChange={([v]) => {
                    const remaining = 100 - v;
                    const ratio = difficultyDist.easy + difficultyDist.medium || 1;
                    setDifficultyDist({
                      easy: Math.round((difficultyDist.easy / ratio) * remaining),
                      medium: remaining - Math.round((difficultyDist.easy / ratio) * remaining),
                      hard: v,
                    });
                  }}
                  max={100}
                  step={5}
                  disabled={isGenerating}
                />
              </div>

              <div className="flex gap-2">
                <Badge className={DIFFICULTY_COLORS.easy}>{t("generation.easy")} {difficultyDist.easy}%</Badge>
                <Badge className={DIFFICULTY_COLORS.medium}>{t("generation.medium")} {difficultyDist.medium}%</Badge>
                <Badge className={DIFFICULTY_COLORS.hard}>{t("generation.hard")} {difficultyDist.hard}%</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("common.settings")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t("generation.language")}</Label>
                <Select value={language} onValueChange={setLanguage} disabled={isGenerating}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vi">Tiếng Việt</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label>{t("generation.includeExplanation")}</Label>
                <Switch
                  checked={includeExplanation}
                  onCheckedChange={setIncludeExplanation}
                  disabled={isGenerating}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            {isGenerating ? (
              <Button variant="destructive" onClick={stopGeneration} className="flex-1">
                <StopCircle className="mr-2 h-4 w-4" />
                {t("generation.stop")}
              </Button>
            ) : (
              <Button
                onClick={handleGenerate}
                className="flex-1"
                disabled={selectedTypes.length === 0}
              >
                <Zap className="mr-2 h-4 w-4" />
                {t("generation.generate")}
              </Button>
            )}
          </div>
        </div>

        {/* SSE Streaming Progress */}
        <div className="space-y-6">
          {(isGenerating || streamedQuestions.length > 0 || error) && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {isGenerating ? t("generation.generating") : error ? t("common.error") : `${t("generation.complete", { count: totalGenerated })}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Step Indicator */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{stepLabel}</span>
                      <span>{currentStep}/{totalSteps}</span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {STEP_LABELS.map((label, index) => {
                      const stepNum = index + 1;
                      const isCompleted = currentStep > stepNum;
                      const isCurrent = currentStep === stepNum;
                      return (
                        <Badge
                          key={index}
                          variant={isCompleted ? "default" : isCurrent ? "default" : "outline"}
                          className={cn(
                            "text-xs",
                            isCurrent && "animate-pulse",
                            isCompleted && "bg-green-600"
                          )}
                        >
                          {isCompleted && <CheckCircle className="mr-1 h-3 w-3" />}
                          {isCurrent && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {label}
                        </Badge>
                      );
                    })}
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
                      <XCircle className="h-5 w-5" />
                      <span className="text-sm">{error}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Streamed Questions */}
              {streamedQuestions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Câu hỏi đã tạo ({streamedQuestions.length})</span>
                      {!isGenerating && (
                        <Button variant="outline" size="sm" onClick={reset}>
                          Xóa kết quả
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {streamedQuestions.map((question, index) => (
                        <div
                          key={question.id || index}
                          className="p-3 border rounded-lg space-y-2 animate-in fade-in-0 slide-in-from-bottom-2"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{QUESTION_TYPE_LABELS[question.type]}</Badge>
                            <Badge className={DIFFICULTY_COLORS[question.difficulty]}>
                              {question.difficulty}
                            </Badge>
                            {question.quality_score && (
                              <Badge variant="secondary">{question.quality_score}</Badge>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              #{index + 1}
                            </span>
                          </div>
                          <div
                            className="text-sm prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: question.body_html }}
                          />
                          {question.options && question.options.length > 0 && (
                            <div className="pl-4 space-y-1">
                              {question.options.map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2 text-sm">
                                  <span className={cn(
                                    "w-5 h-5 rounded-full border flex items-center justify-center text-xs",
                                    opt.is_correct && "bg-green-100 border-green-500 text-green-700"
                                  )}>
                                    {String.fromCharCode(65 + oi)}
                                  </span>
                                  <span dangerouslySetInnerHTML={{ __html: opt.body_html }} />
                                </div>
                              ))}
                            </div>
                          )}
                          {question.explanation_html && (
                            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                              <strong>Giải thích:</strong>{" "}
                              <span dangerouslySetInnerHTML={{ __html: question.explanation_html }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!isGenerating && streamedQuestions.length === 0 && !error && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground text-center">
                  Cấu hình các tùy chọn và nhấn &quot;Bắt đầu tạo&quot; để tạo câu hỏi bằng AI
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
