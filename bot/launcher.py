import os

from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup, Update, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
MINIAPP_URL = os.getenv("MINIAPP_URL", "")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is missing. Set it in .env")
if not MINIAPP_URL:
    raise RuntimeError("MINIAPP_URL is missing. Set it in .env")


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    keyboard = ReplyKeyboardMarkup(
        [[KeyboardButton("Open Finance App", web_app=WebAppInfo(url=MINIAPP_URL))]],
        resize_keyboard=True,
    )
    await update.message.reply_text(
        "Use the button below to open the Finance Mini App.",
        reply_markup=keyboard,
    )


async def app_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    inline = InlineKeyboardMarkup(
        [[InlineKeyboardButton("Open Finance App", web_app=WebAppInfo(url=MINIAPP_URL))]]
    )
    await update.message.reply_text("Launch Mini App:", reply_markup=inline)


def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("app", app_cmd))
    print("Mini App launcher bot running...")
    app.run_polling()


if __name__ == "__main__":
    main()
