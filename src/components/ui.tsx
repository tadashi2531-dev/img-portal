import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

export function HazardStripe() {
  return <div className="hazard" aria-hidden="true" />;
}

export function Banner({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

type TextProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  inputMode?: "text" | "decimal" | "email" | "numeric";
  list?: string;
  autoComplete?: string;
  placeholder?: string;
  name?: string;
  readOnly?: boolean;
};

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  required,
  inputMode,
  list,
  autoComplete,
  placeholder,
  name,
  readOnly,
}: TextProps) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {required ? <span className="req"> *</span> : null}
      </span>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        required={required}
        inputMode={inputMode}
        list={list}
        autoComplete={autoComplete}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <textarea id={id} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: SelectHTMLAttributes<HTMLSelectElement>["children"];
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}
