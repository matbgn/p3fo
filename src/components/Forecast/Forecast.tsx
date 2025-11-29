import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks } from "@/hooks/useTasks";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useUsers } from "@/hooks/useUsers";
import { getWorkingDays } from "@/utils/workingdays";
import TimetableRecordsCell from "./TimetableRecordsCell";

interface ForecastProps {
    userId: string;
}

const Forecast: React.FC<ForecastProps> = ({ userId }) => {
    const { tasks } = useTasks();
    const { settings } = useCombinedSettings();
    const { userSettings } = useUserSettings();
    const { users } = useUsers();

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

    const selectedUser = users.find(u => u.userId === userId);

    // Filter tasks by selected user
    const filteredTasks = userId === "unassigned"
        ? tasks.filter(task => !task.userId)
        : userId
            ? tasks.filter(task => task.userId === userId || (selectedUser && task.userId === selectedUser.username))
            : tasks;
    const displayUserName = userId === "unassigned"
        ? "Unassigned"
        : selectedUser
            ? selectedUser.username
            : (userSettings.username || "Select User");

    // Use selected user's workload if available, otherwise fallback to current settings
    const forecastSettings = {
        ...settings,
        userWorkloadPercentage: selectedUser?.workload ?? settings.userWorkloadPercentage
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <Card className="h-28">
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-medium">User</CardTitle>
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
                settings={forecastSettings}
                year={year}
                month={month}
            />
        </div>
    );
};

export default Forecast;
