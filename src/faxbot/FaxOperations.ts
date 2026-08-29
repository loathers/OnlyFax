import { config } from "../config.js";
import type { ParentController } from "../ParentController.js";
import { addLog } from "../Settings.js";
import type {
  ClanJoinAttempt,
  DepositedFax,
  FaxClanData,
  KoLClan,
  KoLUser,
} from "../types.js";
import { FaxMessages } from "../utils/messages.js";
import type { FaxRequest } from "./faxrequests/FaxRequest.js";
import { FaxOutcome, PlayerFaxRequest } from "./faxrequests/FaxRequest.js";
import {
  getClanById,
  getClanByMonster,
  getClanDataById,
  setFaxMonster,
  updateClan,
} from "./managers/clans.js";
import { addFaxLog } from "./managers/database.js";
import { getMonsterById, tryUpdateMonsters } from "./monsters.js";
import type { FaxAdministration } from "./tasks/FaxAdministration.js";
import { FaxFinder } from "./tasks/FaxFinder.js";

export class FaxOperations {
  controller: ParentController;
  administration: FaxAdministration;

  constructor(controller: ParentController) {
    this.controller = controller;
    this.administration = controller.admin;
  }

  getClient() {
    return this.controller.client;
  }

  async handleFaxRequestWrapper(player: KoLUser, message: string) {
    let faxAttempt: PlayerFaxRequest;

    try {
      faxAttempt = await this.handleFaxRequest(player, message);
    } catch (e) {
      addLog(`Error: `, e);
      await this.getClient().sendPrivateMessage(
        player,
        FaxMessages.ERROR_INTERNAL_ERROR,
      );
    } finally {
      if (faxAttempt != null) {
        faxAttempt.faxAttempt.completed = Math.round(Date.now() / 1000);
        await addFaxLog(faxAttempt.faxAttempt);

        this.administration.faxes.push(faxAttempt.faxAttempt);

        if (faxAttempt.hasFax) {
          await this.dumpFax(faxAttempt, true);
        }
      }
    }

    await this.joinDefaultClan();
  }

  async handleFaxRequest(
    player: KoLUser,
    message: string,
  ): Promise<PlayerFaxRequest> {
    const faxFinder = new FaxFinder(message);

    if (!faxFinder.tryFindMonster()) {
      await this.getClient().sendPrivateMessage(player, faxFinder.getError());

      return null;
    }

    const monster = faxFinder.getMonster();
    const nullableSourceClan = faxFinder.getClan();

    const clanInfo = await this.getClient().getClanInfo(parseInt(player.id));

    if (clanInfo == null) {
      await this.getClient().sendPrivateMessage(
        player,
        FaxMessages.ERROR_CANNOT_FIND_YOUR_CLAN,
      );

      return null;
    }

    const faxData: DepositedFax = {
      requester: player,
      fax: monster,
      requested: Math.round(Date.now() / 1000),
      outcome: FaxMessages.ERROR_INTERNAL_ERROR,
      request: monster.name, // We could store the message itself, but inevitably someone will post their password in a format that resolves to a monster
    };

    const faxAttempt = new PlayerFaxRequest(
      this.getClient(),
      player,
      monster,
      clanInfo,
      faxData,
    );
    faxAttempt.setFaxSource(nullableSourceClan);

    addLog(
      `Grabbing fax for ${player.name}: ${faxAttempt.getExpectedMonster()}`,
    );

    let status: FaxOutcome = FaxOutcome.TRY_AGAIN;

    // While the situation is manageable
    while (status == FaxOutcome.TRY_AGAIN) {
      // Only find a fax source if we are not looking in a specific clan
      if (nullableSourceClan == null) {
        faxAttempt.setFaxSource(getClanByMonster(monster));
      }

      // Attempt to acquire the fax
      status = await this.acquireFax(faxAttempt);

      // If the acquiration didn't go perfectly, go back to step 1. Which will cancel the loop if it went badly
      if (status != FaxOutcome.SUCCESS) {
        // Don't try again if this was for a specific clan
        if (nullableSourceClan != null) {
          break;
        }

        continue;
      }

      // Ensure we don't replace a fax immediately
      await this.administration.ensureClanTimeout(faxAttempt);

      // Attempt to send the fax
      status = await this.sendFax(faxAttempt);

      // If we still have the fax, and the fax dump fails. Break the loop
      if (faxAttempt.hasFax && !(await this.dumpFax(faxAttempt))) {
        break;
      }

      // If its a fail or success, the loop while will stop
      // Otherwise if its a try again, loop will begin again
    }

    return faxAttempt;
  }

  async joinDefaultClan() {
    if (this.getClient().getCurrentClan()?.id == config.DEFAULT_CLAN) {
      return;
    }

    await this.getClient().joinClanForcibly(
      getClanById(config.DEFAULT_CLAN),
      `be in default clan`,
    );
  }

  async dumpFax(
    faxAttempt: FaxRequest,
    silent: boolean = false,
  ): Promise<boolean> {
    addLog(`Now getting rid of the fax on hand`);
    const dumpClan = getClanById(config.FAX_DUMP_CLAN);
    const joinSource = await this.getClient().joinClanForcibly(
      dumpClan,
      `dump fax`,
    );

    if (joinSource != `Joined`) {
      addLog(`Failed to join fax dump clan: ${joinSource}`);

      if (!silent && faxAttempt != null) {
        await faxAttempt.notifyUpdate(FaxMessages.ERROR_FAILED_DUMP_FAX);
      }

      return false;
    }

    const result = await this.getClient().useFaxMachine(`sendfax`);
    const hasFax = result != `Sent Fax` && result != `Illegal Clan`;

    if (faxAttempt != null) {
      faxAttempt.hasFax = hasFax;
    }

    if (!hasFax) {
      return true;
    }

    addLog(`Failed to dump fax: ${result}`);

    if (!silent && faxAttempt != null) {
      await faxAttempt.notifyUpdate(FaxMessages.ERROR_FAILED_DUMP_FAX);
    }

    return false;
  }

  async acquireFax(faxAttempt: FaxRequest): Promise<FaxOutcome> {
    const monsterClan: FaxClanData = faxAttempt.getFaxSource();

    if (monsterClan == null) {
      // We got to this point and we thought it was available, unfortunately it is not available
      addLog(
        `Failed to grab fax, ${faxAttempt.getExpectedMonster()} is no longer in the fax network`,
      );
      await faxAttempt.notifyUpdate(
        FaxMessages.ERROR_MONSTER_REMOVED_FAX_NETWORK,
      );

      return FaxOutcome.FAILED;
    }

    if (faxAttempt.hasFax) {
      // If failed to dump fax, exit
      if (!(await this.dumpFax(faxAttempt))) {
        return FaxOutcome.FAILED;
      }
    }

    const joinSource = await this.getClient().joinClanForcibly(
      {
        id: monsterClan.clanId,
        name: monsterClan.clanName,
      },
      `grab fax, clan title: '${monsterClan.clanTitle}'`,
    );

    const joinedFaxClan = await this.joinedFaxClanCleanly(
      monsterClan,
      joinSource,
      faxAttempt,
    );

    if (joinedFaxClan != FaxOutcome.SUCCESS) {
      return joinedFaxClan;
    }

    const receivedFax = await this.receivedFaxProperly(monsterClan, faxAttempt);

    if (receivedFax != FaxOutcome.SUCCESS) {
      return receivedFax;
    }

    const joinedDest = await this.joinedDestClanCleanly(faxAttempt);

    if (joinedDest != FaxOutcome.SUCCESS) {
      return joinedDest;
    }

    const photo = await this.getClient().getPhotoInfo();

    if (photo == null || photo.id != monsterClan.faxMonsterId) {
      if (!(await this.dumpFax(faxAttempt))) {
        return FaxOutcome.FAILED;
      }

      addLog(
        `Fax was not as expected, expected ${
          monsterClan.faxMonsterId
        } but received ${photo == null ? null : photo.id}. The clan will be ${
          photo == null ? "removed" : "updated"
        }.`,
      );

      await setFaxMonster(monsterClan, photo == null ? null : photo.id);

      return FaxOutcome.TRY_AGAIN;
    }

    return FaxOutcome.SUCCESS;
  }

  async receivedFaxProperly(
    monsterClan: FaxClanData,
    faxAttempt: FaxRequest,
  ): Promise<FaxOutcome> {
    const fax = await this.getClient().useFaxMachine(`receivefax`);
    faxAttempt.hasFax =
      faxAttempt.hasFax || fax == `Already have fax` || fax == `Grabbed Fax`;

    if (fax == `Already have fax`) {
      addLog(`Had a fax on hand unexpectably, now dumping`);

      if (await this.dumpFax(faxAttempt)) {
        return await this.acquireFax(faxAttempt);
      }
    } else if (fax == `No Fax Loaded` || fax == `No Fax Machine`) {
      // Never allow a faxless clan to say its a source clan
      if (
        fax == `No Fax Machine` &&
        monsterClan.clanTitle.toLowerCase().includes("source")
      ) {
        monsterClan.clanTitle = "";
      }

      await setFaxMonster(monsterClan, null);

      addLog(
        `The fax source clan ${monsterClan.clanName} had an invalid state: ${fax}`,
      );

      return FaxOutcome.TRY_AGAIN;
    } else if (fax == `Unknown`) {
      addLog(`Unknown fax machine state, no further information`);
      await faxAttempt.notifyUpdate(
        FaxMessages.ERROR_UNKNOWN_FAX_MACHINE_STATE,
      );

      return FaxOutcome.FAILED;
    }

    return FaxOutcome.SUCCESS;
  }

  async joinedDestClanCleanly(faxAttempt: FaxRequest): Promise<FaxOutcome> {
    const joinTarget = await this.getClient().joinClan(
      faxAttempt.targetClan,
      `deliver fax`,
    );

    if (joinTarget == `Not Whitelisted`) {
      addLog(`Not whitelisted to clan '${faxAttempt.targetClan.name}'`);
      await faxAttempt.notifyUpdate(
        FaxMessages.ERROR_NOT_WHITELISTED_YOUR_CLAN,
      );

      return FaxOutcome.FAILED;
    } else if (joinTarget == `Am Clan Leader`) {
      addLog(`Failed to join target clan, I am clan leader and trapped`);
      await faxAttempt.notifyUpdate(FaxMessages.ERROR_TRAPPED_IN_CLAN);

      return FaxOutcome.FAILED;
    } else if (joinTarget != `Joined`) {
      addLog(
        `Unknown error while trying to join target clan, no further information`,
      );
      await faxAttempt.notifyUpdate(FaxMessages.ERROR_JOINING_YOUR_CLAN);

      return FaxOutcome.FAILED;
    }

    return FaxOutcome.SUCCESS;
  }

  async joinedFaxClanCleanly(
    monsterClan: FaxClanData,
    joinSource: ClanJoinAttempt,
    faxAttempt: FaxRequest,
  ): Promise<FaxOutcome> {
    if (joinSource == `Not Whitelisted`) {
      await setFaxMonster(monsterClan, null);
      addLog(
        `Removed ${monsterClan.clanName} from fax network, we're not whitelisted`,
      );

      return FaxOutcome.TRY_AGAIN;
    } else if (joinSource == `Am Clan Leader`) {
      addLog(`I am trapped in the clan as clan leader`);
      await faxAttempt.notifyUpdate(FaxMessages.ERROR_TRAPPED_IN_CLAN);

      return FaxOutcome.FAILED;
    } else if (joinSource != `Joined`) {
      addLog(`Unable to join clan, no further information known`);
      await faxAttempt.notifyUpdate(FaxMessages.ERROR_UNABLE_JOIN_SOURCE_CLAN);

      return FaxOutcome.FAILED;
    }

    return FaxOutcome.SUCCESS;
  }

  async sendFax(faxAttempt: PlayerFaxRequest): Promise<FaxOutcome> {
    const faxResult = await this.getClient().useFaxMachine(`sendfax`);
    faxAttempt.hasFax =
      faxResult != `Sent Fax` && faxResult != `Have no fax to send`;

    if (faxResult == `Sent Fax`) {
      addLog(
        `Completed fax request from ${faxAttempt.player.name} for monster ${faxAttempt.monster.name}`,
      );

      await faxAttempt.notifyUpdate(FaxMessages.FAX_READY);

      return FaxOutcome.SUCCESS;
    }

    // If we got this far, its a failure
    if (faxResult == `No Fax Machine`) {
      addLog(`Failed to send fax, they do not have a fax machine`);
      await faxAttempt.notifyUpdate(FaxMessages.ERROR_NO_FAX_MACHINE);
    } else if (faxResult == `Illegal Clan`) {
      addLog(`Attempted to send a fax to a source fax clan`);
      await faxAttempt.notifyUpdate(FaxMessages.ERROR_ILLEGAL_CLAN);
    } else if (faxResult == `No Clan Info`) {
      addLog(`Failed to send fax, unknown clan information`);
      await faxAttempt.notifyUpdate(FaxMessages.ERROR_UNKNOWN_CLAN);
    }

    return FaxOutcome.FAILED;
  }

  async checkClanInfo(clan: KoLClan, extraDebugInfo: string = null) {
    addLog(
      `Now checking up on clan ${clan.name}${
        extraDebugInfo ? " " + extraDebugInfo : ""
      }`,
    );

    const state = await this.getClient().joinClanForcibly(
      clan,
      `fetch clan info`,
    );

    // Not sure what's up, lets get out of here
    if (state != `Joined`) {
      addLog(`Failed to join ${clan.name}: ${state}`);

      return;
    }

    const newClan = await this.getClient().myClan();

    if (newClan == null || newClan.id != clan.id) {
      // We didn't join them properly, lets get out of here
      return;
    }

    const data: FaxClanData = {
      clanId: newClan.id,
      clanName: newClan.name,
      clanTitle: newClan.title ?? ``,
      clanLastChecked: Math.round(Date.now() / 1000),
      clanFirstAdded: Math.round(Date.now() / 1000),
    };

    if (
      getClanById(config.DEFAULT_CLAN) != null &&
      getClanById(config.FAX_DUMP_CLAN) != null
    ) {
      const fax = await this.getClient().useFaxMachine(`receivefax`);

      // We bugged out somewhere, lets just go
      if (fax == `Already have fax` || fax == `Unknown`) {
        addLog(
          `Unexpectably bugged out somewhere when checking clan fax: ${fax}`,
        );
        await this.dumpFax(null);

        return;
      }

      const oldData = getClanDataById(newClan.id);

      if (fax == "No Fax Machine") {
        // Never allow a clan without a fax machine to say its a source clan
        if (data.clanTitle.toLowerCase().includes("source")) {
          data.clanTitle = "";
        }
      } else if (fax == `Grabbed Fax`) {
        const photo = await this.getClient().getPhotoInfo();
        await this.dumpFax(null);

        if (photo == null || photo.name == null) {
          // We bugged out somewhere, lets just log it and move on
          addLog(`Failed to find fax information in clan ${newClan.name}`);

          return;
        }

        if (getMonsterById(photo.id) == null) {
          await tryUpdateMonsters();
        }

        await setFaxMonster(data, photo.id);
      } else if (fax == "No Fax Loaded") {
        await setFaxMonster(data, null);
      } else if (oldData != null) {
        // Something went wrong, lets not get into it
        return;
      }
    }

    // The rest of the error states should be non-issues. They probably don't have a fax machine.

    await updateClan(data);
  }
}
