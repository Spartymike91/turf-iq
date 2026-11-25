import Link from "next/link";

export default function AgreeCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-xs text-mist">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} required className="mt-0.5" />
      <span>
        I agree to the{" "}
        <Link href="/terms" target="_blank" className="text-green-mid font-semibold hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="text-green-mid font-semibold hover:underline">
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}
