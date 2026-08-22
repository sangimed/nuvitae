import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";

function classes(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly loading?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  className,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={classes(
        "community-button",
        `community-button-${variant}`,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="community-spinner" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly variant?: Exclude<ButtonVariant, "danger">;
}

export function ButtonLink({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      {...props}
      className={classes(
        "community-button",
        `community-button-${variant}`,
        className,
      )}
    >
      {children}
    </a>
  );
}

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  readonly tone?: "default" | "subtle";
}

export function Panel({
  tone = "default",
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <section
      {...props}
      className={classes(
        "community-panel",
        `community-panel-${tone}`,
        className,
      )}
    >
      {children}
    </section>
  );
}

export type AlertTone = "info" | "warning" | "success" | "error";

const alertLabels: Record<AlertTone, string> = {
  info: "Information",
  warning: "Warning",
  success: "Success",
  error: "Error",
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  readonly tone?: AlertTone;
  readonly title?: string;
}

export function Alert({
  tone = "info",
  title,
  className,
  children,
  ...props
}: AlertProps) {
  const liveRole = tone === "error" ? "alert" : "status";
  return (
    <div
      {...props}
      className={classes(
        "community-alert",
        `community-alert-${tone}`,
        className,
      )}
      role={props.role ?? liveRole}
    >
      <span className="community-alert-marker" aria-hidden="true" />
      <div>
        <strong>{title ?? alertLabels[tone]}</strong>
        <div className="community-alert-content">{children}</div>
      </div>
    </div>
  );
}

export type StatusTone = "loading" | "empty" | "success" | "error";

const statusLabels: Record<StatusTone, string> = {
  loading: "Loading",
  empty: "Nothing here yet",
  success: "Complete",
  error: "Something went wrong",
};

export interface StatusStateProps extends HTMLAttributes<HTMLDivElement> {
  readonly tone: StatusTone;
  readonly title?: string;
  readonly action?: ReactNode;
}

export function StatusState({
  tone,
  title,
  action,
  className,
  children,
  ...props
}: StatusStateProps) {
  return (
    <div
      {...props}
      className={classes(
        "community-status",
        `community-status-${tone}`,
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
      aria-busy={tone === "loading" || undefined}
    >
      {tone === "loading" ? (
        <span className="community-spinner" aria-hidden="true" />
      ) : (
        <span className="community-status-marker" aria-hidden="true" />
      )}
      <div>
        <strong>{title ?? statusLabels[tone]}</strong>
        {children === undefined ? null : (
          <div className="community-status-content">{children}</div>
        )}
        {action === undefined ? null : (
          <div className="community-status-action">{action}</div>
        )}
      </div>
    </div>
  );
}

export interface ProgressStep {
  readonly label: string;
  readonly status: "complete" | "current" | "upcoming";
}

export interface ProgressStepsProps extends Omit<
  HTMLAttributes<HTMLOListElement>,
  "children"
> {
  readonly steps: readonly ProgressStep[];
  readonly label?: string;
}

export function ProgressSteps({
  steps,
  label = "Progress",
  className,
  ...props
}: ProgressStepsProps) {
  return (
    <ol
      {...props}
      className={classes("community-progress", className)}
      aria-label={label}
    >
      {steps.map((step, index) => (
        <li
          className={`community-progress-${step.status}`}
          key={`${index}-${step.label}`}
          aria-current={step.status === "current" ? "step" : undefined}
        >
          <span className="community-progress-number" aria-hidden="true">
            {step.status === "complete" ? "✓" : index + 1}
          </span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
