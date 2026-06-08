// Tiny schema-driven body validator (no dependencies).
//
// A schema maps field names to rules:
//   { type: "string" | "integer",
//     required?: bool,
//     default?: any,        // used when the field is absent (optional fields only)
//     trim?: bool,          // strings only, defaults to true
//     minLength?, maxLength?,  // strings
//     min?, max? }             // integers
//
// On success, req.body is replaced with a cleaned object containing only the
// declared fields (absent optional fields are omitted unless they have a
// default), so downstream partial-update logic keeps working. On failure it
// responds 400 with { error }.

function fail(res, message) {
  return res.status(400).json({ error: message });
}

function validateString(field, value, rules, res) {
  if (typeof value !== "string") {
    return { error: fail(res, `${field} must be a string`) };
  }
  const clean = rules.trim === false ? value : value.trim();
  if (rules.required && clean.length === 0) {
    return { error: fail(res, `${field} is required`) };
  }
  if (rules.minLength != null && clean.length < rules.minLength) {
    return { error: fail(res, `${field} must be at least ${rules.minLength} character(s)`) };
  }
  if (rules.maxLength != null && clean.length > rules.maxLength) {
    return { error: fail(res, `${field} must be at most ${rules.maxLength} character(s)`) };
  }
  return { value: clean };
}

function validateInteger(field, raw, rules, res) {
  let value = raw;
  // Accept numeric strings (e.g. from form inputs) and coerce them.
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isInteger(n)) value = n;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { error: fail(res, `${field} must be an integer`) };
  }
  if (rules.min != null && value < rules.min) {
    return { error: fail(res, `${field} must be >= ${rules.min}`) };
  }
  if (rules.max != null && value > rules.max) {
    return { error: fail(res, `${field} must be <= ${rules.max}`) };
  }
  return { value };
}

export function validateBody(schema) {
  return (req, res, next) => {
    const input = req.body ?? {};
    if (typeof input !== "object" || Array.isArray(input)) {
      return fail(res, "Request body must be a JSON object");
    }

    const cleaned = {};
    for (const [field, rules] of Object.entries(schema)) {
      const value = input[field];
      const present = value !== undefined && value !== null;

      if (!present) {
        if (rules.required) return fail(res, `${field} is required`);
        if ("default" in rules) cleaned[field] = rules.default;
        continue;
      }

      const result =
        rules.type === "integer"
          ? validateInteger(field, value, rules, res)
          : validateString(field, value, rules, res);

      if (result.error) return result.error; // response already sent
      cleaned[field] = result.value;
    }

    req.body = cleaned;
    next();
  };
}
