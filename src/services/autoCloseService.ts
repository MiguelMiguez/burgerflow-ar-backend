import { logger } from "../utils/logger";
import { listTenants } from "./tenantService";
import {
  closeCashRegister,
  getCashRegisterByDate,
} from "./cashRegisterService";
import { getPendingOrdersByDate, cancelOrder } from "./orderService";

/**
 * Servicio de cierre automático de caja
 * Verifica y cierra cajas del día anterior si:
 * - No hay pedidos pendientes
 * - La caja no fue cerrada manualmente
 */

const getYesterdayDate = (): string => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split("T")[0];
};

/**
 * Intenta cerrar la caja del día anterior para un tenant específico
 */
export const autoCloseCashRegisterForTenant = async (
  tenantId: string,
  date: string,
): Promise<{ success: boolean; message: string }> => {
  try {
    // Verificar si ya existe un cierre para esa fecha
    const existingClose = await getCashRegisterByDate(tenantId, date);
    if (existingClose) {
      return { success: true, message: "Caja ya cerrada" };
    }

    // Verificar si hay pedidos pendientes
    const pendingOrders = await getPendingOrdersByDate(tenantId, date);
    if (pendingOrders.length > 0) {
      // Cancelar pedidos pendientes del día anterior (abandonados)
      logger.info(
        `Auto-cancelando ${pendingOrders.length} pedidos pendientes del ${date} para tenant ${tenantId}`,
      );

      for (const order of pendingOrders) {
        try {
          await cancelOrder(tenantId, order.id);
          logger.info(`Pedido #${order.id.slice(-6)} auto-cancelado`);
        } catch (cancelError) {
          logger.warn(
            `No se pudo auto-cancelar pedido #${order.id.slice(-6)}: ${cancelError instanceof Error ? cancelError.message : "Error desconocido"}`,
          );
        }
      }
    }

    // Cerrar la caja
    await closeCashRegister(tenantId, date, "Sistema (auto-cierre)");

    logger.info(
      `Caja del ${date} cerrada automáticamente para tenant ${tenantId}`,
    );
    return { success: true, message: "Caja cerrada automáticamente" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    logger.error(
      `Error en cierre automático de caja para tenant ${tenantId}: ${message}`,
    );
    return { success: false, message };
  }
};

/**
 * Ejecuta el cierre automático para todos los tenants activos
 */
export const runAutoCloseCashRegisters = async (): Promise<void> => {
  const yesterdayDate = getYesterdayDate();
  logger.info(`Iniciando cierre automático de cajas para ${yesterdayDate}`);

  try {
    const tenants = await listTenants();
    const activeTenants = tenants.filter((t) => t.isActive);

    logger.info(
      `Procesando ${activeTenants.length} tenants activos para cierre automático`,
    );

    const results = await Promise.allSettled(
      activeTenants.map((tenant) =>
        autoCloseCashRegisterForTenant(tenant.id, yesterdayDate),
      ),
    );

    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value.success,
    ).length;
    const failed = results.length - successful;

    logger.info(
      `Cierre automático completado: ${successful} exitosos, ${failed} fallidos`,
    );
  } catch (error) {
    logger.error("Error en runAutoCloseCashRegisters", error);
  }
};

/**
 * Configura un intervalo para ejecutar el cierre automático
 * Se ejecuta cada hora y verifica si es hora de cierre (configurable)
 */
let autoCloseInterval: NodeJS.Timeout | null = null;

export const startAutoCloseScheduler = (
  checkHour: number = 3, // 3 AM por defecto
): void => {
  if (autoCloseInterval) {
    logger.warn("Auto-close scheduler ya está corriendo");
    return;
  }

  logger.info(
    `Iniciando scheduler de cierre automático (revisión a las ${checkHour}:00 hs)`,
  );

  // Verificar cada hora
  autoCloseInterval = setInterval(
    async () => {
      const currentHour = new Date().getHours();

      if (currentHour === checkHour) {
        await runAutoCloseCashRegisters();
      }
    },
    60 * 60 * 1000, // Cada hora
  );

  // También verificar al iniciar (si ya pasó la hora de cierre hoy)
  const currentHour = new Date().getHours();
  if (currentHour >= checkHour) {
    // Ejecutar después de 5 segundos para dar tiempo al servidor de iniciar
    setTimeout(() => {
      runAutoCloseCashRegisters().catch((error) => {
        logger.error("Error en cierre automático inicial", error);
      });
    }, 5000);
  }
};

export const stopAutoCloseScheduler = (): void => {
  if (autoCloseInterval) {
    clearInterval(autoCloseInterval);
    autoCloseInterval = null;
    logger.info("Scheduler de cierre automático detenido");
  }
};
