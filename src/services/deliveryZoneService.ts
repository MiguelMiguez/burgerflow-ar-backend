import type {
  QueryDocumentSnapshot,
  DocumentReference,
} from "firebase-admin/firestore";
import { getFirestore } from "../config/firebase";
import {
  DeliveryZone,
  CreateDeliveryZoneInput,
  UpdateDeliveryZoneInput,
} from "../models/deliveryZone";
import { HttpError } from "../utils/httpError";

const DELIVERY_ZONES_COLLECTION = "deliveryZones";

type DeliveryZoneDocument = Omit<DeliveryZone, "id">;

const getCollection = (tenantId: string) =>
  getFirestore().collection(`tenants/${tenantId}/${DELIVERY_ZONES_COLLECTION}`);

const getDocumentRef = (tenantId: string, id: string): DocumentReference => {
  if (!id) {
    throw new HttpError(400, "Se requiere un identificador de zona válido.");
  }
  return getCollection(tenantId).doc(id);
};

const mapSnapshotToDeliveryZone = (
  doc: QueryDocumentSnapshot,
): DeliveryZone => ({
  id: doc.id,
  ...(doc.data() as DeliveryZoneDocument),
});

export const listDeliveryZones = async (
  tenantId: string,
): Promise<DeliveryZone[]> => {
  const snapshot = await getCollection(tenantId).orderBy("name").get();
  return snapshot.docs.map(mapSnapshotToDeliveryZone);
};

export const listActiveDeliveryZones = async (
  tenantId: string,
): Promise<DeliveryZone[]> => {
  const snapshot = await getCollection(tenantId)
    .where("isActive", "==", true)
    .orderBy("name")
    .get();
  return snapshot.docs.map(mapSnapshotToDeliveryZone);
};

export const getDeliveryZoneById = async (
  tenantId: string,
  id: string,
): Promise<DeliveryZone> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "La zona de delivery solicitada no existe.");
  }

  return {
    id: doc.id,
    ...(doc.data() as DeliveryZoneDocument),
  };
};

export const createDeliveryZone = async (
  payload: CreateDeliveryZoneInput,
): Promise<DeliveryZone> => {
  if (!payload.name) {
    throw new HttpError(400, "La zona debe tener un nombre.");
  }

  if (payload.price === undefined || payload.price < 0) {
    throw new HttpError(400, "El precio debe ser un número válido.");
  }

  const document: DeliveryZoneDocument = {
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

export const updateDeliveryZone = async (
  tenantId: string,
  id: string,
  payload: UpdateDeliveryZoneInput,
): Promise<DeliveryZone> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "La zona de delivery solicitada no existe.");
  }

  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, "No se recibieron cambios para actualizar.");
  }

  await docRef.update({ ...payload });
  const updatedDoc = await docRef.get();

  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as DeliveryZoneDocument),
  };
};

export const deleteDeliveryZone = async (
  tenantId: string,
  id: string,
): Promise<void> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "La zona de delivery solicitada no existe.");
  }

  await docRef.update({ isActive: false });
};
