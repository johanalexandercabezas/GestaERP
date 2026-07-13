import * as TooltipPrimitive from "@radix-ui/react-tooltip";

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  side?: "top" | "bottom" | "left" | "right";
}

export default function Tooltip({ children, content, side = "right" }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align="center"
            sideOffset={8}
            className="z-50 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-md shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-gray-900 dark:fill-gray-100" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}