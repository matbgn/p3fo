import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { usePersistence } from '@/hooks/usePersistence';

// Stable internal keys (also used as response storage keys) — keep English so existing
// saved responses remain valid across locales.
const surveyQuestionKeys = [
    "documentation",
    "deepWork",
    "automation",
    "changeConfidence",
    "incidentResponses",
    "localTools",
    "planning",
    "crossTeam",
    "easeOfDelivery",
    "maintainability",
] as const;

// Stable internal keys for satisfaction levels (radio values, stored in responses).
const satisfactionLevelKeys = [
    "noAnswer",
    "veryDissatisfied",
    "dissatisfied",
    "neutral",
    "satisfied",
    "verySatisfied",
] as const;

interface QoLSurveyProps {
    userId: string;
}

const QoLSurvey: React.FC<QoLSurveyProps> = ({ userId }) => {
    const { t } = useTranslation();
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

    const handleResponseChange = (questionKey: string, value: string) => {
        setResponses((prev) => ({ ...prev, [questionKey]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            await persistence.saveQolSurveyResponse(userId, responses);
            alert(t("metrics.qolSurvey.saved"));
            // Trigger a storage event to update other components if needed (though persistence hook might handle this differently depending on implementation)
            window.dispatchEvent(new Event('storage'));
        } catch (error) {
            console.error("Failed to save survey responses to persistence:", error);
            alert(t("metrics.qolSurvey.saveError"));
        }
    };

    if (loading) {
        return (
            <div className="py-8">
                <div className="text-center">{t("metrics.qolSurvey.loading")}</div>
            </div>
        );
    }

    return (
        <div className="py-4">
            <h2 className="text-xl font-semibold mb-2">{t("metrics.qolSurvey.title")}</h2>
            <p className="text-muted-foreground mb-6">
                {t("metrics.qolSurvey.description")}
            </p>

            <form onSubmit={handleSubmit}>
                <div className="border rounded-lg overflow-x-auto">
                    <div className="min-w-[700px]">
                        <div className="grid grid-cols-[2fr_repeat(6,1fr)] bg-muted/50 font-semibold items-center">
                            <div className="p-3">{t("metrics.qolSurvey.column.question")}</div>
                            {satisfactionLevelKeys.map((levelKey) => (
                                <div key={levelKey} className="p-3 text-center text-sm">{t(`metrics.qolSurvey.level.${levelKey}`)}</div>
                            ))}
                        </div>
                        {surveyQuestionKeys.map((qKey, qIndex) => (
                            <div key={qKey} className={`grid grid-cols-[2fr_repeat(6,1fr)] items-center ${qIndex > 0 ? 'border-t' : ''}`}>
                                <h3 className="text-sm font-normal p-3">{t(`metrics.qolSurvey.question.${qKey}`)}</h3>
                                <RadioGroup
                                    value={responses[qKey] || ""}
                                    onValueChange={(value) => handleResponseChange(qKey, value)}
                                    className="col-span-6 grid grid-cols-6"
                                >
                                    {satisfactionLevelKeys.map((levelKey) => (
                                        <div key={levelKey} className="flex justify-center items-center p-3">
                                            <RadioGroupItem value={levelKey} id={`${qKey}-${levelKey}`} />
                                        </div>
                                    ))}
                                </RadioGroup>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex gap-4 mt-8">
                    <Button type="submit">{t("metrics.qolSurvey.submit")}</Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={async () => {
                            if (window.confirm(t("metrics.qolSurvey.clearConfirm"))) {
                                try {
                                    await persistence.saveQolSurveyResponse(userId, {});
                                    setResponses({});
                                    alert(t("metrics.qolSurvey.cleared"));
                                    window.dispatchEvent(new Event('storage'));
                                } catch (error) {
                                    console.error("Failed to clear survey responses:", error);
                                    alert(t("metrics.qolSurvey.clearError"));
                                }
                            }
                        }}
                    >
                        {t("metrics.qolSurvey.clear")}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export default QoLSurvey;
