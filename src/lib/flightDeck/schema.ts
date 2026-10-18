// A small, dependency-free schema validator for the Flight Deck operations
// domain. Every server request and every store write is checked against a
// schema built from these parts (docs/flight-deck/architecture.md §4).
//
// Objects are strict: an unexpected key is an error, not silently dropped,
// so a form or a write cannot smuggle in a field (an upload, a story, an
// archive reference) the schema never declared.

export type Issue = { path: string; code: string };
export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export interface Schema<T> {
  parse(input: unknown, path?: string): Result<T>;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const bad = (path: string, code: string): Result<never> => ({ ok: false, issues: [{ path, code }] });

// Control characters other than tab/newline never belong in operational
// text; zero-width and bidi-override characters are stripped because they
// can disguise content in review screens.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]/g;

export function str(opts: { min?: number; max: number; pattern?: RegExp; multiline?: boolean; code?: string }): Schema<string> {
  return {
    parse(input, path = "") {
      if (typeof input !== "string") {
        return bad(path, "expected-string");
      }
      const value = input.replace(INVISIBLE, "").replace(/\r\n?/g, "\n").trim();
      if (CONTROL.test(value)) {
        return bad(path, "control-characters");
      }
      if (!opts.multiline && value.includes("\n")) {
        return bad(path, "single-line-only");
      }
      if (value.length < (opts.min ?? 0)) {
        return bad(path, value.length === 0 ? "required" : "too-short");
      }
      if (value.length > opts.max) {
        return bad(path, "too-long");
      }
      if (opts.pattern && !opts.pattern.test(value)) {
        return bad(path, opts.code ?? "invalid-format");
      }
      return ok(value);
    },
  };
}

export function oneOf<const V extends readonly string[]>(values: V): Schema<V[number]> {
  return {
    parse(input, path = "") {
      return typeof input === "string" && (values as readonly string[]).includes(input)
        ? ok(input as V[number])
        : bad(path, "not-allowed-value");
    },
  };
}

export const bool: Schema<boolean> = {
  parse(input, path = "") {
    return typeof input === "boolean" ? ok(input) : bad(path, "expected-boolean");
  },
};

export function literal<const V extends string | number | boolean>(expected: V): Schema<V> {
  return {
    parse(input, path = "") {
      return input === expected ? ok(expected) : bad(path, "unexpected-value");
    },
  };
}

export function int(opts: { min?: number; max?: number } = {}): Schema<number> {
  return {
    parse(input, path = "") {
      if (typeof input !== "number" || !Number.isInteger(input)) {
        return bad(path, "expected-integer");
      }
      if ((opts.min !== undefined && input < opts.min) || (opts.max !== undefined && input > opts.max)) {
        return bad(path, "out-of-range");
      }
      return ok(input);
    },
  };
}

// ISO-8601 instant as produced by Date#toISOString (always UTC, ms precision).
export const isoInstant: Schema<string> = {
  parse(input, path = "") {
    if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) || Number.isNaN(Date.parse(input))) {
      return bad(path, "expected-iso-instant");
    }
    return ok(input);
  },
};

// Calendar date (YYYY-MM-DD) for due dates and observed-on dates.
export const isoDate: Schema<string> = {
  parse(input, path = "") {
    if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(Date.parse(`${input}T00:00:00Z`))) {
      return bad(path, "expected-iso-date");
    }
    return ok(input);
  },
};

export const opaqueId = (prefix: string): Schema<string> => str({ min: 4, max: 64, pattern: new RegExp(`^${prefix}_[A-Za-z0-9]{8,48}$`), code: "invalid-id" });

export function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return {
    parse(input, path = "") {
      return input === null ? ok(null) : inner.parse(input, path);
    },
  };
}

// Like nullable(), but a missing key also reads as null: for fields added
// after rows were first written (e.g. settings stored by an earlier version).
export function nullish<T>(inner: Schema<T>): Schema<T | null> {
  return {
    parse(input, path = "") {
      return input === null || input === undefined ? ok(null) : inner.parse(input, path);
    },
  };
}

export function arrayOf<T>(inner: Schema<T>, opts: { max: number }): Schema<T[]> {
  return {
    parse(input, path = "") {
      if (!Array.isArray(input)) {
        return bad(path, "expected-array");
      }
      if (input.length > opts.max) {
        return bad(path, "too-many-items");
      }
      const out: T[] = [];
      const issues: Issue[] = [];
      input.forEach((item, i) => {
        const r = inner.parse(item, `${path}[${i}]`);
        if (r.ok) {
          out.push(r.value);
        } else {
          issues.push(...r.issues);
        }
      });
      return issues.length ? { ok: false, issues } : ok(out);
    },
  };
}

type Shape = Record<string, Schema<unknown>>;
type ObjectOf<S extends Shape> = { [K in keyof S]: Infer<S[K]> };

export function obj<S extends Shape>(shape: S): Schema<ObjectOf<S>> {
  return {
    parse(input, path = "") {
      if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return bad(path, "expected-object");
      }
      const record = input as Record<string, unknown>;
      const issues: Issue[] = [];
      for (const key of Object.keys(record)) {
        if (!(key in shape)) {
          issues.push({ path: path ? `${path}.${key}` : key, code: "unexpected-field" });
        }
      }
      const out: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(shape)) {
        const r = schema.parse(record[key], path ? `${path}.${key}` : key);
        if (r.ok) {
          out[key] = r.value;
        } else {
          issues.push(...r.issues);
        }
      }
      return issues.length ? { ok: false, issues } : ok(out as ObjectOf<S>);
    },
  };
}

export class ValidationError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`validation failed: ${issues.map((i) => `${i.path || "(root)"}:${i.code}`).join(", ")}`);
  }
}

export function must<T>(schema: Schema<T>, input: unknown): T {
  const r = schema.parse(input);
  if (!r.ok) {
    throw new ValidationError(r.issues);
  }
  return r.value;
}
