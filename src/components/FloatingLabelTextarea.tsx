import { useEffect, useRef } from 'react'
import './FloatingLabelInput.css'

interface FloatingLabelTextareaProps {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  className?: string
  rows?: number
  placeholder?: string
}

function FloatingLabelTextarea({ label, value, onChange, className = '', rows = 4, placeholder }: FloatingLabelTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.setAttribute('value', value)
    }
  }, [value])

  return (
    <div className="floating-input-container">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        className={className}
        rows={rows}
        placeholder={placeholder}
      />
      <div className="floating-label">
        <span className="floating-label-text">{label}</span>
      </div>
    </div>
  )
}

export default FloatingLabelTextarea
