import { useEffect, useRef } from "react";
import "./FloatingLabelInput.css";

interface FloatingLabelSelectProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
  children: React.ReactNode;
}

function FloatingLabelSelect({
  label,
  value,
  onChange,
  className = "",
  children,
}: FloatingLabelSelectProps) {
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (selectRef.current) {
      selectRef.current.setAttribute("value", String(value));
    }
  }, [value]);

  return (
    <div className="floating-input-container">
      <select
        ref={selectRef}
        value={value}
        onChange={onChange}
        className={className + " floating-input-field"}
      >
        {children}
      </select>
      <div className="floating-label">
        <span className="floating-label-text floating-label-text-always-float">
          {label}
        </span>
      </div>
    </div>
  );
}

export default FloatingLabelSelect;
