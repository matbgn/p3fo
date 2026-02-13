import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useUsers } from "@/hooks/useUsers";
import { getWorkingDays } from "@/utils/workingdays";
import { getHistoricalHourlyBalances } from "@/utils/projectedHours";
import TimetableRecordsCell from "./TimetableRecordsCell";

interface ForecastProps {
    userId: string;
}

const Forecast: React.FC<ForecastProps> = ({ userId }) => {
    const { tasks } = useAllTasks();
    const { settings } = useCombinedSettings();
    const { userSettings } = useUserSettings();
    const { users } = useUsers();

    const [selectedDate, setSelectedDate] = useState(new Date());
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1; // 1-indexed for getWorkingDays and display

    const workingDays = getWorkingDays(year, month);

    // Format month name
    const monthName = selectedDate.toLocaleString('default', { month: 'long' });

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

    const handleYearChange = (value: string) => {
        const newDate = new Date(selectedDate);
        newDate.setFullYear(parseInt(value));
        setSelectedDate(newDate);
    };

    const handleMonthChange = (value: string) => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(parseInt(value) - 1);
        setSelectedDate(newDate);
    };

    const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    // Get vacations taken for the selected month
    const descId = `${year}-${String(month).padStart(2, '0')}`;
    const vacationsTaken = selectedUser?.monthlyBalances?.[descId]?.vacationsHourlyTaken || 0;

    // Get Previous Month Balance
    const monthlyBalances = selectedUser?.monthlyBalances || {};
    const historicalData = getHistoricalHourlyBalances(filteredTasks, settings, 0, monthlyBalances, forecastSettings.userWorkloadPercentage);

    // Find the cumulative balance of the PREVIOUS month
    // We want the balance up to [year, month-1]
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
    }
    const prevDescId = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    const prevMonthData = historicalData.find(d => d.descId === prevDescId);
    const previousBalance = prevMonthData ? prevMonthData.cumulativeBalance : 0;

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
                    <Select value={year.toString()} onValueChange={handleYearChange}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {years.map(y => (
                                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            <Card className="h-28">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Month</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select value={month.toString()} onValueChange={handleMonthChange}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {months.map(m => (
                                <SelectItem key={m} value={m.toString()}>
                                    {new Date(0, m - 1).toLocaleString('default', { month: 'long' })}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
                vacationsTaken={vacationsTaken}
                previousBalance={previousBalance}
            />
        </div>
    );
};

export default Forecast;
