import { getFirestore } from "../config/firebase";
import {
  CreateExtraInput,
  UpdateExtraInput,
  Extra,
} from "../models/extra";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

const db = getFirestore();
const EXTRAS_COLLECTION = "extras";

/**
 * Crea un nuevo extra/adicional
 */
export const createExtra = async (
  input: CreateExtraInput
): Promise<Extra> => {
  const extraData = {
    ...input,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const docRef = await db.collection(EXTRAS_COLLECTION).add(extraData);
  const doc = await docRef.get();

  logger.info(`Extra creado: ${input.name} (Tenant: ${input.tenantId})`);

  return {
    id: doc.id,
    ...doc.data(),
  } as Extra;
};

/**
 * Obtiene todos los extras de un tenant
 */
export const getExtrasByTenant = async (tenantId: string): Promise<Extra[]> => {
  const snapshot = await db
    .collection(EXTRAS_COLLECTION)
    .where("tenantId", "==", tenantId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Extra[];
};

/**
 * Obtiene un extra por ID
 */
export const getExtraById = async (
  id: string,
  tenantId: string
): Promise<Extra> => {
  const doc = await db.collection(EXTRAS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    throw new HttpError(404, "Extra no encontrado");
  }

  const extra = {
    id: doc.id,
    ...doc.data(),
  } as Extra;

  // Verificar que pertenece al tenant
  if (extra.tenantId !== tenantId) {
    throw new HttpError(403, "No tienes permiso para acceder a este extra");
  }

  return extra;
};

/**
 * Actualiza un extra
 */
export const updateExtra = async (
  id: string,
  tenantId: string,
  input: UpdateExtraInput
): Promise<Extra> => {
  // Verificar que existe y pertenece al tenant
  await getExtraById(id, tenantId);

  await db.collection(EXTRAS_COLLECTION).doc(id).update({ ...input });

  const updatedDoc = await db.collection(EXTRAS_COLLECTION).doc(id).get();

  logger.info(`Extra actualizado: ${id} (Tenant: ${tenantId})`);

  return {
    id: updatedDoc.id,
    ...updatedDoc.data(),
  } as Extra;
};

/**
 * Elimina (desactiva) un extra
 */
export const deleteExtra = async (
  id: string,
  tenantId: string
): Promise<void> => {
  // Verificar que existe y pertenece al tenant
  await getExtraById(id, tenantId);

  await db.collection(EXTRAS_COLLECTION).doc(id).update({
    isActive: false,
  });

  logger.info(`Extra desactivado: ${id} (Tenant: ${tenantId})`);
};

/**
 * Obtiene extras activos de un tenant
 */
export const getActiveExtrasByTenant = async (
  tenantId: string
): Promise<Extra[]> => {
  const snapshot = await db
    .collection(EXTRAS_COLLECTION)
    .where("tenantId", "==", tenantId)
    .where("isActive", "==", true)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Extra[];
};
