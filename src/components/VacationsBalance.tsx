import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCombinedSettings } from "@/hooks/useCombinedSettings";
import { useUsers } from "@/hooks/useUsers";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getVacationsBalances, getMonthProjectionVacations } from "@/utils/projectedHours";
import VacationsTable from "./VacationsTable";
import VacationsChart from "./VacationsChart";
import { MonthlyBalanceData } from "@/lib/persistence-types";
import { getWorkingDays } from "@/utils/workingdays";
import { Button } from "@/components/ui/button";

interface VacationsBalanceProps {
    userId: string;
}

const VacationsBalance: React.FC<VacationsBalanceProps> = ({ userId }) => {
    const { settings } = useCombinedSettings();
    const { users, updateUser } = useUsers();
    const { userSettings } = useUserSettings();
    const [monthsBack, setMonthsBack] = useState(6);

    const selectedUser = users.find((u) => u.userId === userId);
    const monthlyBalances = selectedUser?.monthlyBalances || {};

    const userWorkload = selectedUser?.workload ?? settings.userWorkloadPercentage;
    const effectiveSettings = {
        ...settings,
        userWorkloadPercentage: userWorkload,
        preferredWorkingDays: (selectedUser?.preferredWorkingDays as Record<string, number>) ?? settings.preferredWorkingDays
    };

    const data = getVacationsBalances(effectiveSettings, 18, 6, monthlyBalances, userWorkload);

    const historyData = data.filter(d => !d.projected);
    const projectedData = data.filter(d => d.projected);
    const chartHistoryData = historyData.slice(-monthsBack);
    const chartData = [...chartHistoryData, ...projectedData];

    const tableData = historyData.slice(-monthsBack);
    const hasMoreHistory = historyData.length > monthsBack;

    const displayUserName =
        userId === "unassigned"
            ? "Unassigned"
            : selectedUser
                ? selectedUser.username
                : userSettings.username || "Select User";

    const handleUpdate = async (descId: string, field: 'workload' | 'vacationsHourlyTaken' | 'vacationsHourlyBalance', value: number) => {
        if (!userId || userId === "unassigned") return;

        const currentBalance = monthlyBalances[descId] || {
            workload: userWorkload,
            hourlyBalance: 0,
            hoursDone: 0,
            vacationsHourlyBalance: 0,
            vacationsHourlyTaken: 0
        };

        const updatedBalance: MonthlyBalanceData = {
            ...currentBalance,
            [field]: value,
        };

        if (field === 'workload' || field === 'vacationsHourlyTaken') {
            delete updatedBalance.vacationsHourlyBalance;
        }

        const updatedMonthlyBalances = {
            ...monthlyBalances,
            [descId]: updatedBalance,
        };

        await updateUser(userId, { monthlyBalances: updatedMonthlyBalances });
    };

    const handleAddPastRecord = async () => {
        if (!userId || userId === "unassigned") return;

        const oldestEntry = historyData[0];
        let targetYear: number, targetMonth: number;

        if (oldestEntry) {
            const [y, m] = oldestEntry.descId.split('-').map(Number);
            const date = new Date(y, m - 1 - 1, 1);
            targetYear = date.getFullYear();
            targetMonth = date.getMonth() + 1;
        } else {
            const now = new Date();
            const date = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            targetYear = date.getFullYear();
            targetMonth = date.getMonth() + 1;
        }

        const descId = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

        const newBalance: MonthlyBalanceData = {
            workload: userWorkload,
            hourlyBalance: 0,
            hoursDone: 0,
            vacationsHourlyBalance: 0,
            vacationsHourlyTaken: 0
        };

        const updatedMonthlyBalances = {
            ...monthlyBalances,
            [descId]: newBalance,
        };

        await updateUser(userId, { monthlyBalances: updatedMonthlyBalances });
    };

    const handleAddFutureRecord = async () => {
        if (!userId || userId === "unassigned") return;

        const now = new Date();
        const currentDescId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Find the latest future month in monthlyBalances (after current month)
        let maxFutureDescId = currentDescId;
        Object.keys(monthlyBalances).forEach(key => {
            if (key > maxFutureDescId) {
                maxFutureDescId = key;
            }
        });

        // Add one month after the latest
        const [y, m] = maxFutureDescId.split('-').map(Number);
        const date = new Date(y, m, 1); // m is 1-indexed, so m (not m-1) gives next month
        const targetYear = date.getFullYear();
        const targetMonth = date.getMonth() + 1;

        const descId = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

        const newBalance: MonthlyBalanceData = {
            workload: userWorkload,
            hourlyBalance: 0,
            hoursDone: 0,
            vacationsHourlyBalance: 0,
            vacationsHourlyTaken: 0
        };

        const updatedMonthlyBalances = {
            ...monthlyBalances,
            [descId]: newBalance,
        };

        await updateUser(userId, { monthlyBalances: updatedMonthlyBalances });
    };

    const handleDelete = async (descId: string) => {
        if (!userId || userId === "unassigned") return;

        const updatedMonthlyBalances = { ...monthlyBalances };
        delete updatedMonthlyBalances[descId];

        await updateUser(userId, { monthlyBalances: updatedMonthlyBalances });
    };

    return (
        <div className="flex flex-col gap-6 h-full">
            <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[500px] items-start">
                <div className="w-full lg:w-1/3 lg:min-w-[300px] flex flex-col order-2 lg:order-1">
                    {/* Table: newest month at top, oldest at bottom */}
                    <div className="mb-4 flex flex-col gap-2 justify-center items-center">
                        <Button variant="outline" size="sm" onClick={handleAddFutureRecord}>
                            + Add a future record
                        </Button>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <VacationsTable
                            data={[...tableData].reverse()}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                        />
                    </div>
                    <div className="mt-4 flex flex-col gap-2 justify-center items-center">
                        {hasMoreHistory && (
                            <Button variant="outline" size="sm" onClick={() => setMonthsBack(prev => prev + 6)}>
                                Load Previous Months
                            </Button>
                        )}
                    </div>
                </div>
                <div className="w-full lg:flex-1 h-[400px] lg:h-[600px] flex flex-col order-1 lg:order-2">
                    <VacationsChart data={chartData} limitMultiplier={settings.vacationLimitMultiplier} />
                </div>
            </div>
        </div>
    );
};

export default VacationsBalance;