// A numeric input with a persistent "$" prefix, since a bare number field
// for a cost is easy to misread as something else entirely.
export default function CurrencyInput({
  value,
  onChange,
  placeholder = "0.00",
  required,
  compact = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span
        className={`absolute left-2 top-1/2 -translate-y-1/2 text-mist pointer-events-none ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        $
      </span>
      <input
        type="number"
        step="0.01"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          compact
            ? "w-full pl-5 pr-2 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
            : "w-full pl-6 pr-3 py-2 border-[1.5px] border-rule rounded-lg text-sm outline-none focus:border-green-mid focus:ring-2 focus:ring-green-mid/10"
        }
      />
    </div>
  );
}
