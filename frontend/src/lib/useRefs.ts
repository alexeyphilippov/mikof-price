import { useQueries } from "@tanstack/react-query";
import { api, Clinic, Ref } from "../api/client";

const KINDS = ["groups", "subgroups", "executors", "locations", "clinics"] as const;

/** Единая загрузка всех справочников (устраняет повтор useQuery по страницам). */
export function useRefs() {
  const q = useQueries({
    queries: KINDS.map((k) => ({
      queryKey: [k],
      queryFn: async () => (await api.get<Ref[]>(`/api/${k}`)).data,
    })),
  });
  return {
    groups: q[0].data,
    subgroups: q[1].data,
    executors: q[2].data,
    locations: q[3].data,
    clinics: q[4].data as Clinic[] | undefined,
  };
}
