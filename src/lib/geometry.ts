// Deterministic geometry for drawings rendered on the server and hydrated
// in the browser. Server and client must print identical coordinates, or
// React reports a hydration mismatch and redraws the figure.
//
// Arithmetic (+ - * /) is exact IEEE 754 everywhere, but its results can
// print with up to 17 significant digits, and Math.pow / ** and the
// transcendental functions may differ in the last digit between engines.
// So: compute with plain multiplication, never ** or Math.pow, and round
// every rendered coordinate with r2() (hundredths of a viewBox unit, far
// below a device pixel).
export const r2 = (n: number) => Math.round(n * 100) / 100;

// A point on a cubic Bézier, by plain multiplication (see above).
export const cubic = (p: readonly [number, number, number, number], t: number) => {
  const m = 1 - t;
  return r2(m * m * m * p[0] + 3 * m * m * t * p[1] + 3 * m * t * t * p[2] + t * t * t * p[3]);
};
