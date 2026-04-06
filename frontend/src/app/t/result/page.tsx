"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import api from "@/lib/api";
import { Attempt, Exam, ExamSettings, ExamQuestion, Response as ExamResponse } from "@/types";
import { formatDuration, QUESTION_TYPE_LABELS, cn } from "@/lib/utils";
import {
  Trophy,
  XCircle,
  Clock,
  Target,
  CheckCircle2,
  XOctagon,
  MinusCircle,
  Printer,
  RotateCcw,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";

interface AttemptResult {
  attempt: Attempt;
  exam: Exam;
  questions: Array<ExamQuestion & { response?: ExamResponse }>;
}

export default function ExamResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      }
    >
      <ExamResultContent />
    </Suspense>
  );
}

function ExamResultContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get("attempt_id");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) {
      setError("Không tìm thấy kết quả.");
      setLoading(false);
      return;
    }

    const fetchResult = async () => {
      try {
        const { data } = await api.get(`/api/attempts/${attemptId}/result`);
        setResult(data);
      } catch {
        setError("Không thể tải kết quả. Vui lòng thử lại sau.");
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [attemptId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
            <p className="text-lg font-medium text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { attempt, exam, questions } = result;
  const settings = exam.settings_json as ExamSettings;
  const passed = attempt.passed;
  const scorePct = attempt.score_pct ?? 0;
  const scoreRaw = attempt.score_raw ?? 0;
  const timeTaken = attempt.time_taken_sec ?? 0;
  const totalQuestions = questions.length;

  const correctCount = questions.filter(
    (q) => q.response?.is_correct === true
  ).length;
  const incorrectCount = questions.filter(
    (q) => q.response?.is_correct === false
  ).length;
  const partialCount = questions.filter(
    (q) =>
      q.response?.is_correct === null &&
      q.response?.score_awarded !== null &&
      (q.response?.score_awarded ?? 0) > 0
  ).length;
  const notGradedCount = totalQuestions - correctCount - incorrectCount - partialCount;

  const resultDisplay = settings?.result_display ?? "score";
  const showQuestionReview =
    resultDisplay === "outline" ||
    resultDisplay === "correct_indicator" ||
    resultDisplay === "show_answer" ||
    resultDisplay === "show_explanation";

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 print:bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Pass / Fail Banner */}
        <Card
          className={cn(
            "mb-6 border-2",
            passed === true
              ? "border-green-500 bg-green-50 dark:bg-green-950/20"
              : passed === false
              ? "border-red-500 bg-red-50 dark:bg-red-950/20"
              : "border-border"
          )}
        >
          <CardContent className="flex flex-col items-center py-8">
            {passed === true ? (
              <>
                <Trophy className="h-16 w-16 text-green-500 mb-3" />
                <h1 className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {t("results.passed")}
                </h1>
                {settings?.pass_message && (
                  <p className="mt-2 text-center text-green-600 dark:text-green-300">
                    {settings.pass_message}
                  </p>
                )}
              </>
            ) : passed === false ? (
              <>
                <XCircle className="h-16 w-16 text-red-500 mb-3" />
                <h1 className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {t("results.failed")}
                </h1>
                {settings?.fail_message && (
                  <p className="mt-2 text-center text-red-600 dark:text-red-300">
                    {settings.fail_message}
                  </p>
                )}
              </>
            ) : (
              <>
                <Target className="h-16 w-16 text-primary mb-3" />
                <h1 className="text-2xl font-bold">{t("results.title")}</h1>
              </>
            )}
          </CardContent>
        </Card>

        {/* Score Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{exam.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{t("results.score")}</p>
                <p className="text-3xl font-bold">{scorePct.toFixed(1)}%</p>
                <p className="text-sm text-muted-foreground">
                  {scoreRaw.toFixed(1)} {t("questions.points").toLowerCase()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{t("results.timeTaken")}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <p className="text-2xl font-bold">{formatDuration(timeTaken)}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{t("results.correct")}</p>
                <p className="text-3xl font-bold text-green-600">{correctCount}</p>
                <p className="text-sm text-muted-foreground">/ {totalQuestions}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{t("results.incorrect")}</p>
                <p className="text-3xl font-bold text-red-600">{incorrectCount}</p>
                <p className="text-sm text-muted-foreground">/ {totalQuestions}</p>
              </div>
            </div>

            <Progress value={scorePct} className="h-3 mb-4" />

            <div className="flex flex-wrap gap-3 justify-center text-sm">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {correctCount} {t("results.correct").toLowerCase()}
              </div>
              <div className="flex items-center gap-1">
                <XOctagon className="h-4 w-4 text-red-500" />
                {incorrectCount} {t("results.incorrect").toLowerCase()}
              </div>
              {partialCount > 0 && (
                <div className="flex items-center gap-1">
                  <MinusCircle className="h-4 w-4 text-yellow-500" />
                  {partialCount} {t("results.partial").toLowerCase()}
                </div>
              )}
              {notGradedCount > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {notGradedCount} {t("results.notGraded").toLowerCase()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Per-Question Review */}
        {showQuestionReview && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t("results.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {questions.map((eq, index) => {
                const response = eq.response;
                const isCorrect = response?.is_correct;
                const scoreAwarded = response?.score_awarded;

                return (
                  <div key={eq.id}>
                    {index > 0 && <Separator className="mb-4" />}
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                          isCorrect === true
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            : isCorrect === false
                            ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {eq.question?.type && (
                            <Badge variant="outline" className="text-xs">
                              {QUESTION_TYPE_LABELS[eq.question.type]}
                            </Badge>
                          )}
                          {isCorrect === true && (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {t("results.correct")}
                            </Badge>
                          )}
                          {isCorrect === false && (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                              <XOctagon className="mr-1 h-3 w-3" />
                              {t("results.incorrect")}
                            </Badge>
                          )}
                          {isCorrect === null && scoreAwarded !== null && (scoreAwarded ?? 0) > 0 && (
                            <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                              <MinusCircle className="mr-1 h-3 w-3" />
                              {t("results.partial")}
                            </Badge>
                          )}
                          {scoreAwarded !== null && (
                            <span className="text-sm text-muted-foreground ml-auto">
                              {scoreAwarded?.toFixed(1)} {t("questions.points").toLowerCase()}
                            </span>
                          )}
                        </div>

                        {(resultDisplay === "outline" ||
                          resultDisplay === "show_answer" ||
                          resultDisplay === "show_explanation") &&
                          eq.question?.body_html && (
                            <div
                              className="prose prose-sm dark:prose-invert mb-2"
                              dangerouslySetInnerHTML={{ __html: eq.question.body_html }}
                            />
                          )}

                        {(resultDisplay === "show_answer" ||
                          resultDisplay === "show_explanation") &&
                          response?.answer_data_json && (
                            <div className="bg-muted/50 rounded-md p-3 mb-2">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                {t("results.yourAnswer")}
                              </p>
                              <p className="text-sm">
                                {JSON.stringify(response.answer_data_json)}
                              </p>
                            </div>
                          )}

                        {resultDisplay === "show_explanation" &&
                          eq.question?.explanation_html && (
                            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-md p-3 mt-2">
                              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                                {t("results.explanation")}
                              </p>
                              <div
                                className="prose prose-sm dark:prose-invert"
                                dangerouslySetInnerHTML={{
                                  __html: eq.question.explanation_html,
                                }}
                              />
                            </div>
                          )}

                        {response?.feedback_html && (
                          <div className="bg-muted/50 rounded-md p-3 mt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              {t("results.feedback")}
                            </p>
                            <div
                              className="prose prose-sm dark:prose-invert"
                              dangerouslySetInnerHTML={{
                                __html: response.feedback_html,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 justify-center print:hidden">
          {exam.token && (settings?.max_attempts === null || (settings?.max_attempts ?? 0) > 1) && (
            <Button
              variant="outline"
              onClick={() => (window.location.href = `/t/${exam.token}`)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("results.retry")}
            </Button>
          )}

          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            {t("common.print")}
          </Button>

          {settings?.certificate_enabled && passed === true && (
            <Button
              onClick={() =>
                window.open(
                  `/api/attempts/${attemptId}/certificate`,
                  "_blank"
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {t("results.downloadCertificate")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
