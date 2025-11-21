import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks } from "@/hooks/useTasks";
import { useSettings } from "@/hooks/useSettings";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useUsers } from "@/hooks/useUsers";
import { getWorkingDays } from "@/utils/workingdays";
import TimetableRecordsCell from "./TimetableRecordsCell";

const Forecast: React.FC = () => {
    const { tasks } = useTasks();
    const { settings } = useSettings();
    const { userSettings } = useUserSettings();
    const { users } = useUsers();

    const [selectedUserId, setSelectedUserId] = useState<string>("");

    // Set default selected user to current user when loaded
    useEffect(() => {
        if (userSettings.username && !selectedUserId) {
            // Find the user ID corresponding to the current username if possible,
            // or just use the current user's ID if we had it.
            // useUserSettings doesn't expose ID directly in the hook return, but it uses it internally.
            // Let's try to find the user in the list that matches the current username.
            const currentUser = users.find(u => u.username === userSettings.username);
            if (currentUser) {
                setSelectedUserId(currentUser.userId);
            }
        }
    }, [userSettings, users, selectedUserId]);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-indexed for getWorkingDays and display

    const workingDays = getWorkingDays(year, month);

    // Format month name
    const monthName = now.toLocaleString('default', { month: 'long' });

    // Force re-render every minute to update running timers
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => {
            setTick(t => t + 1);
        }, 60000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    const selectedUser = users.find(u => u.userId === selectedUserId);

    // Filter tasks by selected user
    const filteredTasks = selectedUserId === "unassigned"
        ? tasks.filter(task => !task.userId)
        : selectedUserId
            ? tasks.filter(task => task.userId === selectedUserId || (selectedUser && task.userId === selectedUser.username))
            : tasks;
    const displayUserName = selectedUserId === "unassigned"
        ? "Unassigned"
        : selectedUser
            ? selectedUser.username
            : (userSettings.username || "Select User");

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <Card className="h-28">
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium">User</CardTitle>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                        <SelectTrigger className="w-[140px] h-8">
                            <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {users.map((user) => (
                                <SelectItem key={user.userId} value={user.userId}>
                                    {user.username}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold truncate" title={displayUserName}>
                        {displayUserName}
                    </div>
                </CardContent>
            </Card>

            <Card className="h-28">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Year</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{year}</div>
                </CardContent>
            </Card>

            <Card className="h-28">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Month</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{monthName}</div>
                </CardContent>
            </Card>

            <Card className="h-28">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Working Days</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{workingDays}</div>
                </CardContent>
            </Card>

            <TimetableRecordsCell
                tasks={filteredTasks}
                settings={settings}
                year={year}
                month={month}
            />
        </div>
    );
};

export default Forecast;
