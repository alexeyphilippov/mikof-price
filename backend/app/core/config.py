from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30
    smtp_host: str = ""
    smtp_port: int = 1127
    smtp_login: str = ""
    smtp_password: str = ""
    admin_email: str = "admin@example.com"
    admin_password: str
    seed_password: str
    mailer_url: str = "http://mailer:8001"
    cookie_secure: bool = False
    cors_origins: str = "http://localhost:5173"
    login_rate_limit: str = "5/minute"
    app_base_url: str = "https://mikofai.ru"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
