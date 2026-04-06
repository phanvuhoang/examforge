"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Question } from "@/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface QuestionRendererProps {
  question: Question;
  examQuestionId: string;
  answer?: Record<string, unknown>;
  onAnswer: (answer: Record<string, unknown>) => void;
  readOnly?: boolean;
}

export function QuestionRenderer({ question, examQuestionId, answer, onAnswer, readOnly }: QuestionRendererProps) {
  return (
    <div className="space-y-4">
      <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: question.body_html }} />

      {question.type === "MC" && <MCRenderer question={question} answer={answer} onAnswer={onAnswer} readOnly={readOnly} />}
      {question.type === "MR" && <MRRenderer question={question} answer={answer} onAnswer={onAnswer} readOnly={readOnly} />}
      {question.type === "TF" && <TFRenderer answer={answer} onAnswer={onAnswer} readOnly={readOnly} />}
      {question.type === "FITB" && <FITBRenderer answer={answer} onAnswer={onAnswer} readOnly={readOnly} />}
      {question.type === "MATCH" && <MATCHRenderer question={question} answer={answer} onAnswer={onAnswer} readOnly={readOnly} />}
      {question.type === "ORDER" && <ORDERRenderer question={question} answer={answer} onAnswer={onAnswer} readOnly={readOnly} />}
      {question.type === "NUM" && <NUMRenderer answer={answer} onAnswer={onAnswer} readOnly={readOnly} />}
      {question.type === "SA" && <SARenderer answer={answer} onAnswer={onAnswer} readOnly={readOnly} />}
      {question.type === "ESSAY" && <ESSAYRenderer answer={answer} onAnswer={onAnswer} readOnly={readOnly} />}
      {question.type === "TEXT" && null}
    </div>
  );
}

function MCRenderer({ question, answer, onAnswer, readOnly }: { question: Question; answer?: Record<string, unknown>; onAnswer: (a: Record<string, unknown>) => void; readOnly?: boolean }) {
  const options = question.options || [];
  const selectedId = (answer?.option_id as string) || "";

  return (
    <RadioGroup
      value={selectedId}
      onValueChange={(value) => onAnswer({ option_id: value })}
      disabled={readOnly}
    >
      {options.map((opt) => (
        <div key={opt.id} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
          <RadioGroupItem value={opt.id} id={`mc-${opt.id}`} />
          <Label htmlFor={`mc-${opt.id}`} className="flex-1 cursor-pointer">
            <span dangerouslySetInnerHTML={{ __html: opt.body_html }} />
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

function MRRenderer({ question, answer, onAnswer, readOnly }: { question: Question; answer?: Record<string, unknown>; onAnswer: (a: Record<string, unknown>) => void; readOnly?: boolean }) {
  const options = question.options || [];
  const selectedIds = (answer?.option_ids as string[]) || [];

  const toggleOption = (optionId: string) => {
    const newIds = selectedIds.includes(optionId)
      ? selectedIds.filter((id) => id !== optionId)
      : [...selectedIds, optionId];
    onAnswer({ option_ids: newIds });
  };

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <div key={opt.id} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
          <Checkbox
            id={`mr-${opt.id}`}
            checked={selectedIds.includes(opt.id)}
            onCheckedChange={() => toggleOption(opt.id)}
            disabled={readOnly}
          />
          <Label htmlFor={`mr-${opt.id}`} className="flex-1 cursor-pointer">
            <span dangerouslySetInnerHTML={{ __html: opt.body_html }} />
          </Label>
        </div>
      ))}
    </div>
  );
}

function TFRenderer({ answer, onAnswer, readOnly }: { answer?: Record<string, unknown>; onAnswer: (a: Record<string, unknown>) => void; readOnly?: boolean }) {
  const t = useTranslations();
  const value = answer?.value as boolean | undefined;

  return (
    <div className="flex gap-4">
      <Button
        variant={value === true ? "default" : "outline"}
        size="lg"
        className="flex-1"
        onClick={() => onAnswer({ value: true })}
        disabled={readOnly}
      >
        {t("examPlayer.trueFalse.true")}
      </Button>
      <Button
        variant={value === false ? "default" : "outline"}
        size="lg"
        className="flex-1"
        onClick={() => onAnswer({ value: false })}
        disabled={readOnly}
      >
        {t("examPlayer.trueFalse.false")}
      </Button>
    </div>
  );
}

function FITBRenderer({ answer, onAnswer, readOnly }: { answer?: Record<string, unknown>; onAnswer: (a: Record<string, unknown>) => void; readOnly?: boolean }) {
  const text = (answer?.text as string) || "";

  return (
    <Input
      value={text}
      onChange={(e) => onAnswer({ text: e.target.value })}
      placeholder="Nhập câu trả lời..."
      disabled={readOnly}
      className="max-w-md"
    />
  );
}

function MATCHRenderer({ question, answer, onAnswer, readOnly }: { question: Question; answer?: Record<string, unknown>; onAnswer: (a: Record<string, unknown>) => void; readOnly?: boolean }) {
  const t = useTranslations();
  const options = question.options || [];
  const pairs = (answer?.pairs as Array<{ left_id: string; right_id: string }>) || [];

  // Simple matching UI: left items with dropdowns for right items
  const leftItems = options.filter((_, i) => i % 2 === 0);
  const rightItems = options.filter((_, i) => i % 2 === 1);

  const handleMatch = (leftId: string, rightId: string) => {
    const newPairs = pairs.filter((p) => p.left_id !== leftId);
    if (rightId) {
      newPairs.push({ left_id: leftId, right_id: rightId });
    }
    onAnswer({ pairs: newPairs });
  };

  return (
    <div className="space-y-3">
      {leftItems.map((left) => {
        const matched = pairs.find((p) => p.left_id === left.id);
        return (
          <div key={left.id} className="flex items-center gap-4 p-3 border rounded-lg">
            <div className="flex-1 font-medium" dangerouslySetInnerHTML={{ __html: left.body_html }} />
            <span className="text-muted-foreground">→</span>
            <select
              className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={matched?.right_id || ""}
              onChange={(e) => handleMatch(left.id, e.target.value)}
              disabled={readOnly}
            >
              <option value="">{t("examPlayer.matching.dragHere")}</option>
              {rightItems.map((right) => (
                <option key={right.id} value={right.id}>
                  {right.body_html.replace(/<[^>]*>/g, "")}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </button>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ORDERRenderer({ question, answer, onAnswer, readOnly }: { question: Question; answer?: Record<string, unknown>; onAnswer: (a: Record<string, unknown>) => void; readOnly?: boolean }) {
  const options = question.options || [];
  const orderIds = (answer?.order as string[]) || options.map((o) => o.id);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = orderIds.indexOf(active.id as string);
      const newIndex = orderIds.indexOf(over.id as string);
      const newOrder = arrayMove(orderIds, oldIndex, newIndex);
      onAnswer({ order: newOrder });
    }
  };

  const orderedOptions = orderIds
    .map((id) => options.find((o) => o.id === id))
    .filter(Boolean);

  if (readOnly) {
    return (
      <div className="space-y-2">
        {orderedOptions.map((opt, index) => (
          <div key={opt!.id} className="flex items-center gap-3 p-3 border rounded-lg">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {index + 1}
            </span>
            <span dangerouslySetInnerHTML={{ __html: opt!.body_html }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {orderedOptions.map((opt, index) => (
            <SortableItem key={opt!.id} id={opt!.id}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {index + 1}
                </span>
                <span dangerouslySetInnerHTML={{ __html: opt!.body_html }} />
              </div>
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function NUMRenderer({ answer, onAnswer, readOnly }: { answer?: Record<string, unknown>; onAnswer: (a: Record<string, unknown>) => void; readOnly?: boolean }) {
  const value = answer?.value as number | undefined;

  return (
    <Input
      type="number"
      value={value ?? ""}
      onChange={(e) => onAnswer({ value: parseFloat(e.target.value) })}
      placeholder="Nhập số..."
      disabled={readOnly}
      className="max-w-xs"
      step="any"
    />
  );
}

function SARenderer({ answer, onAnswer, readOnly }: { answer?: Record<string, unknown>; onAnswer: (a: Record<string, unknown>) => void; readOnly?: boolean }) {
  const text = (answer?.text as string) || "";

  return (
    <Textarea
      value={text}
      onChange={(e) => onAnswer({ text: e.target.value })}
      placeholder="Nhập câu trả lời ngắn..."
      disabled={readOnly}
      rows={3}
    />
  );
}

function ESSAYRenderer({ answer, onAnswer, readOnly }: { answer?: Record<string, unknown>; onAnswer: (a: Record<string, unknown>) => void; readOnly?: boolean }) {
  const text = (answer?.text as string) || "";

  return (
    <Textarea
      value={text}
      onChange={(e) => onAnswer({ text: e.target.value })}
      placeholder="Nhập bài luận..."
      disabled={readOnly}
      rows={10}
      className="min-h-[250px]"
    />
  );
}
