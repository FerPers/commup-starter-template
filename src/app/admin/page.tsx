// Nueva lógica de conteo mejorada
      setStats({
        total: rows.length,
        inst: rows.filter((r: any) => 
          r[1]?.toLowerCase().includes("inst")).length,
        mech: rows.filter((r: any) => 
          r[1]?.toLowerCase().includes("mecanica") || 
          r[1]?.toLowerCase().includes("mech")).length,
        elec: rows.filter((r: any) => 
          r[1]?.toLowerCase().includes("elec")).length,
      });
