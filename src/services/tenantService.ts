import type {
  QueryDocumentSnapshot,
  DocumentReference,
} from "firebase-admin/firestore";
import { getFirestore } from "../config/firebase";
import { Tenant, CreateTenantInput, UpdateTenantInput } from "../models/tenant";
import { HttpError } from "../utils/httpError";

const TENANTS_COLLECTION = "tenants";

type TenantDocument = Omit<Tenant, "id">;

const getCollection = () => getFirestore().collection(TENANTS_COLLECTION);

const getDocumentRef = (id: string): DocumentReference => {
  if (!id) {
    throw new HttpError(400, "Se requiere un identificador de tenant válido.");
  }
  return getCollection().doc(id);
};

const mapSnapshotToTenant = (doc: QueryDocumentSnapshot): Tenant => ({
  id: doc.id,
  ...(doc.data() as TenantDocument),
});

export const listTenants = async (): Promise<Tenant[]> => {
  const snapshot = await getCollection().orderBy("name").get();
  return snapshot.docs.map(mapSnapshotToTenant);
};

export const getTenantById = async (id: string): Promise<Tenant> => {
  const docRef = getDocumentRef(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El tenant solicitado no existe.");
  }

  return {
    id: doc.id,
    ...(doc.data() as TenantDocument),
  };
};

/**
 * Busca un tenant por su metaPhoneNumberId
 * Esta función es crítica para el webhook de Meta, ya que permite
 * identificar a qué tenant pertenece un mensaje entrante
 */
export const getTenantByPhoneNumberId = async (
  phoneNumberId: string,
): Promise<Tenant | null> => {
  if (!phoneNumberId) {
    return null;
  }

  const snapshot = await getCollection()
    .where("metaPhoneNumberId", "==", phoneNumberId)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return mapSnapshotToTenant(snapshot.docs[0]);
};

export const createTenant = async (
  payload: CreateTenantInput,
): Promise<Tenant> => {
  if (!payload.name) {
    throw new HttpError(400, "El tenant debe tener un nombre.");
  }

  const document: TenantDocument = {
    ...payload,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const docRef = await getCollection().add(document);

  return {
    id: docRef.id,
    ...document,
  };
};

export const updateTenant = async (
  id: string,
  payload: UpdateTenantInput,
): Promise<Tenant> => {
  const docRef = getDocumentRef(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El tenant solicitado no existe.");
  }

  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, "No se recibieron cambios para actualizar.");
  }

  await docRef.update({ ...payload });
  const updatedDoc = await docRef.get();

  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as TenantDocument),
  };
};

export const deleteTenant = async (id: string): Promise<void> => {
  const docRef = getDocumentRef(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El tenant solicitado no existe.");
  }

  // Soft delete - just deactivate
  await docRef.update({ isActive: false });
};
