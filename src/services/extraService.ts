import type {
  QueryDocumentSnapshot,
  DocumentReference,
} from "firebase-admin/firestore";
import { getFirestore } from "../config/firebase";
import { Extra, CreateExtraInput, UpdateExtraInput } from "../models/extra";
import { HttpError } from "../utils/httpError";

const EXTRAS_COLLECTION = "extras";

type ExtraDocument = Omit<Extra, "id">;

const getCollection = (tenantId: string) =>
  getFirestore().collection(`tenants/${tenantId}/${EXTRAS_COLLECTION}`);

const getDocumentRef = (tenantId: string, id: string): DocumentReference => {
  if (!id) {
    throw new HttpError(400, "Se requiere un identificador de extra válido.");
  }
  return getCollection(tenantId).doc(id);
};

const mapSnapshotToExtra = (doc: QueryDocumentSnapshot): Extra => ({
  id: doc.id,
  ...(doc.data() as ExtraDocument),
});

export const listExtras = async (tenantId: string): Promise<Extra[]> => {
  const snapshot = await getCollection(tenantId).orderBy("name").get();
  return snapshot.docs.map(mapSnapshotToExtra);
};

export const listActiveExtras = async (tenantId: string): Promise<Extra[]> => {
  const snapshot = await getCollection(tenantId)
    .where("isActive", "==", true)
    .orderBy("name")
    .get();
  return snapshot.docs.map(mapSnapshotToExtra);
};

export const getExtraById = async (
  tenantId: string,
  id: string,
): Promise<Extra> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, `Extra con id ${id} no encontrado.`);
  }

  return {
    id: doc.id,
    ...(doc.data() as ExtraDocument),
  };
};

export const createExtra = async (input: CreateExtraInput): Promise<Extra> => {
  const {
    tenantId,
    name,
    price,
    linkedProductId,
    stockConsumption = 0,
  } = input;

  const now = new Date().toISOString();

  const extraData: Omit<Extra, "id"> = {
    tenantId,
    name,
    price,
    linkedProductId,
    stockConsumption,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await getCollection(tenantId).add(extraData);

  return {
    id: docRef.id,
    ...extraData,
  };
};

export const updateExtra = async (
  tenantId: string,
  id: string,
  input: UpdateExtraInput,
): Promise<Extra> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, `Extra con id ${id} no encontrado.`);
  }

  const updateData = {
    ...input,
    updatedAt: new Date().toISOString(),
  };

  await docRef.update(updateData);

  const updatedDoc = await docRef.get();

  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as ExtraDocument),
  };
};

export const deleteExtra = async (
  tenantId: string,
  id: string,
): Promise<void> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, `Extra con id ${id} no encontrado.`);
  }

  await docRef.delete();
};
