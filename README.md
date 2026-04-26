# assisone-backend

API multitenant para AssisOne — plataforma de coordinación de servicios de asistencia (auxilio vial, citas médicas) construida con Fastify, Prisma y BullMQ.

## Stack

- **Runtime:** Node.js 20 + TypeScript
- **Framework:** Fastify 4 (`@fastify/jwt`, `@fastify/cors`, `@fastify/multipart`)
- **ORM:** Prisma 5 sobre PostgreSQL
- **Colas:** BullMQ sobre Redis (ioredis)
- **Validación:** Zod
- **Auth:** JWT (`@fastify/jwt`) + bcryptjs
- **Integraciones:** WhatsApp Cloud API (Meta Graph), AWS S3 para evidencias

## Requisitos

- Node.js 20+
- PostgreSQL 14+
- Redis 6+

## Setup

```bash
npm install
cp .env.example .env       # editar con credenciales reales
npm run db:generate        # genera el cliente de Prisma
npm run db:migrate         # aplica migraciones en la DB local
npm run dev                # arranca con tsx watch en :3000
```

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Arranca el servidor en modo watch (`tsx watch src/server.ts`) |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta `dist/server.js` (requiere build previo) |
| `npm run db:migrate` | `prisma migrate dev` — crea/aplica migraciones en desarrollo |
| `npm run db:generate` | `prisma generate` — regenera el cliente tipado |
| `npm run db:studio` | Abre Prisma Studio para inspeccionar la DB |

## Variables de entorno

Ver `.env.example`. Las claves principales:

- `DATABASE_URL` — cadena de conexión a Postgres
- `REDIS_URL` — cadena de conexión a Redis (usado por BullMQ)
- `JWT_SECRET`, `JWT_EXPIRES_IN` (default `7d`)
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` — para subir evidencias
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_URL`

## Arquitectura

### Estructura de módulos

```
src/
├── app.ts                  # buildApp() — registra plugins y rutas
├── server.ts               # entrypoint
├── modules/
│   ├── auth/               # login / register / me
│   ├── services/           # ciclo de vida de servicios
│   ├── assignments/        # workers BullMQ (timer + push WhatsApp)
│   ├── notifications/      # cliente de WhatsApp Cloud API
│   └── webhooks/           # callback de WhatsApp inbound
└── shared/
    ├── lib/                # db (Prisma), redis (ioredis), bullmq (queues)
    └── middleware/         # authenticate, requireTenant
```

Cada módulo de feature sigue el patrón `routes.ts` → `controller.ts` → `service.ts` → `schema.ts` (Zod).

### Multi-tenancy

Todos los recursos del dominio están scoped por `tenantId`. El JWT carga `{ id, email, tenantId }`; `authenticate` lo verifica y `requireTenant` valida su presencia. Si `register` no recibe `tenantId`, se crea automáticamente un nuevo `Tenant` (slug derivado del nombre).

### Modelo de dominio

El núcleo modela un negocio de despacho de servicios:

- `Tenant` — workspace, dueño de usuarios, clientes, tipos de servicio.
- `Service` — caso de asistencia con ciclo de estados: `received → in_coordination → coordinated → assigned → in_progress → completed` (más `uncoordinated` por timeout).
- `ServiceAssignment` — oferta del servicio a un `Provider` (proveedor global, no scoped por tenant).
- `ServiceEvent` — timeline / auditoría.
- `ServiceEvidence` — fotos/documentos en S3.
- `Notification`, `Appointment` — comunicaciones y citas médicas.

Esquema completo: `prisma/schema.prisma`.

### Trabajos asíncronos

`src/shared/lib/bullmq.ts` define cuatro colas:

- `whatsapp-push` — envío de ofertas a proveedores
- `coordination-timer` — timeout de coordinación (`in_coordination → uncoordinated`)
- `evidence-upload` — descarga de media de WhatsApp y subida a S3
- `notifications` — notificaciones genéricas

Los workers viven junto al módulo que los consume (ej. `src/modules/assignments/assignments.worker.ts`). **No** se arrancan desde `buildApp()`; se ejecutan como side-effect al importarse, así que se espera correr el worker en un proceso/dyno separado.

### WhatsApp

- **Outbound** — `notifications/whatsapp.service.ts` envía mensajes de texto y templates interactivos con botones `Aceptar` / `Rechazar`.
- **Inbound** — `webhooks/whatsapp.routes.ts` (`POST /webhooks/whatsapp`) interpreta:
  - Botones interactivos `accept_<assignmentId>` / `reject_<assignmentId>`.
  - Texto en español (`EN CAMINO`, `LLEGUE`, `FINALIZADO`) que dispara transiciones de estado.
  - Imágenes/documentos que se encolan en `evidence-upload`.
- Verificación del webhook con `WHATSAPP_VERIFY_TOKEN`.

> Los mensajes de error y respuestas al usuario están en **español**. Mantener el idioma al añadir copy nuevo.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Healthcheck |
| `POST` | `/api/auth/login` | Login con email/password, devuelve JWT |
| `POST` | `/api/auth/register` | Registro (auto-crea tenant si no se especifica) |
| `GET` | `/api/auth/me` | Perfil del usuario autenticado |
| `GET` | `/webhooks/whatsapp` | Verificación del webhook (Meta) |
| `POST` | `/webhooks/whatsapp` | Recepción de mensajes WhatsApp |

> Otros módulos (`services`, `providers`, `webhooks`) están implementados pero **comentados en `app.ts`**. Para activarlos, descomentar la línea correspondiente en `buildApp()`.

## Deploy

`Dockerfile` multi-stage basado en `node:20-alpine`:

1. Build stage — `npm install`, `prisma generate`, `tsc`.
2. Runtime stage — solo dependencias de producción + `dist/`. Expone puerto `3000`.

Las migraciones (`prisma migrate deploy`) **no** se ejecutan dentro del contenedor; correrlas como paso separado en CI/CD.
