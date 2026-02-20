import type {
  QueryDocumentSnapshot,
  DocumentReference,
} from "firebase-admin/firestore";
import { getFirestore } from "../config/firebase";
import {
  Delivery,
  CreateDeliveryInput,
  UpdateDeliveryInput,
} from "../models/delivery";
import { HttpError } from "../utils/httpError";

const DELIVERIES_COLLECTION = "deliveries";

type DeliveryDocument = Omit<Delivery, "id">;

const getCollection = (tenantId: string) =>
  getFirestore().collection(`tenants/${tenantId}/${DELIVERIES_COLLECTION}`);

const getDocumentRef = (tenantId: string, id: string): DocumentReference => {
  if (!id) {
    throw new HttpError(
      400,
      "Se requiere un identificador de delivery válido.",
    );
  }
  return getCollection(tenantId).doc(id);
};

const mapSnapshotToDelivery = (doc: QueryDocumentSnapshot): Delivery => ({
  id: doc.id,
  ...(doc.data() as DeliveryDocument),
});

export const listDeliveries = async (tenantId: string): Promise<Delivery[]> => {
  const snapshot = await getCollection(tenantId).orderBy("name").get();
  return snapshot.docs.map(mapSnapshotToDelivery);
};

export const listActiveDeliveries = async (
  tenantId: string,
): Promise<Delivery[]> => {
  const snapshot = await getCollection(tenantId)
    .where("isActive", "==", true)
    .orderBy("name")
    .get();
  return snapshot.docs.map(mapSnapshotToDelivery);
};

export const getDeliveryById = async (
  tenantId: string,
  id: string,
): Promise<Delivery> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El delivery solicitado no existe.");
  }

  return {
    id: doc.id,
    ...(doc.data() as DeliveryDocument),
  };
};

export const createDelivery = async (
  payload: CreateDeliveryInput,
): Promise<Delivery> => {
  if (!payload.name) {
    throw new HttpError(400, "El delivery debe tener un nombre.");
  }

  if (!payload.phone) {
    throw new HttpError(400, "El delivery debe tener un teléfono.");
  }

  const document: DeliveryDocument = {
    ...payload,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const docRef = await getCollection(payload.tenantId).add(document);

  return {
    id: docRef.id,
    ...document,
  };
};

export const updateDelivery = async (
  tenantId: string,
  id: string,
  payload: UpdateDeliveryInput,
): Promise<Delivery> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El delivery solicitado no existe.");
  }

  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, "No se recibieron cambios para actualizar.");
  }

  await docRef.update({ ...payload });
  const updatedDoc = await docRef.get();

  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as DeliveryDocument),
  };
};

export const deleteDelivery = async (
  tenantId: string,
  id: string,
): Promise<void> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El delivery solicitado no existe.");
  }

  // Soft delete
  await docRef.update({ isActive: false });
};

export const hardDeleteDelivery = async (
  tenantId: string,
  id: string,
): Promise<void> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El delivery solicitado no existe.");
  }

  await docRef.delete();
};

export const toggleDeliveryStatus = async (
  tenantId: string,
  id: string,
): Promise<Delivery> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El delivery solicitado no existe.");
  }

  const currentData = doc.data() as DeliveryDocument;
  await docRef.update({ isActive: !currentData.isActive });

  const updatedDoc = await docRef.get();
  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as DeliveryDocument),
  };
};
