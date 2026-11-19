import ipaddress

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.models import Role, User
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    try:
        username = decode_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid"
        )
    user = (
        db.query(User)
        .filter(User.username == username, User.is_active.is_(True))
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Pengguna tidak ditemukan"
        )
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Akses Admin diperlukan"
        )
    return user


def _in_networks(ip: str, cidrs: list[str]) -> bool:
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for cidr in cidrs:
        try:
            print(ipaddress.ip_network(cidr, strict=False))
            if address in ipaddress.ip_network(cidr, strict=False):
                return True
        except ValueError:
            continue
    return False


def get_client_ip(request: Request) -> str | None:
    """IP klien asli. Header proxy hanya dipercaya bila peer langsung adalah proxy tepercaya."""
    settings = get_settings()
    peer = request.client.host if request.client else None
    if peer and _in_networks(peer, settings.trusted_proxy_list):
        forwarded = request.headers.get("x-device-ip", "").strip()
        if forwarded and _in_networks(forwarded, ["0.0.0.0/0", "::/0"]):
            return forwarded
    return peer


def _is_global(ip: str | None) -> bool:
    try:
        return bool(ip) and ipaddress.ip_address(ip).is_global
    except ValueError:
        return False


def _seen_ip(request: Request) -> str | None:
    """Alamat sumber yang dilihat server. X-Real-IP hanya dari proxy tepercaya."""
    peer = request.client.host if request.client else None
    if peer and _in_networks(peer, get_settings().trusted_proxy_list):
        forwarded = request.headers.get("x-real-ip", "").strip()
        try:
            return str(ipaddress.ip_address(forwarded))
        except ValueError:
            pass
    return peer


def _host_header_ip(request: Request) -> str | None:
    """IP host server dari header Host (alamat yang dipakai HP untuk menjangkau server)."""
    host = request.headers.get("host", "").strip()
    if host.startswith("["):
        host = host[1:].split("]")[0]
    elif host.count(":") == 1:
        host = host.split(":")[0]
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return None
    return None if address.is_global else str(address)


def get_school_networks(request: Request) -> list[str]:
    """Jaringan sekolah. CIDR eksplisit diutamakan, lalu IP host server.

    Container tidak bisa tahu IP LAN host-nya sendiri, jadi IP host diisi lewat
    SCHOOL_HOST_IP. Bila kosong, dipakai IP pada header Host bila berupa alamat
    privat, sehingga jaringan yang dipakai sama dengan jaringan host server.
    """
    settings = get_settings()
    if settings.school_network_list:
        return settings.school_network_list
    host_ip = settings.school_host_ip.strip() or _host_header_ip(request)
    if not host_ip:
        return []
    try:
        network = ipaddress.ip_network(
            f"{host_ip}/{settings.school_host_prefix}", strict=False
        )
    except ValueError:
        return []
    return [str(network)]


def get_network_ip(request: Request) -> str | None:
    """IP perangkat yang dipakai untuk cek jaringan sekolah.

    Docker Desktop (Mac/Windows) mengganti alamat sumber dengan IP gateway VM,
    sehingga IP asli perangkat tidak sampai ke server. Karena itu aplikasi
    mobile melaporkan IP WiFi-nya lewat header ``X-Device-Ip``. Laporan itu
    hanya dipercaya bila alamat yang dilihat server bukan alamat publik, yaitu
    request memang datang dari jaringan lokal. Request dari internet tidak
    pernah dapat memakai header ini.
    """
    seen = _seen_ip(request)
    if seen and _in_networks(seen, get_school_networks(request)):
        return seen
    if seen and not _is_global(seen):
        reported = request.headers.get("x-device-ip", "").strip()
        try:
            return str(ipaddress.ip_address(reported))
        except ValueError:
            pass
    return seen


def is_school_network(ip: str | None, request: Request) -> bool:
    if not get_settings().require_school_network:
        return True
    if not ip:
        return False
    return _in_networks(ip, get_school_networks(request))
