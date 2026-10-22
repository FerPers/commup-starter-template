/**
 * Logos en el bucket público org-assets (A-26, S02): solo imágenes rasterizadas (nunca SVG/HTML) y la extensión sale
 * del MIME validado, no del nombre del archivo. El bucket repite la lista. Los PDF solo embeben PNG y JPG (pdf-lib);
 * un WebP se ve en pantalla y en el PDF cae al nombre en texto.
 */
export const LOGO_MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_BUCKET = 'org-assets'

/** E2: logo del cliente del proyecto, dentro de la carpeta de la org (las políticas del bucket la exigen primero). */
export const clientLogoPath = (orgId: string, projectId: string, ext: string) => `${orgId}/projects/${projectId}/client-logo.${ext}`
