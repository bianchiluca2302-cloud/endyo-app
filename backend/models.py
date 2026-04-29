from sqlalchemy import Column, Integer, String, Float, JSON, DateTime, Text, ForeignKey, Boolean, BigInteger
from sqlalchemy.sql import func
from database import Base


CATEGORIES = ["cappello", "maglietta", "felpa", "giacchetto", "pantaloni", "scarpe"]


# ── Utente ─────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id                  = Column(Integer, primary_key=True, index=True)
    email               = Column(String(255), unique=True, index=True, nullable=False)
    username            = Column(String(30),  unique=True, index=True, nullable=True)  # ID pubblico unico
    password_hash       = Column(String(500), nullable=False)
    phone               = Column(String(20),  nullable=True)           # opzionale

    # ── Verifica email ─────────────────────────────────────────────────────────
    is_verified         = Column(Boolean, default=False, nullable=False)
    verify_token        = Column(String(100), nullable=True, index=True)
    verify_token_expires = Column(DateTime(timezone=True), nullable=True)

    # ── Reset password ─────────────────────────────────────────────────────────
    reset_token         = Column(String(100), nullable=True, index=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)

    # ── Piano e quota chat AI ──────────────────────────────────────────────────
    plan                   = Column(String(20),  default='free', nullable=False, server_default='free')
    plan_started_at        = Column(DateTime(timezone=True), nullable=True)  # inizio periodo corrente
    plan_expires_at        = Column(DateTime(timezone=True), nullable=True)  # scadenza periodo corrente
    scheduled_downgrade_to = Column(String(20),  nullable=True)              # piano da attivare a scadenza
    chat_count             = Column(Integer,     default=0,      nullable=False, server_default='0')
    chat_reset_at          = Column(DateTime(timezone=True), nullable=True)
    chat_week_count        = Column(Integer,     default=0,      nullable=False, server_default='0')
    chat_week_reset_at     = Column(DateTime(timezone=True), nullable=True)
    # ── Quota Shopping Advisor ─────────────────────────────────────────────────
    shopping_count         = Column(Integer,     default=0,      nullable=False, server_default='0')
    shopping_reset_at      = Column(DateTime(timezone=True), nullable=True)
    shopping_week_count    = Column(Integer,     default=0,      nullable=False, server_default='0')
    shopping_week_reset_at = Column(DateTime(timezone=True), nullable=True)
    # ── Quota Armocromia (solo settimana, non giornaliero) ─────────────────────
    armocromia_week_count    = Column(Integer,   default=0,      nullable=False, server_default='0')
    armocromia_week_reset_at = Column(DateTime(timezone=True), nullable=True)

    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())


# ── Amicizie ───────────────────────────────────────────────────────────────────
class Friendship(Base):
    __tablename__ = "friendships"

    id            = Column(Integer, primary_key=True, index=True)
    requester_id  = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    addressee_id  = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status        = Column(String(20), default='pending', nullable=False)  # pending, accepted, declined
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())


# ── Vetrina ─────────────────────────────────────────────────────────────────────
class ShowcaseItem(Base):
    __tablename__ = "showcase_items"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    item_type     = Column(String(20), nullable=False)   # 'garment' o 'outfit'
    item_id       = Column(Integer, nullable=False)
    order_index   = Column(Integer, default=0)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())


# ── Capi ───────────────────────────────────────────────────────────────────────
class Garment(Base):
    __tablename__ = "garments"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name          = Column(String(200), nullable=False)
    category      = Column(String(50),  nullable=False)
    brand         = Column(String(100), nullable=True)
    color_primary = Column(String(50),  nullable=True)
    color_hex     = Column(String(10),  nullable=True)
    size          = Column(String(20),  nullable=True)
    price         = Column(Float,       nullable=True)
    material      = Column(String(200), nullable=True)
    description   = Column(Text,        nullable=True)
    style_tags    = Column(JSON, default=list)
    season_tags   = Column(JSON, default=list)
    occasion_tags = Column(JSON, default=list)
    photo_front   = Column(String(500), nullable=True)
    photo_back    = Column(String(500), nullable=True)
    photo_label   = Column(String(500), nullable=True)
    ai_analysis   = Column(JSON,        nullable=True)
    tryon_image   = Column(String(500), nullable=True)
    tryon_status  = Column(String(20),  default='none')
    bg_status     = Column(String(20),  default='none')
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())


# ── Outfit ─────────────────────────────────────────────────────────────────────
class Outfit(Base):
    __tablename__ = "outfits"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name         = Column(String(200), nullable=False)
    garment_ids  = Column(JSON, default=list)
    occasion     = Column(String(100), nullable=True)
    season       = Column(String(50),  nullable=True)
    rating       = Column(Integer, default=0)
    notes        = Column(Text,    nullable=True)
    ai_generated = Column(Integer, default=0)
    is_usual     = Column(Boolean, default=False, server_default='0')  # outfit che l'utente indossa abitualmente
    transforms   = Column(JSON, default=dict)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


# ── Profilo utente ─────────────────────────────────────────────────────────────
class UserProfile(Base):
    __tablename__ = "user_profile"

    id                  = Column(Integer, primary_key=True, index=True)
    user_id             = Column(Integer, ForeignKey("users.id"), nullable=True, index=True, unique=True)
    name                = Column(String(100), nullable=True)
    gender              = Column(String(20),  nullable=True)

    # ── Misure ────────────────────────────────────────────────────────────────
    height_cm           = Column(Integer, nullable=True)
    weight_kg           = Column(Float,   nullable=True)
    chest_cm            = Column(Float,   nullable=True)
    waist_cm            = Column(Float,   nullable=True)
    hips_cm             = Column(Float,   nullable=True)
    shoulder_width_cm   = Column(Float,   nullable=True)
    arm_length_cm       = Column(Float,   nullable=True)
    leg_length_cm       = Column(Float,   nullable=True)
    neck_cm             = Column(Float,   nullable=True)
    thigh_cm            = Column(Float,   nullable=True)
    shoe_size           = Column(Float,   nullable=True)

    # ── Foto profilo (visibile ad altri) ─────────────────────────────────────
    profile_picture     = Column(String(500), nullable=True)

    # ── Foto viso (per analisi armocromia — solo utenti Premium) ────────────
    face_photo_1        = Column(String(500), nullable=True)   # foto frontale viso
    armocromia_season   = Column(String(100), nullable=True)   # risultato analisi (es. "Autunno Caldo")
    armocromia_notes    = Column(String(1000), nullable=True)  # note dettagliate dall'AI

    # ── Legacy try-on (deprecato) ─────────────────────────────────────────────
    avatar_photo        = Column(String(500), nullable=True)
    face_photo_2        = Column(String(500), nullable=True)

    # ── Stile ─────────────────────────────────────────────────────────────────
    body_type           = Column(String(50), nullable=True)
    style_preferences   = Column(JSON, default=list)
    favorite_colors     = Column(JSON, default=list)
    disliked_colors     = Column(JSON, default=list)
    occasions           = Column(JSON, default=list)
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())


# ── Brand ──────────────────────────────────────────────────────────────────────
class Brand(Base):
    __tablename__ = "brands"

    id                   = Column(Integer, primary_key=True, index=True)
    name                 = Column(String(200), nullable=False)
    email                = Column(String(255), unique=True, index=True, nullable=False)
    password_hash        = Column(String(500), nullable=False)
    logo_url             = Column(String(500), nullable=True)
    description          = Column(Text, nullable=True)
    website              = Column(String(500), nullable=True)
    active               = Column(Boolean, default=True, nullable=False)
    reset_token          = Column(String(100), nullable=True, index=True)
    reset_token_expires  = Column(DateTime(timezone=True), nullable=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())
    updated_at           = Column(DateTime(timezone=True), onupdate=func.now())


# ── Prodotti Brand ─────────────────────────────────────────────────────────────
class BrandProduct(Base):
    __tablename__ = "brand_products"

    id              = Column(Integer, primary_key=True, index=True)
    brand_id        = Column(Integer, ForeignKey("brands.id"), nullable=False, index=True)
    name            = Column(String(200), nullable=False)
    category        = Column(String(50),  nullable=False)
    color_primary   = Column(String(50),  nullable=True)
    color_hex       = Column(String(10),  nullable=True)
    style_tags      = Column(JSON, default=list)
    season_tags     = Column(JSON, default=list)
    occasion_tags   = Column(JSON, default=list)
    price           = Column(Float, nullable=True)
    currency        = Column(String(10), default='EUR')
    buy_url         = Column(String(500), nullable=True)
    image_url       = Column(String(500), nullable=True)
    description     = Column(Text, nullable=True)
    active          = Column(Boolean, default=True, nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), onupdate=func.now())


# ── Impressioni prodotti brand (tracking) ──────────────────────────────────────
class BrandProductImpression(Base):
    __tablename__ = "brand_product_impressions"

    id              = Column(Integer, primary_key=True, index=True)
    product_id      = Column(Integer, ForeignKey("brand_products.id"), nullable=False, index=True)
    brand_id        = Column(Integer, ForeignKey("brands.id"), nullable=False, index=True)
    impression_type = Column(String(20), nullable=False)   # 'suggestion' | 'click'
    created_at      = Column(DateTime(timezone=True), server_default=func.now())


# ── Feedback utente sui prodotti brand ─────────────────────────────────────────
class BrandProductFeedback(Base):
    __tablename__ = "brand_product_feedback"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    product_id  = Column(Integer, ForeignKey("brand_products.id"), nullable=False, index=True)
    vote        = Column(String(10), nullable=False)        # 'like' | 'dislike'
    reason      = Column(String(200), nullable=True)        # motivo del dislike (testo libero o preset)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


# ── Social Post ────────────────────────────────────────────────────────────────
class SocialPost(Base):
    __tablename__ = "social_posts"

    id               = Column(Integer, primary_key=True, index=True)
    # Uno dei due è sempre null: user_id per post brand, brand_id per post utente
    user_id          = Column(Integer, ForeignKey("users.id"),          nullable=True, index=True)
    brand_id         = Column(Integer, ForeignKey("brands.id"),         nullable=True, index=True)
    # Tipo contenuto: 'outfit' | 'garment' | 'brand_product'
    post_type        = Column(String(20), nullable=False)
    outfit_id        = Column(Integer, ForeignKey("outfits.id"),        nullable=True)
    garment_id       = Column(Integer, ForeignKey("garments.id"),       nullable=True)
    brand_product_id = Column(Integer, ForeignKey("brand_products.id"), nullable=True)
    caption          = Column(String(500), nullable=True)
    bg_color         = Column(String(30),  nullable=True)   # es. '#FFFFFF' o null
    is_sponsored     = Column(Boolean, default=False, nullable=False)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())


# ── Like ai post ────────────────────────────────────────────────────────────────
class PostLike(Base):
    __tablename__ = "post_likes"

    id         = Column(Integer, primary_key=True, index=True)
    post_id    = Column(Integer, ForeignKey("social_posts.id"), nullable=False, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"),        nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ── Commenti ai post ────────────────────────────────────────────────────────────
class PostComment(Base):
    __tablename__ = "post_comments"

    id         = Column(Integer, primary_key=True, index=True)
    post_id    = Column(Integer, ForeignKey("social_posts.id"), nullable=False, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"),        nullable=False, index=True)
    content    = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ── Wear log — storico outfit indossati ────────────────────────────────────────
class WearLog(Base):
    __tablename__ = "wear_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    outfit_id  = Column(Integer, ForeignKey("outfits.id"), nullable=True, index=True)
    outfit_name = Column(String(200), nullable=True)        # snapshot del nome al momento dell'uso
    worn_on    = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    note       = Column(String(300), nullable=True)         # nota opzionale dell'utente
