
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
} from "recharts";
import type { DataPoint } from "@/utils/projectedHours";

interface TimetableChartProps {
  data: DataPoint[];
}

const TimetableChart: React.FC<TimetableChartProps> = ({ data }) => {
  const valueFormatter = (value: number) => value.toFixed(1);

  return (
    <div className="h-full flex flex-col gap-4">
      <Card className="flex-1 border-none shadow-none">
        <CardContent className="flex flex-col h-full p-0">
          <ResponsiveContainer width="100%" height="100%" minHeight="400px">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
              <Tooltip formatter={valueFormatter} />
              <Legend verticalAlign="top" height={36} />
              <Area
                type="monotone"
                dataKey="Hours Delta per each Month"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#deltaFill)"
              />
              <Area
                type="monotone"
                dataKey="Cummulative Hourly Balance"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#cumFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimetableChart;