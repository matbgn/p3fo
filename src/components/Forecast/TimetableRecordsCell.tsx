import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Task } from "@/hooks/useTasks";
import { getProjectedHoursForActualMonth } from "@/utils/projectedHours";
import { CombinedSettings } from "@/hooks/useCombinedSettings";

interface TimetableRecordsCellProps {
    tasks: Task[];
    settings: CombinedSettings;
    year: number;
    month: number;
    vacationsTaken?: number;
    previousBalance?: number;
}

const TimetableRecordsCell: React.FC<TimetableRecordsCellProps> = ({
    tasks,
    settings,
    year,
    month,
    vacationsTaken = 0,
    previousBalance = 0
}) => {
    const projectedHoursResult = getProjectedHoursForActualMonth(
        year,
        month,
        tasks,
        settings,
        vacationsTaken
    );

    const balance = projectedHoursResult.hourlyBalanceProjection;
    const totalProjectedBalance = balance + previousBalance;
    const workloadPercentage = settings.userWorkloadPercentage;
    // Legacy logic: ratio = balance / workload (where workload is the percentage value, e.g. 60)
    const ratio = balance / workloadPercentage;

    const getBadgeColorClass = (r: number) => {
        const absR = Math.abs(r);
        if (absR > 0.5) return "bg-red-100 text-red-700 hover:bg-red-200"; // Red
        if (absR > 0.3) return "bg-amber-100 text-amber-700 hover:bg-amber-200"; // Amber
        return "bg-green-100 text-green-700 hover:bg-green-200"; // Green
    };

    return (
        <>
            <Card className="h-28">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Hours per month done</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{projectedHoursResult.totalTimeElapsedForAllMonth}</div>
                </CardContent>
            </Card>

            <Card className="h-28">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Hours per month due</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{projectedHoursResult.hoursDue}</div>
                </CardContent>
            </Card>

            <Card className="h-28 border-t-4 border-t-indigo-500">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Hours per month projected</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{projectedHoursResult.totalTimeExpandedInHours}</div>
                </CardContent>
            </Card>

            <Card className="h-28">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Delta hours projected with due</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{projectedHoursResult.actualHourlyBalance}</div>
                </CardContent>
            </Card>

            <Card className="h-28">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Workload</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{workloadPercentage}%</div>
                </CardContent>
            </Card>

            <Card className="h-28">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Last month hourly balance</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{previousBalance}</div>
                </CardContent>
            </Card>

            <Card className="h-28 col-span-1 sm:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">New hourly balance (projection)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex justify-between items-center">
                        <div className="text-2xl font-bold">{Math.round(totalProjectedBalance * 10) / 10} Hours</div>
                        <Badge
                            className={`text-lg px-3 py-1 ${getBadgeColorClass(ratio)}`}
                        >
                            {ratio > 0 ? '+' : ''}
                            {Math.round(ratio * 100)}%
                        </Badge>
                    </div>
                </CardContent>
            </Card>
        </>
    );
};

export default TimetableRecordsCell;
