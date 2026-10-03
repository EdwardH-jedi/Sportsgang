from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

_settings = get_settings()

engine = create_async_engine(
    _settings.async_postgres_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    # Pinned session TimeZone: naive audit `now()` defaults are wall time in
    # DB_NAIVE_TIMEZONE whatever the server's default (CONTRACTS.md §9).
    connect_args=_settings.db_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
