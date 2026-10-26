-- Tipo de señal COMM: comunicación serial / bus de campo (Modbus, Profibus, Ethernet). Las listas de señales de
-- ingeniería traen estas señales (Akacías A2.2, LI-001: 324 de 686 en el DCS) y el importador las rechazaba.
-- Ninguna función SQL ramifica por valor de signal_type; solo se agrega el valor.
ALTER TYPE public.signal_type ADD VALUE IF NOT EXISTS 'COMM';
