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
			".claude/**",
			"supabase/functions/**",
			"src/pwa/sw.ts",
			"public/**/*.min.js",
			"public/**/*.min.mjs",
			"public/**/*.min.css",
			"env.d.ts",
		],
	},
	{
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					destructuredArrayIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{ prefer: "type-imports", fixStyle: "inline-type-imports" },
			],
		},
	},
	{
		files: ["src/**/*.{ts,tsx}"],
		languageOptions: {
			parserOptions: {
				project: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-floating-promises": [
				"error",
				{ ignoreVoid: true },
			],
			"@typescript-eslint/prefer-nullish-coalescing": "error",
			// G-08: diálogos propios (useAskDialog / useToast), nunca los nativos del navegador.
			"no-restricted-globals": [
				"error",
				{ name: "confirm", message: "Usar useAskDialog().confirm (G-08)." },
				{ name: "prompt", message: "Usar useAskDialog().ask con input (G-08)." },
				{ name: "alert", message: "Usar useToast() o un aviso en la página (G-08)." },
			],
			"no-restricted-properties": [
				"error",
				{ object: "window", property: "confirm", message: "Usar useAskDialog().confirm (G-08)." },
				{ object: "window", property: "prompt", message: "Usar useAskDialog().ask con input (G-08)." },
				{ object: "window", property: "alert", message: "Usar useToast() o un aviso en la página (G-08)." },
			],
		},
	},
];

export default eslintConfig;
