"use client";

import * as React from "react";
import { Icon } from "@/components/common/icon";
import { cn } from "@/lib/utils";

export interface StepperStep {
  id: number;
  label: string;
  description?: string;
}

export function Stepper({
  steps,
  currentStep,
  completedSteps = [],
  onSelectStep,
  className,
}: {
  steps: readonly StepperStep[];
  currentStep: number;
  completedSteps?: readonly number[];
  onSelectStep?: (stepId: number) => void;
  className?: string;
}) {
  return (
    <ol
      aria-label="Étapes de configuration"
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6", className)}
    >
      {steps.map((step) => {
        const isCurrent = step.id === currentStep;
        const isCompleted = completedSteps.includes(step.id) || step.id < currentStep;
        return (
          <StepperItem
            key={step.id}
            step={step}
            isCurrent={isCurrent}
            isCompleted={isCompleted}
            onSelect={onSelectStep ? () => onSelectStep(step.id) : undefined}
          />
        );
      })}
    </ol>
  );
}

export function StepperItem({
  step,
  isCurrent,
  isCompleted,
  onSelect,
}: {
  step: StepperStep;
  isCurrent: boolean;
  isCompleted: boolean;
  onSelect?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={!onSelect}
        aria-current={isCurrent ? "step" : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-section border px-3 py-2.5 text-start transition-colors",
          isCurrent
            ? "border-foreground bg-background text-foreground shadow-xs"
            : isCompleted
              ? "border-separator bg-background/80 text-foreground hover:bg-background"
              : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted",
        )}
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-footnote font-semibold tabular-nums",
            isCurrent
              ? "bg-foreground text-background"
              : isCompleted
                ? "bg-positive/15 text-positive"
                : "bg-background text-muted-foreground",
          )}
        >
          {isCompleted && !isCurrent ? <Icon name="check" className="size-3.5" /> : step.id}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-subhead font-medium">{step.label}</span>
          {step.description ? (
            <span className="block truncate text-caption text-muted-foreground">{step.description}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
