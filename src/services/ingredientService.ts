import type {
  QueryDocumentSnapshot,
  DocumentReference,
  Query,
} from "firebase-admin/firestore";
import { getFirestore } from "../config/firebase";
import {
  Ingredient,
  CreateIngredientInput,
  UpdateIngredientInput,
  StockMovement,
} from "../models/ingredient";
import { HttpError } from "../utils/httpError";

const INGREDIENTS_COLLECTION = "ingredients";
const STOCK_MOVEMENTS_COLLECTION = "stockMovements";

type IngredientDocument = Omit<Ingredient, "id">;
type StockMovementDocument = Omit<StockMovement, "id">;

const getCollection = (tenantId: string) =>
  getFirestore().collection(`tenants/${tenantId}/${INGREDIENTS_COLLECTION}`);

const getMovementsCollection = (tenantId: string) =>
  getFirestore().collection(
    `tenants/${tenantId}/${STOCK_MOVEMENTS_COLLECTION}`,
  );

const getDocumentRef = (tenantId: string, id: string): DocumentReference => {
  if (!id) {
    throw new HttpError(
      400,
      "Se requiere un identificador de ingrediente válido.",
    );
  }
  return getCollection(tenantId).doc(id);
};

const mapSnapshotToIngredient = (doc: QueryDocumentSnapshot): Ingredient => ({
  id: doc.id,
  ...(doc.data() as IngredientDocument),
});

export const listIngredients = async (
  tenantId: string,
): Promise<Ingredient[]> => {
  const snapshot = await getCollection(tenantId).orderBy("name").get();
  return snapshot.docs.map(mapSnapshotToIngredient);
};

export const getIngredientById = async (
  tenantId: string,
  id: string,
): Promise<Ingredient> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El ingrediente solicitado no existe.");
  }

  return {
    id: doc.id,
    ...(doc.data() as IngredientDocument),
  };
};

export const createIngredient = async (
  payload: CreateIngredientInput,
): Promise<Ingredient> => {
  if (!payload.name) {
    throw new HttpError(400, "El ingrediente debe tener un nombre.");
  }

  const document: IngredientDocument = {
    ...payload,
    createdAt: new Date().toISOString(),
  };

  const docRef = await getCollection(payload.tenantId).add(document);

  return {
    id: docRef.id,
    ...document,
  };
};

export const updateIngredient = async (
  tenantId: string,
  id: string,
  payload: UpdateIngredientInput,
): Promise<Ingredient> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El ingrediente solicitado no existe.");
  }

  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, "No se recibieron cambios para actualizar.");
  }

  await docRef.update({ ...payload });
  const updatedDoc = await docRef.get();

  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as IngredientDocument),
  };
};

export const deleteIngredient = async (
  tenantId: string,
  id: string,
): Promise<void> => {
  const docRef = getDocumentRef(tenantId, id);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El ingrediente solicitado no existe.");
  }

  await docRef.delete();
};

export const updateStock = async (
  tenantId: string,
  ingredientId: string,
  quantity: number,
  type: "entrada" | "salida" | "ajuste",
  reason: string,
  orderId?: string,
): Promise<Ingredient> => {
  const docRef = getDocumentRef(tenantId, ingredientId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new HttpError(404, "El ingrediente solicitado no existe.");
  }

  const currentData = doc.data() as IngredientDocument;
  let newStock = currentData.stock;

  switch (type) {
    case "entrada":
      newStock += quantity;
      break;
    case "salida":
      newStock -= quantity;
      break;
    case "ajuste":
      newStock = quantity;
      break;
  }

  if (newStock < 0) {
    throw new HttpError(400, `Stock insuficiente de ${currentData.name}.`);
  }

  await docRef.update({ stock: newStock });

  // Registrar movimiento - solo incluir orderId si tiene valor
  const movementDoc: StockMovementDocument = {
    tenantId,
    ingredientId,
    type,
    quantity,
    reason,
    createdAt: new Date().toISOString(),
  };

  // Solo agregar orderId si tiene valor (evitar undefined en Firestore)
  if (orderId) {
    movementDoc.orderId = orderId;
  }

  await getMovementsCollection(tenantId).add(movementDoc);

  const updatedDoc = await docRef.get();
  return {
    id: updatedDoc.id,
    ...(updatedDoc.data() as IngredientDocument),
  };
};

export const getLowStockIngredients = async (
  tenantId: string,
): Promise<Ingredient[]> => {
  const snapshot = await getCollection(tenantId).get();
  const ingredients = snapshot.docs.map(mapSnapshotToIngredient);

  return ingredients.filter((ing) => ing.stock <= ing.minStock);
};

export const bulkUpdateStock = async (
  tenantId: string,
  updates: Array<{ ingredientId: string; quantity: number }>,
  type: "salida",
  reason: string,
  orderId?: string,
): Promise<void> => {
  const db = getFirestore();
  const batch = db.batch();

  for (const update of updates) {
    const docRef = getDocumentRef(tenantId, update.ingredientId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new HttpError(404, `Ingrediente ${update.ingredientId} no existe.`);
    }

    const currentData = doc.data() as IngredientDocument;
    const newStock = currentData.stock - update.quantity;

    if (newStock < 0) {
      throw new HttpError(400, `Stock insuficiente de ${currentData.name}.`);
    }

    batch.update(docRef, { stock: newStock });

    // Registrar movimiento
    const movementRef = getMovementsCollection(tenantId).doc();
    const movementDoc: StockMovementDocument = {
      tenantId,
      ingredientId: update.ingredientId,
      type,
      quantity: update.quantity,
      reason,
      orderId,
      createdAt: new Date().toISOString(),
    };
    batch.set(movementRef, movementDoc);
  }

  await batch.commit();
};
