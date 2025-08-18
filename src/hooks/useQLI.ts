import * as React from "react";

// Type for the QLI data
export type QLIData = {
  score: number;
  details: {
    total_responses: number;
    favorable_responses: number;
    valid_responses: number;
    raw_score: number;
  };
};

export function useQLI() {
  const [data, setData] = React.useState<QLIData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const calculateQLI = () => {
      try {
        setLoading(true);
        const responses = JSON.parse(localStorage.getItem('qolSurveyResponse') || '{}');
        if (Object.keys(responses).length === 0) {
          throw new Error("No survey responses found.");
        }

        const favorableScores = ["Satisfied", "Very satisfied"];
        let favorableCount = 0;
        let validResponseCount = 0;

        for (const answer of Object.values(responses)) {
          if (answer && answer !== "No answer") {
            validResponseCount++;
            if (favorableScores.includes(answer as string)) {
              favorableCount++;
            }
          }
        }

        if (validResponseCount === 0) {
          throw new Error('No valid answers found in the survey responses.');
        }

        const rawScore = (favorableCount / validResponseCount) * 100;
        const roundedScore = Math.round(rawScore);

        const qliData: QLIData = {
          score: roundedScore,
          details: {
            total_responses: 1, // Since we now only have one set of responses
            favorable_responses: favorableCount,
            valid_responses: validResponseCount,
            raw_score: rawScore
          }
        };
        setData(qliData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to calculate Quality of Life Index data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    calculateQLI();
    
    const handleStorageChange = () => {
      calculateQLI();
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return { data, loading, error };
}