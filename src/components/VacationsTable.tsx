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
import { VacationsDataPoint } from "@/utils/projectedHours";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VacationsTableProps {
    data: VacationsDataPoint[];
    onUpdate: (descId: string, field: 'workload' | 'vacationsHourlyTaken' | 'vacationsHourlyBalance', value: number) => void;
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

const VacationsTable: React.FC<VacationsTableProps> = ({ data, onUpdate, onDelete, isRowDeletable }) => {
    const now = new Date();
    const currentDescId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[100px]">Month</TableHead>
                        <TableHead>Workload %</TableHead>
                        <TableHead>Due [h]</TableHead>
                        <TableHead>Taken [h]</TableHead>
                        <TableHead>Balance [h]</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, index) => {
                        const isFuture = row.descId > currentDescId;
                        // Only the furthest future record (first in reversed data) is deletable
                        const showDelete = onDelete && index === 0 && isFuture && (isRowDeletable ? isRowDeletable(index) : true);

                        return (
                            <TableRow key={row.descId}>
                                <TableCell className="font-medium">{row.descId}</TableCell>
                                <TableCell>
                                    <span>{row.workload}</span>
                                </TableCell>
                                <TableCell>
                                    {row.vacationsDue.toFixed(1)}
                                </TableCell>
                                <TableCell>
                                    <EditableCell
                                        value={row.vacationsHourlyTaken}
                                        onSave={(val) => onUpdate(row.descId, 'vacationsHourlyTaken', val)}
                                        isEditable={true}
                                    />
                                </TableCell>
                                <TableCell>
                                    <EditableCell
                                        value={row.vacationsHourlyBalance}
                                        onSave={(val) => onUpdate(row.descId, 'vacationsHourlyBalance', val)}
                                        isEditable={true}
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

export default VacationsTable;
