import type {
  QueryDocumentSnapshot,
  DocumentReference,
} from "firebase-admin/firestore";
import { getFirestore } from "../config/firebase";
import {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ProductCategory,
} from "../models/product";
import { HttpError } from "../utils/httpError";

const PRODUCTS_COLLECTION = "products";

type ProductDocument = Omit<Product, "id">;

const getCollection = (tenantId: string) =>
  getFirestore().collection(`tenants/${tenantId}/${PRODUCTS_COLLECTION}`);

const getDocumentRef = (tenantId: string, id: string): DocumentReference => {
  if (!id) {
    throw new HttpError(
      400,
      "Se requiere un identificador de producto válido.",
    );
  }
  return getCollection(tenantId).doc(id);
};

const mapSnapshotToProduct = (doc: QueryDocumentSnapshot): Product => ({
  id: doc.id,
  ...(doc.data() as ProductDocument),
});

export const listProducts = async (tenantId: string): Promise<Product[]> => {
  const snapshot = await getCollection(tenantId).orderBy("name").get();
  return snapshot.docs.map(mapSnapshotToProduct);
};

export const listAvailableProducts = async (
  tenantId: string,
): Promise<Product[]> => {
  const snapshot = await getCollection(tenantId)
    .where("available", "==", true)
    .orderBy("name")
    .get();
  return snapshot.docs.map(mapSnapshotToProduct);
};

export const listProductsByCategory = async (
  tenantId: string,
  category: ProductCategory,
): Promise<Product[]> => {
  const snapshot = await getCollection(tenantId)
    .where("category", "==", category)
    .where("available", "==", true)
    .orderBy("name")
    .get();
  return snapshot.docs.map(mapSnapshotToProduct);
};

export const getProductById = async (
  tenantId: string,
  id: string,
): Promise<Product> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El producto solicitado no existe.");
  }

  return {
    id: doc.id,
    ...(doc.data() as ProductDocument),
  };
};

export const createProduct = async (
  payload: CreateProductInput,
): Promise<Product> => {
  if (!payload.name) {
    throw new HttpError(400, "El producto debe tener un nombre.");
  }

  if (payload.price === undefined || payload.price < 0) {
    throw new HttpError(400, "El producto debe tener un precio válido.");
  }

  const document: ProductDocument = {
    ...payload,
    available: payload.available ?? true,
    createdAt: new Date().toISOString(),
  };

  const docRef = await getCollection(payload.tenantId).add(document);

  return {
    id: docRef.id,
    ...document,
  };
};

export const updateProduct = async (
  tenantId: string,
  id: string,
  payload: UpdateProductInput,
): Promise<Product> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El producto solicitado no existe.");
  }

  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, "No se recibieron cambios para actualizar.");
  }

  await docRef.update({ ...payload });
  const updatedDoc = await docRef.get();

  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as ProductDocument),
  };
};

export const deleteProduct = async (
  tenantId: string,
  id: string,
): Promise<void> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El producto solicitado no existe.");
  }

  // Soft delete - just mark as unavailable
  await docRef.update({ available: false });
};

export const toggleProductAvailability = async (
  tenantId: string,
  id: string,
): Promise<Product> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El producto solicitado no existe.");
  }

  const currentData = doc.data() as ProductDocument;
  await docRef.update({ available: !currentData.available });

  const updatedDoc = await docRef.get();
  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as ProductDocument),
  };
};
