import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Clinic, Package, Ref, Service, STATUS_NAMES } from "../api/client";

const DIR_URL: Record<string, string> = {
  group: "/api/groups", subgroup: "/api/subgroups",
  executor: "/api/executors", location: "/api/locations", clinic: "/api/clinics",
};

function Row({ k, v }: { k: string; v: any }) {
  if (v === null || v === undefined || v === "") return null;
  return (<><dt>{k}</dt><dd>{String(v)}</dd></>);
}

/** Карточка затрагиваемой сущности со всеми атрибутами (зам.1, зам.4). */
export default function EntityCard({ entityType, entityId }: { entityType: string; entityId: number }) {
  // service_price затрагивает услугу
  const type = entityType === "service_price" ? "service" : entityType;

  const { data: refs } = useQuery({
    queryKey: ["all-refs"],
    queryFn: async () => {
      const [g, sg, ex, lo] = await Promise.all([
        api.get<Ref[]>("/api/groups"), api.get<Ref[]>("/api/subgroups"),
        api.get<Ref[]>("/api/executors"), api.get<Ref[]>("/api/locations"),
      ]);
      return { g: g.data, sg: sg.data, ex: ex.data, lo: lo.data };
    },
    enabled: type === "service" || type === "package",
  });

  const { data: svc } = useQuery({
    queryKey: ["ec-service", entityId],
    queryFn: async () => (await api.get<Service>(`/api/services/${entityId}`)).data,
    enabled: type === "service",
  });
  const { data: pkg } = useQuery({
    queryKey: ["ec-package", entityId],
    queryFn: async () => (await api.get<Package>(`/api/packages/${entityId}`)).data,
    enabled: type === "package",
  });
  const { data: dir } = useQuery({
    queryKey: ["ec-dir", type, entityId],
    queryFn: async () => {
      const list = (await api.get<(Ref | Clinic)[]>(DIR_URL[type])).data;
      return list.find((x) => x.id === entityId);
    },
    enabled: type in DIR_URL,
  });

  const name = (list: Ref[] | undefined, id?: number) => list?.find((x) => x.id === id)?.name_ru;

  if (type === "service") {
    if (!svc) return <div className="entity-card muted">Загрузка услуги…</div>;
    return (
      <div className="entity-card">
        <div className="ec-title"><Link to={`/services/${svc.id}`}>{svc.code} · {svc.name_ru}</Link></div>
        <dl className="attr-grid">
          <Row k="Название RO" v={svc.name_ro} />
          <Row k="Группа" v={name(refs?.g, svc.group_id)} />
          <Row k="Подгруппа" v={name(refs?.sg, svc.subgroup_id)} />
          <Row k="Исполнитель" v={name(refs?.ex, svc.executor_id)} />
          <Row k="Место" v={name(refs?.lo, svc.location_id)} />
          <Row k="Длительность" v={svc.duration_min ? `${svc.duration_min} мин` : null} />
          <Row k="Статус" v={STATUS_NAMES[svc.status] || svc.status} />
          <Row k="Примечание" v={svc.note} />
        </dl>
      </div>
    );
  }
  if (type === "package") {
    if (!pkg) return <div className="entity-card muted">Загрузка пакета…</div>;
    return (
      <div className="entity-card">
        <div className="ec-title"><Link to={`/packages/${pkg.id}`}>{pkg.code} · {pkg.name_ru}</Link></div>
        <dl className="attr-grid">
          <Row k="Группа" v={name(refs?.g, pkg.group_id)} />
          <Row k="Статус" v={STATUS_NAMES[pkg.status] || pkg.status} />
          <Row k="Услуг в составе" v={pkg.items.length} />
        </dl>
      </div>
    );
  }
  if (type in DIR_URL) {
    if (!dir) return <div className="entity-card muted">Загрузка…</div>;
    const c = dir as Clinic;
    return (
      <div className="entity-card">
        <div className="ec-title">{dir.code} · {dir.name_ru}</div>
        <dl className="attr-grid">
          <Row k="Название RO" v={dir.name_ro} />
          <Row k="Адрес" v={c.address} />
          <Row k="Телефон" v={c.phone} />
          <Row k="Статус" v={dir.status ? (STATUS_NAMES[dir.status] || dir.status) : null} />
        </dl>
      </div>
    );
  }
  return null;
}
