import type { KOLMessage, PublicMessageType } from "../types.js";
import { decode, encode } from "html-entities";

/**
 * Start KoL's special encoding
 */
const SAFECHARS =
  `0123456789` + // Numeric
  `ABCDEFGHIJKLMNOPQRSTUVWXYZ` + // Alphabetic
  `abcdefghijklmnopqrstuvwxyz` +
  `-_.!~*'()`; // RFC2396 Mark characters
const HEX = `0123456789ABCDEF`;

export function encodeToKolEncoding(x: string): string {
  // The Javascript escape and unescape functions do not correspond
  // with what browsers actually do...

  const plaintext = x;
  let encoded = ``;

  for (let i = 0; i < plaintext.length; i++) {
    const ch = plaintext.charAt(i);

    if (ch == `+`) {
      encoded += `%2B`;
    } else if (ch == ` `) {
      encoded += `+`; // x-www-urlencoded, rather than %20
    } else if (SAFECHARS.indexOf(ch) != -1) {
      encoded += ch;
    } else {
      const charCode = ch.charCodeAt(0);

      if (charCode > 255) {
        /*  console.log(
          "Unicode Character '" +
            ch +
            "' cannot be encoded using standard URL encoding.\n" +
            "(URL encoding only supports 8-bit characters.)\n" +
            "A space will be substituted."
        );*/
        // Replace invalid chars with a question mark
        encoded += `%3F`;
      } else {
        encoded += `%`;
        encoded += HEX.charAt((charCode >> 4) & 0xf);
        encoded += HEX.charAt(charCode & 0xf);
      }
    }
  } // for

  return encoded;
}

export function humanReadableTime(seconds: number): string {
  return `${Math.floor(seconds / 3600)}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, `0`)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, `0`)}`;
}

export function stripHtml(message: string): string {
  let match: string[] | null;

  while (
    (match = message.match(
      /(?:<[^>]+? title="([^">]*)">.+?<\/[^>]*>)|(?:<(.|\n)*?>)/,
    )) != null
  ) {
    message = message.replace(match[0], match[1] || ``);
  }

  return message;
}

/**
 * Used to split a message to fit into KOL's message limits
 *
 * 260 is the rough limit, but given it injects spaces in 20+ long words. Lower that to 245
 */
export function splitMessage(message: string, limit: number = 245): string[] {
  // TODO Try to honor spaces
  let encodedRemainder = encode(message);
  const messages: string[] = [];

  if (encodedRemainder.length > limit) {
    let end = limit;
    let toSnip: string;

    // Make sure we don't leave html entities out
    while (
      end > 0 &&
      (!message.includes(
        (toSnip = decode(encodedRemainder.substring(0, end))),
      ) ||
        !message.includes(decode(encodedRemainder.substring(end))))
    ) {
      end--;
    }

    encodedRemainder = encodedRemainder.substring(end);
    messages.push(toSnip);
  }

  messages.push(decode(encodedRemainder));

  return messages;
}

export function isModMessage(message: KOLMessage): boolean {
  return (
    message.who != null &&
    (message.who.name === `Mod Announcement` ||
      message.who?.name === `Mod Warning`)
  );
}

export function isEventMessage(message: KOLMessage): boolean {
  return message.type === `event`;
}

export function isPrivateMessage(message: KOLMessage): boolean {
  return message.type === `private`;
}

export function isSystemMessage(message: KOLMessage): boolean {
  return message.type === `system`;
}

export function isPublicMessage(message: KOLMessage): boolean {
  return message.type === `public`;
}

export function getPublicMessageType(
  message: KOLMessage,
): PublicMessageType | undefined {
  if (message.type != `public`) {
    return undefined;
  }

  if (message.format == `0`) {
    return `normal`;
  } else if (message.format == `1`) {
    return `emote`;
  } else if (message.format == `2`) {
    return `system`;
  } else if (message.format == `3`) {
    return `mod warning`;
  } else if (message.format == `4`) {
    return `mod announcement`;
  } else if (message.format == `98`) {
    return `event`;
  } else if (message.format == `99`) {
    return `welcome`;
  }

  return undefined;
}

const originalRollover = 1044847800;
const secondsInDay = 24 * 60 * 60;

export function getSecondsElapsedInDay() {
  const time = Math.round(Date.now() / 1000);
  const secondsSinceOriginalTime = time - originalRollover;
  const secondsElapsedInDay = secondsSinceOriginalTime % secondsInDay;

  return secondsElapsedInDay;
}

export function getSecondsToRollover() {
  const secondsElapsedInDay = getSecondsElapsedInDay();

  return secondsInDay - secondsElapsedInDay;
}

export function getSecondsToNearestRollover() {
  const secondsElapsedInDay = getSecondsElapsedInDay();

  return Math.min(secondsElapsedInDay, secondsInDay - secondsElapsedInDay);
}

export function getKolDay() {
  const time = Math.round(Date.now() / 1000);
  const timeDiff = time - originalRollover;
  const daysSince = timeDiff / (24 * 60 * 60);

  return Math.floor(daysSince);
}

export function formatNumber(number: number) {
  const str = number.toString().split(".");
  str[0] = str[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return str.join(".");
}
