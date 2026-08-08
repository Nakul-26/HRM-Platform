import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("mb-1 block text-sm font-medium text-slate-700", className)} {...props} />
  ),
);
Label.displayName = "Label";
