import React from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceLine,
    Cell,
    Line,
    ComposedChart
} from "recharts";
import { VacationsDataPoint } from "@/utils/projectedHours";

interface VacationsChartProps {
    data: VacationsDataPoint[];
    limitMultiplier: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const filtered = payload.filter((p: any) => {
            if (p.dataKey === 'balance_history' && p.value === 0) return false;
            if (p.dataKey === 'balance_projected' && p.value === 0) return false;
            return true;
        });

        if (!filtered.length) return null;

        return (
            <div className="bg-white border border-slate-200 p-3 rounded shadow-sm opacity-95">
                <p className="font-medium mb-2">{label}</p>
                {filtered.map((entry: any, index: number) => (
                    <div key={index} className="text-sm mb-1" style={{ color: entry.color }}>
                        {entry.name} : {Number(entry.value).toFixed(1)}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const VacationsChart: React.FC<VacationsChartProps> = ({ data, limitMultiplier }) => {
    // Calculate limit based on the first data point's workload (or handle dynamic workload if it changes per month)
    // The requirement is "1.5x of the workload". Workload is in data point.
    // We can add a line for each bar? No, ReferenceLine is usually horizontal.
    // If workload changes over time, a single horizontal line might be misleading.
    // However, usually workload is constant or we want to show the CURRENT limit?
    // "computed by workspace settings that symbolize the limit which every employee should not cross"
    // If we want a dynamic line that follows workload changes, we need a composed chart with a Line.
    // Let's use a Line for the limit.

    const chartData = data.map(d => ({
        ...d,
        limit: (d.workload * limitMultiplier),
        balance_history: !d.projected ? d.vacations_hourly_balance : 0,
        balance_projected: d.projected ? d.vacations_hourly_balance : 0
    }));
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
                data={chartData}
                margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 5,
                }}
            >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine y={0} stroke="#000" />
                <Line type="step" dataKey="limit" stroke="red" strokeDasharray="3 3" dot={false} name="Limit" />

                <Bar dataKey="balance_history" name="Vacations Balance" fill="#6366f1" stackId="a" />
                <Bar dataKey="balance_projected" name="Vacations Projected" fill="#06b6d4" stackId="a" />
            </ComposedChart>
        </ResponsiveContainer>
    );
};

export default VacationsChart;
