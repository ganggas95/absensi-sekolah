def paginate(query, page: int, limit: int) -> dict:
    total = query.order_by(None).count()
    return {
        "items": query.offset((page - 1) * limit).limit(limit).all(),
        "total": total,
        "page": page,
        "limit": limit,
    }
