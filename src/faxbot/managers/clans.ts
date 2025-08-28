import { addLog } from "../../Settings.js";
import type {
  ClanStatistics,
  ClanType,
  FaxClanData,
  KoLClan,
  MonsterData,
  UserClan,
} from "../../types.js";
import { invalidateReportCache } from "../../utils/reportCacheMiddleware.js";
import { getMonsterById } from "../monsters.js";
import { loadClansFromDatabase, removeClan, saveClan } from "./database.js";

// The clans we have access to. If we lose access to a clan, we will remove them from this list
const clans: FaxClanData[] = [];

export function getClanById(id: number): UserClan {
  const def = clans.find((c) => c.clanId == id);

  if (def == null) {
    return null;
  }

  return {
    name: def.clanName,
    id: def.clanId,
    title: def.clanTitle,
  };
}

export function getClanDataById(id: number): FaxClanData {
  return clans.find((d) => d.clanId == id);
}

export function getClanType(clan: FaxClanData): ClanType {
  if ((clan.clanTitle ?? ``).toLowerCase().includes(`source`)) {
    return `Fax Source`;
  }

  return `Random Clan`;
}

export function getClanMonsterType(clan: FaxClanData): number {
  if (clan.clanTitle == null) {
    return null;
  }

  // Match on [MA] as prior to kol update, 'A' represented 'Ambigious Kol Name'
  const pattern = new RegExp(`Source: [MA](\\d+)$`, "i");
  const match = clan.clanTitle.match(pattern);

  if (match == null) {
    return null;
  }

  return parseInt(match[1]);
}

/**
 * Use the first clan that perfectly or vaguely matches, return early if perfect match
 */
export function getClanByMonster(monster: MonsterData): FaxClanData {
  const sorted = [...clans.filter((c) => c.faxMonsterId == monster.id)];

  if (sorted.length == 0) {
    return null;
  }

  // Sort so that fax sources go first
  // Sort so the older faxes go first as they're more reliable
  sorted.sort((c1, c2) => {
    const isSource1 = getClanType(c1) == "Fax Source";
    const isSource2 = getClanType(c2) == "Fax Source";

    if (isSource1 != isSource2) {
      return isSource1 ? -1 : 1;
    }

    const t1 = c1.faxMonsterLastChanged;
    const t2 = c2.faxMonsterLastChanged;

    if (t1 == t2) {
      return 0;
    }

    if (t1 == null || t2 == null) {
      return t1 == null ? 1 : -1;
    }

    return t1 - t2;
  });

  return sorted[0];
}

export function getOutdatedClans() {
  const lastCheckedCutoff = Math.round(Date.now() / 1000) - 60 * 60 * 24 * 14; // 2 weeks

  return clans.filter((c) => c.clanLastChecked < lastCheckedCutoff);
}

export async function updateClan(clan: FaxClanData) {
  const existing = clans.find((c) => c.clanId == clan.clanId);

  if (existing != null) {
    existing.clanTitle = clan.clanTitle;
    existing.faxMonsterId = clan.faxMonsterId;
    existing.clanLastChecked = clan.clanLastChecked;
    existing.faxMonsterLastChanged = clan.faxMonsterLastChanged;
    clan = existing;
  } else {
    clans.push(clan);
    invalidateReportCache();
  }

  if (clan.clanLastChecked == 0) {
    // If we haven't checked this clan, don't add it to the database yet..
    return;
  }

  await saveClan(clan);
}

export async function removeInaccessibleClans(clansWeCanAccess: KoLClan[]) {
  const toRemove = clans.filter(
    (c) => !clansWeCanAccess.some((c1) => c1.id == c.clanId),
  );

  if (toRemove.length == 0) {
    return;
  }

  for (const clan of toRemove) {
    const index = clans.indexOf(clan);

    clans.splice(index, 1);
    await removeClan(clan.clanId);
  }

  invalidateReportCache();
}

export function getUnknownClans(whitelistedClans: KoLClan[]): KoLClan[] {
  // Return every clan we do not know of, or do not know the title of
  return whitelistedClans.filter((clan) => {
    const found = clans.find((c) => c.clanId == clan.id);

    return found == null || found.clanTitle == null;
  });
}

export async function setFaxMonster(clan: FaxClanData, monsterId: number) {
  if (clan.faxMonsterId != monsterId) {
    clan.faxMonsterId = monsterId;
    clan.faxMonsterLastChanged = Math.round(Date.now() / 1000);
  }

  await updateClan(clan);
  invalidateReportCache();
}

export function getFaxClans(...types: ClanType[]): FaxClanData[] {
  return clans.filter(
    (c) => types.includes(getClanType(c)) && c.faxMonsterId != null,
  );
}

export function isUnknownMonsterInClanData(): boolean {
  return clans.some(
    (c) => c.faxMonsterId != null && getMonsterById(c.faxMonsterId) == null,
  );
}

export function getClanStatistics(): ClanStatistics {
  const sourceClans = getFaxClans(`Fax Source`).length;

  return {
    sourceClans: sourceClans,
    otherClans: clans.length - sourceClans,
  };
}

export function getSpecificFaxSources(): [FaxClanData, number][] {
  const mapped: [FaxClanData, number][] = clans.map((c) => [
    c,
    getClanMonsterType(c),
  ]);

  return mapped.filter(
    ([, type]) => type != null && getMonsterById(type) != null,
  );
}

export async function loadClans() {
  clans.splice(0);

  clans.push(...(await loadClansFromDatabase()));

  const faxSources = clans.filter((c) => getClanType(c) == `Fax Source`);
  const monsters = [];
  faxSources.forEach((c) => {
    if (c.faxMonsterId == null || monsters.includes(c.faxMonsterId)) {
      return;
    }

    monsters.push(c.faxMonsterId);
  });

  addLog(
    `Loaded ${clans.length} clans, of which ${faxSources.length} are fax sources and contain ${monsters.length} different monsters.`,
  );
}
