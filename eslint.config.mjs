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
	{
		// G-18 también en lo que las reglas de pantalla (G-10/G-11) dejan fuera: PDF, Excel, landing e impresos.
		files: [
			"src/components/landing/**",
			"src/lib/pdf/**",
			"src/lib/excel/**",
			"src/**/ReportPrint.tsx",
			"src/**/BackupDocumentView.tsx",
		],
		ignores: ["src/**/*.test.{ts,tsx}"],
		rules: {
			"no-restricted-syntax": [
				"error",
				// G-18: tipos de la BD por el cliente tipado; Json → fromJson, NULL en argumentos SQL → sqlArg (@/lib/supabase/casts).
				{
					selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
					message: "Sin `as unknown as` (G-18): la fila se tipa con SupabaseClient<Database>; un jsonb con fromJson<T>(), un NULL de argumento SQL con sqlArg<T>(). Si de verdad no hay otra, eslint-disable con la razón.",
				},
			],
		},
	},
	{
		// G-11: piso de 12 px en todo lo que se ve en pantalla. El bloque G-10 de abajo repite estas
		// reglas (en flat config la última configuración de una regla reemplaza a la anterior).
		files: ["src/**/*.{ts,tsx}"],
		ignores: [
			"src/components/landing/**",
			"src/lib/pdf/**",
			"src/lib/excel/**",
			"src/**/*.test.{ts,tsx}",
			// Documentos para imprimir.
			"src/**/ReportPrint.tsx",
			"src/**/BackupDocumentView.tsx",
		],
		rules: {
			"no-restricted-syntax": [
				"error",
				// G-18: tipos de la BD por el cliente tipado; Json → fromJson, NULL en argumentos SQL → sqlArg (@/lib/supabase/casts).
				{
					selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
					message: "Sin `as unknown as` (G-18): la fila se tipa con SupabaseClient<Database>; un jsonb con fromJson<T>(), un NULL de argumento SQL con sqlArg<T>(). Si de verdad no hay otra, eslint-disable con la razón.",
				},
				// G-11: piso de 12 px para el texto en pantalla.
				{
					selector: "Property[key.name='fontSize'] > Literal[value<12], Property[key.name='fontSize'] > ConditionalExpression > Literal[value<12]",
					message: "Texto de 12 px como mínimo (G-11).",
				},
				{
					selector: "Property[key.name='fontSize'] > Literal[value=/^(?:[0-9]|1[01])(?:\\.[0-9]+)?px$/], Property[key.name='fontSize'] > ConditionalExpression > Literal[value=/^(?:[0-9]|1[01])(?:\\.[0-9]+)?px$/]",
					message: "Texto de 12 px como mínimo (G-11).",
				},
			],
		},
	},
	{
		// G-10: colores por token (var(--danger-700)…), no hex: así responden a oscuro y contraste.
		// Blanco (#fff) sobre un relleno y negro (#000) sí valen. Para alfa, alpha(color, %) de @/lib/theme.
		files: ["src/**/*.{ts,tsx}"],
		ignores: [
			"src/components/landing/**",
			"src/lib/pdf/**",
			"src/lib/excel/**",
			"src/app/api/**",
			"src/app/{page,layout,not-found}.tsx",
			"src/app/{guia,verify,privacy,terms}/**",
			"src/app/(auth)/**",
			"src/app/(access)/**",
			"src/app/(setup)/**",
			// Datos (colores de disciplina que se guardan en la BD o salen por la API), no estilos.
			"src/lib/constants/templates-backup.ts",
			"src/app/actions/**",
			"src/**/*.test.{ts,tsx}",
			// Documentos para imprimir: papel blanco en cualquier tema.
			"src/**/ReportPrint.tsx",
			"src/**/BackupDocumentView.tsx",
		],
		rules: {
			"no-restricted-syntax": [
				"error",
				// G-18: tipos de la BD por el cliente tipado; Json → fromJson, NULL en argumentos SQL → sqlArg (@/lib/supabase/casts).
				{
					selector: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
					message: "Sin `as unknown as` (G-18): la fila se tipa con SupabaseClient<Database>; un jsonb con fromJson<T>(), un NULL de argumento SQL con sqlArg<T>(). Si de verdad no hay otra, eslint-disable con la razón.",
				},
				// G-11: piso de 12 px para el texto en pantalla.
				{
					selector: "Property[key.name='fontSize'] > Literal[value<12], Property[key.name='fontSize'] > ConditionalExpression > Literal[value<12]",
					message: "Texto de 12 px como mínimo (G-11).",
				},
				{
					selector: "Property[key.name='fontSize'] > Literal[value=/^(?:[0-9]|1[01])(?:\\.[0-9]+)?px$/], Property[key.name='fontSize'] > ConditionalExpression > Literal[value=/^(?:[0-9]|1[01])(?:\\.[0-9]+)?px$/]",
					message: "Texto de 12 px como mínimo (G-11).",
				},
				{
					selector: "Property[key.name=/^(color|background|backgroundColor|bg|fg|text|border|borderColor|borderTop|borderBottom|borderLeft|borderRight|outline)$/] Literal[value=/#(?!(?:[fF]{3}|0{3}|[fF]{6}|0{6})(?![0-9a-fA-F]))[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])/]",
					message: "Color por token de escala (var(--danger-700)…) o semántico (var(--text-muted)…), no hex (G-10).",
				},
				{
					selector: "Property[key.name=/^(color|background|backgroundColor|bg|fg|text|border|borderColor|borderTop|borderBottom|borderLeft|borderRight|outline)$/] TemplateElement[value.raw=/#(?!(?:[fF]{3}|0{3}|[fF]{6}|0{6})(?![0-9a-fA-F]))[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])/]",
					message: "Color por token de escala (var(--danger-700)…) o semántico (var(--text-muted)…), no hex (G-10).",
				},
				{
					selector: "TemplateLiteral > TemplateElement:not(:first-child)[value.raw=/^[0-9a-fA-F]{2}(?![0-9a-zA-Z%.])/]",
					message: "Alfa con alpha(color, %) de @/lib/theme: pegarle «NN» a un token var(--…) no es CSS válido (G-10).",
				},
				{
					selector: "BinaryExpression[operator='+'][right.type='Literal'][right.value=/^[0-9a-fA-F]{2}$/]",
					message: "Alfa con alpha(color, %) de @/lib/theme: pegarle «NN» a un token var(--…) no es CSS válido (G-10).",
				},
			],
		},
	},
];

export default eslintConfig;
