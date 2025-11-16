import { useEffect, useRef } from "react";
import "./FloatingLabelInput.css";

interface FloatingLabelInputProps {
  label: string;
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  placeholder?: string;
}

function FloatingLabelInput({
  label,
  type = "text",
  value,
  onChange,
  className = "",
  placeholder,
}: FloatingLabelInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute("value", String(value));
    }
  }, [value]);

  const shouldFloatLabel = type === "date";

  return (
    <div className="floating-input-container">
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={onChange}
        className={className + " floating-input-field"}
        placeholder={placeholder}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="floating-label">
        <span
          className={`floating-label-text ${
            shouldFloatLabel ? "floating-label-text-always-float" : ""
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

export default FloatingLabelInput;
