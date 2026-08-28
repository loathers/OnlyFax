import type { ParentController } from "../../ParentController.js";
import type { KoLUser } from "../../types.js";
import type { FaxCommand } from "./FaxCommand.js";

export class CommandHelp implements FaxCommand {
  controller: ParentController;

  constructor(controller: ParentController) {
    this.controller = controller;
  }

  isRestricted(): boolean {
    return false;
  }

  name(): string {
    return `help`;
  }

  description(): string {
    return `Command for some information or help as it is commonly known in the noob areas (that's you)`;
  }

  async execute(sender: KoLUser) {
    const messages: string[] = [];
    messages.push(
      `Hello and welcome to OnlyFax. My OnlyFaxs is free and features only the highest quality b/w pictures with every matrix dot in high definition.`,
    );
    messages.push(
      `Send me the name or ID of a monster and not only will I cosplay for you, I will take a selfie and deliver it to your clan for your personal perview.`,
    );
    messages.push(
      `You can view a list of monsters at https://onlyfax.loathers.net/`,
    );

    for (const message of messages) {
      await this.controller.client.sendPrivateMessage(sender, message);
    }
  }
}
