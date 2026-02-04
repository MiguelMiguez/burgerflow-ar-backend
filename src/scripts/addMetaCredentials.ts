/**
 * Script para agregar credenciales de Meta WhatsApp a un tenant existente
 *
 * Uso:
 * 1. Configurar las credenciales abajo
 * 2. Ejecutar: npm run script:add-meta-credentials
 */

import { getFirestore } from "../config/firebase";
import { logger } from "../utils/logger";

// ============================================
// CONFIGURACIÓN - Edita estos valores
// ============================================

const TENANT_ID = "default"; // ID del tenant en Firestore

// Obtener estos valores de Meta for Developers:
// https://developers.facebook.com/apps/
const META_PHONE_NUMBER_ID = "123456789012345"; // Phone Number ID de tu WhatsApp Business
const META_ACCESS_TOKEN = "EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // Access Token (System User Token recomendado)

// ============================================

async function addMetaCredentials() {
  try {
    logger.info(`Actualizando tenant ${TENANT_ID} con credenciales de Meta...`);

    const db = getFirestore();
    const tenantRef = db.collection("tenants").doc(TENANT_ID);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      logger.error(`Tenant ${TENANT_ID} no existe en Firestore`);
      logger.info("Tenants disponibles:");
      const tenantsSnapshot = await db.collection("tenants").get();
      tenantsSnapshot.forEach(
        (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
          logger.info(`  - ${doc.id} (${doc.data().name})`);
        },
      );
      process.exit(1);
    }

    const tenantData = tenantDoc.data();
    logger.info(`Tenant encontrado: ${tenantData?.name}`);

    // Actualizar con credenciales de Meta
    await tenantRef.update({
      metaPhoneNumberId: META_PHONE_NUMBER_ID,
      metaAccessToken: META_ACCESS_TOKEN,
      updatedAt: new Date().toISOString(),
    });

    logger.info("✅ Credenciales de Meta agregadas exitosamente");
    logger.info(`Phone Number ID: ${META_PHONE_NUMBER_ID}`);
    logger.info(`Access Token: ${META_ACCESS_TOKEN.substring(0, 20)}...`);

    // Verificar configuración
    const updatedDoc = await tenantRef.get();
    const updatedData = updatedDoc.data();

    if (
      updatedData?.metaPhoneNumberId === META_PHONE_NUMBER_ID &&
      updatedData?.metaAccessToken === META_ACCESS_TOKEN
    ) {
      logger.info("\n✅ Verificación exitosa - Configuración completa");
      logger.info("\nPróximos pasos:");
      logger.info("1. Configura el webhook en Meta for Developers");
      logger.info(`   URL: https://tu-dominio.com/api/webhook`);
      logger.info(
        `   Verify Token: ${process.env.META_VERIFY_TOKEN || "[definir en .env]"}`,
      );
      logger.info("2. Envía un mensaje de prueba al número de WhatsApp");
      logger.info("3. Revisa los logs del servidor para confirmar recepción");
    } else {
      logger.error(
        "❌ Error en verificación - Los datos no se guardaron correctamente",
      );
    }

    process.exit(0);
  } catch (error) {
    logger.error("Error al agregar credenciales de Meta");
    if (error instanceof Error) {
      logger.error(error.message);
    }
    process.exit(1);
  }
}

// Validaciones
if (META_PHONE_NUMBER_ID === "123456789012345") {
  logger.error(
    "⚠️  ERROR: Debes configurar META_PHONE_NUMBER_ID antes de ejecutar este script",
  );
  logger.info("\nPara obtenerlo:");
  logger.info("1. Ve a https://developers.facebook.com/apps/");
  logger.info("2. Selecciona tu app");
  logger.info("3. WhatsApp > API Setup");
  logger.info("4. Copia el 'Phone number ID'");
  process.exit(1);
}

if (META_ACCESS_TOKEN === "EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") {
  logger.error(
    "⚠️  ERROR: Debes configurar META_ACCESS_TOKEN antes de ejecutar este script",
  );
  logger.info("\nPara obtenerlo:");
  logger.info("1. Ve a https://business.facebook.com/settings/system-users");
  logger.info("2. Crea un System User (recomendado) o usa token temporal");
  logger.info(
    "3. Asigna permisos: whatsapp_business_messaging, whatsapp_business_management",
  );
  logger.info("4. Genera el token y cópialo");
  process.exit(1);
}

// Ejecutar
addMetaCredentials();
