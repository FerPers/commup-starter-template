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
		],
	},
];

export default eslintConfig;
