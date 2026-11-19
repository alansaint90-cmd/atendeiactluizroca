import type { AgentConfig } from "./config";
import type { DeliveryState, ProcessingPort } from "./processor";
import { telefoneAlertaHumano } from "./falha-humana";

export async function escalarFalha(config: AgentConfig, port: ProcessingPort, state: DeliveryState) {
  if (!state.escalar || state.transferencia || !telefoneAlertaHumano(config) || !port.falhaHumana) return;
  await port.falhaHumana(state.code ?? "falha_tecnica");
  await port.write({...state,transferencia:true,escalar:false});
}
