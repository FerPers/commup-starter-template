/** Campos de una señal que un supervisor corrige en la app (S07, F-16). Seguro para cliente. */
export const SIGNAL_EDITABLE = [
  'junction_box', 'marshalling', 'io_card', 'io_channel', 'dcs_tag', 'hmi_display',
  'range_min', 'range_max', 'eng_unit', 'alarm_setpoints',
] as const
export type SignalEditable = (typeof SIGNAL_EDITABLE)[number]
