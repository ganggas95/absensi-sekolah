from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://absensi:absensi@localhost:5432/absensi"
    jwt_secret_key: str = "dev-only-change-me"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    cors_origins: str = "http://localhost:3000"
    cookie_secure: bool = False
    media_dir: Path = Path(__file__).resolve().parents[2] / "uploads"
    # Absensi guru hanya diterima dari jaringan sekolah (daftar CIDR dipisah koma).
    school_network_cidrs: str = ""
    # IP host server di LAN (bukan IP container). Jaringan sekolah diturunkan dari
    # IP ini dengan panjang prefix di bawah, bila school_network_cidrs kosong.
    school_host_ip: str = ""
    school_host_prefix: int = 24
    require_school_network: bool = True
    # Proxy (nginx) yang headernya boleh dipercaya untuk membaca IP klien asli.
    trusted_proxy_cidrs: str = "127.0.0.0/8,::1/128,172.16.0.0/12"
    teacher_late_tolerance_minutes: int = 10

    model_config = SettingsConfigDict(
        env_file=".env", case_sensitive=False, extra="ignore"
    )

    @property
    def school_network_list(self) -> list[str]:
        return [c.strip() for c in self.school_network_cidrs.split(",") if c.strip()]

    @property
    def trusted_proxy_list(self) -> list[str]:
        return [c.strip() for c in self.trusted_proxy_cidrs.split(",") if c.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
