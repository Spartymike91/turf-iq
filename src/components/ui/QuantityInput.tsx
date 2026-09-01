// A quantity input that always shows its unit as a persistent suffix
// (e.g. "gal"), sourced from the product's own Inventory record — a plain
// placeholder disappears the moment you start typing, which is exactly
// what made it easy to enter a quantity in the wrong unit.
export default function QuantityInput({
  value,
  onChange,
  unit,
  title,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  unit: string;
  title?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Qty used"
        title={title}
        className="w-full pl-2 pr-12 py-1.5 border-[1.5px] border-rule rounded text-xs outline-none focus:border-green-mid"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-mist pointer-events-none">
        {unit}
      </span>
    </div>
  );
}
