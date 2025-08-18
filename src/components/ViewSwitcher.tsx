import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type View = "focus" | "triage" | "timetable" | "settings" | "metrics" | "qol-survey";

export const ViewSwitcher: React.FC<{
  value: View;
  onChange: (v: View) => void;
}> = ({ value, onChange }) => {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as View)}>
      <TabsList>
        <TabsTrigger value="triage">Projects</TabsTrigger>
        <TabsTrigger value="focus">Focus</TabsTrigger>
        <TabsTrigger value="timetable">Timetable</TabsTrigger>
        <TabsTrigger value="qol-survey">QLI</TabsTrigger>
        <TabsTrigger value="metrics">Metrics</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
    </Tabs>
  );
};