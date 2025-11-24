import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import type { DataPoint } from "@/utils/projectedHours";

interface TimetableRawTableProps {
  data: DataPoint[];
  onUpdate: (descId: string, field: keyof DataPoint, value: number) => void;
}

const EditableCell: React.FC<{
  value: number;
  onSave: (val: number) => void;
  isEditable: boolean;
}> = ({ value, onSave, isEditable }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value.toString());

  useEffect(() => {
    setTempValue(value.toString());
  }, [value]);

  if (!isEditable) {
    return <span>{value.toFixed(1)}</span>;
  }

  if (isEditing) {
    return (
      <Input
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          const num = parseFloat(tempValue);
          if (!isNaN(num)) {
            onSave(num);
          } else {
            setTempValue(value.toString());
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setIsEditing(false);
            const num = parseFloat(tempValue);
            if (!isNaN(num)) {
              onSave(num);
            } else {
              setTempValue(value.toString());
            }
          }
        }}
        className="h-8 w-20"
        autoFocus
      />
    );
  }

  return (
    <div
      onDoubleClick={() => setIsEditing(true)}
      className="cursor-pointer hover:bg-gray-100 p-1 rounded"
      title="Double click to edit"
    >
      {value.toFixed(1)}
    </div>
  );
};

const TimetableRawTable: React.FC<TimetableRawTableProps> = ({ data, onUpdate }) => {
  // Helper to check if a row is the current month (first in the list because of reverse?)
  // Actually data is reversed in getHistoricalHourlyBalances, so current month is the last one?
  // Let's check the date or logic. getHistoricalHourlyBalances returns data.reverse().
  // So the first element is the oldest month, the last element is the current month.
  // Wait, usually tables show newest on top?
  // The user didn't specify order, but usually charts go left-right (old-new).
  // If data is passed to chart as is, it's old -> new.
  // If table iterates data, it shows old -> new (top -> bottom).
  // The user said "For the previous entries...".
  // Let's assume the last element is the current month.

  const isCurrentMonth = (index: number) => index === data.length - 1;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-bold text-gray-500">Month</TableHead>
              <TableHead className="font-bold text-gray-500">Workload</TableHead>
              <TableHead className="font-bold text-gray-500">Hourly Balance</TableHead>
              <TableHead className="font-bold text-gray-500">Hours Done</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => {
              const isEditable = !isCurrentMonth(index);
              return (
                <TableRow key={index} className="hover:bg-muted/50">
                  <TableCell className="font-medium text-gray-600">{row.desc_id}</TableCell>
                  <TableCell className="text-gray-600">
                    <EditableCell
                      value={row.workload}
                      onSave={(val) => onUpdate(row.desc_id, "workload", val)}
                      isEditable={isEditable}
                    />
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {/* Hourly Balance is auto-calculated, not editable */}
                    <span>{row.hourly_balance.toFixed(1)}</span>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    <EditableCell
                      value={row.hours_done}
                      onSave={(val) => onUpdate(row.desc_id, "hours_done", val)}
                      isEditable={isEditable}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default TimetableRawTable;