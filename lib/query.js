// Helpers for validating query-string params. Each returns { value } (value is
// undefined when the param is absent) or { error: "<message>" }.

// A non-negative integer within [min, max] (max optional).
export function parsePageParam(raw, name, { min, max }) {
  if (raw === undefined) return { value: undefined };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || (max !== undefined && n > max)) {
    const range = max !== undefined ? `between ${min} and ${max}` : `>= ${min}`;
    return { error: `${name} must be an integer ${range}` };
  }
  return { value: n };
}

// One of an allowed set of string values.
export function parseEnumParam(raw, name, allowed) {
  if (raw === undefined) return { value: undefined };
  if (!allowed.includes(raw)) {
    return { error: `${name} must be one of: ${allowed.join(", ")}` };
  }
  return { value: raw };
}
