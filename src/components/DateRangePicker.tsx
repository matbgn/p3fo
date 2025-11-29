import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { addDays, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, subDays, subMonths, subWeeks, isSameDay } from "date-fns"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface DateRangePickerProps {
    date: DateRange | undefined
    setDate: (date: DateRange | undefined) => void
    className?: string
    weekStartsOn?: 0 | 1
}

export function DateRangePicker({
    date,
    setDate,
    className,
    weekStartsOn = 1,
}: DateRangePickerProps) {
    const [open, setOpen] = React.useState(false)
    const [tempDate, setTempDate] = React.useState<DateRange | undefined>(date)
    const [preset, setPreset] = React.useState<string>("custom")

    // Sync tempDate with date when popover opens or date changes externally
    React.useEffect(() => {
        setTempDate(date)
    }, [date, open])

    // Helper to check if a range matches a preset
    const checkPreset = (range: DateRange | undefined) => {
        if (!range?.from || !range?.to) return "custom"
        return "custom"
    }

    const presets = [
        {
            label: "Today",
            value: "today",
            getRange: () => {
                const now = new Date()
                return { from: now, to: now }
            }
        },
        {
            label: "Yesterday",
            value: "yesterday",
            getRange: () => {
                const now = new Date()
                const yest = subDays(now, 1)
                return { from: yest, to: yest }
            }
        },
        {
            label: "This Week",
            value: "thisWeek",
            getRange: () => {
                const now = new Date()
                return { from: startOfWeek(now, { weekStartsOn }), to: endOfWeek(now, { weekStartsOn }) }
            }
        },
        {
            label: "Last Week",
            value: "lastWeek",
            getRange: () => {
                const now = new Date()
                const lastWeek = subWeeks(now, 1)
                return { from: startOfWeek(lastWeek, { weekStartsOn }), to: endOfWeek(lastWeek, { weekStartsOn }) }
            }
        },
        {
            label: "This Month",
            value: "thisMonth",
            getRange: () => {
                const now = new Date()
                return { from: startOfMonth(now), to: endOfMonth(now) }
            }
        },
        {
            label: "Last Month",
            value: "lastMonth",
            getRange: () => {
                const now = new Date()
                const lastMonth = subMonths(now, 1)
                return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) }
            }
        },
        {
            label: "Year to Date",
            value: "ytd",
            getRange: () => {
                const now = new Date()
                return { from: startOfYear(now), to: now }
            }
        }
    ]

    const handlePresetSelect = (value: string) => {
        setPreset(value)
        const selectedPreset = presets.find(p => p.value === value)
        if (selectedPreset) {
            setTempDate(selectedPreset.getRange())
        }
    }

    const handleApply = () => {
        setDate(tempDate)
        setOpen(false)
    }

    const handleReset = () => {
        setTempDate(undefined)
        setPreset("custom")
        setDate(undefined)
        setOpen(false)
    }

    return (
        <div className={cn("grid gap-2", className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                            "w-[300px] justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (
                            date.to ? (
                                <>
                                    {format(date.from, "dd.MM.yyyy")} - {format(date.to, "dd.MM.yyyy")}
                                </>
                            ) : (
                                format(date.from, "dd.MM.yyyy")
                            )
                        ) : (
                            <span>Pick a date</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex">
                        <div className="flex flex-col gap-1 p-2 border-r w-[140px]">
                            <div className="text-sm font-medium mb-2 px-2">Time period</div>
                            {presets.map((p) => (
                                <Button
                                    key={p.value}
                                    variant={preset === p.value ? "default" : "ghost"}
                                    className="justify-start h-8 px-2 text-sm font-normal"
                                    onClick={() => handlePresetSelect(p.value)}
                                >
                                    {p.label}
                                </Button>
                            ))}
                            <Button
                                variant={preset === "custom" ? "default" : "ghost"}
                                className="justify-start h-8 px-2 text-sm font-normal"
                                onClick={() => setPreset("custom")}
                            >
                                Custom
                            </Button>
                        </div>
                        <div className="p-0">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={tempDate?.from}
                                selected={tempDate}
                                onSelect={(range) => {
                                    setTempDate(range)
                                    setPreset("custom")
                                }}
                                numberOfMonths={2}
                                className="p-3"
                                weekStartsOn={weekStartsOn}
                            />
                            <div className="flex items-center justify-between p-3 border-t">
                                <div className="text-sm text-muted-foreground">
                                    {tempDate?.from ? (
                                        tempDate.to ? (
                                            <>
                                                {format(tempDate.from, "dd.MM.yyyy")} - {format(tempDate.to, "dd.MM.yyyy")}
                                            </>
                                        ) : (
                                            format(tempDate.from, "dd.MM.yyyy")
                                        )
                                    ) : (
                                        <span>No date selected</span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={handleReset}>
                                        Reset
                                    </Button>
                                    <Button size="sm" onClick={handleApply}>
                                        Apply
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}
