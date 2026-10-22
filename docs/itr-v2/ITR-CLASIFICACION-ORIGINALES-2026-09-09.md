# Clasificación de los originales ITR por estructura de tablas — 2026-09-09

Fuente: `insumos-locales/revision-itr/lote-completo/estructuras/*.json` (tablas del .docx). Generado por `scripts/itr-v2/clasificar-originales.py`. Contraste con la plantilla activa de la org DEMO.

Familias: **C** lista de chequeo pura · **C+V** lista con ítems que exigen valor/lectura · **D** bloque de datos + lista · **M** lista + matriz de medición · **DM** datos + lista + matriz.

| Familia | Formatos |
|---|---|
| C | 112 |
| C+V | 87 |
| D | 56 |
| M | 31 |
| DM | 16 |

| Disciplina | C | C+V | D | M | DM | Total |
|---|---|---|---|---|---|---|
| E | 5 | 2 | 44 | 13 | 11 | 75 |
| H | 19 | 6 | 0 | 3 | 0 | 28 |
| I | 16 | 6 | 6 | 4 | 2 | 34 |
| L | 10 | 2 | 0 | 0 | 1 | 13 |
| M | 42 | 50 | 0 | 4 | 2 | 98 |
| P | 4 | 13 | 1 | 3 | 0 | 21 |
| Q | 4 | 2 | 1 | 0 | 0 | 7 |
| T | 10 | 6 | 4 | 4 | 0 | 24 |
| X | 2 | 0 | 0 | 0 | 0 | 2 |

## Formatos que hoy son solo casillas en la base pero el original no es lista pura: 181

| Código | Familia | Datos | Ítems | Con valor | Matrices | Cabeceras de matriz |
|---|---|---|---|---|---|---|
| E03BV | M | 0 | 0 | 0 | 1 | Tag No. | Tag Description | Check Sheet No. | Check Sheet Description | Protocol Test No. |
| E04B | D | 11 | 13 | 3 | 0 |  |
| E04BV | M | 0 | 0 | 0 | 1 | Tag No. | Tag Description | Highest Rated Power | Voltage Level | Serial No. | Protocol Te |
| E05A | D | 10 | 7 | 0 | 0 |  |
| E05B | DM | 9 | 8 | 1 | 1 | Phase Fase | R | S | T | Primary Current Corriente  Primaria |
| E05BV | M | 0 | 0 | 0 | 1 | Tag No. | Cubicle No. | Ratio | Protocol Test No. |
| E06A | D | 10 | 11 | 0 | 0 |  |
| E06B | D | 10 | 29 | 11 | 0 |  |
| E06BV | M | 0 | 0 | 0 | 1 | Tag No. | Voltage Transformer PRI | Ratio | Cubicle No. | Protocol Test No. |
| E07A | D | 8 | 22 | 4 | 0 |  |
| E07B | D | 6 | 20 | 2 | 0 |  |
| E08A | D | 6 | 25 | 1 | 0 |  |
| E09A | D | 6 | 24 | 1 | 0 |  |
| E10A | DM | 6 | 19 | 1 | 1 | R-Y | Y-B | B-E | R-B | Y-N | N-E |
| E10B | DM | 5 | 19 | 4 | 2 | Receptacle Circuit number | Verify Tag number label is correct | Insulation Resistance to  |
| E11B | M | 0 | 5 | 5 | 1 | Hazardous Area Classification: Clasificación de área peligrosa: | Rated Voltage:           |
| E12A | D | 17 | 19 | 0 | 0 |  |
| E13A | C+V | 0 | 31 | 7 | 0 |  |
| E13B | DM | 18 | 25 | 8 | 1 | Time (Minutes) Tiempo (Minutos) | 0 | 5 | 10 | 20 | 30 | 60 | 90 |
| E13C | D | 20 | 13 | 3 | 0 |  |
| E14-1B | DM | 5 | 11 | 5 | 1 | BATTERY BANK TEST RESULTS RESULTADOS DE PRUEBA BANCO DE BATERIAS | Battery Type: Tipo de B |
| E14-2B | D | 10 | 33 | 6 | 0 |  |
| E14A | D | 10 | 36 | 3 | 0 |  |
| E15A | D | 14 | 15 | 3 | 0 |  |
| E15B | DM | 6 | 10 | 2 | 1 | MCB Rating Corriente nominal del MCB | RCCD Rating Corriente nominal de RCCD | Post claddi |
| E16A | D | 6 | 15 | 2 | 0 |  |
| E17A | D | 9 | 13 | 2 | 0 |  |
| E17B | D | 5 | 9 | 0 | 0 |  |
| E18A | D | 2 | 11 | 2 | 0 |  |
| E18B | D | 7 | 12 | 9 | 0 |  |
| E19A | D | 9 | 26 | 4 | 0 |  |
| E20A | D | 8 | 17 | 1 | 0 |  |
| E20B | D | 10 | 24 | 2 | 0 |  |
| E20BV | M | 0 | 0 | 0 | 1 | Tag No. | Relay Type | Cubicle No. | Protocol Test No. |
| E21A | D | 5 | 9 | 0 | 0 |  |
| E21B | D | 4 | 17 | 4 | 0 |  |
| E21BV | M | 0 | 0 | 0 | 1 | Tag No. | Cubicle No. | Load Description | Protocol Test No. |
| E22A | DM | 3 | 11 | 3 | 1 | Distance D (C2) | Distance D (C2) | Distance D (C2) | Ground System Test Well No | Distanc |
| E22B | D | 2 | 8 | 1 | 0 |  |
| E23A | D | 11 | 15 | 1 | 0 |  |
| E24A | D | 6 | 14 | 1 | 0 |  |
| E25A | D | 6 | 10 | 0 | 0 |  |
| E26A | DM | 8 | 16 | 2 | 2 | 1.12a | Torque bus connections as per manufacturer's recommendations and record the Torque |
| E27A | D | 7 | 14 | 0 | 0 |  |
| E28A | D | 2 | 4 | 0 | 0 |  |
| E29A | M | 0 | 0 | 0 | 1 | Time Tiempo | Leakage Current (uA) On Phase A Corriente fuga en la fase A | Leakage Curren |
| E30A | D | 3 | 22 | 2 | 0 |  |
| E31A | D | 3 | 19 | 5 | 0 |  |
| E32A | M | 0 | 0 | 0 | 1 | CALCULATED RATIO | MEASURED RATIO | Secondary Tap Positions | Line (HV) Volts | Phase (LV) |
| E33A | D | 5 | 0 | 0 | 0 |  |
| E34B | D | 5 | 8 | 1 | 0 |  |
| E35A | C+V | 0 | 20 | 4 | 0 |  |
| E36A | M | 0 | 37 | 2 | 1 | Manufacturer: Fabricante: | Type: Tipo: | Serial No: No. Serie: | Rating:                  |
| E37A | D | 12 | 16 | 2 | 0 |  |
| E38A | DM | 6 | 8 | 3 | 1 | Color-Cable | Yellow Amarillo | Blue Azul | Red Rojo | Orange Naranja | Brown Café | White |
| E41B | D | 4 | 26 | 5 | 0 |  |
| E42-1B | D | 4 | 10 | 2 | 0 |  |
| E47B | D | 6 | 11 | 1 | 0 |  |
| E48B | D | 7 | 6 | 1 | 0 |  |
| E49BV | M | 0 | 0 | 0 | 8 | Tag No. | Tag Description | Check Sheet No. | Check Sheet Description | Voltage Level | Pr |
| E49BV-1 | M | 0 | 0 | 0 | 28 | Tag No. | Serial | Type | Voltage Level [V] | Current [A] | Protocol Test No. || Tag No. | |
| E50B | D | 10 | 17 | 6 | 0 |  |
| E51B | D | 4 | 33 | 5 | 0 |  |
| E52BV | M | 0 | 0 | 0 | 6 | Tag No. | Tag Description | Check Sheet No. | Check Sheet Description | Voltage Level | Pr |
| E54B | D | 18 | 18 | 6 | 0 |  |
| H02B | C+V | 0 | 18 | 2 | 0 |  |
| H02C | C+V | 0 | 18 | 2 | 0 |  |
| H03B | C+V | 0 | 9 | 1 | 0 |  |
| H03C | C+V | 0 | 8 | 1 | 0 |  |
| H15B | M | 0 | 0 | 0 | 1 | Area / Room Description Área / Descripción  recinto | Temperature / Humidity Measurements  |
| H16A | C+V | 0 | 19 | 16 | 0 |  |
| H17B | C+V | 0 | 11 | 2 | 0 |  |
| H18B | M | 0 | 0 | 0 | 1 | Module/Area/ Location Modulo/Área/Ubicación | PDIT Tag No. | Supply Fan No. Ventilador de  |
| H20C | M | 0 | 0 | 0 | 1 | Area / Room Description Área / Sala Descripción | Temperature / Humidity Measurements Medi |
| I02A | C+V | 0 | 6 | 1 | 0 |  |
| I03A | D | 9 | 8 | 0 | 0 |  |
| I07A | C+V | 0 | 17 | 1 | 0 |  |
| I11A | DM | 7 | 37 | 21 | 1 | CALIBRATION CHECK | Input Entrada |
| I14A | D | 2 | 11 | 0 | 0 |  |
| I15A | D | 2 | 15 | 1 | 0 |  |
| I17A | C+V | 0 | 6 | 3 | 0 |  |
| I27B | M | 0 | 8 | 0 | 1 | 8.0 | INSPECTION OF SETTING AND OPERATION  VERIFICACION DE AJUSTES Y OPERACION | Switch Ta |
| I28C | D | 2 | 7 | 1 | 0 |  |
| I29C | M | 0 | 6 | 1 | 1 | Componente (Tag) | Tipo | Alistamiento | Configuración de Parámetros | Gráficos | Prueba d |
| I30C | D | 5 | 4 | 1 | 0 |  |
| I31C | C+V | 0 | 9 | 1 | 0 |  |
| I33C | C+V | 0 | 13 | 7 | 0 |  |
| I42B | M | 0 | 8 | 0 | 1 | OPERATION TEST PRUEBA DE OPERACIÓN | RANGE RANGO | ZEROCERO | SPAN LAPSO | UNITS UNIDADES |
| I43B | C+V | 0 | 9 | 1 | 0 |  |
| L05A | DM | 2 | 5 | 0 | 1 | Equipment Equipo | CO2 | Chemical Químico | Water Agua | AFFF | Dry Powder Trolley Mounted |
| L05C | C+V | 0 | 9 | 1 | 0 |  |
| L10B | C+V | 0 | 8 | 1 | 0 |  |
| M01C | C+V | 0 | 14 | 3 | 0 |  |
| M02A | C+V | 0 | 10 | 1 | 0 |  |
| M03A | C+V | 0 | 12 | 1 | 0 |  |
| M03B | C+V | 0 | 14 | 2 | 0 |  |
| M04A | C+V | 0 | 9 | 1 | 0 |  |
| M05A | C+V | 0 | 7 | 1 | 0 |  |
| M06B | M | 0 | 0 | 0 | 1 | Note: This “Certificate of Vessel or Tank Inspection Closure” must be completed each time  |
| M07B | C+V | 0 | 27 | 2 | 0 |  |
| M09B | C+V | 0 | 11 | 1 | 0 |  |
| M09B-1 | C+V | 0 | 6 | 1 | 0 |  |
| M09C | DM | 11 | 24 | 4 | 1 | VIBRATION DATA DATOS DE VIBRACION | Start Time | 0 Mins | 15 Mins | 30 Mins | 45 Mins | 1  |
| M10A | C+V | 0 | 12 | 1 | 0 |  |
| M10B | C+V | 0 | 23 | 2 | 0 |  |
| M10C | M | 0 | 10 | 3 | 1 | VIBRATION DATA | Start Time | 0 Mins | 15 Mins | 30 Mins | 45 Mins | 1 Hour | 1½ Hour |
| M11C | C+V | 0 | 20 | 2 | 0 |  |
| M12A | C+V | 0 | 12 | 4 | 0 |  |
| M12B | C+V | 0 | 8 | 7 | 0 |  |
| M12C | C+V | 0 | 8 | 7 | 0 |  |
| M13C | C+V | 0 | 45 | 8 | 0 |  |
| M14B | C+V | 0 | 15 | 2 | 0 |  |
| M18A | C+V | 0 | 24 | 2 | 0 |  |
| M22B | C+V | 0 | 14 | 1 | 0 |  |
| M22C | C+V | 0 | 16 | 1 | 0 |  |
| M23B | C+V | 0 | 25 | 1 | 0 |  |
| M23C | DM | 10 | 16 | 2 | 1 | VIBRATION DATA DATOS DE VIBRACION | Start Time | 0 Mins | 15 Mins | 30 Mins | 45 Mins | 1  |
| M24A | C+V | 0 | 9 | 2 | 0 |  |
| M27C | C+V | 0 | 12 | 1 | 0 |  |
| M33A | C+V | 0 | 7 | 3 | 0 |  |
| M34A | C+V | 0 | 20 | 1 | 0 |  |
| M35A | C+V | 0 | 19 | 1 | 0 |  |
| M36C | C+V | 0 | 17 | 1 | 0 |  |
| M37A | C+V | 0 | 21 | 4 | 0 |  |
| M38A | C+V | 0 | 16 | 1 | 0 |  |
| M39A | C+V | 0 | 19 | 1 | 0 |  |
| M42A | C+V | 0 | 17 | 5 | 0 |  |
| M43A | C+V | 0 | 15 | 3 | 0 |  |
| M43C | C+V | 0 | 21 | 8 | 0 |  |
| M44A | C+V | 0 | 16 | 2 | 0 |  |
| M44B | C+V | 0 | 36 | 2 | 0 |  |
| M49B | C+V | 0 | 13 | 1 | 0 |  |
| M50B | C+V | 0 | 41 | 4 | 0 |  |
| M51B | C+V | 0 | 34 | 3 | 0 |  |
| M52B | C+V | 0 | 29 | 3 | 0 |  |
| M52C | C+V | 0 | 12 | 1 | 0 |  |
| M53C | C+V | 0 | 10 | 7 | 0 |  |
| M54B | C+V | 0 | 36 | 4 | 0 |  |
| M54C | M | 0 | 6 | 4 | 1 | Description/Type: Descripción/Tipo: | Catalyst Catalizador | Absorbents Absorbente | Filte |
| M55B | C+V | 0 | 39 | 2 | 0 |  |
| M57B | C+V | 0 | 42 | 6 | 0 |  |
| M58B | C+V | 0 | 74 | 3 | 0 |  |
| M59B | C+V | 0 | 18 | 1 | 0 |  |
| M59C | M | 0 | 15 | 2 | 1 | VIBRATION DATA | Start Time | 0 Mins | 15 Mins | 30 Mins | 45 Mins | 1 Hour | 1½ Hour |
| M60B | C+V | 0 | 43 | 2 | 0 |  |
| M61B | C+V | 0 | 32 | 2 | 0 |  |
| M64B | C+V | 0 | 39 | 2 | 0 |  |
| P01A | M | 0 | 0 | 0 | 1 | Isometric Number Numero Isométrico | Iso Rev. | Line Number Numero de Línea | P&ID | Remar |
| P03A | C+V | 0 | 15 | 11 | 0 |  |
| P04A | C+V | 0 | 11 | 2 | 0 |  |
| P05A | C+V | 0 | 20 | 1 | 0 |  |
| P06A | C+V | 0 | 5 | 1 | 0 |  |
| P06A(1) | C+V | 0 | 5 | 1 | 0 |  |
| P07A | D | 12 | 8 | 2 | 0 |  |
| P08A | C+V | 0 | 53 | 3 | 0 |  |
| P10A | C+V | 0 | 14 | 1 | 0 |  |
| P11B | C+V | 0 | 20 | 3 | 0 |  |
| P13B | C+V | 0 | 3 | 2 | 0 |  |
| P15B | C+V | 0 | 20 | 3 | 0 |  |
| P15C | C+V | 0 | 10 | 7 | 0 |  |
| P16B | M | 0 | 13 | 3 | 1 | ISO# | Joint Tag | Size (inch) | Rating (lbs) | Bolt diam (inch) | # Bolts | Torque Value  |
| P17B | M | 0 | 6 | 2 | 1 | 7.0 | Tag Numbers for Equipment included in the Purging Operation: Números de Tags de los  |
| P19B | C+V | 0 | 6 | 2 | 0 |  |
| P21C | C+V | 0 | 24 | 2 | 0 |  |
| Q02A | C+V | 0 | 20 | 4 | 0 |  |
| Q04A | D | 2 | 28 | 4 | 0 |  |
| Q07A | C+V | 0 | 9 | 1 | 0 |  |
| T01C | M | 0 | 4 | 0 | 1 | *  Equipment Type | Manufacturer | Model No | Vendor Drwg No's |
| T02A | D | 2 | 8 | 1 | 0 |  |
| T03A | D | 5 | 9 | 1 | 0 |  |
| T04B | C+V | 0 | 5 | 2 | 0 |  |
| T04C | M | 0 | 4 | 0 | 1 | *  Equipment Type | Manufacturer | Model No | Vendor Drwg No's |
| T05C | M | 0 | 4 | 0 | 1 | *  Equipment Type | Manufacturer | Model No | Vendor Drwg No's |
| T06B | C+V | 0 | 7 | 1 | 0 |  |
| T06C | M | 0 | 4 | 0 | 1 | *  Equipment Type | Manufacturer | Model No | Vendor Drwg No's | Low Power Loudspeaker |
| T07A | D | 4 | 8 | 1 | 0 |  |
| T08A | D | 4 | 17 | 2 | 0 |  |
| T09A | C+V | 0 | 20 | 2 | 0 |  |
| T09C | C+V | 0 | 26 | 2 | 0 |  |
| T11B | C+V | 0 | 16 | 1 | 0 |  |
| T12B | C+V | 0 | 8 | 2 | 0 |  |

## Listas de chequeo puras (candidatas al script de Fase 2): 112

E11A, E34A, E39A, E40A, E41A, H01A, H02A, H03A, H04A, H04B, H05A, H05B, H06A, H07A, H08A, H09A, H10A, H11A, H12A, H13A, H14A, H15A, H21C, H50b, I03B, I04A, I04B, I06A, I08A, I09A, I11B, I12A, I12B, I14B, I16A, I18A, I21C, I26B, I34B, I45C, L01A, L02A, L03A, L04A, L04B, L06A, L07A, L08A, L08B, L08C, M01A, M06A, M07A, M08A, M09A, M09B-2, M11A, M13A, M14A, M15A, M16A, M17A, M17C, M18C, M19A, M20A, M21A, M21B, M22A, M23A, M25A, M26A, M26C, M27A, M28A, M29A, M30A, M31A, M32A, M36A, M40A, M41A, M41B, M42B, M50C, M51C, M53B, M55C, M56B, M62B, M65B, M65C, P02A, P11A, P14B, P18B, Q01A, Q03A, Q05A, Q06A, T01A, T04A, T05A, T06A, T10A, T10C, T11A, T12A, T13C, T14C, X01A, X02A

## Formatos con notas o figuras en el cuerpo (diseño manual): 12

E04BV, E11A, E49BV, E49BV-1, E52BV, M02A, M12A, M12B, M12C, P03A, P08A, P14B

## Listas con ítems que exigen valor o registro (C+V): 87

El script de Fase 2 los convierte en selección + campo de valor/texto acompañante; revisar cada uno.

- E13A (7): 6.0 Disconnect motor and heater, check insulation resistance Desconectar e ||  < 1 KV ||  < 4.6 KV
- E35A (4): 2.0 ANODE CONTINUITY CHECK PRIOR TO INSTALLTION VERIFICAR LA CONTINUIDAD D || 2.1 Anode No.: Ánodo No.: || 2.3 Anode bed Type: Tipo cama de Ánodo:
- H02B (2): 12.0 Measured V Calculated Parameters || 13.0 Carry out and record any additional checks that may have been recommen
- H02C (2): 12.0 Measured V Calculated Parameters Medida Para metros V Calculados || 13.0 Carry out and record any additional checks that may have been recommen
- H03B (1): 6.0 Record any additional checks that may have been performed or has been 
- H03C (1): 5.0 Record any additional checks that may have been performed or has been 
- H16A (16): 1.0 Ductwork Details: Detalle del conducto: || 1.1 Length: Longitud: || 1.2 Width / Depth / Diameter : Ancho / Profundidad / Diámetro:
- H17B (2): 3.0 Check the following for the Mist Eliminator: Verificar lo siguiente pa || 6.0 Check pressure loss conformance to design values, measure and record p
- I02A (1): 1.0 Check upstream face of the plate tab contains the following markings: 
- I07A (1): 17.0 Check record earth bar resistance to general earth. Revisar el registr
- I17A (3): 1.0 Component being Installed: Componentes a Instalar:  Thermowell  Termop || 2.0 Thermowell details: Detalles del Termopozo:  Length as per data sheet: || 4.0 
- I31C (1): 8.0 Record any additional checks that may have been performed as requested
- I33C (7): 1.0 Input Range: || 2.0 Indication Range: || 3.0 Calibration Check:
- I43B (1): 9.0 Record relevant data on the instrument nameplate Registrar datos relev
- L05C (1):  Conduct tests for the Safety Shower & Eyebath systems  to confirm the 
- L10B (1): 7.0 Record any additional checks that may have been performed as requested
- M01C (3): 8.0 Prepare commissioning log in accordance with procedures. Preparar el r || 9.0 If item is rotating equipment unit: Si el ítem es una unidad de equipo || 11.0
- M02A (1): 9.0 Check the freestanding alignments and record readings at Fig 1 below R
- M03A (1): 5.0 Record mesh size of the Filter and confirm that the correct element is
- M03B (2): 8.0 Inspect and record the following: Inspeccionar y registrar lo siguient || 11.0 Record any additional checks that may have been performed as requested
- M04A (1): 4.0 Check bellows are within max/min expansion parameters and record :- Re
- M05A (1): 7.0 Record if all gags have been removed (check with commissioning for tim
- M07B (2): 4.0 If there is not a signed A check sheet for the boxed-up of this vessel || 6.0 Record any additional checks that may have been performed. Registrar c
- M09B (1): 3.0 Coordinate activities with Instrument & Electrical groups to verify th
- M09B-1 (1): 2.0 After solo Run test Motor, Verify motor –pump coupling Alignment (Re- 
- M10A (1): 5.0 Ensure that the commissioning suction strainer has been correctly fitt
- M10B (2): 12.0 Ensure that suction and discharge Pulsation Dampers are pre-charged to || 16.0 Record any additional checks that may have been performed as requested
- M11C (2): 5.0 Coordinate activities with Instrument & Electrical groups to verify th || 15.0 Record any additional checks that may have been performed as requested
- M12A (4): 1.0 Check the manufacturer's tolerances for the coupling alignment and rec || 7.0 Check and record below the free length of the coupling spacer, and dis || 8.0 
- M12B (7): 1.0 Record the Alignment figures below in relevant sheet box. Registrar lo || 2.0 Following consultation with VENDOR on the as-found readings, if necess ||  Rem
- M12C (7): 1.0 Record the Alignment figures below in relevant sheet box. || 2.0 Following consultation with Supplier on the as-found readings, if nece || 3.0 Remove coupli
- M13B (1): 6.0 Record any additional comments obtained on Pre-Commissioning activitie
- M13C (8): 6.0 For Lubricating Oil System: || 6.1c Check cleanliness of sump and is filled with correct lube oil.  Record || 7.0 For Cooling System:
- M14B (2): 4.0 Remove any access plates / inspection hatch cover(s) and inspect and r || 9.0 Confirm the following: Confirmar lo siguiente:
- M18A (2): 10.0 Axial float of Turbine verified and recorded Verificar y registrar el  || 11.0 Soft feet of Turbine verified and recorded Verificar y registrar el pa
- M22B (1): 6.0 Carry out an unloaded test of the trolley hoist and check for the foll
- M22C (1): 6.0 Carry out an unloaded test of the trolley hoist and check for the foll
- M23B (1): 8.0 Remove any access plate / inspection hatch covers and inspect and reco
- M24A (2): 3.0 Check and record that the correct nozzle type is fitted.:- Type ______ || 5.0 Check that the gearbox lubricant level is correct, and the Pelton driv
- M27C (1): 6.0 Remove any access plates / inspection hatch cover(s) and inspect and r
- M33A (3): 3.0 Record actual Belt Deflection…………….....mm Registro actual de la desvia || 4.0 Record actual  Angular Miss-alignment………………mm Registrar el desalineami || 7.0 
- M34A (1): 13.0 Confirm Grease nipples installed & lubrication. Record type in remarks
- M35A (1): 6.0 Confirm torque / tension of slew ring bolts, include certificate in MC
- M36C (1): 9.0 Verify the following:
- M37A (4): 13.0 Confirm all material certificates are recorded. Confirmar que todos lo || 14.0 Confirm NDE completed and reports recorded. Confirmar que NDE está com || 16
- M38A (1): 16.0 Confirm lubrication schedule relevant to package complies to project s
- M39A (1): 2.0 Check that all new boiler tubing has been satisfactorily pressure test
- M42A (5): 5.0 Before and during (1/4, 1/2, & 3/4) filling the tank with water, check || 6.0 With the manhole and/or other roof fittings open, slowly fill the tank || 8.0 
- M43A (3): 07 If gearbox fitted, check preservation oil removed and filled with corr || 08 If pulleys fitted -check correctly aligned. Record belt tension Si las || 11 Che
- M43C (8): 4.0 Test and record Motor Insulation Resistance. Medir y registrar resiste || 6.0 Check motor bearings grease lubrication. Change or regrease if needed  || 7.0 
- M44A (2): 06 All trays level to within tolerance, i.e. Max 0.3% of dia or 6mm which || 07 All trays underflow downcomer clearances correct to drawing. Tolerance
- M44B (2): 7.0 Coordinate activities with Instrument & Electrical groups to verify th || 7.1 Perform instrument continuity checks and calibrate instruments and con
- M49B (1): 10.0 Record any additional checks that may have been performed as requested
- M50B (4): 7.0 Coordinate activities with Instrument & Electrical groups to verify th || 7.1 Perform instrument continuity checks and calibrate instruments and con || 7.6 
- M51B (3): 7.0 Coordinate activities with Instrument & Electrical groups to verify th || 7.1 Perform instrument continuity checks and calibrate instruments and con || 21.0
- M52B (3): 8.0 Coordinate activities with Instrument & Electrical groups to verify th || 8.1 Perform instrument continuity checks and calibrate instruments and con || 17.4
- M52C (1): 5.0 Remove access / cover plate of combustion chamber, inspect and record 
- M53C (7): 4.0 Record the following for the chemical material loaded: Registre lo sig || 4.1 Name of Product: Nombre del Producto: || 4.2 Product Specification / Identific
- M54B (4): 6.0 Lubricating Oil System: Sistema de lubricación de aceite: || 7.0 Cooling System: Sistema de enfriamiento: || 8.0 Air Intake System: Sistema de entrada de ai
- M55B (2): 7.0 Coordinate activities with Instrument & Electrical groups to verify th || 7.1 Perform instrument continuity checks and calibrate instruments and con
- M57B (6): 8.0 Coordinate activities with Instrument & Electrical groups to verify th || 8.1 Perform instrument continuity checks and calibrate instruments and con || 8.10
- M58B (3): 5.4 Measurement of clearance of blades tips (Final) verified. Verifique qu || 11.0 Coordinate activities with Instrument & Electrical groups to verify th || 11.
- M59B (1): 4.0 Remove any access plate / inspection hatch covers and inspect and reco
- M60B (2): 6.0 Coordinate activities with Instrument & Electrical groups to verify th || 6.1 Perform instrument continuity checks and calibrate instruments and con
- M61B (2): 6.0 Coordinate activities with Instrument & Electrical groups to verify th || 6.1 Perform instrument continuity checks and calibrate instruments and con
- M64B (2): 16.0 Verify the installation of air pressure gauge (0-100 psig) between ins || 18.0 Coordinate activities with Instrument & Electrical groups to verify th
- P03A (11): 1.0 Gauge 1 Calibration Check – Tag/Serial No: Escala 1 Chequeo de Calibra || 1.2 Dead Weight Tester Serial No.: No. Serie probador de peso muerto: || 1.3 Test 
- P04A (2): 2.0 Check all NDE and PWHT has been met and recorded. Comprobar que todas  || 3.0 TEST RESULTS and READINGS RESULTADOS DEL TEST y LECTURAS
- P05A (1): 1.0 For ISLT and Visual Test Packs with no P04A Check all NDE and PWHT has
- P06A (1): 1.0 Verify the following Pipe Marking details for all lines shown on the P
- P06A(1) (1): 1.0 Verify the following Pipe Marking details for all lines shown on the P
- P08A (3):  BEFORE WELDING ANTES DE LA SOLDADURA Each of the following considerati ||  BEFORE CUTTING ANTES DEL CORTE Each of the following considerations sh ||  BEFORE RE
- P10A (1): 2 Check all NDE and Stress relieving has been met and recorded including
- P11B (3): 6.0 System/subsystem circulated for ______hrs and/or until the degreasing  || 9.0 System / subsystem circulated for ______hrs and/or until required iron || 12.0
- P13B (2): 1.0 Select Cleaning Medium used: Seleccionar el medio de limpieza utilizad || 2.0 Select Inspection Method(s) used: Seleccionar método(s) de Inspección 
- P15B (3): 3.0 Relief valve available.    (If no, indicate why) Valve number set at:  || 14.0 Work Permit No.:_________________ Permiso de trabajo No.: || 1.0 Test pressur
- P15C (7): 4.0 Test medium recommended: Medio de prueba recomendado: Air: ____ Aire:  || 5.0 Design Pressure for the System to be tested:              Psi(g) Presi || 6.0 
- P19B (2): 2.0 Verify that the steam conditions apply as agreed upon and approved in  || 4.0 Verify that was selected the appropriate Inspection Method according t
- P21C (2): 1.2 Variable springs (Quantity): Resortes Variables (Cantidad): || 1.3 Constant springs (Quantity): Resortes Constantes (Cantidad):
- Q02A (4): 2.0 INSULATION PROTECTION / WEATHER PROOFING: PROTECCION DE AISLAMIENTO /  || 2.1 Overlap, longitudinal min 50mm Superposición, longitudinal min 50mm || 2.2 Ove
- Q07A (1): 1.3 Tonnage used: Tonelaje usado:
- T04B (2): 1.0 Verify that device and cables A check sheets and tests are complete. V || 3.0 Measure supply voltage (120Vac) and audio voltage (25Vac). Medir tensi
- T06B (1): 1.0 Verify that device and cables A check sheets and tests are complete. V
- T09A (2): 18.0 Check record earth bar resistance to telecom / clean earth. Verificar  || 19.0 Check record earth bar resistance to general earth. Verificar el regis
- T09C (2): 4.0 Measure supply voltage (120Vac). Medir tensión de alimentación (120Vac || 13.1 Measure internal supply voltage (120Vac). Medición de tensión de alime
- T11B (1): 4.0 Measure supply voltage (120Vac). Medir tensión de alimentación (120Vac
- T12B (2): 1.0 Verify that device and cables A check sheets and tests are complete. V || 3.0 Measure device voltaje. Medir tensión de dispositivo.

## Tablas que el clasificador no reconoció (revisar a mano): 22

- E02A: Final Testing
- E03B: Load Test Log Sheet:
- E03BV: SUB-SYSTEM No
- E05B: 8.0 | Ratio Test (to be combined With Relay Testing, If Required) Prueba de Relación de Transformación (para ser combina
- E11A: Distribution board Ref: Referencia del tablero de distribución | Circuit Ref: Referencia de circuito || Tag No. | Description
- E11B: CIRCUIT DEVICES DETAILS: DETALLES DE LOS DISPOSITIVOS DE LOS CIRCUITOS:
- E12A: List of components in the circuit
- E13A: Distribution board Ref: Referencia del tablero de distribución | Circuit Ref: Referencia de circuito
- E19A: WIRING CHECKS
- E29A: Cable Drum No (No de tambor de cables)
- E32A: Manufacturer: Fabricante | Model No.: No de modelo
- E34A: INFORMATION AND INSPECTION
- E37A: Insulation resistance testing – check each core –Records in MΩ. Acceptable minimum: 25 Ω.  Test with 500V. Pruebas de Re || 1-2 | 1-3 | 1-4 | 1-5 | 1-6 | 1-7
- E41A: INFORMATION AND INSPECTION || List of components in the circuit
- I02A: For measurements check, use calipers  Para la prueba de mediciones, usar calibradores
- I11B: CALIBRATION EQUIPMENTS EQUIPOS DE CALIBRACION || OPERATION TEST PRUEBA DE OPERACION || ANCILLIARIES TEST PRUEBA DE ACCESORIOS
- I34B: OPERATION TEST PRUEBAS DE OPERACIÓN
- P01A: System / Sub-System Description: Descripción Sistema / Sub-Sistema:
- P15C: Reference P&ID Numbers:
- P17B: Reference P&ID Numbers: Números P&ID de Referencia:
- P21C: Reference P&ID Numbers: || I.D. Numbers for Lines and installed Spring Supports tags and manufacturers: Código y Número de líneas e identificación 
- X01A: List of boundary drawings reflecting the scope of the tag: Lista de los planos de los limites que refleja el alcance de  || The painting/coating scope of work a
