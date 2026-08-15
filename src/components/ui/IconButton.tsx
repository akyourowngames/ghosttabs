import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const IconButton = React.forwardRef<
  HTMLButtonElement,
  IconButtonProps
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
      className
    )}
    {...props}
  />
));
IconButton.displayName = "IconButton";
