"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import api from "@/lib/api";
import { User } from "@/types";
import { formatDate } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Users, Loader2, Trash2 } from "lucide-react";

const inviteSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  role: z.string(),
});

type InviteForm = z.infer<typeof inviteSchema>;

export default function AdminUsersPage() {
  const t = useTranslations();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: "editor" },
  });

  const fetchUsers = async () => {
    try {
      const { data } = await api.get("/api/admin/users");
      setUsers(Array.isArray(data) ? data : data.items || []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const onInvite = async (data: InviteForm) => {
    await api.post("/api/admin/users", data);
    setIsDialogOpen(false);
    reset();
    fetchUsers();
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    await api.put(`/api/admin/users/${userId}`, { role });
    fetchUsers();
  };

  const handleDelete = async (userId: string) => {
    await api.delete(`/api/admin/users/${userId}`);
    fetchUsers();
  };

  const roleColors: Record<string, string> = {
    admin: "bg-red-100 text-red-800",
    editor: "bg-orange-100 text-orange-800",
    user: "bg-green-100 text-green-800",
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t("admin.users.title")}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />{t("admin.users.invite")}</Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit(onInvite)}>
              <DialogHeader><DialogTitle>{t("admin.users.invite")}</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>{t("admin.users.email")}</Label>
                  <Input type="email" {...register("email")} />
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.users.role")}</Label>
                  <Select defaultValue="editor" onValueChange={(v) => setValue("role", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t("admin.users.roles.admin")}</SelectItem>
                      <SelectItem value="editor">{t("admin.users.roles.editor")}</SelectItem>
                      <SelectItem value="user">{t("admin.users.roles.user")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button type="submit">{t("admin.users.invite")}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t("common.noData")}</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.users.email")}</TableHead>
              <TableHead>{t("admin.users.role")}</TableHead>
              <TableHead>{t("admin.users.status")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead>{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>
                  <Select value={user.role} onValueChange={(v) => handleUpdateRole(user.id, v)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t("admin.users.roles.admin")}</SelectItem>
                      <SelectItem value="editor">{t("admin.users.roles.editor")}</SelectItem>
                      <SelectItem value="user">{t("admin.users.roles.user")}</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Badge className={user.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                    {user.is_active ? t("admin.users.active") : t("admin.users.inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(user.created_at)}</TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("admin.users.deleteConfirm")}</AlertDialogTitle>
                        <AlertDialogDescription>{user.email}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(user.id)}>{t("common.delete")}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
