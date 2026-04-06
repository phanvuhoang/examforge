"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/lib/use-toast";
import { Save, Loader2, TestTube } from "lucide-react";

export default function SettingsPage() {
  const t = useTranslations();
  const [saving, setSaving] = useState(false);
  const [defaultProvider, setDefaultProvider] = useState("openrouter");
  const [defaultModel, setDefaultModel] = useState("qwen/qwen3-235b-a22b-2507");

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save settings
      await new Promise((r) => setTimeout(r, 500));
      toast({ title: t("common.success") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h2>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.aiProviders")}</CardTitle>
          <CardDescription>Cấu hình nhà cung cấp AI cho việc tạo câu hỏi tự động</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("settings.defaultProvider")}</Label>
              <Select value={defaultProvider} onValueChange={setDefaultProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("settings.defaultModel")}</Label>
              <Input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} />
            </div>
          </div>

          <Separator />

          {["OpenAI", "Anthropic", "OpenRouter", "DeepSeek", "Google"].map((provider) => (
            <div key={provider} className="space-y-3">
              <h4 className="font-medium">{provider}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("settings.apiKey")}</Label>
                  <Input type="password" placeholder={`${provider} API Key`} />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.baseUrl")}</Label>
                  <Input placeholder="https://api.example.com (tùy chọn)" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.organization")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("settings.orgName")}</Label>
              <Input placeholder="Tên tổ chức" />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.orgSlug")}</Label>
              <Input placeholder="org-slug" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
