import { config } from "../config.js";
import { addLog } from "../Settings.js";
import type {
  FaxbotDatabase,
  FaxbotDatabaseMonster,
  FaxClanData,
  MonsterCategory,
  MonsterData,
  MonsterSetting,
} from "../types.js";
import { invalidateReportCache } from "../utils/reportCacheMiddleware.js";
import { formatNumber } from "../utils/utilities.js";
import {
  getClanById,
  getClanStatistics,
  getClanType,
  getFaxClans,
  getSpecificFaxSources,
} from "./managers/clans.js";
import {
  getFaxStatistics,
  getSettings,
  loadMonstersFromDatabase,
  saveMonsters,
} from "./managers/database.js";
import axios from "axios";
import { encodeXML } from "entities";
import { readFileSync } from "fs";
import { marked } from "marked";

export const PHOTOCOPIED_BUTT_ID = 1049;

const monsters: MonsterData[] = [];

/**
 * Only invoked when we encounter a monster ID we don't know. Should probably also invoke it every X while. Like every other week.
 */
async function updateMonsterData() {
  addLog(`Now rebuilding monsters from kolmafia..`);
  const fetchedFile = (
    await axios(
      `https://raw.githubusercontent.com/kolmafia/kolmafia/main/src/data/monsters.txt`,
      {
        method: `GET`,
        maxRedirects: 0,
        validateStatus: (status) => status === 200,
      }
    )
  ).data as string;

  await loadMonstersByString(fetchedFile.toString());
  await loadMonsters();
  invalidateReportCache();
}

async function loadMonstersByString(monstersFile: string) {
  monsters.splice(0);

  for (const line of monstersFile.split(/[\r\n]+/)) {
    if (line.startsWith(`#`)) {
      continue;
    }

    const match = line.match(/^([^\t]*)\t(-?\d+)\t[^\t]*\t([^\t]*)/);

    if (match == null) {
      continue;
    }

    const manual = match[3].match(/Manuel: (?:([^ "]+)|"(.*?)"(?:$| ))/);
    let category: MonsterCategory = `Other`;

    if (line.includes(`NOWISH`)) {
      category = `Unwishable`;
    }

    const data: MonsterData = {
      id: parseInt(match[2]),
      name: match[1],
      manualName: manual == null ? match[1] : manual[1] ?? manual[2],
      category: category,
    };

    monsters.push(data);
  }

  const couldMatch = (name1: string, name2: string) => {
    if ((name1 ?? ``) == `` || (name2 ?? ``) == ``) {
      return false;
    }

    // Turn [32]goblin into goblin
    // Turn goblin (blind) into goblin
    name1 = name1
      .toLowerCase()
      .replaceAll(/[([].+?[\])]/g, ``)
      .replaceAll(/[^a-z0-9]/g, ``);
    name2 = name2
      .toLowerCase()
      .replaceAll(/[([].+?[\])]/g, ``)
      .replaceAll(/[^a-z0-9]/g, ``);

    return name1 == name2;
  };

  for (const monster of monsters) {
    const isAmbiguous = monsters.some((m) => {
      if (m.id == monster.id) {
        return false;
      }

      for (const m1 of [monster.name, monster.manualName]) {
        for (const m2 of [m.name, m.manualName]) {
          if (couldMatch(m1, m2)) {
            return true;
          }
        }
      }

      return false;
    });

    if (!isAmbiguous) {
      continue;
    }

    monster.category = `Ambiguous`;
  }

  await saveMonsters(monsters);
}

let lastUpdate = 0;

export async function tryUpdateMonsters(): Promise<boolean> {
  if (lastUpdate + 12 * 60 * 60 * 1000 > Date.now()) {
    return false;
  }

  addLog(`Found unrecognized monster, trying to update our list of monsters..`);
  lastUpdate = Date.now();

  await updateMonsterData();

  return true;
}

export async function loadMonsters() {
  const dbMonsters = await loadMonstersFromDatabase();

  if (dbMonsters.length == 0) {
    await updateMonsterData();

    return;
  }

  monsters.splice(0);
  monsters.push(...dbMonsters);

  // Sort with shorter names taking priority over longer names
  monsters.sort((m1, m2) => {
    if (m1.name.length != m2.name.length) {
      return m1.name.length - m2.name.length;
    }

    return m1.name.localeCompare(m2.name);
  });

  addLog(`Loaded ${monsters.length} monsters`);
}

export function getMonsterById(id: number): MonsterData {
  return monsters.find((m) => m.id == id);
}

/**
 *
 */
export function getMonsters(identifier?: string): MonsterData[] {
  if (identifier == null) {
    return monsters;
  }

  // Lowercase it then replace any spaces with no-spaces
  // We're not going to get smarter about this yet
  identifier = identifier.replaceAll(` `, ``).toLowerCase();

  if (identifier.match(/^\[\d+\]/)) {
    identifier = identifier.match(/(\d+)/)[1];
  } else if (identifier.match(/^\[\?+]/)) {
    // If it starts with [??] then strip it
    identifier = identifier.match(/^\[\?+] *(.*)$/)[1];
  }

  let result = monsters.filter((m) => m.id.toString() == identifier);

  if (result.length > 0) {
    return result;
  }

  result = monsters.filter(
    (m) =>
      m.manualName &&
      m.manualName.replaceAll(` `, ``).toLowerCase() == identifier
  );

  if (result.length == 1) {
    return result;
  }

  result = monsters.filter(
    (m) => m.name && m.name.replaceAll(` `, ``).toLowerCase() == identifier
  );

  if (result.length > 0) {
    return result;
  }

  result = monsters.filter(
    (m) =>
      m.manualName &&
      m.manualName.replaceAll(` `, ``).toLowerCase().startsWith(identifier)
  );

  if (result.length > 0) {
    return result;
  }

  result = monsters.filter(
    (m) =>
      m.name && m.name.replaceAll(` `, ``).toLowerCase().startsWith(identifier)
  );

  if (result.length > 0) {
    return result;
  }

  // Finally just find any monsters that contain this monster name
  result = monsters.filter(
    (m) =>
      m.manualName &&
      m.manualName.replaceAll(` `, ``).toLowerCase().includes(identifier)
  );

  if (result.length == 0) {
    result = monsters.filter(
      (m) =>
        m.name && m.name.replaceAll(` `, ``).toLowerCase().includes(identifier)
    );
  }

  return result;
}

export function createMonsterList(
  reliableClans: boolean | null, // If null, include all monsters we have access to
  settings: MonsterSetting[] = []
): FaxbotDatabaseMonster[] {
  let clans: FaxClanData[];

  if (reliableClans) {
    // If we're wanting reliable clans in the data
    clans = getFaxClans(`Random Clan`, `Fax Source`).filter((c) => {
      if (getClanType(c) == "Fax Source") {
        return true;
      }

      // Only if the monster was unchanged at least a week after it was added, will it be included
      const added = c.faxMonsterLastChanged;
      const checked = c.clanLastChecked;

      if (added == null || checked == null) {
        return false;
      }

      // If the monster is unchanged more than a week, then add to source clans
      return added + 7 * 24 * 60 * 60 < checked;
    });
  } else if (reliableClans == false) {
    clans = getFaxClans("Random Clan");
  } else {
    clans = getFaxClans("Random Clan", "Fax Source");
  }

  // Sort so known fax monsters are ordered first and null ids are last
  clans.sort((c1, c2) => (c1.faxMonsterId ?? 9999) - (c2.faxMonsterId ?? 9999));

  const monsterList: FaxbotDatabaseMonster[] = [];

  for (const clan of clans) {
    if (clan.faxMonsterId == null) {
      continue;
    }

    const monsterData = getMonsterById(clan.faxMonsterId);

    if (monsterData == null) {
      addLog(
        `Unable to find a monster '${clan.faxMonsterId}'. We have ${monsters.length} monsters loaded`
      );
      continue;
    }

    let displayedName = monsterData.name;

    if (monsterData.id == 1049) {
      const match = (clan.clanTitle ?? "").match(/Source: (.+'s butt)$/);

      if (match != null) {
        displayedName = match[1];
      }
    }

    const monsterCommand = `[${monsterData.id}]${displayedName}`;

    // Prevent dupes
    if (monsterList.some((list) => list.command == monsterCommand)) {
      continue;
    }

    const category = settings.find(
      (s) => s.monster == monsterCommand && s.setting == "Category"
    );

    const monster: FaxbotDatabaseMonster = {
      name: displayedName,
      actual_name: monsterData.name,
      command: monsterCommand,
      category: category == null ? monsterData.category : category.value,
    };

    monsterList.push(monster);
  }

  if (config.TESTING && monsterList.length < 5) {
    for (let i = 0; i < 5; i++) {
      monsterList.push({
        name: `Test Monster ${i}`,
        actual_name: `Test Monster ${i}`,
        command: `[100${i}]Test Monster ${i}`,
        category: "Test",
      });
    }
  }

  monsterList.sort((s1, s2) => s1.name.localeCompare(s2.name));

  return monsterList;
}

const constSpace = `\t`;

async function createHtml(botName: string, botId: string) {
  let md = readFileSync("./data/main.md", "utf-8");

  const generateMonsterList = (
    keyword: string,
    monsters: FaxbotDatabaseMonster[]
  ) => {
    md = md.replaceAll(
      keyword,
      monsters
        .map((m) => {
          if (m.command == "") {
            return `||||`;
          }

          const match = m.command.match(/^(?:\[([\d?]+)\])?(.*)$/);

          if (match == null) {
            return "";
          }

          return `|${match[1] ?? "N/A"}|${match[2]}|\`${m.command}\`|`;
        })
        .join("\n")
    );
  };

  md = md.replaceAll("{Bot Info}", `${botName} (#${botId})`);

  const clan = getClanById(config.DEFAULT_CLAN);
  const defaultClanName = clan ? clan.name : "{ERROR: Default Clan Unknown}";

  md = md.replaceAll("{Default Clan}", defaultClanName);

  const clanStats = getClanStatistics();
  const faxStats = await getFaxStatistics();

  const settings = await getSettings();
  const reliableMonsters = createMonsterList(true, settings);
  const allMonsters = createMonsterList(null, settings);
  const noteworthyMonsters = allMonsters.filter((m) =>
    settings.some((s) => s.monster == m.command && s.setting == "Noteworthy")
  );
  const unreliableMonsters = allMonsters.filter(
    (m) => !reliableMonsters.some((m1) => m1.name == m.name)
  );

  md = md.replaceAll(
    "{Other Monster Count}",
    formatNumber(unreliableMonsters.length)
  );
  md = md.replaceAll("{Source Clans}", formatNumber(clanStats.sourceClans));
  md = md.replaceAll("{Other Clans}", formatNumber(clanStats.otherClans));
  md = md.replaceAll(
    "{Source Monster Count}",
    formatNumber(reliableMonsters.length)
  );

  md = md.replaceAll("{Faxes Served}", formatNumber(faxStats.faxesServed));
  md = md.replaceAll(
    "{Top Requests}",
    faxStats.topFaxes
      .map((m) => {
        return `|${m.name}|${formatNumber(m.count)}|`;
      })
      .join("\n")
  );
  md = md.replaceAll(
    "{Top Requests Month}",
    faxStats.topFaxesMonth
      .map((m) => {
        return `|${m.name}|${formatNumber(m.count)}|`;
      })
      .join("\n")
  );

  if (unreliableMonsters.length == 0) {
    unreliableMonsters.push({
      name: ``,
      actual_name: "",
      command: "",
      category: "",
    });
  }

  generateMonsterList("{Other Monsters}", unreliableMonsters);
  generateMonsterList("{Source Monsters}", reliableMonsters);
  generateMonsterList("{Noteworthy Monsters}", noteworthyMonsters);

  // Build the list of clans that are looking for monsters
  const lookingForClans = getSpecificFaxSources().filter(
    ([c, id]) => c.faxMonsterId != id
  );

  // We're sorting this by newest clans first
  lookingForClans.sort(([c1], [c2]) => c2.clanFirstAdded - c1.clanFirstAdded);

  const lookingForMonsters: FaxbotDatabaseMonster[] = [];

  for (const [, monsterId] of lookingForClans) {
    const monster = getMonsterById(monsterId);
    const cmd = `[${monster.id}]${monster.name}`;

    if (lookingForMonsters.some((c) => c.command == cmd)) {
      continue;
    }

    lookingForMonsters.push({
      name: monster.name,
      actual_name: monster.name,
      command: cmd,
      category: "N/A",
    });
  }

  lookingForMonsters.sort((m1, m2) =>
    m1.actual_name.localeCompare(m2.actual_name)
  );

  generateMonsterList("{Looking For Monsters}", lookingForMonsters);

  const inlineHtml = await marked.parse(md, { breaks: true, async: false });

  let html = readFileSync("./data/main.html", "utf-8");
  html = html.replaceAll("{Bot Info}", `${botName} (#${botId})`);
  html = html.replaceAll("{Inline Html}", inlineHtml);

  return html;
}

export function generateLookingFor(): string {
  const clans = getSpecificFaxSources()
    .filter(([clan, monsterId]) => clan.faxMonsterId != monsterId)
    .map(([clan, monsterId]) => ({
      clan: clan.clanName,
      title: clan.clanTitle,
      monster: monsterId,
      name: getMonsterById(monsterId)?.name,
    }));

  clans.sort((c1, c2) => c1.name.localeCompare(c2.name));

  return JSON.stringify(clans);
}

export async function formatMonsterList(
  format: "xml" | "json" | "html",
  botName: string,
  botId: string
): Promise<string> {
  if (format === "html") {
    return createHtml(botName, botId);
  }

  const reliableMonsters = createMonsterList(true, await getSettings());

  const data = {
    botdata: {
      name: botName,
      playerid: botId,
    },
    monsterlist: { monsterdata: reliableMonsters },
  } satisfies FaxbotDatabase;

  if (format === "xml") {
    const strings: string[] = [`<?xml version="1.0" encoding="UTF-8"?>`];
    strings.push(...createXMLField(`faxbot`, data, ``));

    return strings.join(`\n`);
  }

  return JSON.stringify(data);
}

type NestedValue =
  | string
  | number
  | FaxbotDatabaseMonster
  | { [x: string]: NestedValue }
  | NestedValue[];

function createXMLField(
  name: string,
  value: NestedValue,
  spacing: string
): string[] {
  const strings: string[] = [];

  if (Array.isArray(value)) {
    for (const arrayEntry of value) {
      strings.push(`${spacing}<${name}>`);

      for (const key of Object.keys(arrayEntry)) {
        const values = createXMLField(
          key,
          arrayEntry[key],
          spacing + constSpace
        );

        strings.push(...values);
      }

      strings.push(`${spacing}</${name}>`);
    }
  } else if (typeof value == `object`) {
    strings.push(`${spacing}<${name}>`);

    for (const key of Object.keys(value)) {
      const values = createXMLField(key, value[key], spacing + constSpace);

      strings.push(...values);
    }

    strings.push(`${spacing}</${name}>`);
  } else {
    strings.push(`${spacing}<${name}>${encodeXML(value.toString())}</${name}>`);
  }

  return strings;
}
