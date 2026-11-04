-- Restricciones CHECK (Prisma no las genera; se agregan a mano)

ALTER TABLE "Bobina" ADD CONSTRAINT "bobina_gramos_no_negativos"
  CHECK ("gramosDisponibles" >= 0 AND "gramosReservados" >= 0 AND "gramosConsumidos" >= 0);

-- No se puede reservar más de lo que hay en la bobina (segunda red de seguridad de RN-2)
ALTER TABLE "Bobina" ADD CONSTRAINT "bobina_reserva_maxima"
  CHECK ("gramosReservados" <= "gramosDisponibles");

ALTER TABLE "Pedido" ADD CONSTRAINT "pedido_anticipo_valido"
  CHECK ("anticipo" >= 0 AND ("total" IS NULL OR "anticipo" <= "total"));

ALTER TABLE "Pedido" ADD CONSTRAINT "pedido_cantidad_y_medidas"
  CHECK ("cantidad" > 0 AND "dimX" > 0 AND "dimY" > 0 AND "dimZ" > 0);

ALTER TABLE "Reserva" ADD CONSTRAINT "reserva_gramos_positivos" CHECK ("gramos" > 0);

ALTER TABLE "Tarifa" ADD CONSTRAINT "tarifa_unica" CHECK ("id" = 1);
