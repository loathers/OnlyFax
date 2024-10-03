import { addLog } from "../../Settings.js";
import type {
  DepositedFax,
  FaxClanData,
  FaxRequestedCount,
  FaxStatistics,
  KoLUser,
  MonsterCategory,
  MonsterData,
  MonsterSetting,
  SettingType,
} from "../../types.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function loadClansFromDatabase(): Promise<FaxClanData[]> {
  const clans = await prisma.faxClan.findMany();
  const list: FaxClanData[] = [];

  for (const clan of clans) {
    list.push({
      ...clan,
    });
  }

  return list;
}

export async function saveClan(faxClan: FaxClanData) {
  await prisma.faxClan.upsert({
    where: { clanId: faxClan.clanId },
    update: {
      clanTitle: faxClan.clanTitle,
      faxMonsterId: faxClan.faxMonsterId,
      faxMonsterLastChanged: faxClan.faxMonsterLastChanged,
      clanLastChecked: faxClan.clanLastChecked,
    },
    create: {
      clanId: faxClan.clanId,
      clanName: faxClan.clanName,
      clanTitle: faxClan.clanTitle,
      faxMonsterId: faxClan.faxMonsterId,
      faxMonsterLastChanged: faxClan.faxMonsterLastChanged,
      clanFirstAdded: faxClan.clanFirstAdded,
      clanLastChecked: faxClan.clanLastChecked,
    },
  });
}

export async function removeClan(clanId: number) {
  await prisma.faxClan.delete({ where: { clanId } });
}

export async function addFaxLog(fax: DepositedFax) {
  await prisma.faxRecord.create({
    data: {
      playerId: parseInt(fax.requester.id),
      faxClan: fax.faxClan,
      playerClan: fax.clanId,
      completed: fax.completed,
      started: fax.requested,
      outcome: fax.outcome,
      faxRequest: fax.request,
    },
  });
}

export async function loadMonstersFromDatabase(): Promise<MonsterData[]> {
  const monsters = await prisma.monsterData.findMany();
  const list: MonsterData[] = [];

  for (const monsterData of monsters) {
    list.push({
      id: monsterData.monsterId,
      name: monsterData.mafiaName,
      manualName: monsterData.manualName,
      category: monsterData.category as MonsterCategory,
    });
  }

  return list;
}

export async function getFaxStatistics(): Promise<FaxStatistics> {
  const faxesServed = await prisma.faxRecord.count();
  const topRequests = await prisma.faxRecord.groupBy({
    by: ["faxRequest"],
    _count: {
      _all: true,
    },
    orderBy: {
      _count: { faxRequest: "desc" },
    },
    take: 10,
  });
  const topRequestsMonth = await prisma.faxRecord.groupBy({
    by: ["faxRequest"],
    _count: {
      _all: true,
    },
    where: {
      completed: {
        gte: Math.round(Date.now() / 1000) - 31 * 24 * 60 * 60,
      },
    },
    orderBy: {
      _count: { faxRequest: "desc" },
    },
    take: 10,
  });

  const topFaxes: FaxRequestedCount[] = [];

  topRequests.forEach((req) => {
    topFaxes.push({ name: req.faxRequest, count: req._count._all });
  });
  const topFaxesMonth: FaxRequestedCount[] = [];

  topRequestsMonth.forEach((req) => {
    topFaxesMonth.push({ name: req.faxRequest, count: req._count._all });
  });

  return {
    faxesServed,
    topFaxes,
    topFaxesMonth,
  };
}

export async function saveMonsters(monsters: MonsterData[]) {
  for (const monster of monsters) {
    await prisma.monsterData.upsert({
      where: { monsterId: monster.id },
      create: {
        monsterId: monster.id,
        mafiaName: monster.name,
        manualName: monster.manualName,
        category: monster.category,
      },
      update: {
        mafiaName: monster.name,
        manualName: monster.manualName,
        category: monster.category,
      },
    });
  }
}

/**
 * Returns previous setting if success
 */
export async function removeSetting(
  user: KoLUser,
  monster: string,
  setting: string
): Promise<string> {
  const existing = await prisma.customSetting.findFirst({
    where: {
      monster: monster,
      key: setting,
    },
  });

  if (existing == null) {
    return null;
  }

  addLog(
    `${user.name} is removing setting ${setting} which is '${existing.value}' for ${monster}`
  );

  await prisma.customSetting.delete({
    where: {
      id: existing.id,
    },
  });

  return existing.value;
}

/**
 * Returns previous setting if existed
 */
export async function setSetting(
  user: KoLUser,
  monster: string,
  setting: string,
  value: string
): Promise<string | null> {
  const existing = await prisma.customSetting.findFirst({
    where: {
      monster: monster,
      key: setting,
    },
  });

  if (existing != null) {
    addLog(
      `${user.name} (#${user.id}) is overwriting ${setting} for ${monster} from '${existing.value}' to '${value}'`
    );

    await prisma.customSetting.update({
      where: { id: existing.id },
      data: { author: parseInt(user.id), value: value },
    });
  } else {
    addLog(
      `${user.name} (#${user.id}) is setting setting ${setting} for ${monster} to '${value}'`
    );

    await prisma.customSetting.create({
      data: {
        author: parseInt(user.id),
        created: Math.round(Date.now() / 1000),
        key: setting,
        value: value,
        monster: monster,
      },
    });
  }

  return existing != null ? existing.value : null;
}

export async function getSettings(): Promise<MonsterSetting[]> {
  const settings = await prisma.customSetting.findMany();
  const list: MonsterSetting[] = [];

  for (const setting of settings) {
    list.push({
      monster: setting.monster,
      setting: setting.key as SettingType,
      value: setting.value,
    });
  }

  return list;
}
