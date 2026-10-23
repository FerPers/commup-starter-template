import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// ── Cabeceras de seguridad (Sprint S, 2026-09-03) ───────────────────────────
// Sin middleware/proxy (incompatible con OpenNext) no hay nonces por request,
// por eso script-src lleva 'unsafe-inline' (Next hidrata con scripts inline).
// En dev Next necesita 'unsafe-eval' (HMR / overlay).
const isDev = process.env.NODE_ENV !== 'production';

const supabaseUrl = (() => {
	try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''); } catch { return null; }
})();
const supabaseHost = supabaseUrl?.host ?? '';
// G-17: Supabase local (`supabase start`, pruebas E2E) va por http; solo entonces se permite http/ws y no se
// fuerza https (upgrade-insecure-requests rompería las llamadas a 127.0.0.1). Prod siempre es https.
const localSupabase = supabaseUrl?.protocol === 'http:';
const supabaseSrc = supabaseHost
	? localSupabase ? `http://${supabaseHost} ws://${supabaseHost}` : `https://${supabaseHost} wss://${supabaseHost}`
	: 'https://*.supabase.co wss://*.supabase.co';

const csp = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"frame-ancestors 'none'",
	"form-action 'self'",
	`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://static.cloudflareinsights.com`,
	"style-src 'self' 'unsafe-inline'",
	`img-src 'self' data: blob: ${supabaseSrc.split(' ')[0]}`,
	"font-src 'self' data:",
	`connect-src 'self' ${supabaseSrc} https://cloudflareinsights.com${isDev ? ' ws: http://localhost:*' : ''}`,
	"worker-src 'self' blob:",
	"frame-src 'self' blob:",
	"media-src 'self' blob: data:",
	"manifest-src 'self'",
	...(isDev || localSupabase ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
	{ key: 'Content-Security-Policy', value: csp },
	{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
	{ key: 'X-Content-Type-Options', value: 'nosniff' },
	{ key: 'X-Frame-Options', value: 'DENY' },
	{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
	{ key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()' },
	{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
	poweredByHeader: false,
	experimental: {
		serverActions: {
			bodySizeLimit: '5mb',
		},
	},
	async headers() {
		return [{ source: '/:path*', headers: securityHeaders }];
	},
};

// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
initOpenNextCloudflareForDev();

export default withNextIntl(nextConfig);
