const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
const http = require("http");

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WestJet Applications Bot is running.");
  })
  .listen(process.env.PORT || 3000);

function loadConfig() {
  const config = {
    TOKEN: process.env.TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,
    STAFF_ROLE_ID: process.env.STAFF_ROLE_ID,
    REVIEW_CHANNEL_ID: process.env.REVIEW_CHANNEL_ID,
  };
  const missing = Object.keys(config).filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
  return config;
}

const APPLICATIONS = {
  pilot: {
    label: "Pilot",
    emoji: "✈️",
    questions: [
      "What is your Roblox username?",
      "What is your age?",
      "What is your timezone (GMT)?",
      "How many flight hours do you have in PTFS?",
      "What aircraft are you most comfortable flying?",
      "Do you know WestJet's SOPs? Explain briefly.",
      "Describe how you'd handle an emergency landing.",
      "How many hours per week can you fly for WestJet?",
      "Do you have prior aviation experience in other servers?",
      "Why do you want to join WestJet as a pilot?",
    ],
    trial: [
      "Walk me through your full departure procedure, from pushback to takeoff.",
      "You lose an engine right after V1. Describe your exact actions and communications.",
      "Explain how you decide on and execute a go-around after an unstable approach.",
      "How do you manage sequencing and separation with ATC at a busy airport?",
      "Cabin crew reports a passenger emergency mid-flight and requests a diversion. How do you decide and act?",
    ],
  },
  cabincrew: {
    label: "Cabin Crew",
    emoji: "🧑‍✈️",
    questions: [
      "What is your Roblox username?",
      "What is your age?",
      "What is your timezone (GMT)?",
      "Why do you want to be Cabin Crew?",
      "How would you handle an upset passenger?",
      "Are you familiar with in-flight safety announcements?",
      "How many hours per week can you be active?",
      "Do you have prior cabin crew experience?",
      "Describe your communication / customer service skills.",
      "Are you comfortable communicating in English?",
    ],
    trial: [
      "Write out a full pre-departure safety announcement exactly as you would deliver it.",
      "Sudden turbulence hits during the service. What do you do and say?",
      "A passenger refuses to follow safety instructions during boarding. How do you escalate?",
      "Describe how you coordinate with the flight deck during an emergency evacuation.",
      "A passenger suffers a medical emergency on board. Walk me through your response step by step.",
    ],
  },
  checkin: {
    label: "Check-in Agent",
    emoji: "🛎️",
    questions: [
      "What is your Roblox username?",
      "What is your age?",
      "What is your timezone (GMT)?",
      "Why do you want to be a Check-in Agent?",
      "How would you handle a passenger with an invalid ticket/ID?",
      "Are you familiar with the check-in process?",
      "How many hours per week can you be active?",
      "Do you have prior ground staff experience?",
      "How do you handle multitasking during busy periods?",
      "Give an example that shows you're patient and detail-oriented.",
    ],
    trial: [
      "Write out a complete check-in interaction, from greeting to handing over the boarding pass.",
      "A passenger arrives just before check-in closes. What do you do?",
      "Two passengers claim the same seat. How do you resolve it?",
      "A passenger's bag is overweight and they refuse to pay. How do you handle it?",
      "A flight is delayed by two hours. How do you coordinate with gate agents and the crew, and what do you tell passengers?",
    ],
  },
  moderator: {
    label: "Server Moderator",
    emoji: "🛡️",
    questions: [
      "What is your Discord username?",
      "What is your age?",
      "What is your timezone (GMT)?",
      "Do you have prior moderation experience? Where?",
      "How would you handle a member repeatedly breaking rules?",
      "How many hours per week can you moderate?",
      "How would you de-escalate a conflict between two members?",
      "Are you familiar with Discord's ToS and community guidelines?",
      "Why do you want to be a Server Moderator for WestJet?",
      "Describe a difficult moderation decision you've had to make.",
    ],
    trial: [
      "A staff member is abusing their permissions. What do you do?",
      "The server is hit by a raid with mass spam. Walk me through your response.",
      "An argument in public chat escalates and one member starts doxxing another. What are your steps?",
      "A member says their punishment was unfair and threatens to leave with others. How do you respond?",
      "What would you change in a typical server moderation system to make it more effective?",
    ],
  },
};

const activeSessions = new Set();

function isStaff(interaction, staffRoleId) {
  if (!interaction.member) return false;
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return interaction.member.roles.cache.has(staffRoleId);
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("apply_select_role")
      .setPlaceholder("Select a position to apply for")
      .addOptions(
        Object.entries(APPLICATIONS).map(([key, value]) => ({
          label: value.label,
          value: key,
          emoji: value.emoji,
        }))
      )
  );
}

async function runInterview(dmChannel, user, questions, introText, doneText, minutesPerQuestion) {
  const answers = [];

  await dmChannel.send(introText);

  for (let i = 0; i < questions.length; i++) {
    await dmChannel.send(`**Question ${i + 1}/${questions.length}:** ${questions[i]}`);

    const collected = await dmChannel
      .awaitMessages({
        filter: (m) => m.author.id === user.id,
        max: 1,
        time: minutesPerQuestion * 60 * 1000,
        errors: ["time"],
      })
      .catch(() => null);

    if (!collected || collected.size === 0) {
      await dmChannel.send("⏱️ You took too long to respond. Your session has been cancelled.");
      return null;
    }

    const reply = collected.first().content.trim();

    if (reply.toLowerCase() === "cancel") {
      await dmChannel.send("❌ Session cancelled.");
      return null;
    }

    answers.push(reply);
  }

  await dmChannel.send(doneText);
  return answers;
}

async function deployCommands(token, clientId, guildId) {
  const commands = [
    new SlashCommandBuilder()
      .setName("applypanel")
      .setDescription("Post the WestJet applications panel (staff only)"),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
}

function reviewButtons(prefix, positive, negative, userId, roleKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}_${positive.id}_${userId}_${roleKey}`)
      .setLabel(positive.label)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${prefix}_${negative.id}_${userId}_${roleKey}`)
      .setLabel(negative.label)
      .setStyle(ButtonStyle.Danger)
  );
}

(async () => {
  const { TOKEN, CLIENT_ID, GUILD_ID, STAFF_ROLE_ID, REVIEW_CHANNEL_ID } = loadConfig();

  await deployCommands(TOKEN, CLIENT_ID, GUILD_ID).catch(() => {});

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message],
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "applypanel") {
        if (!isStaff(interaction, STAFF_ROLE_ID)) {
          return interaction.reply({
            content: "❌ You don't have permission to use this command.",
            flags: MessageFlags.Ephemeral,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle("WestJet Applications")
          .setDescription(
            "Interested in joining the WestJet team? Select a position below.\n\n" +
              "✈️ **Pilot**\n🧑‍✈️ **Cabin Crew**\n🛎️ **Check-in Agent**\n🛡️ **Server Moderator**\n\n" +
              "The bot will DM you 10 questions, one at a time. Make sure your DMs are open!\n" +
              "If you are accepted, you will receive a trial with 5 advanced questions."
          )
          .setColor(0x1abc9c)
          .setFooter({ text: "WestJet | Applications" });

        await interaction.channel.send({ embeds: [embed], components: [buildPanelRow()] });
        return interaction.reply({ content: "✅ Panel posted.", flags: MessageFlags.Ephemeral });
      }

      if (interaction.isStringSelectMenu() && interaction.customId === "apply_select_role") {
        const roleKey = interaction.values[0];
        const app = APPLICATIONS[roleKey];
        if (!app) return;

        if (activeSessions.has(interaction.user.id)) {
          return interaction.reply({
            content: "⚠️ You already have a session in progress. Check your DMs.",
            flags: MessageFlags.Ephemeral,
          });
        }

        let dmChannel;
        try {
          dmChannel = await interaction.user.createDM();
          await dmChannel.send("Starting your application...");
        } catch {
          return interaction.reply({
            content: "❌ I can't DM you. Please enable direct messages from server members and try again.",
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.reply({
          content: `📩 Check your DMs, your **${app.label}** application has started!`,
          flags: MessageFlags.Ephemeral,
        });

        activeSessions.add(interaction.user.id);

        try {
          const answers = await runInterview(
            dmChannel,
            interaction.user,
            app.questions,
            `👋 Hey ${interaction.user.username}! Let's start your **${app.label}** application for WestJet.\n` +
              `I'll ask you ${app.questions.length} questions, one at a time. Just reply in this DM.\n` +
              `You have 10 minutes per question. Type **cancel** anytime to stop.`,
            "✅ All done! Your application has been submitted for review. Good luck!",
            10
          );
          if (!answers) return;

          const embed = new EmbedBuilder()
            .setTitle(`New ${app.label} Application`)
            .setDescription(`Applicant: <@${interaction.user.id}> (${interaction.user.tag})`)
            .setColor(0x3498db)
            .setTimestamp();

          app.questions.forEach((question, i) => {
            embed.addFields({ name: question, value: answers[i]?.slice(0, 400) || "N/A" });
          });

          const reviewChannel = await client.channels.fetch(REVIEW_CHANNEL_ID);
          await reviewChannel.send({
            embeds: [embed],
            components: [
              reviewButtons(
                "app",
                { id: "accept", label: "Accept" },
                { id: "deny", label: "Deny" },
                interaction.user.id,
                roleKey
              ),
            ],
          });
        } catch {
          await dmChannel.send("❌ Something went wrong with your application. Please try again later.").catch(() => {});
        } finally {
          activeSessions.delete(interaction.user.id);
        }
        return;
      }

      if (interaction.isButton()) {
        const [prefix, action, userId, roleKey] = interaction.customId.split("_");
        const app = APPLICATIONS[roleKey];

        if (prefix === "app" && (action === "accept" || action === "deny") && app) {
          if (!isStaff(interaction, STAFF_ROLE_ID)) {
            return interaction.reply({
              content: "❌ You don't have permission to review applications.",
              flags: MessageFlags.Ephemeral,
            });
          }

          const accepted = action === "accept";
          const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(accepted ? 0x2ecc71 : 0xe74c3c)
            .addFields({
              name: "Decision",
              value: `${accepted ? "✅ Accepted" : "❌ Denied"} by <@${interaction.user.id}>`,
            });

          await interaction.update({ embeds: [updatedEmbed], components: [] });

          try {
            const applicant = await client.users.fetch(userId);
            if (accepted) {
              await applicant.send({
                content:
                  `🎉 Congratulations! Your **${app.label}** application for WestJet has been **accepted**.\n` +
                  `The next step is your trial: 5 advanced questions. Click the button below when you're ready.`,
                components: [
                  new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                      .setCustomId(`trialstart_begin_${userId}_${roleKey}`)
                      .setLabel("Start Your Trial")
                      .setStyle(ButtonStyle.Primary)
                      .setEmoji("🚀")
                  ),
                ],
              });
            } else {
              await applicant.send(
                `Your **${app.label}** application for WestJet has been **denied**. You're welcome to reapply later.`
              );
            }
          } catch {}
          return;
        }

        if (prefix === "trialstart" && action === "begin" && app) {
          if (interaction.user.id !== userId) {
            return interaction.reply({
              content: "❌ This trial is not for you.",
              flags: MessageFlags.Ephemeral,
            });
          }

          if (activeSessions.has(userId)) {
            return interaction.reply({
              content: "⚠️ You already have a session in progress.",
              flags: MessageFlags.Ephemeral,
            });
          }

          await interaction.update({ components: [] });

          const dmChannel = interaction.channel ?? (await interaction.user.createDM());
          activeSessions.add(userId);

          try {
            const answers = await runInterview(
              dmChannel,
              interaction.user,
              app.trial,
              `🚀 Welcome to your **${app.label}** trial, ${interaction.user.username}!\n` +
                `You will get ${app.trial.length} advanced questions, one at a time. Be detailed and realistic.\n` +
                `You have 15 minutes per question. Type **cancel** anytime to stop.`,
              "✅ Trial complete! Your answers have been sent to the staff team for review. Good luck!",
              15
            );
            if (!answers) return;

            const embed = new EmbedBuilder()
              .setTitle(`${app.label} Trial Submission`)
              .setDescription(`Applicant: <@${userId}> (${interaction.user.tag})`)
              .setColor(0x9b59b6)
              .setTimestamp();

            app.trial.forEach((question, i) => {
              embed.addFields({ name: question.slice(0, 256), value: answers[i]?.slice(0, 800) || "N/A" });
            });

            const reviewChannel = await client.channels.fetch(REVIEW_CHANNEL_ID);
            await reviewChannel.send({
              embeds: [embed],
              components: [
                reviewButtons(
                  "trial",
                  { id: "pass", label: "Pass" },
                  { id: "fail", label: "Fail" },
                  userId,
                  roleKey
                ),
              ],
            });
          } catch {
            await dmChannel.send("❌ Something went wrong with your trial. Please contact a staff member.").catch(() => {});
          } finally {
            activeSessions.delete(userId);
          }
          return;
        }

        if (prefix === "trial" && (action === "pass" || action === "fail") && app) {
          if (!isStaff(interaction, STAFF_ROLE_ID)) {
            return interaction.reply({
              content: "❌ You don't have permission to review trials.",
              flags: MessageFlags.Ephemeral,
            });
          }

          const passed = action === "pass";
          const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(passed ? 0x2ecc71 : 0xe74c3c)
            .addFields({
              name: "Decision",
              value: `${passed ? "✅ Passed" : "❌ Failed"} by <@${interaction.user.id}>`,
            });

          await interaction.update({ embeds: [updatedEmbed], components: [] });

          try {
            const applicant = await client.users.fetch(userId);
            await applicant.send(
              passed
                ? `🎉 Congratulations! You passed your trial and you are now officially a WestJet **${app.label}**. Welcome to the team!`
                : `Unfortunately, you did not pass your **${app.label}** trial for WestJet. You're welcome to apply again later.`
            );
          } catch {}
        }
      }
    } catch {
      if (interaction.isRepliable()) {
        const payload = { content: "❌ An error occurred.", flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
          interaction.followUp(payload).catch(() => {});
        } else {
          interaction.reply(payload).catch(() => {});
        }
      }
    }
  });

  client.login(TOKEN);
})();
