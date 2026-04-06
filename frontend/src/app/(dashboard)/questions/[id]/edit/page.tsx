"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { Question, QuestionType, Difficulty } from "@/types";
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS } from "@/lib/utils";
import { ArrowLeft, Plus, Trash2, Save, Loader2, GripVertical } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TiptapLink from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";

const QUESTION_TYPES: QuestionType[] = ["MC", "MR", "TF", "FITB", "MATCH", "ORDER", "NUM", "SA", "ESSAY", "TEXT"];

const questionSchema = z.object({
  type: z.string(),
  body_html: z.string().min(1, "Nội dung câu hỏi là bắt buộc"),
  explanation_html: z.string().optional(),
  points_default: z.number().min(0),
  difficulty: z.string(),
  shuffle_options: z.boolean(),
  language: z.string(),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface OptionField {
  id?: string;
  body_html: string;
  is_correct: boolean;
}

function TipTapEditor({ content, onChange, placeholder }: { content: string; onChange: (html: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TiptapLink.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder: placeholder || "Nhập nội dung..." }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  return (
    <div className="border rounded-md">
      {editor && (
        <div className="flex items-center gap-1 p-2 border-b flex-wrap">
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive("bold") ? "bg-accent" : ""}>
            <strong>B</strong>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive("italic") ? "bg-accent" : ""}>
            <em>I</em>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive("underline") ? "bg-accent" : ""}>
            <u>U</u>
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive("bulletList") ? "bg-accent" : ""}>
            UL
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive("orderedList") ? "bg-accent" : ""}>
            OL
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={editor.isActive("codeBlock") ? "bg-accent" : ""}>
            Code
          </Button>
        </div>
      )}
      <EditorContent editor={editor} className="min-h-[150px]" />
    </div>
  );
}

export default function QuestionEditorPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const questionId = params.id as string;
  const isNew = questionId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<OptionField[]>([]);
  const [bodyHtml, setBodyHtml] = useState("");
  const [explanationHtml, setExplanationHtml] = useState("");
  const [correctAnswerJson, setCorrectAnswerJson] = useState<Record<string, unknown>>({});

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      type: "MC",
      body_html: "",
      explanation_html: "",
      points_default: 1,
      difficulty: "medium",
      shuffle_options: true,
      language: "vi",
    },
  });

  const questionType = watch("type") as QuestionType;

  useEffect(() => {
    if (!isNew) {
      const fetchQuestion = async () => {
        try {
          const { data } = await api.get(`/api/questions/${questionId}`);
          setValue("type", data.type);
          setValue("body_html", data.body_html);
          setValue("explanation_html", data.explanation_html || "");
          setValue("points_default", data.points_default);
          setValue("difficulty", data.difficulty);
          setValue("shuffle_options", data.shuffle_options);
          setValue("language", data.language);
          setBodyHtml(data.body_html);
          setExplanationHtml(data.explanation_html || "");
          setOptions(data.options || []);
          setCorrectAnswerJson(data.correct_answer_json || {});
        } catch {
          router.push("/questions");
        } finally {
          setLoading(false);
        }
      };
      fetchQuestion();
    }
  }, [questionId, isNew, setValue, router]);

  const addOption = () => {
    setOptions([...options, { body_html: "", is_correct: false }]);
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, field: keyof OptionField, value: string | boolean) => {
    setOptions(options.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt)));
  };

  const onSubmit = async (data: QuestionFormData) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        body_html: bodyHtml,
        explanation_html: explanationHtml,
        options: options.map((opt, index) => ({
          ...opt,
          display_order: index,
        })),
        correct_answer_json: correctAnswerJson,
      };

      if (isNew) {
        await api.post("/api/questions", payload);
      } else {
        await api.put(`/api/questions/${questionId}`, payload);
      }
      router.push("/questions");
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const showOptions = ["MC", "MR", "TF", "MATCH", "ORDER"].includes(questionType);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/questions")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">
          {isNew ? t("questions.create") : t("questions.edit")}
        </h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Thông tin cơ bản</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t("questions.type")}</Label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {QUESTION_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("questions.difficulty")}</Label>
                <Controller
                  name="difficulty"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">{DIFFICULTY_LABELS.easy}</SelectItem>
                        <SelectItem value="medium">{DIFFICULTY_LABELS.medium}</SelectItem>
                        <SelectItem value="hard">{DIFFICULTY_LABELS.hard}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("questions.points")}</Label>
                <Input type="number" step="0.5" min="0" {...register("points_default", { valueAsNumber: true })} />
              </div>
              <div className="space-y-2">
                <Label>{t("generation.language")}</Label>
                <Controller
                  name="language"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vi">Tiếng Việt</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Controller
                name="shuffle_options"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                    <Label>{t("questions.shuffle")}</Label>
                  </div>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Question Body */}
        <Card>
          <CardHeader>
            <CardTitle>{t("questions.body")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TipTapEditor
              content={bodyHtml}
              onChange={(html) => { setBodyHtml(html); setValue("body_html", html); }}
              placeholder="Nhập nội dung câu hỏi..."
            />
            {errors.body_html && (
              <p className="text-sm text-destructive mt-2">{errors.body_html.message}</p>
            )}
          </CardContent>
        </Card>

        {/* Options for MC/MR/TF/MATCH/ORDER */}
        {showOptions && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("questions.options")}</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <Plus className="mr-2 h-4 w-4" />
                {t("questions.addOption")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {options.map((opt, index) => (
                <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="flex items-center gap-2 pt-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {String.fromCharCode(65 + index)}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      value={opt.body_html.replace(/<[^>]*>/g, "")}
                      onChange={(e) => updateOption(index, "body_html", e.target.value)}
                      placeholder={`Lựa chọn ${String.fromCharCode(65 + index)}`}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    {(questionType === "MC" || questionType === "MR") && (
                      <div className="flex items-center gap-1">
                        <Checkbox
                          checked={opt.is_correct}
                          onCheckedChange={(checked) => {
                            if (questionType === "MC") {
                              setOptions(options.map((o, i) => ({ ...o, is_correct: i === index ? !!checked : false })));
                            } else {
                              updateOption(index, "is_correct", !!checked);
                            }
                          }}
                        />
                        <Label className="text-xs">{t("questions.correctAnswer")}</Label>
                      </div>
                    )}
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {options.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Chưa có lựa chọn nào. Nhấn &quot;Thêm lựa chọn&quot; để bắt đầu.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* FITB specific */}
        {questionType === "FITB" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("questions.acceptedAnswers")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Nhập các đáp án chấp nhận, mỗi dòng một đáp án"
                value={((correctAnswerJson?.accepted as string[]) || []).join("\n")}
                onChange={(e) => setCorrectAnswerJson({ accepted: e.target.value.split("\n").filter(Boolean) })}
                rows={4}
              />
            </CardContent>
          </Card>
        )}

        {/* NUM specific */}
        {questionType === "NUM" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("questions.correctAnswer")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Giá trị đúng</Label>
                  <Input
                    type="number"
                    step="any"
                    value={(correctAnswerJson?.value as number) ?? ""}
                    onChange={(e) => setCorrectAnswerJson({ ...correctAnswerJson, value: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("questions.tolerance")}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={(correctAnswerJson?.tolerance as number) ?? 0}
                    onChange={(e) => setCorrectAnswerJson({ ...correctAnswerJson, tolerance: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Explanation */}
        <Card>
          <CardHeader>
            <CardTitle>{t("questions.explanation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TipTapEditor
              content={explanationHtml}
              onChange={(html) => { setExplanationHtml(html); setValue("explanation_html", html); }}
              placeholder="Nhập giải thích (tùy chọn)..."
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push("/questions")}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            {t("common.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
