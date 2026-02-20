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
import { getTenantById } from "./tenantService";
import {
  addProductToCatalog,
  updateProductInCatalog,
  removeProductFromCatalog,
  updateProductAvailabilityInCatalog,
  hasCatalogConfigured,
} from "./whatsappCatalogService";
import { logger } from "../utils/logger";

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

const mapSnapshotToProduct = (doc: QueryDocumentSnapshot): Product => {
  const data = doc.data() as ProductDocument;
  return {
    id: doc.id,
    ...data,
    compatibleExtras: data.compatibleExtras ?? [],
  };
};

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

  const data = doc.data() as ProductDocument;
  return {
    id: doc.id,
    ...data,
    compatibleExtras: data.compatibleExtras ?? [],
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
    stock: payload.stock ?? 0,
    unit: payload.unit ?? "unidades",
    available: payload.available ?? true,
    compatibleExtras: payload.compatibleExtras ?? [],
    createdAt: new Date().toISOString(),
  };

  const docRef = await getCollection(payload.tenantId).add(document);

  const product: Product = {
    id: docRef.id,
    ...document,
  };

  // Sincronizar con el catálogo de WhatsApp si está configurado
  try {
    const tenant = await getTenantById(payload.tenantId);
    if (hasCatalogConfigured(tenant)) {
      await addProductToCatalog(product, tenant);
      logger.info(
        `Producto ${product.id} sincronizado con catálogo de WhatsApp`,
      );
    }
  } catch (catalogError) {
    // No fallar la creación del producto si falla la sincronización
    logger.warn(
      `No se pudo sincronizar producto ${product.id} con catálogo de WhatsApp`,
      catalogError,
    );
  }

  return product;
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
  const data = updatedDoc.data() as ProductDocument;

  const product: Product = {
    id: updatedDoc.id,
    ...data,
    compatibleExtras: data.compatibleExtras ?? [],
  };

  // Sincronizar con el catálogo de WhatsApp si está configurado
  try {
    const tenant = await getTenantById(tenantId);
    if (hasCatalogConfigured(tenant)) {
      await updateProductInCatalog(product, tenant);
      logger.info(`Producto ${product.id} actualizado en catálogo de WhatsApp`);
    }
  } catch (catalogError) {
    logger.warn(
      `No se pudo actualizar producto ${product.id} en catálogo de WhatsApp`,
      catalogError,
    );
  }

  return product;
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

  // Eliminar del catálogo de WhatsApp antes de borrar
  try {
    const tenant = await getTenantById(tenantId);
    if (hasCatalogConfigured(tenant)) {
      await removeProductFromCatalog(id, tenant);
      logger.info(`Producto ${id} eliminado del catálogo de WhatsApp`);
    }
  } catch (catalogError) {
    logger.warn(
      `No se pudo eliminar el producto ${id} del catálogo de WhatsApp`,
      catalogError,
    );
  }

  // Eliminar el producto de la base de datos
  await docRef.delete();
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
  const newAvailability = !currentData.available;
  await docRef.update({ available: newAvailability });

  const updatedDoc = await docRef.get();
  const data = updatedDoc.data() as ProductDocument;

  const product: Product = {
    id: updatedDoc.id,
    ...data,
    compatibleExtras: data.compatibleExtras ?? [],
  };

  // Actualizar disponibilidad en el catálogo de WhatsApp
  try {
    const tenant = await getTenantById(tenantId);
    if (hasCatalogConfigured(tenant)) {
      await updateProductAvailabilityInCatalog(id, newAvailability, tenant);
      logger.info(
        `Disponibilidad del producto ${id} actualizada en catálogo de WhatsApp: ${newAvailability}`,
      );
    }
  } catch (catalogError) {
    logger.warn(
      `No se pudo actualizar disponibilidad del producto ${id} en catálogo de WhatsApp`,
      catalogError,
    );
  }

  return product;
};
