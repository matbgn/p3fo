import React from "react";
import HighImpactTaskMetric from "@/components/HighImpactTaskMetric";
import FailureRateMetric from "@/components/FailureRateMetric";
import QualityOfLifeIndexMetric from "@/components/QualityOfLifeIndexMetric";
import NewCapabilitiesMetric from "@/components/NewCapabilitiesMetric";
import Forecast from "@/components/Forecast/Forecast";
import HourlyBalance from "@/components/HourlyBalance";
import VacationsBalance from "@/components/VacationsBalance";
import QoLSurvey from "@/components/QoLSurvey";
import PomodoroStats from "@/components/PomodoroStats";
import PomodoroHeatmap from "@/components/PomodoroHeatmap";
import ConsistencyHeatmap from "@/components/ConsistencyHeatmap";
import { ScoreCurve } from "@/components/ScoreCurve";
import { useConsistencyScore } from "@/hooks/useConsistencyScore";
import { ALL_LEGEND_KEYS, type LegendKey } from "@/components/ConsistencyLegend";
import { useAllTasks } from "@/hooks/useAllTasks";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePomodoroStats } from "@/hooks/usePomodoroStats";

import { useUsersContext } from "@/context/UsersContext";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadFiltersFromSessionStorage, saveFiltersToSessionStorage } from "@/lib/filter-storage";
import { getDefaultFilters } from "@/lib/filter-merge";
import { Filters } from "@/components/FilterControls";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { getPersistenceAdapter } from "@/lib/persistence-factory";
import { eventBus } from "@/lib/events";

const PomodoroStatsTab: React.FC<{ userId: string; weekStartDay: 0 | 1 }> = ({ userId, weekStartDay }) => {
  const { sessions, stats, isLoading, reload } = usePomodoroStats(userId);
  const { data: consistencyData, isLoading: consistencyLoading } = useConsistencyScore(userId);
  const { tasks } = useAllTasks();
  const [legendVisible, setLegendVisible] = React.useState<Set<LegendKey>>(ALL_LEGEND_KEYS);

  const toggleLegend = React.useCallback((key: LegendKey) => {
    setLegendVisible(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleReset = async () => {
    try {
      const adapter = await getPersistenceAdapter();
      await adapter.deletePomodoroSessionsByUser(userId);
      eventBus.publish('pomodoroSessionCompleted');
      reload();
    } catch (error) {
      console.error('Error resetting focus session stats:', error);
    }
  };

  if (isLoading) {
    return <LoadingSpinner label="Loading focus session stats..." className="h-full" />;
  }

  return (
    <div className="space-y-6">
      <PomodoroStats stats={stats} userId={userId} consistencyDays={consistencyData?.days} sessions={sessions} tasks={tasks} visible={legendVisible} onToggleLegend={toggleLegend} weekStartDay={weekStartDay} />
      {consistencyData && !consistencyLoading && (
        <div className="rounded-lg border bg-card text-card-foreground p-4">
          <h3 className="text-sm font-medium mb-3">Consistency Score</h3>
          <ScoreCurve data={consistencyData} />
        </div>
      )}
      <div className="rounded-lg border bg-card text-card-foreground p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Consistency Activity</h3>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" />
                Reset Stats
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>Reset Focus Session Stats?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently delete all your focus session history, including the heatmap and statistics. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete All Sessions
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {consistencyData && !consistencyLoading ? (
          <ConsistencyHeatmap days={consistencyData.days} weekStartDay={weekStartDay} visible={legendVisible} onToggleLegend={toggleLegend} />
        ) : (
          <PomodoroHeatmap sessions={sessions} weekStartDay={weekStartDay} />
        )}
      </div>
    </div>
  );
};

const MetricsPage: React.FC<{ activeView?: string }> = ({ activeView }) => {
  const [activeTab, setActiveTab] = React.useState("forecast");
  const { userId: currentUserId } = useCurrentUser();
  const { users, loading: usersLoading } = useUsersContext();
  const { userSettings } = useUserSettings();

  React.useEffect(() => {
    if (activeView === 'metrics') {
      const pending = sessionStorage.getItem('p3fo_metrics_tab');
      if (pending) {
        sessionStorage.removeItem('p3fo_metrics_tab');
        setActiveTab(pending);
      }
    }
  }, [activeView]);

  const [selectedUserId, setSelectedUserId] = React.useState<string>("");
  const [initializing, setInitializing] = React.useState(true);

  // Load from storage on mount
  React.useEffect(() => {
    const load = async () => {
      const filters = await loadFiltersFromSessionStorage();
      if (filters?.selectedUserId) {
        setSelectedUserId(filters.selectedUserId);
      } else {
        if (userSettings.username) {
          const currentUser = users.find(u => u.username === userSettings.username);
          if (currentUser) {
            setSelectedUserId(currentUser.userId);
          } else if (currentUserId) {
            setSelectedUserId(currentUserId);
          }
        }
      }
      setInitializing(false);
    };
    load();
  }, [userSettings, users, currentUserId]);

  const handleUserChange = async (newUserId: string) => {
    setSelectedUserId(newUserId);
    const currentFilters = await loadFiltersFromSessionStorage() || getDefaultFilters();

    await saveFiltersToSessionStorage({
      ...currentFilters,
      selectedUserId: newUserId
    });
  };

  if (initializing || usersLoading) {
    return <LoadingSpinner label="Loading metrics..." className="h-full" />;
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Top pane for collaborative metrics cards */}
      <section className="rounded-lg p-2">
        <h2 className="text-xl font-semibold mb-4">Collaborative Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* High Impact Task Achievement Frequency Metric */}
          <HighImpactTaskMetric />

          {/* Failure Rate Metric */}
          <FailureRateMetric />

          {/* Quality of Life Index Metric (third position) */}
          <QualityOfLifeIndexMetric />

          {/* Time spent on New Capabilities Metric */}
          <NewCapabilitiesMetric />
        </div>
      </section>

      {/* Bottom pane for graphics in subtab separated view */}
      <section className="flex-1 border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Individual Metrics</h2>
          <Select value={selectedUserId} onValueChange={handleUserChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.userId} value={user.userId}>
                  {user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col h-full">
          {/* Subtab navigation */}
          <div className="flex border-b mb-4">
            <button
              className={`px-4 py-2 font-medium ${activeTab === "forecast" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("forecast")}
            >
              Forecast
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === "hourly-balance" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("hourly-balance")}
            >
              Hourly Balance
            </button>

            <button
              className={`px-4 py-2 font-medium ${activeTab === "vacations" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("vacations")}
            >
              Vacations
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === "individual-qol" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("individual-qol")}
            >
              Individual QoL
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === "pomodoro" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("pomodoro")}
            >
              Focus Sessions
            </button>
          </div>

          {/* Graphics area */}
          <div className="flex-1 bg-muted/10 rounded-lg p-4 overflow-auto">
            {activeTab === "forecast" ? (
              <Forecast userId={selectedUserId} />
            ) : activeTab === "hourly-balance" ? (
              <HourlyBalance userId={selectedUserId} />
            ) : activeTab === "vacations" ? (
              <VacationsBalance userId={selectedUserId} />
            ) : activeTab === "individual-qol" ? (
              selectedUserId && selectedUserId !== "unassigned" ? <QoLSurvey userId={selectedUserId} /> : <div>Please select a user to view survey</div>
            ) : activeTab === "pomodoro" ? (
              selectedUserId && selectedUserId !== "unassigned" ? <PomodoroStatsTab userId={selectedUserId} weekStartDay={userSettings.weekStartDay ?? 1} /> : <div>Please select a user to view focus session stats</div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Graphics content for {activeTab} will appear here</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default MetricsPage;