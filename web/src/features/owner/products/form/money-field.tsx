import { formatRupiah, parseRupiah } from "@/shared/lib/money";
import { TextField, type TextFieldProps } from "./form-section";

/** Isian rupiah: papan angka, dan "3000" dirapikan jadi "Rp3.000" saat selesai diketik. */
export function MoneyField({
  onChange,
  value,
  ...rest
}: Omit<TextFieldProps, "inputMode" | "placeholder" | "onBlur">) {
  return (
    <TextField
      {...rest}
      value={value}
      onChange={onChange}
      inputMode="numeric"
      placeholder="Rp0"
      onBlur={() => {
        const n = parseRupiah(value);
        if (n !== null) onChange(formatRupiah(n));
      }}
    />
  );
}
