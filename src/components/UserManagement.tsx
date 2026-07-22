import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUsersContext, UserWithTrigram } from '@/context/UsersContext';
import { useAllTasks } from '@/hooks/useAllTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, User, Check, X } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const UserManagement: React.FC = () => {
    const { t } = useTranslation();
    const { users, loading: usersLoading, deleteUser, updateUser } = useUsersContext();
    const { tasks } = useAllTasks();
    const [editingTrigram, setEditingTrigram] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [editingWorkload, setEditingWorkload] = useState<string | null>(null);
    const [workloadValue, setWorkloadValue] = useState("");

    // Calculate task counts per user
    const userTaskCounts = useMemo(() => {
        const counts: Record<string, number> = {};

        // Initialize counts for all users
        users.forEach(user => {
            counts[user.userId] = 0;
        });

        // Count tasks
        tasks.forEach(task => {
            if (task.userId && counts[task.userId] !== undefined) {
                counts[task.userId]++;
            }
        });

        return counts;
    }, [users, tasks]);

    const handleDeleteUser = async (userId: string, username: string) => {
        if (window.confirm(t('userManagement.deleteConfirm', { name: username }))) {
            try {
                await deleteUser(userId);
            } catch (error) {
                console.error('Failed to delete user:', error);
                alert(t('userManagement.deleteFailed'));
            }
        }
    };

    const startEditing = (userId: string, currentTrigram: string) => {
        setEditingTrigram(userId);
        setEditValue(currentTrigram);
    };

    const cancelEditing = () => {
        setEditingTrigram(null);
        setEditValue("");
    };

    const saveTrigram = async (userId: string) => {
        try {
            await updateUser(userId, { trigram: editValue });
            setEditingTrigram(null);
        } catch (error) {
            console.error('Failed to update trigram:', error);
            alert(t('userManagement.workloadUpdateFailed'));
        }
    };

    const startEditingWorkload = (userId: string, currentWorkload: number | undefined) => {
        setEditingWorkload(userId);
        setWorkloadValue(String(currentWorkload ?? 60));
    };

    const cancelEditingWorkload = () => {
        setEditingWorkload(null);
        setWorkloadValue("");
    };

    const saveWorkload = async (userId: string) => {
        try {
            const workload = parseInt(workloadValue, 10);
            if (isNaN(workload) || workload < 0 || workload > 100) {
                alert(t('userManagement.workloadInvalid'));
                return;
            }
            await updateUser(userId, { workload });
            setEditingWorkload(null);
        } catch (error) {
            console.error('Failed to update workload:', error);
            alert(t('userManagement.workloadUpdateFailed'));
        }
    };

    if (usersLoading) {
        return <div className="text-center py-4">{t('userManagement.loading')}</div>;
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">{t('userManagement.title')}</h2>
            <p className="text-sm text-muted-foreground">
                {t('userManagement.help')}
            </p>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('userManagement.colUser')}</TableHead>
                            <TableHead>{t('userManagement.colTrigram')}</TableHead>
                            <TableHead>{t('userManagement.colWorkload')}</TableHead>
                            <TableHead>{t('userManagement.colUserId')}</TableHead>
                            <TableHead className="text-center">{t('userManagement.colAssignedTasks')}</TableHead>
                            <TableHead className="text-right">{t('userManagement.colActions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    {t('userManagement.noUsers')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map((user) => {
                                const taskCount = userTaskCounts[user.userId] || 0;
                                const isDangling = taskCount === 0;

                                return (
                                    <TableRow key={user.userId}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={user.logo} alt={user.username} />
                                                    <AvatarFallback>
                                                        {(user as UserWithTrigram).trigram || user.username.slice(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium">{user.username}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {editingTrigram === user.userId ? (
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value.toUpperCase().slice(0, 3))}
                                                        className="w-16 h-8 font-mono uppercase"
                                                        maxLength={3}
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveTrigram(user.userId);
                                                            if (e.key === 'Escape') cancelEditing();
                                                        }}
                                                    />
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => saveTrigram(user.userId)}>
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={cancelEditing}>
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div
                                                    className="font-mono bg-muted/50 px-2 py-1 rounded w-fit cursor-pointer hover:bg-muted"
                                                    onDoubleClick={() => startEditing(user.userId, (user as UserWithTrigram).trigram || t('userManagement.noTrigram'))}
                                                    title={t('userManagement.doubleClickEdit')}
                                                >
                                                    {(user as UserWithTrigram).trigram || t('userManagement.noTrigram')}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {editingWorkload === user.userId ? (
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={workloadValue}
                                                        onChange={(e) => setWorkloadValue(e.target.value)}
                                                        className="w-16 h-8"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveWorkload(user.userId);
                                                            if (e.key === 'Escape') cancelEditingWorkload();
                                                        }}
                                                    />
                                                    <span className="text-xs">%</span>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => saveWorkload(user.userId)}>
                                                        <Check className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={cancelEditingWorkload}>
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div
                                                    className="bg-muted/50 px-2 py-1 rounded w-fit cursor-pointer hover:bg-muted"
                                                    onDoubleClick={() => startEditingWorkload(user.userId, user.workload)}
                                                    title={t('userManagement.doubleClickEdit')}
                                                >
                                                    {user.workload ?? 60}%
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {user.userId}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={taskCount > 0 ? "secondary" : "outline"}>
                                                {taskCount}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {isDangling ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                    onClick={() => handleDeleteUser(user.userId, user.username)}
                                                    title={t('userManagement.deleteUser')}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic px-2">
                                                    {t('userManagement.cannotDelete')}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};
