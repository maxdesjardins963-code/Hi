/**
 * ========================================================
 *   WESTJET APPLICATIONS BOT - index.js (discord.js v14)
 *   Version DM : le bot pose les 10 questions une par une
 *   directement en message privé.
 * ========================================================
 *
 * Flow :
 * 1. Le membre clique sur un poste dans le panel (menu déroulant)
 * 2. Le bot lui envoie un DM et pose les 10 questions, une par une
 *    (il attend la réponse avant de poser la suivante)
 * 3. Une fois terminé, la candidature est postée dans le channel
 *    de review avec les boutons Accept / Deny
 * 4. Le candidat reçoit un DM avec la décision finale
 *
 * ========================================================
 *   VARIABLES D'ENVIRONNEMENT REQUISES
 * ========================================================
 *   TOKEN               -> Bot Token
 *   CLIENT_ID           -> Application ID
 *   GUILD_ID            -> ID de ton serveur WestJet
 *   STAFF_ROLE_ID        -> ID du rôle autorisé à review les candidatures
 *   REVIEW_CHANNEL_ID    -> ID du channel où les candidatures sont postées
 *
 * ========================================================
 *   INSTALLATION
 * ========================================================
 * 1. Build Command : npm install
 * 2. Start Command : node index.js
 * 3. Ajoute les variables d'environnement ci-dessus
 * 4. Une fois le bot en ligne, fais /applypanel dans le channel voulu
 * ========================================================
 */

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

// ============== SERVEUR HTTP FACTICE (pour Render) ==============
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WestJet Applications Bot is running.");
  })
  .listen(PORT, () => {
    console.log(`🌐 Dummy HTTP server listening on port ${PORT} (for Render)`);
  });

// ============== CONFIGURATION (variables d'environnement) ==============
function loadConfig() {
  const TOKEN = process.env.TOKEN;
  const CLIENT_ID = process.env.CLIENT_ID;
  const GUILD_ID = process.env.GUILD_ID;
  const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
  const REVIEW_CHANNEL_ID = process.env.REVIEW_CHANNEL_ID;

  const missing = [];
  if (!TOKEN) missing.push("TOKEN");
  if (!CLIENT_ID) missing.push("CLIENT_ID");
  if (!GUILD_ID) missing.push("GUILD_ID");
  if (!STAFF_ROLE_ID) missing.push("STAFF_ROLE_ID");
  if (!REVIEW_CHANNEL_ID) missing.push("REVIEW_CHANNEL_ID");

  if (missing.length > 0) {
    console.error("========================================");
    console.error("❌ Variables d'environnement manquantes :");
    missing.forEach((m) => console.error(`   - ${m}`));
    console.error("========================================");
    process.exit(1);
  }

  return { TOKEN, CLIENT_ID, GUILD_ID, STAFF_ROLE_ID, REVIEW_CHANNEL_ID };
}

// ============== DÉFINITION DES POSTES / QUESTIONS ==============
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
  },
  atc: {
    label: "ATC",
    emoji: "🗼",
    questions: [
      "What is your Roblox username?",
      "What is your age?",
      "What is your timezone (GMT)?",
      "Do you have prior ATC experience? Where?",
      "Are you familiar with standard ATC phraseology?",
      "Two aircraft request the same runway at once — what do you do?",
      "How many hours per week can you be active as ATC?",
      "Rate your ATC knowledge from 1-10 and explain.",
      "Describe how you'd handle a pilot declaring an emergency.",
      "Why do you want to join the WestJet ATC team?",
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
  },
};

// Empêche un membre de démarrer 2 candidatures en même temps
const activeApplications = new Set();

function isStaff(interaction, STAFF_ROLE_ID) {
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return interaction.member.roles.cache.has(STAFF_ROLE_ID);
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("apply_select_role")
      .setPlaceholder("Select a position to apply for")
      .addOptions(
        Object.entries(APPLICATIONS).map(([key, val]) => ({
          label: val.label,
          value: key,
          emoji: val.emoji,
        }))
      )
  );
}

// Pose les questions une par une en DM et renvoie les réponses,
// ou null si le membre n'a pas répondu à temps / a annulé.
async function runDmInterview(dmChannel, user, app) {
  const answers = [];

  await dmChannel.send(
    `👋 Hey ${user.username}! Let's start your **${app.label}** application for WestJet.\n` +
      `I'll ask you ${app.questions.length} questions, one at a time. Just reply in this DM.\n` +
      `You have 10 minutes per question. Type **cancel** anytime to stop.`
  );

  for (let i = 0; i < app.questions.length; i++) {
    await dmChannel.send(`**Question ${i + 1}/${app.questions.length}:** ${app.questions[i]}`);

    const collected = await dmChannel
      .awaitMessages({
        filter: (m) => m.author.id === user.id,
        max: 1,
        time: 10 * 60 * 1000,
        errors: ["time"],
      })
      .catch(() => null);

    if (!collected || collected.size === 0) {
      await dmChannel.send("⏱️ You took too long to respond. Application cancelled — feel free to start again.");
      return null;
    }

    const reply = collected.first().content.trim();

    if (reply.toLowerCase() === "cancel") {
      await dmChannel.send("❌ Application cancelled.");
      return null;
    }

    answers.push(reply);
  }

  await dmChannel.send("✅ All done! Your application has been submitted for review. Good luck!");
  return answers;
}

// ============== DÉPLOIEMENT DES SLASH COMMANDS ==============
async function deployCommands(TOKEN, CLIENT_ID, GUILD_ID) {
  const commands = [
    new SlashCommandBuilder()
      .setName("applypanel")
      .setDescription("Post the WestJet applications panel (staff only)"),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  console.log("⏳ Déploiement des slash commands...");
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("✅ Slash commands déployées.\n");
}

// ============== DÉMARRAGE ==============
(async () => {
  const { TOKEN, CLIENT_ID, GUILD_ID, STAFF_ROLE_ID, REVIEW_CHANNEL_ID } = loadConfig();

  try {
    await deployCommands(TOKEN, CLIENT_ID, GUILD_ID);
  } catch (err) {
    console.error("❌ Erreur lors du déploiement des commandes :", err.message);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Logged in as ${c.user.tag} - WestJet Applications Bot ready.`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ---------- /applypanel ----------
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
              "✈️ **Pilot**\n🧑‍✈️ **Cabin Crew**\n🛎️ **Check-in Agent**\n🗼 **ATC**\n🛡️ **Server Moderator**\n\n" +
              "The bot will DM you 10 questions, one at a time. Make sure your DMs are open!"
          )
          .setColor(0x1abc9c)
          .setFooter({ text: "WestJet | Applications" });

        await interaction.channel.send({ embeds: [embed], components: [buildPanelRow()] });
        return interaction.reply({ content: "✅ Panel posted.", flags: MessageFlags.Ephemeral });
      }

      // ---------- SELECT MENU : choix du poste ----------
      if (interaction.isStringSelectMenu() && interaction.customId === "apply_select_role") {
        const roleKey = interaction.values[0];
        const app = APPLICATIONS[roleKey];
        if (!app) return;

        if (activeApplications.has(interaction.user.id)) {
          return interaction.reply({
            content: "⚠️ You already have an application in progress. Check your DMs.",
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
          content: `📩 Check your DMs — I've started your **${app.label}** application!`,
          flags: MessageFlags.Ephemeral,
        });

        activeApplications.add(interaction.user.id);

        try {
          const answers = await runDmInterview(dmChannel, interaction.user, app);
          if (!answers) return; // annulé / timeout

          const embed = new EmbedBuilder()
            .setTitle(`New ${app.label} Application`)
            .setDescription(`Applicant: <@${interaction.user.id}> (${interaction.user.tag})`)
            .setColor(0x3498db)
            .setTimestamp();

          app.questions.forEach((q, i) => {
            embed.addFields({ name: q, value: answers[i]?.slice(0, 1024) || "N/A" });
          });

          const reviewChannel = await client.channels.fetch(REVIEW_CHANNEL_ID);

          const buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`app_accept_${interaction.user.id}_${roleKey}`)
              .setLabel("Accept")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`app_deny_${interaction.user.id}_${roleKey}`)
              .setLabel("Deny")
              .setStyle(ButtonStyle.Danger)
          );

          await reviewChannel.send({ embeds: [embed], components: [buttonsRow] });
        } catch (err) {
          console.error("DM interview error:", err);
          await dmChannel.send("❌ Something went wrong with your application. Please try again later.").catch(() => {});
        } finally {
          activeApplications.delete(interaction.user.id);
        }
      }

      // ---------- BOUTONS : Accept / Deny ----------
      if (
        interaction.isButton() &&
        (interaction.customId.startsWith("app_accept_") || interaction.customId.startsWith("app_deny_"))
      ) {
        if (!isStaff(interaction, STAFF_ROLE_ID)) {
          return interaction.reply({
            content: "❌ You don't have permission to review applications.",
            flags: MessageFlags.Ephemeral,
          });
        }

        const isAccept = interaction.customId.startsWith("app_accept_");
        const rest = interaction.customId.replace(isAccept ? "app_accept_" : "app_deny_", "");
        const [applicantId, roleKey] = rest.split("_");
        const app = APPLICATIONS[roleKey];

        const originalEmbed = interaction.message.embeds[0];
        const updatedEmbed = EmbedBuilder.from(originalEmbed)
          .setColor(isAccept ? 0x2ecc71 : 0xe74c3c)
          .addFields({
            name: "Decision",
            value: `${isAccept ? "✅ Accepted" : "❌ Denied"} by <@${interaction.user.id}>`,
          });

        await interaction.update({ embeds: [updatedEmbed], components: [] });

        try {
          const applicant = await client.users.fetch(applicantId);
          await applicant.send(
            isAccept
              ? `🎉 Congratulations! Your **${app.label}** application for WestJet has been **accepted**.`
              : `Your **${app.label}** application for WestJet has been **denied**. You're welcome to reapply later.`
          );
        } catch {
          // DMs fermés, on ignore
        }
      }
    } catch (err) {
      console.error(err);
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
