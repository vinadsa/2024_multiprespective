"""
Centralized configuration for all GO-TR backend services.

Values are read from environment variables, optionally loaded from
``OnlineApps/Backend/.env`` (see ``.env.example``). Every value has a default
that reproduces the original hardcoded behaviour, so the system still runs
without a ``.env`` file.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent.parent

try:
    from dotenv import load_dotenv

    # Load root .env if it exists, then backend .env to override
    if (ROOT_DIR / ".env").exists():
        load_dotenv(ROOT_DIR / ".env", override=False)
    if (BACKEND_DIR / ".env").exists():
        load_dotenv(BACKEND_DIR / ".env", override=True)
    elif not (ROOT_DIR / ".env").exists():
        load_dotenv(BACKEND_DIR / ".env", override=False)
except ImportError:  # python-dotenv is optional
    pass


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value.strip() == "" else value.strip()


def _env_list(name: str, default: str) -> List[str]:
    return [item.strip() for item in _env(name, default).split(",") if item.strip()]


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def resolve_path(path: Optional[str], base: Path = BACKEND_DIR) -> Optional[Path]:
    """Resolve a (possibly relative) path against the Backend directory."""
    if not path:
        return None
    p = Path(path).expanduser()
    return p if p.is_absolute() else (base / p).resolve()


@dataclass
class Settings:
    # --- Kafka ---
    kafka_brokers: List[str] = field(default_factory=list)
    kafka_topic_events: str = "pm.test.events.raw"
    kafka_topic_watermark: str = "pm.test.events.watermark"
    kafka_topic_dlq: str = "pm.test.events.dlq"
    kafka_group_id: str = "gotr_consumer_group_7"
    kafka_partitions: int = 3
    kafka_replication_factor: int = 2

    # --- Neo4j ---
    neo4j_uri: str = "neo4j://127.0.0.1:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "12345678"

    # --- Services ---
    consumer_host: str = "0.0.0.0"
    consumer_port: int = 8000
    producer_host: str = "0.0.0.0"
    producer_port: int = 8100

    # --- Process & organizational model ---
    model_source_path: Optional[Path] = None
    model_case_col: str = "case_id"
    model_activity_col: str = "activity"
    model_timestamp_col: str = "timestamp"
    model_noise_threshold: float = 0.0
    org_model_path: Optional[Path] = None
    upload_dir: Path = BACKEND_DIR / "models" / "uploads"

    # --- Case completion ---
    case_end_strategy: List[str] = field(default_factory=list)
    case_idle_timeout_sec: int = 30
    case_sweep_interval_sec: int = 15

    # --- Streamer ---
    producer_webhook_url: str = "http://localhost:8100/events"
    streamer_xes_files: List[str] = field(default_factory=list)
    streamer_mode: str = "fixed_interval"
    streamer_speed: float = 1.0
    streamer_fixed_interval_ms: int = 5000
    xes_activity_key: str = "concept:name"
    xes_resource_keys: List[str] = field(default_factory=list)
    xes_case_key: str = "concept:name"

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            kafka_brokers=_env_list("KAFKA_BROKERS", "localhost:29092,localhost:29093,localhost:29094"),
            kafka_topic_events=_env("KAFKA_TOPIC_EVENTS", "pm.test.events.raw"),
            kafka_topic_watermark=_env("KAFKA_TOPIC_WATERMARK", "pm.test.events.watermark"),
            kafka_topic_dlq=_env("KAFKA_TOPIC_DLQ", "pm.test.events.dlq"),
            kafka_group_id=_env("KAFKA_GROUP_ID", "gotr_consumer_group_7"),
            kafka_partitions=_env_int("KAFKA_PARTITIONS", 3),
            kafka_replication_factor=_env_int("KAFKA_REPLICATION_FACTOR", 2),
            neo4j_uri=_env("NEO4J_URI", "neo4j://127.0.0.1:7687"),
            neo4j_user=_env("NEO4J_USER", "neo4j"),
            neo4j_password=_env("NEO4J_PASSWORD", "12345678"),
            consumer_host=_env("CONSUMER_HOST", "0.0.0.0"),
            consumer_port=_env_int("CONSUMER_PORT", 8000),
            producer_host=_env("PRODUCER_HOST", "0.0.0.0"),
            producer_port=_env_int("PRODUCER_PORT", 8100),
            model_source_path=resolve_path(
                _env("MODEL_SOURCE_PATH", "../../process_mining/media/datacsv_repair.csv")
            ),
            model_case_col=_env("MODEL_CASE_COL", "case_id"),
            model_activity_col=_env("MODEL_ACTIVITY_COL", "activity"),
            model_timestamp_col=_env("MODEL_TIMESTAMP_COL", "timestamp"),
            model_noise_threshold=_env_float("MODEL_NOISE_THRESHOLD", 0.0),
            org_model_path=resolve_path(_env("ORG_MODEL_PATH", "models/org_model.repair.yaml")),
            upload_dir=resolve_path(_env("UPLOAD_DIR", "models/uploads")),
            case_end_strategy=[
                s.lower() for s in _env_list("CASE_END_STRATEGY", "end_signal,final_marking")
            ],
            case_idle_timeout_sec=_env_int("CASE_IDLE_TIMEOUT_SEC", 30),
            case_sweep_interval_sec=_env_int("CASE_SWEEP_INTERVAL_SEC", 15),
            producer_webhook_url=_env("PRODUCER_WEBHOOK_URL", "http://localhost:8100/events"),
            streamer_xes_files=_env_list("STREAMER_XES_FILES", "output_logv2test2.xes"),
            streamer_mode=_env("STREAMER_MODE", "fixed_interval"),
            streamer_speed=_env_float("STREAMER_SPEED", 1.0),
            streamer_fixed_interval_ms=_env_int("STREAMER_FIXED_INTERVAL_MS", 5000),
            xes_activity_key=_env("XES_ACTIVITY_KEY", "concept:name"),
            xes_resource_keys=_env_list("XES_RESOURCE_KEYS", "org:resource,resource"),
            xes_case_key=_env("XES_CASE_KEY", "concept:name"),
        )


settings = Settings.from_env()
