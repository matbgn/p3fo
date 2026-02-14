import React, { useMemo } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { useAllTasks } from '@/hooks/useAllTasks';
import { Button } from '@/components/ui/button';
import { Trash2, User } from 'lucide-react';
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
    const { users, loading: usersLoading, deleteUser } = useUsers();
    const { tasks } = useAllTasks();

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
        if (window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
            try {
                await deleteUser(userId);
            } catch (error) {
                console.error('Failed to delete user:', error);
                alert('Failed to delete user. Please try again.');
            }
        }
    };

    if (usersLoading) {
        return <div className="text-center py-4">Loading users...</div>;
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">User Management</h2>
            <p className="text-sm text-muted-foreground">
                Manage users stored in the application context. You can delete users that have no assigned tasks.
            </p>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>User ID</TableHead>
                            <TableHead className="text-center">Assigned Tasks</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    No users found.
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
                                                        {user.username.slice(0, 2).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium">{user.username}</span>
                                            </div>
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
                                                    title="Delete User"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic px-2">
                                                    Cannot delete
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
