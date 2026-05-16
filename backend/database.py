from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

# ── Database URL ──────────────────────────────────────────────────────────────
# Produzione: DATABASE_URL=postgresql+asyncpg://user:pass@host/dbname
# Heroku/Railway usano postgres:// — viene normalizzato automaticamente.
# Sviluppo: SQLite locale se DATABASE_URL non è impostata.
_DATABASE_URL_ENV = os.getenv("DATABASE_URL", "")
if _DATABASE_URL_ENV:
    DATABASE_URL = _DATABASE_URL_ENV.replace("postgres://", "postgresql+asyncpg://", 1)
    if "postgresql://" in DATABASE_URL and "+asyncpg" not in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "wardrobe.db")
    DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

_is_postgres = DATABASE_URL.startswith("postgresql")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    **({
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
    } if _is_postgres else {})
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    from models import (  # noqa — registra tutti i modelli in Base.metadata
        Garment, Outfit, UserProfile, User, Friendship, ShowcaseItem,
        BrandProductFeedback, Brand, BrandProduct, BrandProductImpression,
        SocialPost, PostLike, PostComment, WearLog,
    )
    # Step 1: crea tutte le tabelle in una transazione dedicata.
    # Viene committata prima di eseguire le migrazioni: in PostgreSQL una
    # transazione in stato "aborted" farebbe rollback anche del create_all.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Step 2: ogni migrazione nella propria transazione separata.
    # Così un ALTER TABLE già-esistente (exception ignorata) non compromette
    # le migrazioni successive né le tabelle appena create.
    await _migrate()
    print("[DB] Database initialized")


# Lista delle colonne da aggiungere se non esistono ancora.
_MIGRATIONS = [
    # Colonne storiche
    ("user_profile", "profile_picture",       "VARCHAR(500)"),
    ("garments",     "tryon_image",            "VARCHAR(500)"),
    ("garments",     "tryon_status",           "VARCHAR(20) DEFAULT 'none'"),
    ("user_profile", "avatar_photo",           "VARCHAR(500)"),
    ("user_profile", "face_photo_1",           "VARCHAR(500)"),
    ("user_profile", "face_photo_2",           "VARCHAR(500)"),
    ("garments",     "bg_status",              "VARCHAR(20) DEFAULT 'none'"),
    ("outfits",      "transforms",             "JSON"),
    # Auth multi-utente
    ("garments",     "user_id",               "INTEGER REFERENCES users(id)"),
    ("outfits",      "user_id",               "INTEGER REFERENCES users(id)"),
    ("user_profile", "user_id",               "INTEGER REFERENCES users(id)"),
    # Username pubblico
    ("users",        "username",              "VARCHAR(30)"),
    # Piano e quota chat AI
    ("users",        "plan",                  "VARCHAR(20) DEFAULT 'free'"),
    ("users",        "chat_count",            "INTEGER DEFAULT 0"),
    ("users",        "chat_reset_at",         "TIMESTAMP WITH TIME ZONE"),
    # Sfondo post social
    ("social_posts", "bg_color",              "VARCHAR(30)"),
    # Numero scarpe (EU)
    ("user_profile", "shoe_size",             "REAL"),
    # Armocromia
    ("user_profile", "armocromia_season",     "VARCHAR(100)"),
    ("user_profile", "armocromia_notes",      "VARCHAR(1000)"),
    # Quota Shopping Advisor
    ("users", "shopping_count",               "INTEGER DEFAULT 0"),
    ("users", "shopping_reset_at",            "TIMESTAMP WITH TIME ZONE"),
    ("users", "shopping_week_count",          "INTEGER DEFAULT 0"),
    ("users", "shopping_week_reset_at",       "TIMESTAMP WITH TIME ZONE"),
    # Quota Armocromia
    ("users", "armocromia_week_count",        "INTEGER DEFAULT 0"),
    ("users", "armocromia_week_reset_at",     "TIMESTAMP WITH TIME ZONE"),
    # Quota Upload vestiti
    ("users", "upload_count",                 "INTEGER DEFAULT 0"),
    ("users", "upload_reset_at",              "TIMESTAMP WITH TIME ZONE"),
    ("users", "upload_week_count",            "INTEGER DEFAULT 0"),
    ("users", "upload_week_reset_at",         "TIMESTAMP WITH TIME ZONE"),
    ("users", "upload_extra",                 "INTEGER DEFAULT 0"),
    # Colonne aggiunte successivamente (già in main.py extra_migrations — duplicato sicuro)
    ("users", "chat_week_count",              "INTEGER NOT NULL DEFAULT 0"),
    ("users", "chat_week_reset_at",           "TIMESTAMP WITH TIME ZONE"),
    ("users", "plan_started_at",              "TIMESTAMP WITH TIME ZONE"),
    ("users", "plan_expires_at",              "TIMESTAMP WITH TIME ZONE"),
    ("users", "scheduled_downgrade_to",       "VARCHAR(20)"),
    ("users", "google_linked",                "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "terms_accepted_at",            "TIMESTAMP WITH TIME ZONE"),
    ("users", "marketing_email",              "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "marketing_phone",              "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "google_link_token",            "VARCHAR(100)"),
    ("users", "google_link_token_expires",    "TIMESTAMP WITH TIME ZONE"),
    ("users", "notifications_seen_at",        "TIMESTAMP WITH TIME ZONE"),
    ("user_profile", "last_name",             "VARCHAR(100)"),
    ("user_profile", "birth_year",            "INTEGER"),
    ("user_profile", "profile_picture_data",  "TEXT"),
    ("garments",     "photo_front_data",      "TEXT"),
    ("garments",     "photo_back_data",       "TEXT"),
    ("garments",     "photo_label_data",      "TEXT"),
    # Palette colori dettagliata — CRITICO: senza questa colonna tutti i salvataggi falliscono con 500
    ("garments",     "color_palette",         "JSON"),
    ("outfits",      "is_usual",              "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("brands",       "reset_token",           "VARCHAR(100)"),
    ("brands",       "reset_token_expires",   "TIMESTAMP WITH TIME ZONE"),
    ("brands",       "logo_url",              "VARCHAR(500)"),
    ("brands",       "description",           "TEXT"),
    ("brands",       "website",               "VARCHAR(500)"),
    ("brands",       "active",                "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("brands",       "updated_at",            "TIMESTAMP WITH TIME ZONE"),
    # Memoria persistente stylist AI
    ("user_profile", "stylist_memory",        "TEXT"),
    # Quota Viaggio
    ("users", "travel_month_count",           "INTEGER DEFAULT 0"),
    ("users", "travel_month_reset_at",        "TIMESTAMP WITH TIME ZONE"),
    ("users", "travel_week_count",            "INTEGER DEFAULT 0"),
    ("users", "travel_week_reset_at",         "TIMESTAMP WITH TIME ZONE"),
    # Account privato
    ("users", "is_private",                   "BOOLEAN NOT NULL DEFAULT FALSE"),
]


async def _migrate():
    """Aggiunge colonne introdotte dopo la creazione iniziale del DB.
    Usa una singola connessione con SAVEPOINT per ogni ALTER TABLE: evita
    di aprire ~50 connessioni separate e riduce drasticamente il tempo di
    avvio (critico per il health-check di Railway a 120 s).
    """
    from sqlalchemy import text as _text
    async with engine.begin() as conn:
        for table, column, col_type in _MIGRATIONS:
            try:
                await conn.execute(_text("SAVEPOINT mig"))
                await conn.execute(
                    _text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
                )
                await conn.execute(_text("RELEASE SAVEPOINT mig"))
                print(f"[DB] Migrazione: aggiunta colonna {table}.{column}")
            except Exception:
                await conn.execute(_text("ROLLBACK TO SAVEPOINT mig"))
