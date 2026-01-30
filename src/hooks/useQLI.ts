import * as React from "react";
import { usePersistence } from "@/hooks/usePersistence";

// Type for the QLI data
export type QLIData = {
  score: number;
  details: {
    totalResponses: number;
    favorableResponses: number;
    validResponses: number;
    rawScore: number;
  };
};

export function useQLI() {
  const [data, setData] = React.useState<QLIData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const persistence = usePersistence();

  React.useEffect(() => {
    const calculateQLI = async () => {
      try {
        setLoading(true);
        const allResponses = await persistence.getAllQolSurveyResponses();

        if (Object.keys(allResponses).length === 0) {
          // No responses yet, return null data without error
          setData(null);
          setLoading(false);
          return;
        }

        const favorableScores = ["Satisfied", "Very satisfied"];
        let totalFavorableCount = 0;
        let totalValidResponseCount = 0;

        // Iterate through each user's responses
        for (const userResponses of Object.values(allResponses)) {
          if (!userResponses) continue;

          // Iterate through answers in a user's response
          for (const answer of Object.values(userResponses)) {
            if (answer && answer !== "No answer") {
              totalValidResponseCount++;
              if (favorableScores.includes(answer as string)) {
                totalFavorableCount++;
              }
            }
          }
        }

        if (totalValidResponseCount === 0) {
          // No valid answers found across all users
          setData(null);
          setLoading(false);
          return;
        }

        const rawScore = (totalFavorableCount / totalValidResponseCount) * 100;
        const roundedScore = Math.round(rawScore);

        const qliData: QLIData = {
          score: roundedScore,
          details: {
            totalResponses: Object.keys(allResponses).length, // Number of users who responded
            favorableResponses: totalFavorableCount,
            validResponses: totalValidResponseCount,
            rawScore: rawScore
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
  }, [persistence]);

  return { data, loading, error };
}