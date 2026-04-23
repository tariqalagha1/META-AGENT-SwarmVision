from __future__ import annotations

from app.schemas.insight import MetaInsight


def serialize_insights(insights: list[MetaInsight]) -> list[dict]:
    return [insight.model_dump(mode='json') for insight in insights]
