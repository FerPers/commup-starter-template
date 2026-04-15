// Type stub para html5-qrcode (cargado dinámicamente en QRNFCScanner)
declare module 'html5-qrcode' {
  export class Html5Qrcode {
    constructor(elementId: string, config?: Record<string, unknown>);
    static getCameras(): Promise<{ id: string; label: string }[]>;
    start(
      cameraIdOrConfig: string | { deviceId: string } | { facingMode: string },
      config: Record<string, unknown>,
      onSuccess: (decodedText: string) => void,
      onError?: (error: string) => void
    ): Promise<void>;
    stop(): Promise<void>;
    clear(): void;
  }
}
