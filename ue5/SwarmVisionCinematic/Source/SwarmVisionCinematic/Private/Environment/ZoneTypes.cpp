#include "Environment/ZoneTypes.h"

FZoneColors FZoneColors::ForZone(EZoneId Zone)
{
    FZoneColors C;

    switch (Zone)
    {
    case EZoneId::Intake:
        // fetch_agent — cool electric blue
        C.Primary   = FLinearColor(0.10f, 0.45f, 1.00f);
        C.Ambient   = FLinearColor(0.02f, 0.08f, 0.20f);
        C.Highlight = FLinearColor(0.40f, 0.85f, 1.00f);
        break;

    case EZoneId::Transform:
        // normalize_agent — deep violet / magenta
        C.Primary   = FLinearColor(0.55f, 0.10f, 1.00f);
        C.Ambient   = FLinearColor(0.10f, 0.02f, 0.18f);
        C.Highlight = FLinearColor(0.85f, 0.50f, 1.00f);
        break;

    case EZoneId::Validation:
        // quality_agent — amber gold
        C.Primary   = FLinearColor(1.00f, 0.65f, 0.00f);
        C.Ambient   = FLinearColor(0.18f, 0.10f, 0.00f);
        C.Highlight = FLinearColor(1.00f, 0.90f, 0.40f);
        break;

    case EZoneId::Corridor:
        // Main data channel — cyan teal
        C.Primary   = FLinearColor(0.00f, 0.90f, 0.85f);
        C.Ambient   = FLinearColor(0.00f, 0.12f, 0.12f);
        C.Highlight = FLinearColor(0.50f, 1.00f, 0.95f);
        break;

    case EZoneId::Mezzanine:
        // Observation / meta — cool white-blue
        C.Primary   = FLinearColor(0.70f, 0.80f, 1.00f);
        C.Ambient   = FLinearColor(0.08f, 0.10f, 0.16f);
        C.Highlight = FLinearColor(1.00f, 1.00f, 1.00f);
        break;

    default:
        C.Primary   = FLinearColor::White;
        C.Ambient   = FLinearColor(0.05f, 0.05f, 0.05f);
        C.Highlight = FLinearColor::White;
        break;
    }

    return C;
}
