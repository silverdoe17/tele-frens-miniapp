import os
import re
import sqlite3
from pathlib import Path
from urllib.parse import urlencode

from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup, Update, WebAppInfo
from telegram.ext import Application, ChatMemberHandler, CommandHandler, ContextTypes, MessageHandler, filters

BASE_DIR = Path(__file__).resolve().parents[1]
DB_FILE = BASE_DIR.parent / "finances.db"

load_dotenv(BASE_DIR / ".env")
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
MINIAPP_URL = os.getenv("MINIAPP_URL", "")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is missing. Set it in .env")
if not MINIAPP_URL:
    raise RuntimeError("MINIAPP_URL is missing. Set it in .env")


def init_db() -> None:
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS group_chats (
              chat_id INTEGER PRIMARY KEY,
              title TEXT,
              type TEXT,
              updated_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS group_members (
              chat_id INTEGER,
              user_id INTEGER,
              username TEXT,
              display_name TEXT,
              is_active INTEGER DEFAULT 1,
              updated_at TEXT,
              PRIMARY KEY (chat_id, user_id)
            )
            """
        )


def now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def is_private_chat(update: Update) -> bool:
    return update.effective_chat is not None and update.effective_chat.type == "private"


def is_group_chat(update: Update) -> bool:
    return update.effective_chat is not None and update.effective_chat.type in {"group", "supergroup"}


def display_name_from_user(user) -> str:
    if user is None:
        return ""
    if user.username:
        return f"@{user.username}"
    full_name = " ".join(part for part in [user.first_name, user.last_name] if part).strip()
    return full_name or str(user.id)


def upsert_group_chat(chat) -> None:
    if chat is None:
        return
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            """
            INSERT INTO group_chats (chat_id, title, type, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET
              title=excluded.title,
              type=excluded.type,
              updated_at=excluded.updated_at
            """,
            (chat.id, getattr(chat, "title", f"Chat {chat.id}"), getattr(chat, "type", "group"), now_iso()),
        )


def upsert_group_member(chat, user, is_active: bool = True) -> None:
    if chat is None or user is None:
        return
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute(
            """
            INSERT INTO group_members (chat_id, user_id, username, display_name, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(chat_id, user_id) DO UPDATE SET
              username=excluded.username,
              display_name=excluded.display_name,
              is_active=excluded.is_active,
              updated_at=excluded.updated_at
            """,
            (
                chat.id,
                user.id,
                user.username,
                display_name_from_user(user),
                1 if is_active else 0,
                now_iso(),
            ),
        )


def sync_group_context(update: Update) -> None:
    if not is_group_chat(update):
        return
    upsert_group_chat(update.effective_chat)
    upsert_group_member(update.effective_chat, update.effective_user, True)


def build_webapp_url(group_chat_id: int | None = None) -> str:
    if not group_chat_id:
        return MINIAPP_URL
    separator = "&" if "?" in MINIAPP_URL else "?"
    return f"{MINIAPP_URL}{separator}{urlencode({'group_chat_id': group_chat_id})}"


def dm_deeplink(bot_username: str, group_chat_id: int) -> str:
    payload = f"group_{group_chat_id}"
    return f"https://t.me/{bot_username}?start={payload}"


def group_open_markup(bot_username: str, group_chat_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton("Open Planner App", url=dm_deeplink(bot_username, group_chat_id))]]
    )


def private_open_markup(group_chat_id: int | None = None, label: str = "Open Finance App") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton(label, web_app=WebAppInfo(url=build_webapp_url(group_chat_id)))]])


def private_open_keyboard(group_chat_id: int | None = None) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton("Open Finance App", web_app=WebAppInfo(url=build_webapp_url(group_chat_id)))]],
        resize_keyboard=True,
    )


def parse_group_payload(args: list[str]) -> int | None:
    if not args:
        return None
    match = re.fullmatch(r"group_(-?\d+)", args[0].strip())
    return int(match.group(1)) if match else None


def is_greeting_to_bot(text: str, bot_username: str) -> bool:
    lowered = (text or "").strip().lower()
    if not lowered or not bot_username:
        return False
    return f"@{bot_username}" in lowered and bool(re.search(r"\b(hi|hello|hey)\b", lowered))


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    group_chat_id = parse_group_payload(ctx.args)

    if is_private_chat(update):
        await update.message.reply_text(
            "Use the button below to open the Finance Mini App.",
            reply_markup=private_open_keyboard(group_chat_id),
        )
        return

    sync_group_context(update)
    bot_username = ctx.bot.username or ""
    await update.message.reply_text(
        "Open the planner app from private chat:",
        reply_markup=group_open_markup(bot_username, update.effective_chat.id),
    )


async def app_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if is_private_chat(update):
        await update.message.reply_text("Launch Mini App:", reply_markup=private_open_markup())
        return

    sync_group_context(update)
    bot_username = ctx.bot.username or ""
    await update.message.reply_text(
        "Open the planner app for this group from private chat:",
        reply_markup=group_open_markup(bot_username, update.effective_chat.id),
    )


async def hi_mention_handler(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message or not update.message.text:
        return

    bot_username = (ctx.bot.username or "").lower()
    if not is_greeting_to_bot(update.message.text, bot_username):
        return

    if is_private_chat(update):
        await update.message.reply_text("Open planner app:", reply_markup=private_open_markup(label="Open Planner App"))
        return

    sync_group_context(update)
    await update.message.reply_text(
        "Open planner app for this group:",
        reply_markup=group_open_markup(ctx.bot.username or "", update.effective_chat.id),
    )


async def sync_group_message(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_group_chat(update) or update.effective_user is None:
        return
    sync_group_context(update)


async def sync_chat_member(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    chat_member = update.chat_member
    if chat_member is None or chat_member.chat.type not in {"group", "supergroup"}:
        return

    upsert_group_chat(chat_member.chat)
    status = getattr(chat_member.new_chat_member, "status", "")
    user = getattr(chat_member.new_chat_member, "user", None)
    if user is None:
        return

    is_active = status in {"creator", "administrator", "member", "restricted"}
    upsert_group_member(chat_member.chat, user, is_active)


def main() -> None:
    init_db()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("app", app_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, hi_mention_handler))
    app.add_handler(MessageHandler((filters.ChatType.GROUP | filters.ChatType.SUPERGROUP) & filters.ALL, sync_group_message))
    app.add_handler(ChatMemberHandler(sync_chat_member, ChatMemberHandler.CHAT_MEMBER))
    print("Mini App launcher bot running...")
    app.run_polling()


if __name__ == "__main__":
    main()
