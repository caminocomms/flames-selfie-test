import asyncio
import logging

from app.services.results_repo import ResultsRepository, utc_now_iso
from app.services.storage import S3Storage

logger = logging.getLogger(__name__)


async def delete_expired_results_once(repo: ResultsRepository, storage: S3Storage) -> int:
    expired = repo.get_expired_results(utc_now_iso())
    if not expired:
        return 0

    for row in expired:
        for key in (row.upload_object_key, row.generated_object_key, row.final_object_key):
            try:
                if key:
                    storage.delete_object(key)
            except Exception:
                logger.exception("Failed deleting object '%s'", key)

    repo.delete_results([row.id for row in expired])
    return len(expired)


async def cleanup_loop(repo: ResultsRepository, storage: S3Storage, interval_seconds: int = 86400) -> None:
    while True:
        try:
            count = await delete_expired_results_once(repo, storage)
            if count:
                logger.info("Expired cleanup removed %d records", count)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Expired cleanup loop failed")
        await asyncio.sleep(interval_seconds)
