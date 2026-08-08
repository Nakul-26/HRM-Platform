import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

export const alertVariants = cva("rounded-md border p-3 text-sm", {
  variants: {
    variant: {
      info: "border-slate-200 bg-slate-50 text-slate-700",
      error: "border-red-200 bg-red-50 text-red-800",
      success: "border-green-200 bg-green-50 text-green-800",
    },
  },
  defaultVariants: { variant: "info" },
});

export interface AlertProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
