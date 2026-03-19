"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Aquí conectaremos luego con la base de datos D1
    console.log("Intentando iniciar sesión para:", email);
    alert("Conectando con la base de datos de CommUp... ¡Bienvenido!");
  };

  return (
    <main style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      backgroundColor: '#f4f7f9',
      fontFamily: 'sans-serif' 
    }}>
      <div style={{ 
        backgroundColor: '#fff', 
        padding: '40px', 
        borderRadius: '10px', 
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h1 style={{ textAlign: 'center', color: '#0070f3', marginBottom: '10px' }}>CommUp</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
          Gestión de Completamiento Oil & Gas
        </p>
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <label style={{ fontWeight: 'bold' }}>Correo Electrónico</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@commup.app"
            style={{ padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
            required
          />
          
          <label style={{ fontWeight: 'bold' }}>Contraseña</label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ padding: '12px', borderRadius: '5px', border: '1px solid #ccc' }}
            required
          />
          
          <button type="submit" style={{ 
            padding: '12px', 
            backgroundColor: '#0070f3', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px', 
            cursor: 'pointer',
            fontWeight: 'bold',
            marginTop: '10px'
          }}>
            Ingresar al Proyecto
          </button>
        </form>
      </div>
    </main>
  );
}
