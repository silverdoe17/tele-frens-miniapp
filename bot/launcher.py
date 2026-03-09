import os
import re
from urllib.parse import quote

from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup, Update, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
MINIAPP_URL = os.getenv("MINIAPP_URL", "")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is missing. Set it in .env")
if not MINIAPP_URL:
    raise RuntimeError("MINIAPP_URL is missing. Set it in .env")


def _is_private_chat(update: Update) -> bool:
    return (update.effective_chat is not None) and (update.effective_chat.type == "private")


def _dm_deeplink(bot_username: str, startapp_payload: str = "open_from_group") -> str:
    safe_payload = quote(startapp_payload)
    return f"https://t.me/{bot_username}?startapp={safe_payload}"


def _group_open_markup(bot_username: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton("Open Planner App", url=_dm_deeplink(bot_username))]]
    )


def _private_open_markup(label: str = "Open Finance App") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton(label, web_app=WebAppInfo(url=MINIAPP_URL))]])


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if _is_private_chat(update):
        keyboard = ReplyKeyboardMarkup(
            [[KeyboardButton("Open Finance App", web_app=WebAppInfo(url=MINIAPP_URL))]],
            resize_keyboard=True,
        )
        await update.message.reply_text(
            "Use the button below to open the Finance Mini App.",
            reply_markup=keyboard,
        )
        return

    bot_username = ctx.bot.username or ""
    await update.message.reply_text(
        "Open the planner app from private chat:",
        reply_markup=_group_open_markup(bot_username),
    )


async def app_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if _is_private_chat(update):
        await update.message.reply_text("Launch Mini App:", reply_markup=_private_open_markup())
        return

    bot_username = ctx.bot.username or ""
    await update.message.reply_text(
        "Mini App buttons are private-chat only. Tap below to open it in DM:",
        reply_markup=_group_open_markup(bot_username),
    )


def _is_greeting_to_bot(text: str, bot_username: str) -> bool:
    lowered = (text or "").strip().lower()
    if not lowered or not bot_username:
        return False
    has_mention = f"@{bot_username}" in lowered
    has_greeting = bool(re.search(r"\b(hi|hello|hey)\b", lowered))
    return has_mention and has_greeting


async def hi_mention_handler(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    bot_username = (ctx.bot.username or "").lower()
    if not _is_greeting_to_bot(update.message.text, bot_username):
        return

    if _is_private_chat(update):
        await update.message.reply_text("Open planner app:", reply_markup=_private_open_markup("Open Planner App"))
        return

    await update.message.reply_text(
        "Open planner app from private chat:",
        reply_markup=_group_open_markup(ctx.bot.username or ""),
    )


def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("app", app_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, hi_mention_handler))
    print("Mini App launcher bot running...")
    app.run_polling()


if __name__ == "__main__":
    main()
