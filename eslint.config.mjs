import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
	...nextCoreWebVitals,
	...nextTypescript,
	{
		ignores: [
			".next/**",
			".open-next/**",
			"node_modules/**",
			"audit-package/**",
			".agents/**",
			"supabase/functions/**",
			"public/**/*.min.js",
			"public/**/*.min.mjs",
			"public/**/*.min.css",
		],
	},
];

export default eslintConfig;
