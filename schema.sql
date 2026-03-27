-- 1. Estructura de Usuarios y Roles (RBAC)
CREATE TABLE roles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL -- 'Admin', 'Construccion', 'QAQC', 'Cliente', 'PreComm'
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role_id INTEGER,
    discipline TEXT, -- 'Instrumentacion', 'Electricidad', 'Mecanica Rotativa', etc.
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- 2. Jerarquía de Proyecto (Nemotecnia WinPCS/ICAPS)
CREATE TABLE hierarchy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL, -- 'Plant', 'System', 'Subsystem'
    name TEXT NOT NULL,
    parent_id INTEGER, -- Para crear el árbol
    FOREIGN KEY (parent_id) REFERENCES hierarchy(id)
);

-- 3. Tabla Maestra de Activos (The Core Instrument Index)
CREATE TABLE assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_number TEXT NOT NULL UNIQUE,
    instrument_type TEXT,
    service TEXT,
    discipline_id INTEGER,
    subsystem_id INTEGER,
    status_mc TEXT DEFAULT 'Pending', -- Hoja A
    status_precomm TEXT DEFAULT 'Pending', -- Hoja B
    status_comm TEXT DEFAULT 'Pending', -- Hoja C
    pid_reference TEXT,
    loop_drawing TEXT,
    hookup_drawing TEXT,
    FOREIGN KEY (subsystem_id) REFERENCES hierarchy(id)
);
