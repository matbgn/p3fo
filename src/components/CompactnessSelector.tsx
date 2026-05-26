import React from 'react';
import { Slider } from "@/components/ui/slider";
import { useViewDisplay } from "@/hooks/useView";
import { COMPACTNESS_ULTRA, COMPACTNESS_COMPACT, COMPACTNESS_FULL } from "@/context/ViewContextDefinition";

export const CompactnessSelector: React.FC = () => {
    const { cardCompactness, setCardCompactness } = useViewDisplay();

    const handleChange = (value: number[]) => {
        setCardCompactness(value[0]);
    };

    return (
        <div className="flex items-center gap-2 w-28">
            <span className={`text-xs font-semibold ${cardCompactness === COMPACTNESS_ULTRA ? "text-primary" : "text-muted-foreground"}`}>SM</span>
            <Slider
                defaultValue={[COMPACTNESS_FULL]}
                value={[cardCompactness]}
                min={0}
                max={2}
                step={1}
                onValueChange={handleChange}
                className="flex-1"
            />
            <span className={`text-xs font-semibold ${cardCompactness === COMPACTNESS_FULL ? "text-primary" : "text-muted-foreground"}`}>XL</span>
        </div>
    );
};
