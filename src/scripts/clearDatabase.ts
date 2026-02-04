/**
 * Script para limpiar toda la base de datos de Firebase
 * Ejecutar con: npx ts-node src/scripts/clearDatabase.ts
 */

import admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Colecciones a nivel raíz
const ROOT_COLLECTIONS = ["tenants", "services"];

// Subcolecciones dentro de cada tenant
const TENANT_SUBCOLLECTIONS = [
  "products",
  "orders",
  "ingredients",
  "stockMovements",
  "deliveryZones",
  "deliveries",
  "cashRegisters",
  "bookings",
];

const initFirebase = (): admin.firestore.Firestore => {
  if (admin.apps.length === 0) {
    // Intentar usar credenciales de archivo JSON
    const credentialsPath = path.resolve(
      __dirname,
      "../../burgerflowar-firebase-credentials.json",
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require(credentialsPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase inicializado con archivo de credenciales");
    } catch {
      // Fallback a variables de entorno
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        "\n",
      );

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error(
          "No se encontraron credenciales de Firebase. Configura el archivo JSON o las variables de entorno.",
        );
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log("✅ Firebase inicializado con variables de entorno");
    }
  }

  return admin.firestore();
};

const deleteCollection = async (
  db: admin.firestore.Firestore,
  collectionPath: string,
  batchSize = 100,
): Promise<number> => {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  let totalDeleted = 0;

  const deleteQueryBatch = async (): Promise<void> => {
    const snapshot = await query.get();

    if (snapshot.empty) {
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    totalDeleted += snapshot.size;

    if (snapshot.size >= batchSize) {
      await deleteQueryBatch();
    }
  };

  await deleteQueryBatch();
  return totalDeleted;
};

const clearDatabase = async (): Promise<void> => {
  console.log("\n🗑️  Iniciando limpieza de base de datos...\n");

  const db = initFirebase();

  // Primero, obtener todos los tenants para limpiar sus subcolecciones
  console.log("📋 Obteniendo lista de tenants...");
  const tenantsSnapshot = await db.collection("tenants").get();
  const tenantIds = tenantsSnapshot.docs.map((doc) => doc.id);
  console.log(`   Encontrados ${tenantIds.length} tenant(s)\n`);

  // Eliminar subcolecciones de cada tenant
  for (const tenantId of tenantIds) {
    console.log(`🏪 Limpiando tenant: ${tenantId}`);

    for (const subcollection of TENANT_SUBCOLLECTIONS) {
      const path = `tenants/${tenantId}/${subcollection}`;
      const deleted = await deleteCollection(db, path);
      if (deleted > 0) {
        console.log(
          `   ✓ ${subcollection}: ${deleted} documento(s) eliminado(s)`,
        );
      }
    }
    console.log("");
  }

  // Eliminar colecciones raíz
  console.log("🗂️  Limpiando colecciones raíz...");
  for (const collection of ROOT_COLLECTIONS) {
    const deleted = await deleteCollection(db, collection);
    if (deleted > 0) {
      console.log(`   ✓ ${collection}: ${deleted} documento(s) eliminado(s)`);
    }
  }

  console.log("\n✅ Base de datos limpiada exitosamente!\n");
};

// Ejecutar
clearDatabase()
  .then(() => {
    console.log("Script finalizado.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error al limpiar la base de datos:", error);
    process.exit(1);
  });
