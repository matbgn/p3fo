import React from "react";
import { useTranslation } from 'react-i18next';
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
import { FocusModeProvider } from "@/components/FocusModeProvider";
import { FocusModeOverlay } from "@/components/FocusModeOverlay";

const PomodoroStatsTab: React.FC<{ userId: string; weekStartDay: 0 | 1 }> = ({ userId, weekStartDay }) => {
  const { t } = useTranslation();
  const { sessions, stats, isLoading, reload } = usePomodoroStats(userId);
  const { data: consistencyData, isLoading: consistencyLoading } = useConsistencyScore(userId, { sessions });
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
    return <LoadingSpinner label={t('metrics.loadingFocusStats')} className="h-full" />;
  }

  return (
    <div className="space-y-6">
      <PomodoroStats stats={stats} userId={userId} consistencyDays={consistencyData?.days} sessions={sessions} tasks={tasks} visible={legendVisible} onToggleLegend={toggleLegend} weekStartDay={weekStartDay} />
      {consistencyData && !consistencyLoading && (
        <div className="rounded-lg border bg-card text-card-foreground p-4">
          <h3 className="text-sm font-medium mb-3">{t('metrics.consistencyScore.title')}</h3>
          <ScoreCurve data={consistencyData} />
        </div>
      )}
      <div className="rounded-lg border bg-card text-card-foreground p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">{t('metrics.consistencyActivity.title')}</h3>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" />
                {t('metrics.resetStatsButton')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>{t('metrics.resetStatsTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                    {t('metrics.resetStatsDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('metrics.deleteAllSessionsButton')}
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

const MetricsPageInner: React.FC<{ activeView?: string }> = ({ activeView }) => {
  const { t } = useTranslation();
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
    return <LoadingSpinner label={t('metrics.loading')} className="h-full" />;
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Top pane for collaborative metrics cards */}
      <section className="rounded-lg p-2">
        <h2 className="text-xl font-semibold mb-4">{t('metrics.collaborativeTitle')}</h2>
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
      <section className="flex-1 border rounded-lg p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">{t('metrics.individualTitle')}</h2>
          <Select value={selectedUserId} onValueChange={handleUserChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('metrics.selectUser')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">{t('common.unassigned')}</SelectItem>
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
              {t('metrics.tab.forecast')}
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === "hourly-balance" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("hourly-balance")}
            >
              {t('metrics.tab.hourlyBalance')}
            </button>

            <button
              className={`px-4 py-2 font-medium ${activeTab === "vacations" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("vacations")}
            >
              {t('metrics.tab.vacations')}
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === "individual-qol" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("individual-qol")}
            >
              {t('metrics.tab.individualQol')}
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === "pomodoro" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("pomodoro")}
            >
              {t('metrics.tab.focusSessions')}
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
              selectedUserId && selectedUserId !== "unassigned" ? <QoLSurvey userId={selectedUserId} /> : <div>{t('metrics.selectUserQol')}</div>
            ) : activeTab === "pomodoro" ? (
              selectedUserId && selectedUserId !== "unassigned" ? <PomodoroStatsTab userId={selectedUserId} weekStartDay={userSettings.weekStartDay ?? 1} /> : <div>{t('metrics.selectUserFocus')}</div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">{t('metrics.graphicsPlaceholder', { tab: activeTab })}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

const MetricsPage: React.FC<{ activeView?: string }> = ({ activeView }) => {
  return (
    <FocusModeProvider viewId="metrics">
      <FocusModeOverlay>
        <MetricsPageInner activeView={activeView} />
      </FocusModeOverlay>
    </FocusModeProvider>
  );
};

export default MetricsPage;