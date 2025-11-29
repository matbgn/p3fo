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
    const monthlyBalances = selectedUser?.monthly_balances || {};

    const userWorkload = selectedUser?.workload ?? settings.userWorkloadPercentage;

    const data = getVacationsBalances(settings, 18, 6, monthlyBalances, userWorkload);

    // Filter data for chart: only show last 6 months of history + projection
    const historyData = data.filter(d => !d.projected);
    const projectedData = data.filter(d => d.projected);
    const chartHistoryData = historyData.slice(-monthsBack); // Last 6 months
    const chartData = [...chartHistoryData, ...projectedData];

    // Filter data for table: show based on monthsBack
    const tableData = historyData.slice(-monthsBack);
    const hasMoreHistory = historyData.length > monthsBack;

    const displayUserName =
        userId === "unassigned"
            ? "Unassigned"
            : selectedUser
                ? selectedUser.username
                : userSettings.username || "Select User";

    const handleUpdate = async (descId: string, field: 'workload' | 'vacations_hourly_taken' | 'vacations_hourly_balance', value: number) => {
        if (!userId || userId === "unassigned") return;

        const currentBalance = monthlyBalances[descId] || {
            workload: settings.userWorkloadPercentage,
            hourly_balance: 0,
            hours_done: 0,
            vacations_hourly_balance: 0,
            vacations_hourly_taken: 0
        };

        const updatedBalance: MonthlyBalanceData = {
            ...currentBalance,
            [field]: value,
        };

        // Recalculate vacations_hourly_balance if workload or vacations_hourly_taken changed
        // Logic: Balance = Previous Balance + Due - Taken?
        // No, Vacations Balance is usually cumulative.
        // But here we are updating a specific month.
        // If we update a month, we just store the value.
        // The cumulative calculation happens in `getVacationsBalances`.
        // BUT `getVacationsBalances` uses `vacations_hourly_balance` from DB if present!
        // So if we store it, we override the calculation.
        // If we want the calculation to be dynamic based on Due/Taken, we should perhaps NOT store `vacations_hourly_balance`?
        // Or we must recalculate it correctly here.
        // But `vacations_hourly_balance` is cumulative. It depends on previous months.
        // If I edit month X, I can't easily calculate its cumulative balance without knowing month X-1.
        // `getVacationsBalances` does the chain calculation.
        // If I store a hardcoded balance for month X, `getVacationsBalances` uses it and continues from there.
        // This seems to be the design: allow manual override of balance.
        // BUT, if I change "Taken", I expect "Balance" to update?
        // If I change "Taken", and I have a stored "Balance", the stored Balance is now stale?
        // If the user wants to see the effect of "Taken", they probably shouldn't have a manual "Balance" override?
        // Or the "Balance" field in DB is meant to be the *result*?
        // If it's the result, I need to calculate it.
        // But I don't have the previous balance here easily.

        // However, looking at `HourlyBalance` logic I just wrote:
        // `updatedBalance.hourly_balance = hoursDone - hoursDue;`
        // This is NOT cumulative. This is monthly delta.
        // `getHistoricalHourlyBalances` sums them up.

        // In `VacationsBalance`:
        // `getVacationsBalances`:
        // `cumulativeBalance += vacationsDue + vacationsTaken;`
        // `currentBalance = cumulativeBalance;`
        // IF `monthlyBalances[descId].vacations_hourly_balance` exists, it uses it as `currentBalance` (cumulative).

        // So `vacations_hourly_balance` in DB is CUMULATIVE?
        // If so, editing "Taken" for one month should update the cumulative balance for that month AND all future months?
        // That's complex.

        // Maybe `vacations_hourly_balance` in DB is NOT cumulative?
        // Let's check `getVacationsBalances` again.
        // `if (monthlyBalances[descId].vacations_hourly_balance !== undefined) { currentBalance = ...; cumulativeBalance = currentBalance; }`
        // Yes, it treats it as the absolute cumulative balance at that point.

        // If the user edits "Taken", they are changing the delta.
        // If they also have a stored "Balance", that stored balance is now wrong if it was derived.
        // If they want to rely on auto-calculation, they should maybe DELETE the stored balance?
        // But `VacationsTable` doesn't allow deleting the balance field specifically.

        // If I look at `VacationsTable`, the "Balance" column is NOT editable.
        // So the user cannot manually set the balance.
        // So `vacations_hourly_balance` in DB should probably NOT be set by this `handleUpdate`?
        // If `VacationsTable` calls `onUpdate` only for "Taken" and "Workload".
        // Then `field` is never `vacations_hourly_balance`.
        // So `updatedBalance` will have the old `vacations_hourly_balance`.
        // If we want to revert to auto-calculation, we should REMOVE `vacations_hourly_balance` from the DB entry?
        // Yes! If I change "Taken", I want the system to recalculate Balance.
        // Since Balance is derived cumulatively, I should probably `delete updatedBalance.vacations_hourly_balance`.

        // If the user manually updates the balance, we keep it.
        // If they update workload or taken, we remove the manual balance to allow auto-recalculation.
        if (field === 'workload' || field === 'vacations_hourly_taken') {
            delete updatedBalance.vacations_hourly_balance;
        }

        const updatedMonthlyBalances = {
            ...monthlyBalances,
            [descId]: updatedBalance,
        };

        await updateUser(userId, { monthly_balances: updatedMonthlyBalances });
    };

    const handleAddPastRecord = async () => {
        if (!userId || userId === "unassigned") return;

        // Find the oldest month in historyData
        const oldestEntry = historyData[0];
        let targetYear, targetMonth;

        if (oldestEntry) {
            const [y, m] = oldestEntry.desc_id.split('-').map(Number);
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

        // Create entry with 0 workload
        const newBalance: MonthlyBalanceData = {
            workload: 0,
            hourly_balance: 0,
            hours_done: 0,
            vacations_hourly_balance: 0,
            vacations_hourly_taken: 0
        };

        const updatedMonthlyBalances = {
            ...monthlyBalances,
            [descId]: newBalance,
        };

        await updateUser(userId, { monthly_balances: updatedMonthlyBalances });
    };

    return (
        <div className="flex flex-col gap-6 h-full">
            <div className="flex items-center justify-between">
                <span className="font-medium">User: {displayUserName}</span>
            </div>

            <div className="flex flex-row gap-6 h-full min-h-[500px] items-start">
                <div className="w-1/3 min-w-[400px] border rounded-lg p-4 bg-white flex flex-col">
                    {/* Table: newest month at top, oldest at bottom */}
                    <div className="flex-1 overflow-auto">
                        <VacationsTable
                            data={[...tableData].reverse()}
                            onUpdate={handleUpdate}
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
                <div className="flex-1 h-[600px] border rounded-lg p-4 bg-white">
                    <VacationsChart data={chartData} limitMultiplier={settings.vacationLimitMultiplier} />
                </div>
            </div>
        </div>
    );
};

export default VacationsBalance;
