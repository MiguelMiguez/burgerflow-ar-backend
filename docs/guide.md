# 🍔 Guía de Implementación: Bot WhatsApp API (BurgerFlow)

**Versión:** 1.0 (Estándar "Clean Slate")
**Fecha de Revisión:** Febrero 2026
**Objetivo:** Procedimiento estandarizado para desplegar nuevos clientes en BurgerFlow evitando errores de sesión (`2388001`) y problemas de permisos.

---

## 📋 1. Pre-requisitos Críticos

Antes de iniciar la configuración digital, se deben cumplir estos requisitos físicos:

1.  **Chip (SIM) NUEVO Y VIRGEN:**
    - El número **NO** debe haber sido registrado nunca en WhatsApp Messenger o Business anteriormente.
    - _Razón:_ Evita el error de "Número ya registrado" y problemas de caché en servidores de Meta.
2.  **Dispositivo para SMS:**
    - Un celular básico o libre.
    - **ADVERTENCIA:** ⛔ **NO instalar la App de WhatsApp** en este dispositivo. Solo usarlo para recibir el SMS de la operadora y el código de verificación de Facebook.
3.  **Accesos:**
    - Meta Business Suite (Admin).
    - Panel de Desarrolladores (Developers).
    - Firebase Console (Firestore).
    - Render Dashboard (Logs).

---

## ⚙️ 2. Configuración en Meta (Permisos)

El error más común es usar un perfil personal. Siempre configurar un **Usuario del Sistema**.

### 2.1. Crear/Verificar Usuario del Sistema

1.  Ir a **Configuración del Negocio** > **Usuarios** > **Usuarios del sistema**.
2.  Si no existe, crear uno llamado `BotServer` (Rol: Admin).
3.  **Generar Token:**
    - Clic en "Generar nuevo token".
    - Seleccionar App: `BurgerFlow`.
    - Permisos obligatorios: `whatsapp_business_messaging`, `whatsapp_business_management`.
    - 💾 **Guardar este Token (EAA...) en un lugar seguro.**

### 2.2. Asignación de Activos (Paso Anti-Errores)

Para evitar el error `(#100) Object does not exist`:

1.  En **Usuarios del sistema**, seleccionar `BotServer`.
2.  Clic en **Asignar activos**.
3.  Ir a **Cuentas de WhatsApp** > Seleccionar la cuenta del cliente.
4.  Permisos: Activar **Control total**.
5.  Guardar cambios.

---

## ☁️ 3. Registro del Número (Método API)

Aunque se puede hacer visualmente, recomendamos el **Graph API Explorer** para tener feedback real de errores.

### 3.1. Obtener ID del Teléfono

1.  Agregar el número en el **WhatsApp Manager** (con verificación por SMS).
2.  Si queda en estado "Conectado": Copiar el **Identificador de número de teléfono**.
3.  Si queda en estado "Pendiente" o da error, proceder al paso 3.2.

### 3.2. Registro Forzado (Si el panel falla)

1.  Abrir [Graph API Explorer](https://developers.facebook.com/tools/explorer).
2.  **Token:** Usar el Token del Bot (`EAA...`).
3.  **Método:** `POST`.
4.  **URL:** `PHONE_NUMBER_ID/register`
5.  **Body (JSON):**
    ```json
    {
      "messaging_product": "whatsapp",
      "pin": "123456"
    }
    ```
6.  Resultado esperado: `{"success": true}`.

---

## 🔗 4. Conexión Backend (Render & Firebase)

### 4.1. Configuración de Webhook

1.  En **developers.facebook.com** > WhatsApp > Configuración.
2.  Verificar URL de Callback (`.../api/webhook`) y Verify Token.
3.  **Suscripción a Campos:**
    - Clic en "Administrar".
    - Asegurar que **`messages`** esté suscrito (Check verde).
    - _Tip:_ Si ya estaba verde, desmarcar y volver a marcar para refrescar.

### 4.2. Actualización de Base de Datos

1.  Ir a **Firebase Firestore**.
2.  Colección `tenants` > Documento del cliente (ej: `default`).
3.  Actualizar campo: **`metaPhoneNumberId`**.
    - Valor: El ID numérico obtenido en el paso 3.1.
    - _Nota:_ No confundir con el `WABA ID` (Identificador de cuenta comercial).

---

## 🚀 5. Activación "En Vivo"

Como es un número nuevo, no podemos iniciar conversación con plantillas de prueba.

1.  **Generar Enlace Directo:**
    `https://wa.me/54911XXXXXXXX` (Reemplazar con el número del chip).
2.  **Disparar Conversación:**
    - Enviar ese enlace a tu celular personal.
    - Abrirlo y enviar un mensaje: **"Hola"**.
3.  **Verificación:**
    - Revisar logs en Render. Debe aparecer `WEBHOOK RECIBIDO`.
    - El bot debe responder automáticamente.

---

## 🎨 6. Personalización Final (Makeup)

El perfil no se edita en el celular. Se hace en la nube.

1.  Ir a **WhatsApp Manager** > Número > Configuración (⚙️) > **Perfil**.
2.  Subir:
    - Logo (640x640px recom.).
    - Descripción del negocio.
    - Dirección y Web.
3.  _Nota:_ Los cambios pueden tardar 5-10 min en reflejarse en los dispositivos.

---

## 🚑 Troubleshooting (Solución de Errores)

| Error                                    | Causa Probable                               | Solución                                                                                                                         |
| :--------------------------------------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `(#100) Object... does not exist`        | Token incorrecto o falta asignar activo.     | Verificar Fase 2.2 (Asignar activos al System User).                                                                             |
| `Error 2388001` (Ya registrado)          | El número sigue activo en un celular físico. | 1. Instalar WhatsApp en el celular.<br>2. **Eliminar cuenta** desde ajustes.<br>3. Esperar 3 min.<br>4. Reintentar registro API. |
| `(#133010) Account not registered`       | Número verificado pero desconectado.         | Ejecutar Paso 3.2 (Registro Forzado).                                                                                            |
| Logs vacíos en Render                    | Webhook dormido.                             | Ir a config de Webhook y resuscribir el campo `messages`.                                                                        |
| Bot no responde (Log: `No tenant found`) | ID incorrecto en Firebase.                   | Verificar que `metaPhoneNumberId` en Firebase coincida con el `phone_number_id` que llega en el JSON del webhook.                |
