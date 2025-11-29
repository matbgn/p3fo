import React from "react";
import HighImpactTaskMetric from "@/components/HighImpactTaskMetric";
import FailureRateMetric from "@/components/FailureRateMetric";
import QualityOfLifeIndexMetric from "@/components/QualityOfLifeIndexMetric";
import NewCapabilitiesMetric from "@/components/NewCapabilitiesMetric";
import Forecast from "@/components/Forecast/Forecast";
import HourlyBalance from "@/components/HourlyBalance";
import VacationsBalance from "@/components/VacationsBalance";
import QoLSurvey from "@/components/QoLSurvey";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import { useUsers } from "@/hooks/useUsers";
import { useUserSettings } from "@/hooks/useUserSettings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadFiltersFromSessionStorage, saveFiltersToSessionStorage } from "@/lib/filter-storage";
import { Filters } from "@/components/FilterControls";

const MetricsPage: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState("forecast");
  const { userId: currentUserId } = useCurrentUser();
  const { users } = useUsers();
  const { userSettings } = useUserSettings();

  const [selectedUserId, setSelectedUserId] = React.useState<string>("");

  // Load from storage on mount
  React.useEffect(() => {
    const load = async () => {
      const filters = await loadFiltersFromSessionStorage();
      if (filters?.selectedUserId) {
        setSelectedUserId(filters.selectedUserId);
      } else {
        // Default to current user if no filter is saved
        if (userSettings.username) {
          const currentUser = users.find(u => u.username === userSettings.username);
          if (currentUser) {
            setSelectedUserId(currentUser.userId);
          } else if (currentUserId) {
            setSelectedUserId(currentUserId);
          }
        }
      }
    };
    load();
  }, [userSettings, users, currentUserId]);

  const handleUserChange = async (newUserId: string) => {
    setSelectedUserId(newUserId);
    const currentFilters = await loadFiltersFromSessionStorage() || {
      showUrgent: false,
      showImpact: false,
      showMajorIncident: false,
      status: [],
      showDone: false,
      searchText: "",
      difficulty: [],
      category: []
    } as Filters;

    await saveFiltersToSessionStorage({
      ...currentFilters,
      selectedUserId: newUserId
    });
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Top pane for collaborative metrics cards */}
      <section className="flex-1 border rounded-lg p-6">
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