import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // CDK synth output is generated, bundled JS — never hand-authored, never
  // meant to pass this project's lint rules. Flat config doesn't read
  // .gitignore automatically, so this needs its own entry.
  { ignores: ["infra/cdk.out/**"] },
  // staff-ui/ is intentionally plain, dependency-free browser script (no
  // build step, no ES modules — functions are shared across files via
  // global <script> tags on purpose) run outside the Next.js/TypeScript
  // project this config targets. eslint-config-next's TS-aware rules
  // (e.g. no-unused-vars on exports with no module linkage to trace)
  // don't apply to that kind of file.
  { ignores: ["staff-ui/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
