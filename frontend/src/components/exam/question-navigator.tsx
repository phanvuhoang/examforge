"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExamQuestion } from "@/types";
import { cn } from "@/lib/utils";

interface QuestionNavigatorProps {
  questions: ExamQuestion[];
  responses: Record<string, Record<string, unknown>>;
  flaggedQuestions: Set<string>;
  currentIndex: number;
  onNavigate: (index: number) => void;
  isForwardOnly: boolean;
}

export function QuestionNavigator({
  questions,
  responses,
  flaggedQuestions,
  currentIndex,
  onNavigate,
  isForwardOnly,
}: QuestionNavigatorProps) {
  const t = useTranslations();

  const getStatus = (eq: ExamQuestion, index: number) => {
    if (index === currentIndex) return "current";
    if (flaggedQuestions.has(eq.id)) return "flagged";
    if (responses[eq.id]) return "answered";
    return "unanswered";
  };

  const statusColors = {
    current: "bg-blue-500 text-white",
    answered: "bg-green-500 text-white",
    flagged: "bg-yellow-500 text-white",
    unanswered: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  };

  const answeredCount = Object.keys(responses).length;
  const flaggedCount = flaggedQuestions.size;

  return (
    <Card className="sticky top-24">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Danh sách câu hỏi</CardTitle>
        <div className="flex flex-wrap gap-2 text-xs mt-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span>{t("examPlayer.answered")} ({answeredCount})</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-200" />
            <span>{t("examPlayer.unanswered")} ({questions.length - answeredCount})</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-yellow-500" />
            <span>{t("examPlayer.flagged")} ({flaggedCount})</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <span>Hiện tại</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-2">
          {questions.map((eq, index) => {
            const status = getStatus(eq, index);
            const disabled = isForwardOnly && index < currentIndex;
            return (
              <button
                key={eq.id}
                onClick={() => !disabled && onNavigate(index)}
                disabled={disabled}
                className={cn(
                  "w-10 h-10 rounded-md text-sm font-medium flex items-center justify-center transition-colors",
                  statusColors[status],
                  disabled && "opacity-50 cursor-not-allowed",
                  !disabled && "cursor-pointer hover:opacity-80"
                )}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
