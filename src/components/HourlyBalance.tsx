import React, { useState, useEffect } from "react";
import TimetableChart from "./TimetableChart";
import TimetableRawTable from "./TimetableRawTable";
import { getHistoricalHourlyBalances, DataPoint } from "@/utils/projectedHours";
import { getWorkingDays } from "@/utils/workingdays";
import { useTasks } from "@/hooks/useTasks";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { useUsers } from "@/hooks/useUsers";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Button } from "@/components/ui/button";
import { MonthlyBalanceData } from "@/lib/persistence-types";

interface HourlyBalanceProps {
    userId: string;
}

const HourlyBalance: React.FC<HourlyBalanceProps> = ({ userId }) => {
    const { tasks } = useTasks();
    const { settings } = useCombinedSettings();
    const { users, updateUser } = useUsers();
    const { userSettings, userId: currentUserId } = useUserSettings();
    const [monthsBack, setMonthsBack] = useState(6);

    const filteredTasks =
        userId === "unassigned"
            ? tasks.filter((task) => !task.userId)
            : userId
                ? tasks.filter(
                    (task) =>
                        task.userId === userId ||
                        (users.find((u) => u.userId === userId)?.username &&
                            task.userId === users.find((u) => u.userId === userId)?.username)
                )
                : tasks;

    const selectedUser = users.find((u) => u.userId === userId);
    const monthlyBalances = selectedUser?.monthly_balances || {};

    // Use selected user's workload if available, otherwise fallback to settings (which is current user's or default)
    // We need to pass this to getHistoricalHourlyBalances
    const userWorkload = selectedUser?.workload ?? settings.userWorkloadPercentage;

    const data = getHistoricalHourlyBalances(filteredTasks, settings, 6, monthlyBalances, userWorkload);

    // Filter data for chart: only show last 6 months of history + projection
    // data contains history (monthsBack) + projection (6 months)
    // We want the last 6 months of history + all projection
    const historyData = data.filter(d => !d.projected);
    const projectedData = data.filter(d => d.projected);
    const chartHistoryData = historyData.slice(-monthsBack); // Dynamic history based on user selection
    // User requested to restore previous rendering, which likely means NO projections in the chart
    // as the "Previously" image showed the graph ending at the current month.
    const chartData = chartHistoryData;

    // Filter data for table: show based on monthsBack
    const tableData = historyData.slice(-monthsBack);
    const hasMoreHistory = historyData.length > monthsBack;

    const displayUserName =
        userId === "unassigned"
            ? "Unassigned"
            : selectedUser
                ? selectedUser.username
                : userSettings.username || "Select User";

    // Auto-persist previous month if missing (Lazy Persistence)
    useEffect(() => {
        if (!userId || userId === "unassigned" || !selectedUser) return;

        const now = new Date();
        const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevYear = prevDate.getFullYear();
        const prevMonth = prevDate.getMonth() + 1;
        const prevDescId = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

        // Check if previous month exists in monthlyBalances
        if (!monthlyBalances[prevDescId]) {
            // Calculate it using the projection logic (which handles past months correctly)
            // We need to pass the correct settings and tasks
            // Use effective settings (user workload)
            const effectiveSettings = {
                ...settings,
                userWorkloadPercentage: userWorkload
            };

            // We need to get vacations taken for that month if any (from where? if record missing, it's 0)
            const vacationsTaken = 0;

            const projected = getHistoricalHourlyBalances(filteredTasks, settings, 0, monthlyBalances, userWorkload)
                .find(d => d.desc_id === prevDescId);

            // If we found the data point (which we should as getHistoricalHourlyBalances generates it)
            if (projected) {
                const newBalance: MonthlyBalanceData = {
                    workload: projected.workload,
                    hourly_balance: projected.hourly_balance,
                    hours_done: projected.hours_done,
                    vacations_hourly_taken: projected.vacations_hourly_taken,
                    vacations_hourly_balance: projected.vacations_hourly_balance,
                    is_manual: false
                };

                const updatedMonthlyBalances = {
                    ...monthlyBalances,
                    [prevDescId]: newBalance,
                };

                // Save it
                updateUser(userId, { monthly_balances: updatedMonthlyBalances });
            }
        }
    }, [userId, selectedUser, monthlyBalances, filteredTasks, settings, userWorkload, updateUser]);

    const handleUpdate = async (descId: string, field: keyof DataPoint, value: number) => {
        if (!userId || userId === "unassigned") {
            return;
        }

        const currentBalance = monthlyBalances[descId] || {
            workload: 0,
            hourly_balance: 0,
            hours_done: 0,
        };

        const updatedBalance: MonthlyBalanceData = {
            ...currentBalance,
            [field]: value,
            is_manual: true,
            modified_by: currentUserId // Track who modified it (current logged in user)
        };

        // Recalculate hourly_balance if workload or hours_done changed
        if (field === 'workload' || field === 'hours_done') {
            const [year, month] = descId.split('-').map(Number);
            const workingDays = getWorkingDays(year, month);
            const workload = field === 'workload' ? value : updatedBalance.workload;
            const hoursDone = field === 'hours_done' ? value : updatedBalance.hours_done;
            const hoursDue = workingDays * 8 * (workload / 100);
            updatedBalance.hourly_balance = hoursDone - hoursDue;
        }

        // Ensure all fields are present if creating new entry
        if (!monthlyBalances[descId]) {
            // Logic handled by default values above and recalculation
            if (updatedBalance.workload === undefined) updatedBalance.workload = 0;
            if (updatedBalance.hours_done === undefined) updatedBalance.hours_done = 0;
            if (updatedBalance.hourly_balance === undefined) updatedBalance.hourly_balance = 0;
        }

        const updatedMonthlyBalances = {
            ...monthlyBalances,
            [descId]: updatedBalance,
        };

        await updateUser(userId, { monthly_balances: updatedMonthlyBalances });
    };

    const handleDelete = async (descId: string) => {
        if (!userId || userId === "unassigned") return;

        const updatedMonthlyBalances = { ...monthlyBalances };
        delete updatedMonthlyBalances[descId];

        await updateUser(userId, { monthly_balances: updatedMonthlyBalances });
    };

    const handleAddPastRecord = async () => {
        if (!userId || userId === "unassigned") return;

        // Find the oldest month in historyData
        const oldestEntry = historyData[0];
        let targetYear, targetMonth;

        if (oldestEntry) {
            const [y, m] = oldestEntry.desc_id.split('-').map(Number);
            // Go back one month
            const date = new Date(y, m - 1 - 1, 1); // Month is 0-indexed in Date, but m is 1-indexed. So m-1 is current month index. m-2 is previous.
            targetYear = date.getFullYear();
            targetMonth = date.getMonth() + 1;
        } else {
            // Should not happen as we always have current month, but fallback to now - 1 month
            const now = new Date();
            const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            targetYear = date.getFullYear();
            targetMonth = date.getMonth() + 1;
        }

        const descId = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

        // Create entry with 0 workload as requested
        const newBalance: MonthlyBalanceData = {
            workload: 0,
            hourly_balance: 0,
            hours_done: 0
        };

        const updatedMonthlyBalances = {
            ...monthlyBalances,
            [descId]: newBalance,
        };

        await updateUser(userId, { monthly_balances: updatedMonthlyBalances });
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between">
                <span className="font-medium">User: {displayUserName}</span>
            </div>
            <div className="flex flex-row gap-6 h-full items-start">
                <div className="w-1/3 min-w-[300px] border rounded-lg p-4 bg-white flex flex-col">
                    {/* Table: newest month at top, oldest at bottom */}
                    <div className="flex-1 overflow-auto">
                        <TimetableRawTable
                            data={[...tableData].reverse()}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                            isRowDeletable={(index) => index === tableData.length - 1 && !hasMoreHistory}
                        />
                    </div>
                    <div className="mt-4 flex flex-col gap-2 justify-center items-center">
                        {!hasMoreHistory && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAddPastRecord}
                            >
                                + Add a past record
                            </Button>
                        )}
                        {hasMoreHistory && (
                            <Button variant="outline" size="sm" onClick={() => setMonthsBack(prev => prev + 6)}>
                                Load Previous Months
                            </Button>
                        )}
                    </div>
                </div>
                <div className="flex-1 h-[600px] border rounded-lg p-4 bg-white">
                    {/* Chart: oldest month on left, newest on right */}
                    <TimetableChart
                        data={chartData}
                        limitUpper={settings.hourlyBalanceLimitUpper}
                        limitLower={settings.hourlyBalanceLimitLower}
                    />
                </div>
            </div>
        </div>
    );
};

export default HourlyBalance;
