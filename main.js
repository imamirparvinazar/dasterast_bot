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
              text: `Remove all emojis from the text. You may only use 🛑 or 🔸.

Remove any Telegram channel IDs.

Add the following at the end of the text with one blank line above it:
✋ | @dasterast_co |

Do not change the meaning of the text. Only fix spacing and spelling.

Add a hashtag next to the word “urgent”, and use | after it.

Make the title bold.

Use Telegram Markdown (NOT MarkdownV2!).

TEXT: "${textToProcess}"`,
            },
          ],
        },
      ],
    });

    return response.text.trim();
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
      "❌ Access denied. Only the designated client is allowed.",
      { parse_mode: "Markdown" },
    );
  }

  const originalMessage = ctx.message;
  const rawText =
    originalMessage.text || originalMessage.caption || "No Text/Caption Found.";

  const aiSummary = await sendToAI(rawText);

  const actionId = Date.now();

  const confirmationText =
    "🔔 *NEW APPROVAL REQUEST* 🔔\n\n" +
    "*Original Content Summary:*\n" +
    aiSummary +
    "\n\n" +
    "---\n\n" +
    "*Do you approve this content for:*" +
    FINAL_CHANNEL_ID +
    "?";

  const inlineKeyboard = Markup.inlineKeyboard([
    Markup.button.callback("✅ تایید و ارسال", `confirm_${actionId}`),
    Markup.button.callback("❌ رد و لغو", `reject_${actionId}`),
  ]);

  await ctx.telegram.sendMessage(USER2_ID, confirmationText, {
    parse_mode: "Markdown",
    reply_markup: inlineKeyboard.reply_markup,
  });
});

// Confirm
bot.action(/confirm_(\d+)/, async (ctx) => {
  const actionId = ctx.match[1];

  await ctx.editMessageText("✨ Approved! Sending to the final channel...", {
    parse_mode: "Markdown",
    reply_markup: Markup.inlineKeyboard([
      Markup.button.callback("⭐ Done", "done"),
    ]).reply_markup,
  });

  const previewMessage = ctx.callbackQuery.message.reply_to_message;

  if (!previewMessage) {
    return ctx.reply("Error: Could not find the original message.", {
      parse_mode: "Markdown",
    });
  }

  try {
    await ctx.telegram.copyMessage(
      FINAL_CHANNEL_ID,
      previewMessage.chat.id,
      previewMessage.message_id,
    );

    await ctx.telegram.sendMessage(
      ctx.from.id,
      `✅ Message (ID: ${actionId}) successfully published to ${FINAL_CHANNEL_ID}.`,
      { parse_mode: "Markdown" },
    );
  } catch (error) {
    console.error("FINAL SEND ERROR:", error.message);
    ctx.telegram.sendMessage(
      ctx.from.id,
      "❌ FATAL ERROR: Failed to send to final channel.",
      { parse_mode: "Markdown" },
    );
  }
});

// Reject
bot.action(/reject_(\d+)/, (ctx) => {
  const message = "❌ عملیات لغو شد. پیام ارسال نشد.";
  ctx.editMessageText(message, {
    parse_mode: "Markdown",
    reply_markup: Markup.inlineKeyboard([
      Markup.button.callback("ℹ️ Fallback Info", "fallback_info"),
    ]).reply_markup,
  });
});

bot.launch();
console.log("Bot running with normal Telegram Markdown.");
