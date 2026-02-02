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

import { Trash2, Pen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TimetableRawTableProps {
  data: DataPoint[];
  onUpdate: (descId: string, field: keyof DataPoint, value: number) => void;
  onDelete?: (descId: string) => void;
  isRowDeletable?: (index: number) => boolean;
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

const TimetableRawTable: React.FC<TimetableRawTableProps> = ({ data, onUpdate, onDelete, isRowDeletable }) => {
  // Helper to check if a row is the current month
  // In getHistoricalHourlyBalances, data is pushed from oldest to newest.
  // So the last element is the current month.
  // Actually, the data passed to this table is REVERSED in HourlyBalance ([...tableData].reverse())
  // So the FIRST element is the current month (newest).
  // Let's verify usage in HourlyBalance: <TimetableRawTable data={[...tableData].reverse()} ... />
  // So index 0 is the newest (current month).
  const isCurrentMonth = (index: number) => index === 0;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Month</TableHead>
            <TableHead>Workload %</TableHead>
            <TableHead>Hourly Balance</TableHead>
            <TableHead>Hours Done</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => {
            // If data is reversed, index 0 is current month.
            // We want to allow editing for past months?
            // Previous code: const isEditable = !isCurrentMonth(index);
            // If index 0 is current month, then !isCurrentMonth(0) is false. Correct.
            const isEditable = !isCurrentMonth(index);
            const showDelete = onDelete && !isCurrentMonth(index) && (isRowDeletable ? isRowDeletable(index) : true);

            return (
              <TableRow key={index}>
                <TableCell className="font-medium flex items-center gap-2">
                  {row.descId}
                  {row.isManual && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Pen className="h-3 w-3 text-blue-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edited by {row.modifiedBy || 'Unknown'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </TableCell>
                <TableCell>
                  <EditableCell
                    value={row.workload}
                    onSave={(val) => onUpdate(row.descId, "workload", val)}
                    isEditable={isEditable}
                  />
                </TableCell>
                <TableCell>
                  {/* Hourly Balance is auto-calculated, not editable */}
                  <span>{row.hourlyBalance.toFixed(1)}</span>
                </TableCell>
                <TableCell>
                  <EditableCell
                    value={row.hoursDone}
                    onSave={(val) => onUpdate(row.descId, "hoursDone", val)}
                    isEditable={isEditable}
                  />
                </TableCell>
                <TableCell>
                  {showDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => onDelete!(row.descId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default TimetableRawTable;