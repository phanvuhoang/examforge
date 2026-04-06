"use client";

import React, { useEffect, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useExamStore } from "@/stores/exam-store";
import { ExamSettings } from "@/types";
import { QuestionRenderer } from "./question-renderer";
import { QuestionNavigator } from "./question-navigator";
import { cn, formatDuration } from "@/lib/utils";
import { Flag, FlagOff, ChevronLeft, ChevronRight, Send, Clock, Loader2 } from "lucide-react";

export function ExamPlayer() {
  const t = useTranslations();
  const router = useRouter();
  const {
    currentExam,
    attempt,
    questions,
    responses,
    flaggedQuestions,
    currentQuestionIndex,
    timeRemaining,
    isSubmitting,
    setResponse,
    toggleFlag,
    setCurrentQuestion,
    saveResponses,
    submitAttempt,
    setTimeRemaining,
  } = useExamStore();

  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveRef = useRef<NodeJS.Timeout>();
  const timerRef = useRef<NodeJS.Timeout>();

  const settings = currentExam?.settings_json as ExamSettings | undefined;
  const isAllOnOne = settings?.pagination === "all_on_one";
  const isForwardOnly = settings?.navigation === "forward_only";
  const currentQuestion = questions[currentQuestionIndex];

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveRef.current = setInterval(async () => {
      if (Object.keys(responses).length > 0) {
        setAutoSaveStatus("saving");
        try {
          await saveResponses();
          setAutoSaveStatus("saved");
          setTimeout(() => setAutoSaveStatus("idle"), 2000);
        } catch {
          setAutoSaveStatus("idle");
        }
      }
    }, 30000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [responses, saveResponses]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeRemaining(Math.max(0, (timeRemaining || 0) - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeRemaining, setTimeRemaining]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeRemaining === 0) {
      handleSubmit();
    }
  }, [timeRemaining]);

  // Browser security
  useEffect(() => {
    if (!settings?.browser_security) return;
    const { disable_copy_paste, disable_right_click, disable_print } = settings.browser_security;

    const preventCopy = (e: Event) => { if (disable_copy_paste) e.preventDefault(); };
    const preventContextMenu = (e: Event) => { if (disable_right_click) e.preventDefault(); };
    const preventPrint = (e: KeyboardEvent) => {
      if (disable_print && (e.ctrlKey || e.metaKey) && e.key === "p") e.preventDefault();
    };

    document.addEventListener("copy", preventCopy);
    document.addEventListener("paste", preventCopy);
    document.addEventListener("cut", preventCopy);
    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("keydown", preventPrint);

    return () => {
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("paste", preventCopy);
      document.removeEventListener("cut", preventCopy);
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("keydown", preventPrint);
    };
  }, [settings?.browser_security]);

  const handleSubmit = async () => {
    await submitAttempt();
    if (attempt) {
      router.push(`/t/result?attempt_id=${attempt.id}`);
    }
  };

  const answeredCount = Object.keys(responses).length;
  const totalCount = questions.length;
  const unansweredCount = totalCount - answeredCount;
  const progressPercent = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;

  const timeIsLow = timeRemaining !== null && settings?.time_limit_minutes
    ? timeRemaining < settings.time_limit_minutes * 60 * 0.1
    : false;

  return (
    <div className={cn("min-h-screen bg-background", settings?.browser_security?.disable_copy_paste && "exam-secure no-copy")}>
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-lg font-semibold truncate">{currentExam?.title}</h1>
              <div className="flex items-center gap-4 mt-1">
                <Progress value={progressPercent} className="flex-1 h-2 max-w-xs" />
                <span className="text-sm text-muted-foreground">
                  {answeredCount}/{totalCount} {t("examPlayer.answered")}
                </span>
              </div>
            </div>

            {timeRemaining !== null && (
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-lg font-bold",
                timeIsLow ? "bg-red-100 text-red-700 animate-pulse" : "bg-muted"
              )}>
                <Clock className="h-5 w-5" />
                {formatDuration(timeRemaining)}
              </div>
            )}

            <div className="flex items-center gap-2">
              {autoSaveStatus === "saving" && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("examPlayer.autoSaving")}
                </span>
              )}
              {autoSaveStatus === "saved" && (
                <span className="text-xs text-green-600">{t("examPlayer.saved")}</span>
              )}

              <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
                <AlertDialogTrigger asChild>
                  <Button>
                    <Send className="mr-2 h-4 w-4" />
                    {t("examPlayer.submitExam")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("examPlayer.submitConfirm")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {unansweredCount > 0 && (
                        <span className="text-yellow-600 font-medium">
                          Bạn còn {unansweredCount} câu chưa trả lời.{" "}
                        </span>
                      )}
                      Sau khi nộp bài bạn không thể thay đổi câu trả lời.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSubmit} disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("common.confirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          {/* Questions */}
          <div className="space-y-6">
            {isAllOnOne ? (
              questions.map((eq, index) => (
                <Card key={eq.id} id={`question-${index}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">
                        Câu {index + 1} / {totalCount}
                        {eq.points_override && (
                          <span className="text-sm font-normal text-muted-foreground ml-2">
                            ({eq.points_override} điểm)
                          </span>
                        )}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleFlag(eq.id)}
                      >
                        {flaggedQuestions.has(eq.id) ? (
                          <><FlagOff className="mr-1 h-4 w-4" /> {t("examPlayer.unflag")}</>
                        ) : (
                          <><Flag className="mr-1 h-4 w-4" /> {t("examPlayer.flag")}</>
                        )}
                      </Button>
                    </div>
                    {eq.question && (
                      <QuestionRenderer
                        question={eq.question}
                        examQuestionId={eq.id}
                        answer={responses[eq.id]}
                        onAnswer={(answer) => setResponse(eq.id, answer)}
                      />
                    )}
                  </CardContent>
                </Card>
              ))
            ) : currentQuestion ? (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">
                      Câu {currentQuestionIndex + 1} / {totalCount}
                      {currentQuestion.points_override && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          ({currentQuestion.points_override} điểm)
                        </span>
                      )}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleFlag(currentQuestion.id)}
                    >
                      {flaggedQuestions.has(currentQuestion.id) ? (
                        <><FlagOff className="mr-1 h-4 w-4" /> {t("examPlayer.unflag")}</>
                      ) : (
                        <><Flag className="mr-1 h-4 w-4" /> {t("examPlayer.flag")}</>
                      )}
                    </Button>
                  </div>
                  {currentQuestion.question && (
                    <QuestionRenderer
                      question={currentQuestion.question}
                      examQuestionId={currentQuestion.id}
                      answer={responses[currentQuestion.id]}
                      onAnswer={(answer) => setResponse(currentQuestion.id, answer)}
                    />
                  )}

                  <div className="flex items-center justify-between mt-6 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentQuestion(currentQuestionIndex - 1)}
                      disabled={currentQuestionIndex === 0 || isForwardOnly}
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      {t("common.previous")}
                    </Button>
                    <Button
                      onClick={() => setCurrentQuestion(currentQuestionIndex + 1)}
                      disabled={currentQuestionIndex >= totalCount - 1}
                    >
                      {t("common.next")}
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Question Navigator */}
          <div className="hidden lg:block">
            <QuestionNavigator
              questions={questions}
              responses={responses}
              flaggedQuestions={flaggedQuestions}
              currentIndex={currentQuestionIndex}
              onNavigate={(index) => {
                if (!isForwardOnly || index >= currentQuestionIndex) {
                  setCurrentQuestion(index);
                  if (isAllOnOne) {
                    document.getElementById(`question-${index}`)?.scrollIntoView({ behavior: "smooth" });
                  }
                }
              }}
              isForwardOnly={isForwardOnly || false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
