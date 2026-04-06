"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/auth-store";
import {
  LayoutDashboard,
  FolderOpen,
  BookOpen,
  FileText,
  ClipboardList,
  Upload,
  Settings,
  Users,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
} from "lucide-react";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/projects", labelKey: "nav.projects", icon: FolderOpen },
  { href: "/questions", labelKey: "nav.questionBank", icon: BookOpen },
  { href: "/exam-templates", labelKey: "nav.examTemplates", icon: FileText },
  { href: "/exams", labelKey: "nav.exams", icon: ClipboardList },
  { href: "/import", labelKey: "nav.import", icon: Upload },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

const adminItems: NavItem[] = [
  { href: "/admin/users", labelKey: "nav.users", icon: Users, adminOnly: true },
  { href: "/admin/ai-usage", labelKey: "nav.aiUsage", icon: BarChart3, adminOnly: true },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const t = useTranslations();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "relative flex flex-col border-r bg-card transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex h-16 items-center justify-between px-4">
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">ExamForge</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/" className="mx-auto">
              <GraduationCap className="h-6 w-6 text-primary" />
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", collapsed && "mx-auto")}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <Separator />

        <ScrollArea className="flex-1 py-2">
          <nav className="flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              if (collapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex h-10 w-10 mx-auto items-center justify-center rounded-md transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {t(item.labelKey)}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}

            {isAdmin && (
              <>
                <Separator className="my-2" />
                {!collapsed && (
                  <span className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
                    {t("nav.admin")}
                  </span>
                )}
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                            className={cn(
                              "flex h-10 w-10 mx-auto items-center justify-center rounded-md transition-colors",
                              active
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {t(item.labelKey)}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {t(item.labelKey)}
                    </Link>
                  );
                })}
              </>
            )}
          </nav>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
