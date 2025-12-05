import React from 'react';
import { Slider } from "@/components/ui/slider";
import { useView } from "@/hooks/useView";
import { COMPACTNESS_ULTRA, COMPACTNESS_COMPACT, COMPACTNESS_FULL } from "@/context/ViewContextDefinition";
import { Layers, Maximize2, Minimize2 } from "lucide-react";

export const CompactnessSelector: React.FC = () => {
    const { cardCompactness, setCardCompactness } = useView();

    const handleChange = (value: number[]) => {
        setCardCompactness(value[0]);
    };

    return (
        <div className="flex items-center gap-2 w-32">
            <Minimize2 className={`h-4 w-4 ${cardCompactness === COMPACTNESS_ULTRA ? "text-primary" : "text-muted-foreground"}`} />
            <Slider
                defaultValue={[COMPACTNESS_FULL]}
                value={[cardCompactness]}
                min={0}
                max={2}
                step={1}
                onValueChange={handleChange}
                className="flex-1"
            />
            <Maximize2 className={`h-4 w-4 ${cardCompactness === COMPACTNESS_FULL ? "text-primary" : "text-muted-foreground"}`} />
        </div>
    );
};
