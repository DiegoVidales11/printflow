import { z } from 'zod';

// Validación en el cliente con Zod. La validación definitiva la hace el servidor (class-validator).

export const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

export const registroSchema = z.object({
  nombre: z.string().min(2, 'Escribe tu nombre'),
  email: z.string().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

export const solicitudSchema = z.object({
  archivoStl: z.string().regex(/\.stl$/i, 'El archivo debe ser .stl'),
  materialTipo: z.enum(['PLA', 'PETG', 'ABS', 'TPU', 'RESINA']),
  color: z.string().min(2, 'Indica el color'),
  cantidad: z.coerce.number().int().min(1).max(100),
  dimX: z.coerce.number().int().positive('Medida en mm'),
  dimY: z.coerce.number().int().positive('Medida en mm'),
  dimZ: z.coerce.number().int().positive('Medida en mm'),
  notas: z.string().max(500).optional(),
});

export const cotizarSchema = z.object({
  gramosPorPieza: z.coerce.number().int().positive(),
  horasPorPieza: z.coerce.number().positive(),
  impresoraId: z.coerce.number().int().positive('Elige impresora'),
  bobinaId: z.coerce.number().int().positive('Elige bobina'),
});

export const anticipoSchema = z.object({ monto: z.coerce.number().positive('Monto mayor a 0') });

/** Convierte FormData en objeto y valida; devuelve datos o el primer mensaje de error. */
export function validar<T>(schema: z.ZodType<T>, form: HTMLFormElement): { ok: true; datos: T } | { ok: false; error: string } {
  const crudo = Object.fromEntries(
    Array.from(new FormData(form).entries()).filter(([, v]) => v !== '').map(([k, v]) => [k, typeof v === 'string' ? v : v.name]),
  );
  const r = schema.safeParse(crudo);
  if (r.success) return { ok: true, datos: r.data };
  const i = r.error.issues[0];
  return { ok: false, error: `${i.path.join('.')}: ${i.message}` };
}
