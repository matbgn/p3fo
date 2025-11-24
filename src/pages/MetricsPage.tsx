import React from "react";
import HighImpactTaskMetric from "@/components/HighImpactTaskMetric";
import FailureRateMetric from "@/components/FailureRateMetric";
import QualityOfLifeIndexMetric from "@/components/QualityOfLifeIndexMetric";
import NewCapabilitiesMetric from "@/components/NewCapabilitiesMetric";
import Forecast from "@/components/Forecast/Forecast";

import HourlyBalance from "@/components/HourlyBalance";

const MetricsPage: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState("forecast");

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
        <h2 className="text-xl font-semibold mb-4">Individual Metrics</h2>
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
              className={`px-4 py-2 font-medium ${activeTab === "tab3" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveTab("tab3")}
            >
              Tab 3
            </button>
          </div>

          {/* Graphics area */}
          <div className="flex-1 bg-muted/10 rounded-lg p-4 overflow-auto">
            {activeTab === "forecast" ? (
              <Forecast />
            ) : activeTab === "hourly-balance" ? (
              <HourlyBalance />
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