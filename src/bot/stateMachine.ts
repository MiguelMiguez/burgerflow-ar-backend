import { getFirestore } from "firebase-admin/firestore";
import { logger } from "../utils/logger";
import type { ConversationState, ConversationStep } from "./types";
import { STATE_TTL_MS } from "./constants";

/**
 * Interfaz para el almacenamiento de estados
 * Permite intercambiar entre memoria y Firestore fácilmente
 */
interface StateStorage {
  get(key: string): Promise<ConversationState | null>;
  set(key: string, state: ConversationState): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Almacenamiento en memoria (para desarrollo/testing)
 */
class MemoryStorage implements StateStorage {
  private store = new Map<string, ConversationState>();

  async get(key: string): Promise<ConversationState | null> {
    const state = this.store.get(key);
    if (!state) return null;

    // Verificar TTL
    if (state.lastUpdated && Date.now() - state.lastUpdated > STATE_TTL_MS) {
      this.store.delete(key);
      return null;
    }

    return state;
  }

  async set(key: string, state: ConversationState): Promise<void> {
    this.store.set(key, { ...state, lastUpdated: Date.now() });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Almacenamiento en Firestore (para producción)
 * Persiste el estado entre reinicios del servidor
 */
class FirestoreStorage implements StateStorage {
  private collectionName = "bot_conversations";

  private get collection() {
    return getFirestore().collection(this.collectionName);
  }

  async get(key: string): Promise<ConversationState | null> {
    try {
      const doc = await this.collection.doc(key).get();
      if (!doc.exists) return null;

      const data = doc.data() as ConversationState;

      // Verificar TTL
      if (data.lastUpdated && Date.now() - data.lastUpdated > STATE_TTL_MS) {
        await this.delete(key);
        return null;
      }

      return data;
    } catch (error) {
      logger.error("Error al obtener estado de Firestore", error);
      return null;
    }
  }

  async set(key: string, state: ConversationState): Promise<void> {
    try {
      // Limpiar campos undefined antes de guardar (Firestore no los acepta)
      const cleanState = this.cleanUndefined({
        ...state,
        lastUpdated: Date.now(),
      });

      await this.collection.doc(key).set(cleanState);
    } catch (error) {
      logger.error("Error al guardar estado en Firestore", error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.collection.doc(key).delete();
    } catch (error) {
      logger.error("Error al eliminar estado de Firestore", error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cleanUndefined(obj: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          cleaned[key] = this.cleanUndefined(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }
}

/**
 * State Machine para manejar el flujo de conversación
 * Centraliza la lógica de estados y transiciones
 */
export class StateMachine {
  private storage: StateStorage;

  constructor(useFirestore = true) {
    this.storage = useFirestore ? new FirestoreStorage() : new MemoryStorage();
    logger.info(
      `StateMachine inicializado con ${useFirestore ? "Firestore" : "Memory"} storage`,
    );
  }

  /**
   * Genera la clave única para un usuario
   */
  private getKey(phoneNumber: string, tenantId: string): string {
    return `${tenantId}:${phoneNumber}`;
  }

  /**
   * Obtiene el estado actual de la conversación
   */
  async getState(
    phoneNumber: string,
    tenantId: string,
  ): Promise<ConversationState> {
    const key = this.getKey(phoneNumber, tenantId);
    const existing = await this.storage.get(key);

    if (existing) {
      return existing;
    }

    // Estado inicial
    return {
      step: "idle",
      tenantId,
      cart: [],
      generalExtras: [],
    };
  }

  /**
   * Actualiza el estado de la conversación
   */
  async setState(
    phoneNumber: string,
    tenantId: string,
    updates: Partial<ConversationState>,
  ): Promise<ConversationState> {
    const key = this.getKey(phoneNumber, tenantId);
    const current = await this.getState(phoneNumber, tenantId);
    const newState: ConversationState = { ...current, ...updates };

    await this.storage.set(key, newState);
    return newState;
  }

  /**
   * Transiciona a un nuevo paso
   */
  async transitionTo(
    phoneNumber: string,
    tenantId: string,
    step: ConversationStep,
    additionalUpdates?: Partial<ConversationState>,
  ): Promise<ConversationState> {
    return this.setState(phoneNumber, tenantId, {
      step,
      ...additionalUpdates,
    });
  }

  /**
   * Resetea la conversación al estado inicial
   */
  async reset(phoneNumber: string, tenantId: string): Promise<void> {
    const key = this.getKey(phoneNumber, tenantId);
    await this.storage.delete(key);
    logger.debug(`Conversación reseteada: ${phoneNumber}`);
  }

  /**
   * Verifica si la conversación está en un estado específico
   */
  async isInStep(
    phoneNumber: string,
    tenantId: string,
    step: ConversationStep,
  ): Promise<boolean> {
    const state = await this.getState(phoneNumber, tenantId);
    return state.step === step;
  }
}

// Singleton para uso global
let stateMachineInstance: StateMachine | null = null;

/**
 * Obtiene la instancia del StateMachine
 * En producción usa Firestore, en desarrollo usa memoria
 */
export const getStateMachine = (): StateMachine => {
  if (!stateMachineInstance) {
    const useFirestore = process.env.NODE_ENV !== "test";
    stateMachineInstance = new StateMachine(useFirestore);
  }
  return stateMachineInstance;
};
