/**
 * CommUP — QR/NFC Scanner Component (Stage 14.2)
 *
 * - QR: html5-qrcode library con viewfinder overlay profesional
 * - NFC: Web NFC API (Android Chrome 89+)
 * - Deep link a /tag_360/:tagId para cualquier equipo
 * - Historial de escaneos recientes
 * - Vibración haptica en scan exitoso
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface ScanResult {
  tag_id: string;
  tag_type: 'QR' | 'NFC' | 'MANUAL';
  raw: string;
  timestamp: string;
}

interface RecentScan {
  tag_id: string;
  tag_type: 'QR' | 'NFC' | 'MANUAL';
  scanned_at: string;
  equipment_name?: string;
}

type ScanMode = 'QR' | 'NFC' | 'MANUAL';

interface NDEFRecord { recordType: string; data: ArrayBuffer; encoding?: string }
interface NDEFMessage { records: NDEFRecord[] }
interface NDEFReadingEvent { message: NDEFMessage; serialNumber: string }
interface NDEFReaderLike {
  scan(options: { signal: AbortSignal }): Promise<void>;
  addEventListener(type: 'reading', cb: (e: NDEFReadingEvent) => void): void;
  addEventListener(type: 'readingerror', cb: () => void): void;
}
type NDEFReaderCtor = new () => NDEFReaderLike;

interface Html5QrcodeScannerLike {
  stop(): Promise<void>;
  clear(): void;
  start(
    camera: { deviceId: string },
    config: Record<string, unknown>,
    onScan: (decodedText: string) => void,
    onError?: undefined
  ): Promise<void>;
}

// ─── CommUP Tag URL pattern ────────────────────────────────────────────────
// Formatos aceptados:
//   https://app.commup.io/tag_360/EQ-001-PUMP-001
//   commup://tag/EQ-001-PUMP-001
//   EQ-001-PUMP-001  (tag_id directo)
const COMMUP_TAG_PATTERNS = [
  /\/tag_360\/([A-Z0-9\-_]+)/i,
  /commup:\/\/tag\/([A-Z0-9\-_]+)/i,
  /^([A-Z]{2,4}-\d{3,6}-[A-Z0-9\-]+)$/i,
];

function parseTagId(raw: string): string | null {
  for (const pattern of COMMUP_TAG_PATTERNS) {
    const match = raw.trim().match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

// ─── Hook: NFC Scanner ─────────────────────────────────────────────────────
function useNFCScan(
  onScan: (result: ScanResult) => void,
  onError: (error: string) => void
) {
  const abortRef = useRef<AbortController | null>(null);
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [nfcActive, setNfcActive] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser feature detection: NDEFReader only exists on client, must read after mount
    setNfcAvailable('NDEFReader' in window);
  }, []);

  const startNFC = useCallback(async () => {
    if (!('NDEFReader' in window)) {
      onError('NFC no disponible en este dispositivo');
      return;
    }
    try {
      abortRef.current = new AbortController();
      const Ctor = (window as unknown as { NDEFReader: NDEFReaderCtor }).NDEFReader;
      const ndef = new Ctor();
      await ndef.scan({ signal: abortRef.current.signal });
      setNfcActive(true);

      ndef.addEventListener('reading', ({ message, serialNumber }: NDEFReadingEvent) => {
        let raw = serialNumber;
        for (const record of message.records) {
          if (record.recordType === 'url') {
            const decoder = new TextDecoder();
            raw = decoder.decode(record.data);
            break;
          } else if (record.recordType === 'text') {
            const decoder = new TextDecoder(record.encoding || 'utf-8');
            raw = decoder.decode(record.data);
            break;
          }
        }

        const tagId = parseTagId(raw);
        if (tagId) {
          navigator.vibrate?.([100, 50, 100]);
          onScan({ tag_id: tagId, tag_type: 'NFC', raw, timestamp: new Date().toISOString() });
        } else {
          onError(`NFC tag no reconocido: ${raw}`);
        }
      });

      ndef.addEventListener('readingerror', () => {
        onError('Error leyendo NFC tag. Acerque más el dispositivo.');
      });
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e.name === 'NotAllowedError') {
        onError('Permiso NFC denegado. Habilítelo en configuración.');
      } else {
        onError(`NFC error: ${e.message ?? String(err)}`);
      }
      setNfcActive(false);
    }
  }, [onScan, onError]);

  const stopNFC = useCallback(() => {
    abortRef.current?.abort();
    setNfcActive(false);
  }, []);

  return { nfcAvailable, nfcActive, startNFC, stopNFC };
}

// ─── Hook: html5-qrcode QR Scanner ────────────────────────────────────────
function useQRScan(
  containerId: string,
  onScan: (result: ScanResult) => void,
  onError: (error: string) => void
) {
  const scannerRef = useRef<Html5QrcodeScannerLike | null>(null);
  const [qrActive, setQrActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startQR = useCallback(async () => {
    try {
      // html5-qrcode cargado vía CDN o npm
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode(containerId, {
        verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        throw new Error('No se encontró cámara');
      }

      // Preferir cámara trasera
      const backCamera = cameras.find((c) =>
        c.label.toLowerCase().includes('back') ||
        c.label.toLowerCase().includes('rear') ||
        c.label.toLowerCase().includes('environment')
      ) || cameras[cameras.length - 1];

      await scanner.start(
        { deviceId: backCamera.id },
        {
          fps: 15,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0,
          disableFlip: false,
          formatsToSupport: [
            0,  // QR_CODE
            4,  // CODE_128
            5,  // CODE_39
            11, // DATA_MATRIX
          ],
        },
        (decodedText: string) => {
          const tagId = parseTagId(decodedText);
          if (tagId) {
            navigator.vibrate?.([150]);
            onScan({ tag_id: tagId, tag_type: 'QR', raw: decodedText, timestamp: new Date().toISOString() });
          } else {
            onError(`Código no reconocido: ${decodedText.substring(0, 40)}...`);
          }
        },
        undefined // errores de frame: ignorar (normal)
      );

      setQrActive(true);
      setCameraError(null);
    } catch (err: unknown) {
      const m = (err as { message?: string })?.message;
      const msg = m?.includes('permission')
        ? 'Permiso de cámara denegado. Habilítelo en el navegador.'
        : m || 'Error iniciando cámara';
      setCameraError(msg);
      onError(msg);
    }
  }, [containerId, onScan, onError]);

  const stopQR = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch { /* ya detenido */ }
      scannerRef.current = null;
    }
    setQrActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopQR(); };
  }, [stopQR]);

  return { qrActive, cameraError, startQR, stopQR };
}

// ─── Componente Principal ──────────────────────────────────────────────────
export default function QRNFCScanner() {
  const router = useRouter();
  const QR_CONTAINER_ID = 'commup-qr-container';

  const [mode, setMode] = useState<ScanMode>('QR');
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Cargar historial desde localStorage
  useEffect(() => {
    const saved = localStorage.getItem('commup-recent-scans');
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate history from localStorage which is only available client-side
      try { setRecentScans(JSON.parse(saved)); } catch { }
    }
  }, []);

  const handleScan = useCallback((result: ScanResult) => {
    setLastScan(result);
    setError(null);

    // Actualizar historial
    const newScan: RecentScan = {
      tag_id: result.tag_id,
      tag_type: result.tag_type,
      scanned_at: result.timestamp,
    };
    setRecentScans((prev) => {
      const filtered = prev.filter((s) => s.tag_id !== result.tag_id);
      const updated = [newScan, ...filtered].slice(0, 10);
      localStorage.setItem('commup-recent-scans', JSON.stringify(updated));
      return updated;
    });

    // Navegar a tag_360 después de 300ms (feedback visual primero)
    setTimeout(() => router.push(`/tag_360/${result.tag_id}`), 300);
  }, [router]);

  const handleError = useCallback((err: string) => {
    setError(err);
    setTimeout(() => setError(null), 4000);
  }, []);

  const { nfcAvailable, nfcActive, startNFC, stopNFC } = useNFCScan(handleScan, handleError);
  const { qrActive, cameraError, startQR, stopQR } = useQRScan(QR_CONTAINER_ID, handleScan, handleError);

  // Arrancar/detener según modo
  useEffect(() => {
    if (mode === 'QR') {
      stopNFC();
      startQR();
    } else if (mode === 'NFC') {
      stopQR();
      startNFC();
    } else {
      stopQR();
      stopNFC();
    }
    return () => {
      stopQR();
      stopNFC();
    };
  }, [mode]);

  const handleManualSubmit = () => {
    const tagId = parseTagId(manualInput);
    if (tagId) {
      handleScan({ tag_id: tagId, tag_type: 'MANUAL', raw: manualInput, timestamp: new Date().toISOString() });
    } else {
      handleError('ID de tag no válido. Formato: XX-000-NOMBRE-000');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-900)', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottom: '1px solid var(--gray-700)' }}>
        <button
          onClick={() => router.back()}
          style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gray-800)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>Escanear Tag</h1>
        <button
          onClick={() => setShowHistory(!showHistory)}
          style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', transition: 'background 0.15s', position: 'relative' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gray-800)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {recentScans.length > 0 && (
            <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, background: 'var(--primary-500)', borderRadius: 'var(--radius-pill)' }} />
          )}
        </button>
      </div>

      {/* Mode Selector */}
      <div style={{ display: 'flex', gap: 4, padding: 12, background: 'var(--gray-800)' }}>
        {(['QR', 'NFC', 'MANUAL'] as ScanMode[]).map((m) => {
          const isActive = mode === m
          const isDisabled = m === 'NFC' && !nfcAvailable
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={isDisabled}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                transition: 'background 0.15s',
                border: 'none',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                background: isActive ? 'var(--primary-600)' : 'var(--gray-700)',
                color: isActive ? '#fff' : 'var(--gray-400)',
                opacity: isDisabled ? 0.4 : 1,
              }}
            >
              {m === 'QR' && '📷 QR'}
              {m === 'NFC' && `📡 NFC${!nfcAvailable ? ' (N/D)' : ''}`}
              {m === 'MANUAL' && '⌨️ Manual'}
            </button>
          )
        })}
      </div>

      {/* Error Banner */}
      {(error || cameraError) && (
        <div style={{ margin: '12px 16px 0', padding: 12, background: 'rgba(127, 29, 29, 0.5)', border: '1px solid var(--danger-500)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--danger-500)' }}>
          ⚠️ {error || cameraError}
        </div>
      )}

      {/* QR Viewfinder */}
      {mode === 'QR' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 384 }}>
            {/* Container html5-qrcode */}
            <div
              id={QR_CONTAINER_ID}
              style={{ width: '100%', borderRadius: 16, overflow: 'hidden', background: '#000', minHeight: 320 }}
            />
            {/* Overlay con crosshair */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 256, height: 256, position: 'relative' }}>
                  {/* Esquinas del viewfinder */}
                  {[
                    { top: 0, left: 0, borderTop: '4px solid var(--primary-400)', borderLeft: '4px solid var(--primary-400)', borderTopLeftRadius: 8 },
                    { top: 0, right: 0, borderTop: '4px solid var(--primary-400)', borderRight: '4px solid var(--primary-400)', borderTopRightRadius: 8 },
                    { bottom: 0, left: 0, borderBottom: '4px solid var(--primary-400)', borderLeft: '4px solid var(--primary-400)', borderBottomLeftRadius: 8 },
                    { bottom: 0, right: 0, borderBottom: '4px solid var(--primary-400)', borderRight: '4px solid var(--primary-400)', borderBottomRightRadius: 8 },
                  ].map((corner, i) => (
                    <div key={i} style={{ position: 'absolute', width: 32, height: 32, ...corner }} />
                  ))}
                  {/* Scan line animada */}
                  {qrActive && (
                    <div className="animate-scan-line" style={{ position: 'absolute', left: 8, right: 8, height: 2, background: 'var(--primary-400)', opacity: 0.8 }} />
                  )}
                </div>
              </div>
            </div>
            {/* Status indicator */}
            <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
              <span style={{
                fontSize: 'var(--text-xs)',
                padding: '4px 12px',
                borderRadius: 'var(--radius-pill)',
                fontWeight: 500,
                background: qrActive ? 'rgba(37, 99, 235, 0.8)' : 'rgba(51, 65, 85, 0.8)',
                color: qrActive ? 'var(--primary-100)' : 'var(--gray-400)',
              }}>
                {qrActive ? '● Escaneando...' : '⊘ Cámara inactiva'}
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--gray-400)', fontSize: 'var(--text-sm)', textAlign: 'center', marginTop: 16 }}>
            Apunte al código QR o código de barras del tag del equipo
          </p>
        </div>
      )}

      {/* NFC Mode */}
      {mode === 'NFC' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 }}>
          <div
            className={nfcActive ? 'animate-pulse' : ''}
            style={{
              width: 192, height: 192,
              borderRadius: '50%',
              border: `4px solid ${nfcActive ? 'var(--primary-400)' : 'var(--gray-600)'}`,
              background: nfcActive ? 'rgba(30, 58, 138, 0.3)' : 'var(--gray-800)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.5s',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 64, marginBottom: 8 }}>📡</div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--primary-400)' }}>
                {nfcActive ? 'Listo' : 'Inactivo'}
              </div>
            </div>
          </div>
          {!nfcActive && (
            <button
              onClick={startNFC}
              style={{ background: 'var(--primary-600)', color: '#fff', fontWeight: 700, padding: '12px 32px', borderRadius: 'var(--radius-lg)', transition: 'background 0.15s', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Activar NFC
            </button>
          )}
          {nfcActive && (
            <>
              <p style={{ color: 'var(--gray-300)', textAlign: 'center', fontSize: 'var(--text-lg)', fontWeight: 500 }}>
                Acerque el dispositivo al tag NFC del equipo
              </p>
              <button
                onClick={stopNFC}
                style={{ background: 'var(--gray-700)', color: '#fff', padding: '8px 24px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', transition: 'background 0.15s', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Detener
              </button>
            </>
          )}
        </div>
      )}

      {/* Manual Input */}
      {mode === 'MANUAL' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 16 }}>
          <p style={{ color: 'var(--gray-400)', fontSize: 'var(--text-sm)' }}>
            Ingrese el ID del tag o escanee/pegue la URL del equipo
          </p>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              placeholder="EJ: PMP-001-P-001A"
              style={{
                width: '100%',
                background: 'var(--gray-800)',
                border: '1px solid var(--gray-600)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                color: '#fff',
                fontSize: 'var(--text-lg)',
                fontFamily: 'ui-monospace, monospace',
                outline: 'none',
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button
            onClick={handleManualSubmit}
            disabled={!manualInput}
            style={{
              background: !manualInput ? 'var(--gray-700)' : 'var(--primary-600)',
              color: !manualInput ? 'var(--gray-500)' : '#fff',
              fontWeight: 700,
              padding: '16px',
              borderRadius: 'var(--radius-lg)',
              transition: 'background 0.15s',
              fontSize: 'var(--text-lg)',
              border: 'none',
              cursor: !manualInput ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Ir a Tag →
          </button>
          <div style={{ marginTop: 8, padding: 12, background: 'var(--gray-800)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)', fontFamily: 'ui-monospace, monospace', margin: 0 }}>Formatos válidos:</p>
            <p style={{ color: 'var(--gray-400)', fontSize: 'var(--text-xs)', fontFamily: 'ui-monospace, monospace', marginTop: 4, marginBottom: 0 }}>PMP-001-P-001A</p>
            <p style={{ color: 'var(--gray-400)', fontSize: 'var(--text-xs)', fontFamily: 'ui-monospace, monospace', margin: 0 }}>https://app.commup.io/tag_360/XXX</p>
            <p style={{ color: 'var(--gray-400)', fontSize: 'var(--text-xs)', fontFamily: 'ui-monospace, monospace', margin: 0 }}>commup://tag/XXX</p>
          </div>
        </div>
      )}

      {/* Recent Scans Drawer */}
      {showHistory && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div
            style={{ flex: 1, background: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => setShowHistory(false)}
          />
          <div style={{ background: 'var(--gray-800)', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '60vh', overflowY: 'auto' }}>
            <div style={{ width: 48, height: 4, background: 'var(--gray-600)', borderRadius: 'var(--radius-pill)', margin: '0 auto 16px' }} />
            <h2 style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginBottom: 16, marginTop: 0 }}>Escaneados Recientes</h2>
            {recentScans.length === 0 ? (
              <p style={{ color: 'var(--gray-500)', textAlign: 'center', padding: '32px 0' }}>Sin historial aún</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentScans.map((scan, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setShowHistory(false);
                      router.push(`/tag_360/${scan.tag_id}`);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--gray-700)', borderRadius: 'var(--radius-lg)', transition: 'background 0.15s', textAlign: 'left', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <span style={{ fontSize: 'var(--text-lg)' }}>{scan.tag_type === 'QR' ? '📷' : scan.tag_type === 'NFC' ? '📡' : '⌨️'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: 'var(--primary-300)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scan.tag_id}</div>
                      {scan.equipment_name && (
                        <div style={{ color: 'var(--gray-400)', fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scan.equipment_name}</div>
                      )}
                      <div style={{ color: 'var(--gray-500)', fontSize: 'var(--text-xs)' }}>
                        {new Date(scan.scanned_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                    <svg style={{ width: 20, height: 20, color: 'var(--gray-500)', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scan Success Flash */}
      {lastScan && (
        <div className="animate-slide-up" style={{ position: 'fixed', bottom: 24, left: 16, right: 16, zIndex: 40, background: 'var(--success-500)', color: '#fff', padding: 16, borderRadius: 16, boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 'var(--text-xl)' }}>✓</span>
            <div>
              <div style={{ fontWeight: 700 }}>{lastScan.tag_id}</div>
              <div style={{ fontSize: 'var(--text-sm)', opacity: 0.85 }}>Navegando a Tag 360°...</div>
            </div>
          </div>
        </div>
      )}

      {/* Tailwind animation classes — add to global CSS */}
      <style>{`
        @keyframes scan-line {
          0% { top: 8px; }
          50% { top: calc(100% - 8px); }
          100% { top: 8px; }
        }
        .animate-scan-line { animation: scan-line 2s ease-in-out infinite; }
        @keyframes slide-up {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
      `}</style>
    </div>
  );
}
