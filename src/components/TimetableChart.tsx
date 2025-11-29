
import React from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from "recharts";
import type { DataPoint } from "@/utils/projectedHours";

interface TimetableChartProps {
  data: DataPoint[];
  limitUpper: number;
  limitLower: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const filtered = payload.filter((p: any) => p.dataKey !== 'upperLimit' && p.dataKey !== 'lowerLimit');
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

const TimetableChart: React.FC<TimetableChartProps> = ({ data, limitUpper, limitLower }) => {
  const chartData = data.map(d => ({
    ...d,
    upperLimit: d.workload * limitUpper,
    lowerLimit: d.workload * limitLower // limitLower is expected to be negative, e.g. -0.5
  }));

  return (
    <div className="h-full flex flex-col gap-4">
      <Card className="flex-1 border-none shadow-none">
        <CardContent className="flex flex-col h-full p-0">
          <ResponsiveContainer width="100%" height="100%" minHeight="400px">
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="deltaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" />
              <YAxis />
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} />
              <Area
                type="monotone"
                dataKey="hourly_balance"
                name="Hours Delta per each Month"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#deltaFill)"
              />
              <Area
                type="monotone"
                dataKey="cumulative_balance"
                name="Cummulative Hourly Balance"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#cumFill)"
              />
              <Line type="step" dataKey="upperLimit" stroke="red" strokeDasharray="3 3" dot={false} name="Limit" />
              <Line type="step" dataKey="lowerLimit" stroke="red" strokeDasharray="3 3" dot={false} legendType="none" name="Limit" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimetableChart;