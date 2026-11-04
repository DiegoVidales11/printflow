# PrintFlow — Gestión de un taller de impresión 3D bajo pedido

Práctica integradora de **Infraestructura de Servicios (Kubernetes)**.
Alumno: Diego Vidales Castillo.

Sistema de tres capas desplegado en k3s: web en **Next.js**, API en **NestJS + Prisma**, **PostgreSQL 16** (transaccional) y **MongoDB 7** (bitácora técnica), conectadas con el **patrón outbox**.

## Estructura

```
apps/api     API NestJS: auth JWT con 3 roles, pedidos y flujo de estados (409), reglas RN-1 a RN-6,
             inventario, impresoras, reportes, worker de outbox, semilla de datos
apps/web     Interfaz por rol (cliente, operador, administrador) con validación Zod
k8s/base     Manifiestos comunes (StatefulSets, Deployments, Ingress, NetworkPolicies, HPA, CronJob)
k8s/overlays dev y prod (Kustomize)
k8s/jobs     Migraciones y semilla (Jobs)
k8s/cluster  Emisor de certificados de cert-manager (una vez por clúster)
k8s/monitoring ServiceMonitor para Prometheus
.github/workflows/ci-cd.yml   Pruebas, imágenes en GHCR y despliegue
```

## Usuarios de prueba (semilla)

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | admin@printflow.mx | Admin12345 |
| Operador | operador1@printflow.mx | Operador12345 |
| Cliente | cliente1@correo.mx | Cliente12345 |

## Endpoints principales

| Método | Ruta | Rol |
| --- | --- | --- |
| POST | /auth/register, /auth/login | público |
| GET | /pedidos?q=&estado=&page=&limit= | todos (el cliente solo ve los suyos) |
| POST | /pedidos | cliente |
| POST | /pedidos/:id/cotizar | operador, admin |
| POST | /pedidos/:id/anticipo | operador, admin |
| PATCH | /pedidos/:id/estado | según la tabla de transiciones (409 si no está permitida) |
| GET/POST | /pedidos/:id/historial, /pedidos/:id/bitacora | historial en MongoDB |
| GET | /impresoras, /materiales, /bobinas, /tarifas | operador, admin |
| GET | /reportes/mensual?mes=AAAA-MM | admin |
| GET | /health/live, /health/ready, /metrics | público (probes y Prometheus) |
| POST | /internal/expirar | CronJob (token interno) |

## Pruebas unitarias

```bash
cd apps/api && npm ci && npx prisma generate && npm run build && npm test
```
