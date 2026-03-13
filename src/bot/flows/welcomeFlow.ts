import { sendMessage } from "../../services/metaService";
import * as templates from "../templates";
import type { Tenant } from "../../models/tenant";

/**
 * Envía el mensaje de bienvenida
 */
export const sendWelcomeMessage = async (
  phoneNumber: string,
  tenant: Tenant,
  contactName?: string,
): Promise<void> => {
  await sendMessage(
    phoneNumber,
    templates.getWelcomeMessage(contactName, tenant.name),
    tenant,
  );
};

/**
 * Envía mensaje de pedido cancelado
 */
export const sendCancellationMessage = async (
  phoneNumber: string,
  tenant: Tenant,
): Promise<void> => {
  await sendMessage(
    phoneNumber,
    templates.getCancellationMessage(tenant.name),
    tenant,
  );
};
