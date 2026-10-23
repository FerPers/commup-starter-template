import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

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
			// G-12: accesibilidad. El plugin ya lo registra eslint-config-next; aquí solo se encienden sus reglas.
			...jsxA11y.flatConfigs.recommended.rules,
			// G-12 (fuera de recommended): la regla nueva no ve los <label>{t('…')}</label> sueltos; esta (vieja) sí: label que envuelve su campo o con htmlFor.
			"jsx-a11y/label-has-for": ["error", { required: { some: ["nesting", "id"] }, allowChildren: false }],
			// Los diálogos enfocan su primer campo a propósito (AskDialog, motivo, búsqueda).
			"jsx-a11y/no-autofocus": "off",
			// G-12 (fuera de recommended): nombre para botones de ícono y encabezados vacíos; <option value> de un <datalist> y <td> vacíos no lo necesitan.
			"jsx-a11y/control-has-associated-label": ["error", {
				...jsxA11y.flatConfigs.recommended.rules["jsx-a11y/control-has-associated-label"][1],
				ignoreElements: [...jsxA11y.flatConfigs.recommended.rules["jsx-a11y/control-has-associated-label"][1].ignoreElements, "option", "td"],
			}],
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
