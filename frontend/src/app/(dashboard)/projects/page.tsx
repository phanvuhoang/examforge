"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProjectStore } from "@/stores/project-store";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, FolderOpen, BookOpen, ClipboardList, FileText, Loader2, Search, Pencil, Trash2 } from "lucide-react";

const projectSchema = z.object({
  name: z.string().min(1, "Tên dự án là bắt buộc"),
  description: z.string().optional(),
});

type ProjectForm = z.infer<typeof projectSchema>;

export default function ProjectsPage() {
  const t = useTranslations();
  const { projects, isLoading, fetchProjects, createProject, updateProject, deleteProject } = useProjectStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const createForm = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
  });

  const editForm = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
  });

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const onCreateProject = async (data: ProjectForm) => {
    await createProject(data);
    setIsCreateOpen(false);
    createForm.reset();
  };

  const onEditProject = async (data: ProjectForm) => {
    if (!editingProject) return;
    await updateProject(editingProject, data);
    setEditingProject(null);
    editForm.reset();
  };

  const onDeleteProject = async () => {
    if (!deletingProject) return;
    await deleteProject(deletingProject);
    setDeletingProject(null);
  };

  const openEdit = (e: React.MouseEvent, project: { id: string; name: string; description?: string | null }) => {
    e.preventDefault();
    e.stopPropagation();
    editForm.setValue("name", project.name);
    editForm.setValue("description", project.description || "");
    setEditingProject(project.id);
  };

  const openDelete = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingProject(projectId);
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t("projects.title")}</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("projects.create")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={createForm.handleSubmit(onCreateProject)}>
              <DialogHeader>
                <DialogTitle>{t("projects.create")}</DialogTitle>
                <DialogDescription>{t("projects.description")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="create-name">{t("projects.name")}</Label>
                  <Input id="create-name" {...createForm.register("name")} />
                  {createForm.formState.errors.name && (
                    <p className="text-sm text-destructive">{createForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-description">{t("common.description")}</Label>
                  <Textarea id="create-description" {...createForm.register("description")} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit">{t("common.create")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("common.search") + "..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">{t("projects.noProjects")}</p>
            <Button className="mt-4" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("projects.create")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="flex items-center gap-2 flex-1 min-w-0">
                      <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </CardTitle>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => openEdit(e, project)}
                        title={t("common.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={(e) => openDelete(e, project.id)}
                        title={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {project.description && (
                    <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <BookOpen className="h-4 w-4" />
                      <span>{project.question_count || 0}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ClipboardList className="h-4 w-4" />
                      <span>{project.exam_count || 0}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      <span>{project.document_count || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingProject} onOpenChange={(open) => { if (!open) setEditingProject(null); }}>
        <DialogContent>
          <form onSubmit={editForm.handleSubmit(onEditProject)}>
            <DialogHeader>
              <DialogTitle>{t("common.edit")} {t("projects.title").toLowerCase()}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t("projects.name")}</Label>
                <Input id="edit-name" {...editForm.register("name")} />
                {editForm.formState.errors.name && (
                  <p className="text-sm text-destructive">{editForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">{t("common.description")}</Label>
                <Textarea id="edit-description" {...editForm.register("description")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingProject(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingProject} onOpenChange={(open) => { if (!open) setDeletingProject(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.delete")} {t("projects.title").toLowerCase()}</DialogTitle>
            <DialogDescription>{t("projects.deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingProject(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={onDeleteProject}>
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
