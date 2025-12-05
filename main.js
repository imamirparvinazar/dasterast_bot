const { GoogleGenAI } = require("@google/genai");
const { Telegraf, Markup } = require("telegraf");
const dotenv = require("dotenv");

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function sendToAI(textToProcess) {
  if (!textToProcess) return "No text provided for AI processing.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Remove all emojis from the text. You may only use 🛑 (the red hexagon) or 🔸.
              Use the red emoji for the message title, and the orange emoji for items, lists, and similar elements.

              Also remove any indicator related to a Telegram channel ID (ID, emoji, slogan).

              Add this at the end of the text, with one blank line above it:
              ✋ | @dasterast_co |

              Do not change the original text in any way (other than replacing the emojis). Only correct spelling mistakes, unnecessary spacing, or words stuck together.

              Add a hashtag next to the word “urgent”, and use | after the hashtag.
              Make the message title bold: "${textToProcess}"`,
            },
          ],
        },
      ],
    });

    const aiResponse = response.text.trim();
    return aiResponse;
  } catch (error) {
    console.error("Error connecting to Gemini API:", error.message);
    return "AI_ERROR: Failed to process content. Send manually or check API.";
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const USER1_ID = 7562837492;
const USER2_ID = 7872550471;
const FINAL_CHANNEL_ID = "@dasterast_co";

const bot = new Telegraf(BOT_TOKEN);

bot.on("message", async (ctx) => {
  if (ctx.from.id !== USER1_ID) {
    return ctx.reply(
      "❌ Access denied. Only the designated client is allowed to forward messages to me.",
    );
  }

  // A forwarded message contains the original message body
  const originalMessage = ctx.message;

  // Find the text/caption of the message (can be in different fields for media)
  const rawText =
    originalMessage.text || originalMessage.caption || "No Text/Caption Found.";

  // 1.2. AI Processing
  const aiSummary = await sendToAI(rawText);

  // Store essential data for the action handler (inline buttons)
  // We use a unique ID (e.g., current timestamp) to link the confirmation message to the original
  const actionId = Date.now();

  // Save the original message ID in a temporary storage if needed,
  // but for simple forward/copy, the context object often suffices.
  // However, Telegraf actions only pass a string (callback data), so we rely on Telegraf's message storage or copyMessage.

  // 1.3. Construct Confirmation Message
  const confirmationText = `🔔 **NEW APPROVAL REQUEST** 🔔

    **Original Content Summary:**
    _${aiSummary}_

    ---

    **Do you approve this content for:** ${FINAL_CHANNEL_ID}?`;

  // 1.4. Send Confirmation to User 2 (The Approver)
  const inlineKeyboard = Markup.inlineKeyboard([
    Markup.button.callback("✅ تایید و ارسال", `confirm_${actionId}`),
    Markup.button.callback("❌ رد و لغو", `reject_${actionId}`),
  ]);

  // Send the confirmation message immediately after the preview
  await ctx.telegram.sendMessage(USER2_ID, confirmationText, {
    parse_mode: "Markdown",
    reply_markup: inlineKeyboard.reply_markup
  });
});

// --- 2. Action Handler (Buttons) ---

// 2.1. Confirmation Handler
bot.action(/confirm_(\d+)/, async (ctx) => {
  const actionId = ctx.match[1];

  // A. Edit the confirmation message
  await ctx.editMessageText(
    `✨ **Approved!** Message is being sent to the final channel...`,
    {
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback("⭐ Done", "done"),
      ]).reply_markup,
    },
  );

  // B. Find the original message (The preview message is a copy of the original forward)
  const previewMessage = ctx.callbackQuery.message.reply_to_message;

  if (!previewMessage) {
    return ctx.reply("Error: Could not find the original message to send.", {
      parse_mode: "Markdown",
    });
  }

  try {
    // C. **Final Action: Copy the original content (file/text) to the final channel**
    await ctx.telegram.copyMessage(
      FINAL_CHANNEL_ID,
      previewMessage.chat.id,
      previewMessage.message_id,
    );

    // D. Final confirmation
    await ctx.telegram.sendMessage(
      ctx.from.id,
      `✅ Message (ID: ${actionId}) successfully published to ${FINAL_CHANNEL_ID}.`,
      { parse_mode: "Markdown" },
    );
  } catch (error) {
    console.error("FINAL SEND ERROR:", error.message);
    ctx.telegram.sendMessage(
      ctx.from.id,
      `❌ **FATAL ERROR:** Failed to send to the final channel. Bot is not admin or channel ID is wrong.`,
      { parse_mode: "Markdown" },
    );
  }
});

// 2.2. Rejection Handler (Fallback)
bot.action(/reject_(\d+)/, (ctx) => {
  const fallbackMessage = "❌ **عملیات لغو** شد. پیام به کانال ارسال نشد.";

  // Execute Fallback: Edit the confirmation message
  ctx.editMessageText(
    fallbackMessage,
    Markup.inlineKeyboard([
      Markup.button.callback("🔍 Fallback Info", "fallback_info"),
    ]),
  );
});

// --- Start Bot ---
bot.launch();
console.log(
  "Intermediate Bot launched and listening for messages from Client.",
);
