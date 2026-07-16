import * as React from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface HoverOrClickCardProps {
    children: React.ReactElement;
    content: React.ReactNode;
    contentClassName?: string;
    align?: "center" | "start" | "end";
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

export function HoverOrClickCard({
    children,
    content,
    contentClassName,
    align = "center",
    open,
    onOpenChange,
}: HoverOrClickCardProps) {
    const [supportsHover, setSupportsHover] = React.useState<boolean>(() => {
        if (typeof window === "undefined" || !window.matchMedia) return true;
        return window.matchMedia(HOVER_QUERY).matches;
    });

    React.useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mql = window.matchMedia(HOVER_QUERY);
        const onChange = () => setSupportsHover(mql.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, []);

    if (supportsHover) {
        return (
            <HoverCard open={open} onOpenChange={onOpenChange}>
                <HoverCardTrigger asChild>{children}</HoverCardTrigger>
                <HoverCardContent className={contentClassName} align={align}>
                    {content}
                </HoverCardContent>
            </HoverCard>
        );
    }

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
            <PopoverContent className={contentClassName} align={align}>
                {content}
            </PopoverContent>
        </Popover>
    );
}