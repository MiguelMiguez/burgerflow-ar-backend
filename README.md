# BurgerFlow Backend

Backend de gestión de pedidos de hamburguesas con sistema multi-tenant. Integración con Meta WhatsApp Business Cloud API para tomar pedidos por WhatsApp.

## 🚀 Migración a Meta WhatsApp Cloud API

**⚠️ IMPORTANTE**: Este proyecto fue migrado de `whatsapp-web.js` a la **Meta WhatsApp Business Cloud API oficial**.

📖 **Lee la guía completa de migración**: [META_WHATSAPP_MIGRATION.md](./META_WHATSAPP_MIGRATION.md)

### Cambios Principales

- ❌ Eliminado: `whatsapp-web.js`, `qrcode-terminal`, `puppeteer`
- ✅ Agregado: `axios`, Meta WhatsApp Business Cloud API (webhook + HTTP API)
- 🔄 Arquitectura: De emulación de navegador a webhook oficial
- 🏢 Multi-tenant: Cada negocio con sus propias credenciales de WhatsApp

## Requisitos previos

- Node.js 18 o superior
- Cuenta de Firebase con proyecto configurado y credenciales de servicio
- **Meta for Developers Account** (para WhatsApp Business API)
- **Meta Business Manager** (para gestionar números de WhatsApp Business)

## Configuración

### 1. Dependencias

```bash
npm install
```

### 2. Variables de Entorno

Copia `.env.example` a `.env` y completa:

```bash
# Firebase
FIREBASE_PROJECT_ID=tu-proyecto-firebase
FIREBASE_CLIENT_EMAIL=tu-service-account@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# API Keys
ADMIN_API_KEY=tu_admin_key_seguro
USER_API_KEY=tu_user_key_seguro

# Meta WhatsApp Business API
META_VERIFY_TOKEN=tu_token_secreto_para_verificar_webhook
META_APP_SECRET=tu_app_secret_de_meta
META_API_VERSION=v21.0
```

### 3. Configurar Meta WhatsApp

1. **Crear App en Meta for Developers**:
   - Ve a https://developers.facebook.com/
   - Crea una app tipo "Business"
   - Agrega el producto "WhatsApp"

2. **Configurar Webhook**:
   - URL: `https://tu-dominio.com/api/webhook`
   - Verify Token: El mismo valor de `META_VERIFY_TOKEN`
   - Suscríbete a: `messages`

3. **Obtener Credenciales por Tenant**:
   - **Phone Number ID**: En WhatsApp > API Setup
   - **Access Token**: System User Token (recomendado)

4. **Agregar Credenciales al Tenant**:

```bash
# Edita src/scripts/addMetaCredentials.ts con tus valores
npm run script:add-meta-credentials
```

O manualmente en Firestore:

```javascript
{
  id: "tenant-id",
  name: "Mi Hamburguesería",
  isActive: true,
  metaPhoneNumberId: "123456789012345",
  metaAccessToken: "EAAxxxxx..."
}
```

## Scripts disponibles

- `npm run dev`: Servidor desarrollo con `ts-node`
- `npm run typecheck`: Validar tipos TypeScript
- `npm run build`: Compilar a JavaScript
- `npm start`: Ejecutar servidor compilado
- `npm run script:add-meta-credentials`: Agregar credenciales de Meta a un tenant
- `npm run script:clear-db`: Limpiar base de datos (desarrollo)

## 🤖 Bot de WhatsApp

### Funcionalidades

El bot permite a los clientes:

1. ✅ Ver el menú de hamburguesas
2. ✅ Agregar productos al carrito
3. ✅ Personalizar ingredientes (agregar/quitar)
4. ✅ Seleccionar delivery o retiro
5. ✅ Elegir método de pago (efectivo/transferencia)
6. ✅ Confirmar y crear pedidos

### Comandos del Cliente

- `hola` / `buenas`: Saludo inicial
- `menu` / `ayuda`: Ver ayuda
- `hamburguesas` / `menu`: Ver productos disponibles
- `pedir` / `ordenar`: Iniciar flujo de pedido
- `cancelar`: Cancelar pedido actual
- Números (1, 2, 3...): Seleccionar productos/opciones

### Flujo de Conversación

```
Cliente: pedir
Bot: [Muestra menú]

Cliente: 1
Bot: ¿Cuántas unidades?

Cliente: 2
Bot: ¿Deseas personalizarlo? (si/no)

Cliente: si
Bot: [Opciones de ingredientes]

Cliente: listo
Bot: ¿Agregar más productos? (si/no)

Cliente: no
Bot: ¿Delivery o retiro? (1/2)

Cliente: 1
Bot: Escribe tu dirección

Cliente: Calle Falsa 123...
Bot: ¿Cómo pagas? (1. Efectivo / 2. Transferencia)

Cliente: 1
Bot: [Resumen del pedido]
     ¿Confirmamos? (confirmar/cancelar)

Cliente: confirmar
Bot: ✅ ¡Pedido confirmado! #ABC123
```

## 🔧 Arquitectura

### Recepción de Mensajes (Webhook)

```
WhatsApp → Meta Cloud API → POST /api/webhook → processIncomingMessage() → Bot
```

### Envío de Mensajes (HTTP API)

```
Bot → metaService.sendMessage() → Graph API → WhatsApp
```

### Componentes Principales

- **webhookController.ts**: Maneja verificación y recepción de webhooks de Meta
- **burgerBotRefactored.ts**: Lógica del bot de pedidos (estado conversacional)
- **metaService.ts**: Cliente HTTP para enviar mensajes vía Graph API
- **tenantService.ts**: Gestión de multi-tenant (lookup por phoneNumberId)
- **orderService.ts**: Creación y gestión de pedidos
- **productService.ts**: Gestión de menú y productos

## 📡 API Endpoints

### Públicos (sin autenticación)

- `GET /api/webhook`: Verificación de webhook de Meta
- `POST /api/webhook`: Recepción de mensajes de WhatsApp

### Protegidos (requieren API key)

- `GET /api/tenants`: Listar tenants
- `GET /api/products`: Listar productos
- `POST /api/products`: Crear producto
- `GET /api/orders`: Listar pedidos
- `POST /api/orders`: Crear pedido manual
- ... (ver Swagger en `/api-docs`)

## 🚢 Despliegue

### Railway / Render / Heroku

1. Configura variables de entorno en el panel
2. Conecta repositorio
3. El servicio auto-detectará `npm start`
4. Configura el webhook en Meta con tu URL

### Render (render.yaml incluido)

```bash
git push origin main
# Render detecta render.yaml y despliega automáticamente
```

### Verificar Despliegue

```bash
# Verificar que el servidor responde
curl https://tu-dominio.com/health

# Verificar webhook (debe devolver 403 sin parámetros)
curl https://tu-dominio.com/api/webhook
```

## 🔍 Troubleshooting

Ver [META_WHATSAPP_MIGRATION.md](./META_WHATSAPP_MIGRATION.md) sección "Troubleshooting".

### Problemas Comunes

**"Webhook verification failed"**

- Verifica que `META_VERIFY_TOKEN` coincida exactamente
- Revisa logs del servidor

**"No se encontró tenant para phoneNumberId"**

- Ejecuta `npm run script:add-meta-credentials`
- Verifica que `metaPhoneNumberId` en Firestore coincida con el del webhook

**"Error 401 Unauthorized"**

- Token de Meta inválido o expirado
- Genera nuevo token en Meta Business Manager

## 📚 Recursos

- [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Guía de Migración Completa](./META_WHATSAPP_MIGRATION.md)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)

## 📝 Licencia

Privado - AcaCoop
name: "Mi Hamburguesería",
isActive: true,
metaPhoneNumberId: "123456789012345",
metaAccessToken: "EAAxxxxx..."
}

```

## Scripts disponibles

- `npm run dev`: Servidor desarrollo con `ts-node`
- `npm run typecheck`: Validar tipos TypeScript
- `npm run build`: Compilar a JavaScript
- `npm start`: Ejecutar servidor compilado
- `npm run script:add-meta-credentials`: Agregar credenciales de Meta a un tenant
- `npm run script:clear-db`: Limpiar base de datos (desarrollo)

## 🤖 Bot de WhatsApp

### Funcionalidades

El bot permite a los clientes:

1. ✅ Ver el menú de hamburguesas
2. ✅ Agregar productos al carrito
3. ✅ Personalizar ingredientes (agregar/quitar)
4. ✅ Seleccionar delivery o retiro
5. ✅ Elegir método de pago (efectivo/transferencia)
6. ✅ Confirmar y crear pedidos

### Comandos del Cliente

- `hola` / `buenas`: Saludo inicial
- `menu` / `ayuda`: Ver ayuda
- `hamburguesas` / `menu`: Ver productos disponibles
- `pedir` / `ordenar`: Iniciar flujo de pedido
- `cancelar`: Cancelar pedido actual
- Números (1, 2, 3...): Seleccionar productos/opciones

### Flujo de Conversación

```

Cliente: pedir
Bot: [Muestra menú]

Cliente: 1
Bot: ¿Cuántas unidades?

Cliente: 2
Bot: ¿Deseas personalizarlo? (si/no)

Cliente: si
Bot: [Opciones de ingredientes]

Cliente: listo
Bot: ¿Agregar más productos? (si/no)

Cliente: no
Bot: ¿Delivery o retiro? (1/2)

Cliente: 1
Bot: Escribe tu dirección

Cliente: Calle Falsa 123...
Bot: ¿Cómo pagas? (1. Efectivo / 2. Transferencia)

Cliente: 1
Bot: [Resumen del pedido]
¿Confirmamos? (confirmar/cancelar)

Cliente: confirmar
Bot: ✅ ¡Pedido confirmado! #ABC123

````

## 🔧 Arquitectura

```bash
npm run dev
````

El servidor queda disponible en `http://localhost:3000` (o el puerto definido en `PORT`).

## Endpoints iniciales

- `POST /bookings` crea un turno si el horario está disponible.
- `GET /bookings` lista todos los turnos.
- `DELETE /bookings/:id` elimina un turno existente.
- `GET /services` lista los servicios disponibles.
- `POST /services` crea un servicio (pensado para pruebas y bootstrap).

## Estructura del proyecto

```
/src
 ├── index.ts
 ├── config/
 ├── controllers/
 ├── routes/
 ├── services/
 ├── models/
 └── utils/
```

Cada capa mantiene responsabilidades separadas para favorecer la escalabilidad y facilitar futuras integraciones con otros canales o tipos de negocio.
