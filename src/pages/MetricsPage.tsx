import React from "react";
import HighImpactTaskMetric from "@/components/HighImpactTaskMetric";
import FailureRateMetric from "@/components/FailureRateMetric";
import QualityOfLifeIndexMetric from "@/components/QualityOfLifeIndexMetric";
import NewCapabilitiesMetric from "@/components/NewCapabilitiesMetric";

const MetricsPage: React.FC = () => {
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
            <button className="px-4 py-2 font-medium border-b-2 border-primary text-primary">
              Tab 1
            </button>
            <button className="px-4 py-2 font-medium text-muted-foreground hover:text-foreground">
              Tab 2
            </button>
            <button className="px-4 py-2 font-medium text-muted-foreground hover:text-foreground">
              Tab 3
            </button>
          </div>
          
          {/* Graphics area */}
          <div className="flex-1 flex items-center justify-center bg-muted rounded-lg">
            <p className="text-muted-foreground">Graphics content will appear here</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default MetricsPage;