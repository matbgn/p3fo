import React, { useState, useEffect } from "react";
import TimetableChart from "./TimetableChart";
import TimetableRawTable from "./TimetableRawTable";
import { getHistoricalHourlyBalances, DataPoint } from "@/utils/projectedHours";
import { useTasks } from "@/hooks/useTasks";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { useUsers } from "@/hooks/useUsers";
import { useUserSettings } from "@/hooks/useUserSettings";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { MonthlyBalanceData } from "@/lib/persistence-types";

interface HourlyBalanceProps {
    userId: string;
}

const HourlyBalance: React.FC<HourlyBalanceProps> = ({ userId }) => {
    const { tasks } = useTasks();
    const { settings } = useCombinedSettings();
    const { users, updateUser } = useUsers();
    const { userSettings } = useUserSettings();

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

    const data = getHistoricalHourlyBalances(filteredTasks, settings, 6, monthlyBalances);

    const displayUserName =
        userId === "unassigned"
            ? "Unassigned"
            : selectedUser
                ? selectedUser.username
                : userSettings.username || "Select User";

    const handleUpdate = async (descId: string, field: keyof DataPoint, value: number) => {
        console.log('[HourlyBalance] handleUpdate called:', { descId, field, value, userId });

        if (!userId || userId === "unassigned") {
            console.log('[HourlyBalance] Skipping update - no user or unassigned');
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
        };

        // Ensure all fields are present if creating new entry
        if (!monthlyBalances[descId]) {
            // If creating new, maybe initialize other fields with 0 or defaults?
            // The user said "make them empty", so 0 is fine.
            if (field === 'workload') {
                updatedBalance.hourly_balance = 0;
                updatedBalance.hours_done = 0;
            } else if (field === 'hourly_balance') {
                updatedBalance.workload = 0;
                updatedBalance.hours_done = 0;
            } else if (field === 'hours_done') {
                updatedBalance.workload = 0;
                updatedBalance.hourly_balance = 0;
            }
        }

        const updatedMonthlyBalances = {
            ...monthlyBalances,
            [descId]: updatedBalance,
        };

        console.log('[HourlyBalance] Calling updateUser with:', { updatedMonthlyBalances });
        await updateUser(userId, { monthly_balances: updatedMonthlyBalances });
        console.log('[HourlyBalance] updateUser complete');
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex items-center justify-between">
                <span className="font-medium">User: {displayUserName}</span>
            </div>
            <div className="flex flex-row gap-6 h-full">
                <div className="w-1/3 min-w-[300px] border rounded-lg p-4 bg-white">
                    {/* Table: newest month at top, oldest at bottom */}
                    <TimetableRawTable data={[...data].reverse()} onUpdate={handleUpdate} />
                </div>
                <div className="flex-1 min-h-[400px] border rounded-lg p-4 bg-white">
                    {/* Chart: oldest month on left, newest on right */}
                    <TimetableChart data={data} />
                </div>
            </div>
        </div>
    );
};

export default HourlyBalance;
