/**
 * ========================================================
 *   WESTJET APPLICATIONS BOT - index.js (discord.js v14)
 * ========================================================
 *
 * Panel de candidatures avec 5 postes :
 *   Pilot, Cabin Crew, Check-in Agent, ATC, Server Moderator
 *
 * Chaque poste a 10 questions, réparties en 2 formulaires
 * (Discord limite un modal à 5 champs max, donc 2 modals
 * s'enchaînent automatiquement).
 *
 * Les candidatures complètes sont postées dans un channel de
 * review avec des boutons Accept / Deny (staff only). Le candidat
 * reçoit un DM avec la décision.
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
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

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
// style: "short" ou "paragraph"
const APPLICATIONS = {
  pilot: {
    label: "Pilot",
    emoji: "✈️",
    questions: [
      { id: "q1", label: "Roblox Username", style: "short" },
      { id: "q2", label: "Age", style: "short" },
      { id: "q3", label: "Timezone (GMT)", style: "short" },
      { id: "q4", label: "Flight hours in PTFS", style: "short" },
      { id: "q5", label: "Preferred aircraft", style: "short" },
      { id: "q6", label: "Do you know WestJet SOPs?", style: "paragraph" },
      { id: "q7", label: "Describe an emergency landing", style: "paragraph" },
      { id: "q8", label: "Hours/week available", style: "short" },
      { id: "q9", label: "Prior aviation experience", style: "paragraph" },
      { id: "q10", label: "Why join WestJet as a pilot?", style: "paragraph" },
    ],
  },
  cabincrew: {
    label: "Cabin Crew",
    emoji: "🧑‍✈️",
    questions: [
      { id: "q1", label: "Roblox Username", style: "short" },
      { id: "q2", label: "Age", style: "short" },
      { id: "q3", label: "Timezone (GMT)", style: "short" },
      { id: "q4", label: "Why Cabin Crew?", style: "paragraph" },
      { id: "q5", label: "Handling an upset passenger", style: "paragraph" },
      { id: "q6", label: "Familiar with safety announcements?", style: "paragraph" },
      { id: "q7", label: "Hours/week available", style: "short" },
      { id: "q8", label: "Prior cabin crew experience", style: "paragraph" },
      { id: "q9", label: "Describe your communication skills", style: "paragraph" },
      { id: "q10", label: "Comfortable communicating in English?", style: "short" },
    ],
  },
  checkin: {
    label: "Check-in Agent",
    emoji: "🛎️",
    questions: [
      { id: "q1", label: "Roblox Username", style: "short" },
      { id: "q2", label: "Age", style: "short" },
      { id: "q3", label: "Timezone (GMT)", style: "short" },
      { id: "q4", label: "Why Check-in Agent?", style: "paragraph" },
      { id: "q5", label: "Handling invalid ID/ticket", style: "paragraph" },
      { id: "q6", label: "Familiar with check-in process?", style: "paragraph" },
      { id: "q7", label: "Hours/week available", style: "short" },
      { id: "q8", label: "Prior ground staff experience", style: "paragraph" },
      { id: "q9", label: "How do you handle rush/multitasking?", style: "paragraph" },
      { id: "q10", label: "Give an example of your patience", style: "paragraph" },
    ],
  },
  atc: {
    label: "ATC",
    emoji: "🗼",
    questions: [
      { id: "q1", label: "Roblox Username", style: "short" },
      { id: "q2", label: "Age", style: "short" },
      { id: "q3", label: "Timezone (GMT)", style: "short" },
      { id: "q4", label: "Prior ATC experience", style: "paragraph" },
      { id: "q5", label: "Familiar with ATC phraseology?", style: "paragraph" },
      { id: "q6", label: "Two aircraft, same runway - action?", style: "paragraph" },
      { id: "q7", label: "Hours/week available", style: "short" },
      { id: "q8", label: "Rate ATC knowledge (1-10) + explain", style: "paragraph" },
      { id: "q9", label: "Handling a pilot emergency declare", style: "paragraph" },
      { id: "q10", label: "Why join the ATC team?", style: "paragraph" },
    ],
  },
  moderator: {
    label: "Server Moderator",
    emoji: "🛡️",
    questions: [
      { id: "q1", label: "Discord Username", style: "short" },
      { id: "q2", label: "Age", style: "short" },
      { id: "q3", label: "Timezone (GMT)", style: "short" },
      { id: "q4", label: "Prior moderation experience", style: "paragraph" },
      { id: "q5", label: "Handling a repeat rule-breaker", style: "paragraph" },
      { id: "q6", label: "Hours/week available", style: "short" },
      { id: "q7", label: "How do you de-escalate a conflict?", style: "paragraph" },
      { id: "q8", label: "Familiar with Discord ToS?", style: "short" },
      { id: "q9", label: "Why be a Server Moderator?", style: "paragraph" },
      { id: "q10", label: "Describe a difficult decision you made", style: "paragraph" },
    ],
  },
};

// Stockage temporaire des réponses du 1er formulaire, en attendant le 2e
// clé: `${userId}_${roleKey}`
const pendingApplications = new Map();

function isStaff(interaction, STAFF_ROLE_ID) {
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return interaction.member.roles.cache.has(STAFF_ROLE_ID);
}

function buildModal(roleKey, part, questions) {
  const modal = new ModalBuilder()
    .setCustomId(`apply_m${part}_${roleKey}`)
    .setTitle(`${APPLICATIONS[roleKey].label} Application (${part}/2)`);

  const slice = part === 1 ? questions.slice(0, 5) : questions.slice(5, 10);

  slice.forEach((q) => {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label)
      .setStyle(q.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(q.style === "paragraph" ? 1000 : 200);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return modal;
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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`✅ Logged in as ${c.user.tag} - WestJet Applications Bot ready.`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ---------- /applypanel ----------
      if (interaction.isChatInputCommand() && interaction.commandName === "applypanel") {
        if (!isStaff(interaction, STAFF_ROLE_ID)) {
          return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle("WestJet Applications")
          .setDescription(
            "Interested in joining the WestJet team? Select a position below to start your application.\n\n" +
              "✈️ **Pilot**\n🧑‍✈️ **Cabin Crew**\n🛎️ **Check-in Agent**\n🗼 **ATC**\n🛡️ **Server Moderator**\n\n" +
              "You'll be asked 10 questions in total, split into two short forms."
          )
          .setColor(0x1abc9c)
          .setFooter({ text: "WestJet | Applications" });

        await interaction.channel.send({ embeds: [embed], components: [buildPanelRow()] });
        return interaction.reply({ content: "✅ Panel posted.", ephemeral: true });
      }

      // ---------- SELECT MENU : choix du poste ----------
      if (interaction.isStringSelectMenu() && interaction.customId === "apply_select_role") {
        const roleKey = interaction.values[0];
        const app = APPLICATIONS[roleKey];
        if (!app) return;

        const modal = buildModal(roleKey, 1, app.questions);
        return interaction.showModal(modal);
      }

      // ---------- MODAL SUBMIT : formulaire 1/2 ----------
      if (interaction.isModalSubmit() && interaction.customId.startsWith("apply_m1_")) {
        const roleKey = interaction.customId.replace("apply_m1_", "");
        const app = APPLICATIONS[roleKey];
        if (!app) return;

        const answers = {};
        app.questions.slice(0, 5).forEach((q) => {
          answers[q.id] = interaction.fields.getTextInputValue(q.id);
        });

        pendingApplications.set(`${interaction.user.id}_${roleKey}`, answers);

        const modal2 = buildModal(roleKey, 2, app.questions);
        return interaction.showModal(modal2);
      }

      // ---------- MODAL SUBMIT : formulaire 2/2 ----------
      if (interaction.isModalSubmit() && interaction.customId.startsWith("apply_m2_")) {
        const roleKey = interaction.customId.replace("apply_m2_", "");
        const app = APPLICATIONS[roleKey];
        if (!app) return;

        const key = `${interaction.user.id}_${roleKey}`;
        const answers1 = pendingApplications.get(key) || {};
        pendingApplications.delete(key);

        const answers2 = {};
        app.questions.slice(5, 10).forEach((q) => {
          answers2[q.id] = interaction.fields.getTextInputValue(q.id);
        });

        const allAnswers = { ...answers1, ...answers2 };

        const embed = new EmbedBuilder()
          .setTitle(`New ${app.label} Application`)
          .setDescription(`Applicant: <@${interaction.user.id}> (${interaction.user.tag})`)
          .setColor(0x3498db)
          .setTimestamp();

        app.questions.forEach((q) => {
          embed.addFields({ name: q.label, value: allAnswers[q.id]?.slice(0, 1024) || "N/A" });
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

        return interaction.reply({
          content: `✅ Your **${app.label}** application has been submitted! Staff will review it soon.`,
          ephemeral: true,
        });
      }

      // ---------- BOUTONS : Accept / Deny ----------
      if (interaction.isButton() && (interaction.customId.startsWith("app_accept_") || interaction.customId.startsWith("app_deny_"))) {
        if (!isStaff(interaction, STAFF_ROLE_ID)) {
          return interaction.reply({ content: "❌ You don't have permission to review applications.", ephemeral: true });
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
          // DM fermés, on ignore
        }
      }
    } catch (err) {
      console.error(err);
      if (interaction.isRepliable()) {
        const payload = { content: "❌ An error occurred.", ephemeral: true };
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
