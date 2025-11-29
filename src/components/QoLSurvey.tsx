import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { usePersistence } from '@/hooks/usePersistence';

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

interface QoLSurveyProps {
    userId: string;
}

const QoLSurvey: React.FC<QoLSurveyProps> = ({ userId }) => {
    const [responses, setResponses] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const persistence = usePersistence();

    // Load saved responses on mount or when userId changes
    useEffect(() => {
        const loadResponses = async () => {
            setLoading(true);
            try {
                const savedResponses = await persistence.getQolSurveyResponse(userId);

                if (savedResponses && Object.keys(savedResponses).length > 0) {
                    setResponses(savedResponses as Record<string, string>);
                } else {
                    setResponses({});
                }
            } catch (error) {
                console.error("Error loading QoL survey responses:", error);
            } finally {
                setLoading(false);
            }
        };

        if (userId) {
            loadResponses();
        }
    }, [userId, persistence]);

    const handleResponseChange = (question: string, value: string) => {
        setResponses((prev) => ({ ...prev, [question]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            await persistence.saveQolSurveyResponse(userId, responses);
            alert("Survey responses saved!");
            // Trigger a storage event to update other components if needed (though persistence hook might handle this differently depending on implementation)
            window.dispatchEvent(new Event('storage'));
        } catch (error) {
            console.error("Failed to save survey responses to persistence:", error);
            alert("Error: Could not save survey responses.");
        }
    };

    if (loading) {
        return (
            <div className="py-8">
                <div className="text-center">Loading survey...</div>
            </div>
        );
    }

    return (
        <div className="py-4">
            <h2 className="text-xl font-semibold mb-2">Quality of Life Effectiveness Survey</h2>
            <p className="text-muted-foreground mb-6">
                Rate your satisfaction with the items below
            </p>

            <form onSubmit={handleSubmit}>
                <div className="border rounded-lg overflow-x-auto">
                    <div className="min-w-[700px]">
                        <div className="grid grid-cols-[2fr_repeat(6,1fr)] bg-muted/50 font-semibold items-center">
                            <div className="p-3">Question</div>
                            {satisfactionLevels.map((level) => (
                                <div key={level} className="p-3 text-center text-sm">{level}</div>
                            ))}
                        </div>
                        {surveyQuestions.map((question, qIndex) => (
                            <div key={question} className={`grid grid-cols-[2fr_repeat(6,1fr)] items-center ${qIndex > 0 ? 'border-t' : ''}`}>
                                <h3 className="text-sm font-normal p-3">{question}</h3>
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
                <div className="flex gap-4 mt-8">
                    <Button type="submit">Submit Responses</Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={async () => {
                            if (window.confirm("Are you sure you want to clear your survey responses?")) {
                                try {
                                    await persistence.saveQolSurveyResponse(userId, {});
                                    setResponses({});
                                    alert("Survey responses cleared!");
                                    window.dispatchEvent(new Event('storage'));
                                } catch (error) {
                                    console.error("Failed to clear survey responses:", error);
                                    alert("Error: Could not clear survey responses.");
                                }
                            }
                        }}
                    >
                        Clear Survey
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default QoLSurvey;
