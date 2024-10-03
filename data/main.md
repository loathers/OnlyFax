<header><h1>{Bot Info} <a href="https://github.com/loathers/OnlyFax"><svg xlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" style="fill:rgb(209,213,219); height: 1em;"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6m-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3m44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9M244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8M97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1m-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7m32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1m-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2"></path></svg></a></h1></header>

- [What are you?](#whoami)
- [Stats](#stats)
- [Monsters](#monsters)
- [Noteworthy Faxes](#noteworthy)
- [Commands](#commands)
- [Add a monster to network](#faxsource)
- [Monsters that FaxBot is looking for](#lookingfor)
- [Supporting the FaxBot](#supporting)

# What are you?<a id="whoami"></a>

Hi! I am at your service, I deliver pics to your clan.
I am easy to get started. Just send me a monster name which is in my fax network, and I will deliver that monster to your clan's fax machine.
Be aware though that you need a VIP invitation to access the fax machine, and I will need a whitelist to your clan.
If you wish to add a monster to the fax network, give me a clan title with "Source" or "Fax Source" in the name.

I also operate as a Fortune Teller bot in {Default Clan}.
Just consult me with the Fortune Teller in the VIP Lounge and I will respond with beer, robin, thin.

---

# Give me some interesting (cached) stats!<a id="stats"></a>

| Name                     | Count                  |
| ------------------------ | ---------------------- |
| Source Clans             | {Source Clans}         |
| Other Clans              | {Other Clans}          |
| Monsters in Source Clans | {Source Monster Count} |
| Monsters in Other Clans  | {Other Monster Count}  |
| Faxes Served             | {Faxes Served}         |

### Here's the most requested monsters!

| Monster | Requested |
| ------- | --------- |
{Top Requests}

### Most requested monsters for the last month!

| Monster | Requested |
| ------- | --------- |
{Top Requests Month}

---

# Faxable Monsters<a id="monsters"></a>

| ID  | Name | Command |
| --- | ---- | ------- |
{Source Monsters}

These remaining monsters are in clans that are not marked as a source clan.

| ID  | Name | Command |
| --- | ---- | ------- |
{Other Monsters}

---

# Noteworthy Faxes<a id="noteworthy"></a>

| ID  | Name | Command |
| --- | ---- | ------- |
{Noteworthy Monsters}

---

# Commands<a id="commands"></a>

#### Give me a fax!

Just send the monster name or ID to request a fax.

#### Your clan title has changed, please check it out

Send me `refresh` while in the clan.

#### No no, I want you to check every clan you have access to

Well, this is restricted to a few people which probably doesn't include you.. But send me `refresh all`!

#### Help!

You're already reading the help, but you do you. Send me `help`!

# I hear you're looking for monsters? How do I add a fax source?<a id="faxsource"></a>

Sure! There's two methods of doing this, the first one is that you have a clan ready with a fax machine that contains a monster.
You're also hopefully aware that the FaxBot expects that monster to always be in the fax machine.

You can add a source clan to my network by adding me to your whitelist with the title containing the word `Source`, eg `Fax Source`. Then send me the message `refresh`. I'll check out your clan and the monster, then add it to the network of source clans.

This differs from the `addfax` method.

The `addfax` method is for when you don't have access to the monster itself but still want to add it to the network when someone has the time to do so.

This isn't likely to always be the case, but I sometimes have fax clans that are already set up and just need monsters to be added.

This is done by giving it the clan title `Fax Source: M1234` where `1234` is the monster ID. As long as the monster in the fax machine doesn't match the clan title, I will add it to my "looking for" list.

Anyone can add a clan to that list, and anyone can give me a monster I'm missing if its in that list! No need to setup a clan yourself, someone already did it for you!

To send me a monster that I'm looking for, use a `portable photocopier` on a monster to get a `Photocopied monster`, then add it to your clan fax machine. Then send me the message `addfax run`

I will pop into your clan, take your fax then send it to the clan that was looking for the fax. Then I'll thank you! (Literally thank, no physical rewards)

- `addfax which` - Requests a list of monsters that I'm looking for.
- `addfax run` - You have a fax I'm looking for? I'll come and check out your clan's fax machine to grab it!
- `addfax <Monster Name>` - Want to know if I'm looking for a certain monster that you may be fighting? Or have plans to fight? Just send me `addfax ` then the monster name! So `addfax Knob Goblin Embezzler` will probably tell you `Sorry, I don't need that monster!`.


# Looking for these monsters<a id="lookingfor"></a>

If the faxbot is looking for monsters, they will be listed below.
Remember, you only need to add the fax to a fax machine, then send me `addfax run` to tell me to come over and pick up the fax to deposit it into the clan that is looking for this monster. You can acquire the fax by using a `portable photocopier` on the monster in a fight.

| ID  | Name | Command |
| --- | ---- | ------- |
{Looking For Monsters}

---

# Supporting the FaxBot<a id="supporting"></a>

OnlyFax is run by [loathers](https://www.loathers.net/)

OnlyFax is very self sufficient, with only operating costs to pay, but the costs are not much!
We use https://opencollective.com/loathers where you can see our expenses, balance and contributions.
You can also make a contribution, but we're not asking you to.

As for ingame, the bot doesn't need any meat or items to operate so don't worry about it!
