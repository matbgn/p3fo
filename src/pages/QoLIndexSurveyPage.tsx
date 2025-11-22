import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const surveyQuestions = [
  "Documentation & access to information",
  "Deep work/focus time",
  "Automation processes",
  "Change confidence (Impact & Effectiveness)",
  "Incident responses",
  "Local tools experience",
  "Planning processes",
  "Cross-team dependencies",
  "Ease of Delivery (difficulty to implement change)",
  "Maintainability of delivered assets",
];

const satisfactionLevels = [
  "No answer",
  "Very dissatisfied",
  "Dissatisfied",
  "Neutral",
  "Satisfied",
  "Very satisfied",
];

const QoLIndexSurveyPage: React.FC = () => {
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Load saved responses on mount
  useEffect(() => {
    const loadResponses = async () => {
      try {
        const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
        const adapter = await persistence;
        const savedResponses = await adapter.getQolSurveyResponse();

        if (savedResponses && Object.keys(savedResponses).length > 0) {
          setResponses(savedResponses as Record<string, string>);
        } else {
          // Fallback to localStorage for backward compatibility
          const legacyResponses = JSON.parse(localStorage.getItem('qolSurveyResponse') || '{}');
          if (Object.keys(legacyResponses).length > 0) {
            setResponses(legacyResponses);
            // Migrate to new persistence
            await adapter.saveQolSurveyResponse(legacyResponses);
          }
        }
      } catch (error) {
        console.error("Error loading QoL survey responses:", error);
        // Fallback to localStorage
        const legacyResponses = JSON.parse(localStorage.getItem('qolSurveyResponse') || '{}');
        if (Object.keys(legacyResponses).length > 0) {
          setResponses(legacyResponses);
        }
      } finally {
        setLoading(false);
      }
    };

    loadResponses();
  }, []);

  const handleResponseChange = (question: string, value: string) => {
    setResponses((prev) => ({ ...prev, [question]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const persistence = await import('@/lib/persistence-factory').then(m => m.getPersistenceAdapter());
      const adapter = await persistence;
      await adapter.saveQolSurveyResponse(responses);
      alert("Survey responses saved!");
    } catch (error) {
      console.error("Failed to save survey responses to persistence:", error);
      // Fallback to localStorage
      try {
        localStorage.setItem('qolSurveyResponse', JSON.stringify(responses));
        alert("Survey responses saved (fallback to localStorage)!");
      } catch (e) {
        console.error("Failed to save survey responses to localStorage:", e);
        alert("Error: Could not save survey responses.");
      }
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading survey...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-2">Quality of Life Effectiveness Survey</h1>
      <p className="text-muted-foreground mb-8">
        Rate your satisfaction with the items below
      </p>

      <form onSubmit={handleSubmit}>
        <div className="border rounded-lg overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[2fr_repeat(6,1fr)] bg-muted/50 font-semibold items-center">
              <div className="p-3">Question</div>
              {satisfactionLevels.map((level) => (
                <div key={level} className="p-3 text-center">{level}</div>
              ))}
            </div>
            {surveyQuestions.map((question, qIndex) => (
              <div key={question} className={`grid grid-cols-[2fr_repeat(6,1fr)] items-center ${qIndex > 0 ? 'border-t' : ''}`}>
                <h2 className="text-base font-normal p-3">{question}</h2>
                <RadioGroup
                  value={responses[question] || ""}
                  onValueChange={(value) => handleResponseChange(question, value)}
                  className="col-span-6 grid grid-cols-6"
                >
                  {satisfactionLevels.map((level) => (
                    <div key={level} className="flex justify-center items-center p-3">
                      <RadioGroupItem value={level} id={`${question}-${level}`} />
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}
          </div>
        </div>
        <Button type="submit" className="mt-8">Submit Responses</Button>
      </form>
    </div>
  );
};

export default QoLIndexSurveyPage;