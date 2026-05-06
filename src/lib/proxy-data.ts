import proxyMappingsJson from "@/data/proxy_mappings.json";
import type { CardCatalog, ModelCard, ProxyAvailability, ProxyMapping } from "./types";

export const PROXY_SOURCE = "M4E Model Changes & Proxies";

export const PROXY_MAPPINGS = proxyMappingsJson as ProxyMapping[];

export function proxyMappingKey(mapping: Pick<ProxyMapping, "legacyName" | "mayProxyForName">): string {
  return `${slug(mapping.legacyName)}__${slug(mapping.mayProxyForName)}`;
}

export function proxyAvailabilityForCatalog(catalog: Pick<CardCatalog, "models">): ProxyAvailability[] {
  const modelByName = new Map(catalog.models.map((model) => [canonicalName(model.name), model]));
  const seen = new Set<string>();

  return PROXY_MAPPINGS.flatMap((mapping) => {
    const model = modelByName.get(canonicalName(mapping.mayProxyForName));
    if (!model) return [];

    const key = proxyMappingKey(mapping);
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      key,
      modelId: model.id,
      proxyName: mapping.legacyName,
      targetName: model.name,
      baseSize: mapping.baseSize,
      source: mapping.source,
      notes: mapping.notes
    }];
  });
}

export function proxyTargetIdsForKeys(availabilities: ProxyAvailability[], keys: string[]): string[] {
  const selected = new Set(keys);
  return Array.from(new Set(availabilities.filter((entry) => selected.has(entry.key)).map((entry) => entry.modelId)));
}

export function proxyAvailabilityByModelId(availabilities: ProxyAvailability[], selectedKeys?: Set<string>): Record<string, ProxyAvailability[]> {
  return availabilities.reduce<Record<string, ProxyAvailability[]>>((groups, entry) => {
    if (selectedKeys && !selectedKeys.has(entry.key)) return groups;
    groups[entry.modelId] = [...(groups[entry.modelId] ?? []), entry];
    return groups;
  }, {});
}

export function proxyDataWarnings(catalog: Pick<CardCatalog, "models">): string[] {
  const modelNames = new Set(catalog.models.map((model) => canonicalName(model.name)));
  return PROXY_MAPPINGS
    .filter((mapping) => !modelNames.has(canonicalName(mapping.mayProxyForName)))
    .map((mapping) => `${mapping.legacyName} maps to ${mapping.mayProxyForName}, which is not present in parsed card data.`);
}

export function proxySearchText(entry: ProxyAvailability, model: ModelCard): string {
  return [entry.proxyName, entry.targetName, entry.baseSize, entry.source, entry.notes, model.faction, ...model.keywords, ...model.strategicKeywords]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function canonicalName(name: string): string {
  return name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(name: string): string {
  return canonicalName(name).replace(/\s+/g, "-");
}
