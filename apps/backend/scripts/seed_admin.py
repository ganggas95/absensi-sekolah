import os

from app.db import SessionLocal
from app.models import Role, User
from app.security import hash_password


username = os.getenv("ADMIN_USERNAME", "admin")
password = os.getenv("ADMIN_PASSWORD", "admin123")
db = SessionLocal()
try:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        db.add(
            User(
                username=username,
                hashed_password=hash_password(password),
                full_name="Administrator",
                role=Role.ADMIN,
            )
        )
        db.commit()
        print(f"Admin dibuat: {username}")
    else:
        print(f"Admin sudah ada: {username}")
finally:
    db.close()
