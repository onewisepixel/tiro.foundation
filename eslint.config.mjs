import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // CDK synth output is generated, bundled JS — never hand-authored, never
  // meant to pass this project's lint rules. Flat config doesn't read
  // .gitignore automatically, so this needs its own entry.
  { ignores: ["infra/cdk.out/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
