-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('CLIENTE', 'OPERADOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('SOLICITADO', 'COTIZADO', 'APROBADO', 'EN_COLA', 'IMPRIMIENDO', 'POSPROCESO', 'LISTO_ENTREGA', 'ENTREGADO', 'EXPIRADO', 'CANCELADO', 'FALLIDO', 'REQUIERE_REVISION');

-- CreateEnum
CREATE TYPE "TipoImpresora" AS ENUM ('FDM', 'SLA');

-- CreateEnum
CREATE TYPE "TipoMaterial" AS ENUM ('PLA', 'PETG', 'ABS', 'TPU', 'RESINA');

-- CreateEnum
CREATE TYPE "ResultadoIntento" AS ENUM ('EN_CURSO', 'EXITO', 'FALLA', 'CANCELADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'CLIENTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impresora" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoImpresora" NOT NULL,
    "extrusorDirecto" BOOLEAN NOT NULL DEFAULT false,
    "volX" INTEGER NOT NULL,
    "volY" INTEGER NOT NULL,
    "volZ" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Impresora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoMaterial" NOT NULL,
    "color" TEXT NOT NULL,
    "precioGramo" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bobina" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "materialId" INTEGER NOT NULL,
    "gramosDisponibles" INTEGER NOT NULL,
    "gramosReservados" INTEGER NOT NULL DEFAULT 0,
    "gramosConsumidos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Bobina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" SERIAL NOT NULL,
    "folio" TEXT NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'SOLICITADO',
    "archivoStl" TEXT NOT NULL,
    "materialTipo" "TipoMaterial" NOT NULL,
    "color" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "dimX" INTEGER NOT NULL,
    "dimY" INTEGER NOT NULL,
    "dimZ" INTEGER NOT NULL,
    "notas" TEXT,
    "gramosEstimados" INTEGER,
    "horasEstimadas" DECIMAL(6,2),
    "total" DECIMAL(10,2),
    "anticipo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "anticipoDevuelto" BOOLEAN NOT NULL DEFAULT false,
    "prioridad" INTEGER NOT NULL DEFAULT 0,
    "fallosConsecutivos" INTEGER NOT NULL DEFAULT 0,
    "impresoraId" INTEGER,
    "bobinaId" INTEGER,
    "cotizadoEn" TIMESTAMP(3),
    "entregadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "bobinaId" INTEGER NOT NULL,
    "gramos" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intento" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "impresoraId" INTEGER NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "resultado" "ResultadoIntento" NOT NULL DEFAULT 'EN_CURSO',
    "horas" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "gramos" INTEGER NOT NULL DEFAULT 0,
    "merma" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Intento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "siguienteIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoError" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarifa" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "costoHoraMaquina" DECIMAL(10,2) NOT NULL,
    "margen" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "Tarifa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Impresora_nombre_key" ON "Impresora"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Material_tipo_color_key" ON "Material"("tipo", "color");

-- CreateIndex
CREATE UNIQUE INDEX "Bobina_codigo_key" ON "Bobina"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_folio_key" ON "Pedido"("folio");

-- CreateIndex
CREATE INDEX "Pedido_estado_idx" ON "Pedido"("estado");

-- CreateIndex
CREATE INDEX "Pedido_clienteId_idx" ON "Pedido"("clienteId");

-- CreateIndex
CREATE INDEX "Reserva_pedidoId_idx" ON "Reserva"("pedidoId");

-- CreateIndex
CREATE INDEX "Intento_inicio_idx" ON "Intento"("inicio");

-- CreateIndex
CREATE UNIQUE INDEX "Outbox_eventId_key" ON "Outbox"("eventId");

-- CreateIndex
CREATE INDEX "Outbox_publicado_siguienteIntento_idx" ON "Outbox"("publicado", "siguienteIntento");

-- AddForeignKey
ALTER TABLE "Bobina" ADD CONSTRAINT "Bobina_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_impresoraId_fkey" FOREIGN KEY ("impresoraId") REFERENCES "Impresora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_bobinaId_fkey" FOREIGN KEY ("bobinaId") REFERENCES "Bobina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_bobinaId_fkey" FOREIGN KEY ("bobinaId") REFERENCES "Bobina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intento" ADD CONSTRAINT "Intento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intento" ADD CONSTRAINT "Intento_impresoraId_fkey" FOREIGN KEY ("impresoraId") REFERENCES "Impresora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
