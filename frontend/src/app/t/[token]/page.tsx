"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useExamStore } from "@/stores/exam-store";
import { Exam, ExamSettings } from "@/types";
import { GraduationCap, Loader2, Clock, HelpCircle } from "lucide-react";

export default function ExamLandingPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { currentExam, fetchExamByToken, startAttempt, isLoading } = useExamStore();
  const [examLoading, setExamLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const settings = currentExam?.settings_json as ExamSettings | undefined;

  const formSchema = z.object({
    identifier: settings?.require_identifier !== "none"
      ? z.string().min(1, "Trường này là bắt buộc")
      : z.string().optional(),
    passcode: currentExam?.access_type === "passcode"
      ? z.string().min(1, "Vui lòng nhập mã truy cập")
      : z.string().optional(),
  });

  type FormData = z.infer<typeof formSchema>;

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  useEffect(() => {
    const loadExam = async () => {
      try {
        await fetchExamByToken(token);
      } catch {
        setError("Không tìm thấy đề thi hoặc đề thi đã đóng.");
      } finally {
        setExamLoading(false);
      }
    };
    loadExam();
  }, [token, fetchExamByToken]);

  const onSubmit = async (data: FormData) => {
    if (!currentExam) return;
    setError(null);
    try {
      await startAttempt(currentExam.id, data.identifier, data.passcode);
      setStarted(true);
    } catch {
      setError("Không thể bắt đầu làm bài. Vui lòng thử lại.");
    }
  };

  if (examLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !currentExam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-12">
            <HelpCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (started) {
    return <ExamPlayerWrapper />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <GraduationCap className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">{currentExam?.title}</CardTitle>
          {settings?.time_limit_minutes && (
            <CardDescription className="flex items-center justify-center gap-2 mt-2">
              <Clock className="h-4 w-4" />
              {settings.time_limit_minutes} phút
            </CardDescription>
          )}
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            )}

            {settings?.require_identifier && settings.require_identifier !== "none" && (
              <div className="space-y-2">
                <Label>
                  {settings.require_identifier === "name"
                    ? t("examPlayer.enterName")
                    : settings.require_identifier === "email"
                    ? t("examPlayer.enterEmail")
                    : t("examPlayer.enterStudentId")}
                </Label>
                <Input
                  {...register("identifier")}
                  placeholder={
                    settings.require_identifier === "name"
                      ? "Nguyễn Văn A"
                      : settings.require_identifier === "email"
                      ? "email@example.com"
                      : "SV001"
                  }
                />
                {errors.identifier && (
                  <p className="text-sm text-destructive">{errors.identifier.message}</p>
                )}
              </div>
            )}

            {currentExam?.access_type === "passcode" && (
              <div className="space-y-2">
                <Label>{t("examPlayer.enterPasscode")}</Label>
                <Input type="password" {...register("passcode")} />
                {errors.passcode && (
                  <p className="text-sm text-destructive">{errors.passcode.message}</p>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("examPlayer.startExam")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function ExamPlayerWrapper() {
  const { ExamPlayer } = require("@/components/exam/exam-player");
  return <ExamPlayer />;
}
