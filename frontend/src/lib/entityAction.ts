import { api } from "../api/client";

export interface ChangeItem {
  entity_type: string;
  entity_id?: number;
  field_name: string;
  old_value: any;
  new_value: any;
}

export interface RequestPayload { title: string; note?: string; items: ChangeItem[] }

/**
 * Сквозная модель прав: R1 применяет изменение напрямую; R2/R3 — через заявку.
 * Возвращает id созданной заявки (для редиректа) либо null для R1.
 */
export async function submitEntityChange(
  role: string,
  direct: () => Promise<void>,
  payload: RequestPayload,
  comment?: string,
): Promise<number | null> {
  if (role === "r1") {
    await direct();
    return null;
  }
  const req = (await api.post("/api/requests", payload)).data;
  const text = comment?.trim();
  if (text) await api.post(`/api/requests/${req.id}/comments`, { text });
  await api.patch(`/api/requests/${req.id}/submit`);
  return req.id as number;
}
