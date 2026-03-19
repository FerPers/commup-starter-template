"use client";
import { useState } from "react";

export default function AdminDashboard() {
  const [fileData, setFileData] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, inst: 0, mech: 0, elec: 0 });

  // Función para procesar el archivo CSV (Excel guardado como CSV)
const handleFileUpload = (e: any) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event: any) => {
      const text = event.target.result;
      
      // 1. Limpiamos espacios y saltos de línea extra
      const rows = text.split("\n").map((row: string) => row.trim()).filter((row: string) => row !== "");
      
      // 2. Quitamos el encabezado y separamos por comas
      const data = rows.slice(1).map((row: string) => row.split(","));
      
      setFileData(data);

      // 3. ¡AHORA SÍ! Filtramos sobre 'data' (columnas), no sobre 'rows' (letras)
      setStats({
        total: data.length,
        inst: data.filter((col: any) => 
          col[1]?.toLowerCase().includes("inst")).length,
        mech: data.filter((col: any) => 
          col[1]?.toLowerCase().includes("mecanica") || 
          col[1]?.toLowerCase().includes("mech")).length,
        elec: data.filter((col: any) => 
          col[1]?.toLowerCase().includes("elec")).length,
      });

      alert("¡Instrument Index procesado correctamente!");
    };
    reader.readAsText(file);
  };
  
  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#0070f3' }}>CommUp - Panel de Control</h1>
        <div style={{ backgroundColor: '#fff', padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <strong>Admin:</strong> Luis Fernando Perdomo
        </div>
      </header>

      {/* Tarjetas de KPI Rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
        <Card title="Total Tags" value={stats.total} color="#0070f3" />
        <Card title="Instrumentación" value={stats.inst} color="#28a745" />
        <Card title="Mecánica" value={stats.mech} color="#ffc107" />
        <Card title="Electricidad" value={stats.elec} color="#17a2b8" />
      </div>

      {/* Sección de Carga de Excel */}
      <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <h3>Importar Instrument Index (CSV)</h3>
        <p style={{ color: '#666' }}>Selecciona tu archivo estructurado con: Tag, Disciplina, Servicio, P&ID...</p>
        <input 
          type="file" 
          accept=".csv" 
          onChange={handleFileUpload}
          style={{ marginTop: '10px', padding: '10px', border: '1px dashed #0070f3', width: '100%', borderRadius: '5px' }}
        />
      </div>
    </div>
  );
}

// Componente pequeño para las tarjetas
function Card({ title, value, color }: any) {
  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '10px', borderLeft: `5px solid ${color}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
      <h4 style={{ margin: 0, color: '#666' }}>{title}</h4>
      <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '10px 0 0 0' }}>{value}</p>
    </div>
  );
}
