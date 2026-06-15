import axios from "axios";

export const api = axios.create({ baseURL: "/", withCredentials: true });

export type Role = "r1" | "r2" | "r3" | "r4";

export interface Me {
  id: number;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
}

export interface Service {
  id: number;
  code: string;
  name_ru: string;
  name_ro?: string;
  group_id?: number;
  subgroup_id?: number;
  executor_id?: number;
  location_id?: number;
  duration_min?: number;
  sold_separately: boolean;
  status: string;
  note?: string;
}

export interface Ref { id: number; code: string; name_ru: string; name_ro?: string; status?: string }
export interface Clinic extends Ref { address?: string; phone?: string; status: string }

export interface Price {
  id: number; clinic_id: number; currency: string;
  price?: number; price_cmn?: number; price_online?: number; price_special?: number;
}

export interface PkgPrice { id: number; clinic_id: number; currency: string; price_fixed?: number }

export interface Package {
  id: number; code: string; name_ru: string; name_ro?: string;
  group_id?: number; subgroup_id?: number; status: string;
  items: { id: number; service_id: number; inclusion_type: string }[];
  prices: PkgPrice[];
}

export interface Participant { id: number; name: string; role: Role }

export interface ChangeRequest {
  id: number; title: string; status: string; author_id: number; author_name?: string;
  participants?: Participant[]; note?: string;
  created_at: string; updated_at: string;
  items: { id: number; entity_type: string; entity_id?: number; field_name: string; old_value: any; new_value: any; r2_override_value: any }[];
  comments: { id: number; author_id: number; author_name?: string; text: string; created_at: string }[];
  history: { id: number; from_status?: string; to_status: string; actor_id: number; actor_name?: string; note?: string; created_at: string }[];
}

export const ROLE_NAMES: Record<Role, string> = {
  r1: "Генеральный директор",
  r2: "Финансовый директор",
  r3: "Медицинский директор",
  r4: "Персонал",
};

export const STATUS_NAMES: Record<string, string> = {
  draft: "Черновик",
  pending_cfd: "У финдиректора",
  pending_ceo: "У гендиректора",
  approved: "Утверждена",
  rejected: "Отклонена",
  revision: "На доработке",
  cancelled: "Отменена",
  active: "Активна",
  inactive: "Не активна",
  pending: "На согласовании",
};
