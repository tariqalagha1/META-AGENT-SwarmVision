#pragma once

#include "CoreMinimal.h"
#include "ZoneTypes.generated.h"

// ─── EZoneId ──────────────────────────────────────────────────────────────────
// Identifies which physical zone on the operations floor.

UENUM(BlueprintType)
enum class EZoneId : uint8
{
    Intake      UMETA(DisplayName="Intake (fetch_agent)"),
    Transform   UMETA(DisplayName="Transform (normalize_agent)"),
    Validation  UMETA(DisplayName="Validation (quality_agent)"),
    Corridor    UMETA(DisplayName="Main Corridor"),
    Mezzanine   UMETA(DisplayName="Mezzanine"),
};

// ─── EZoneState ───────────────────────────────────────────────────────────────
// Visual state of a zone — drives lighting, FX, material parameters.

UENUM(BlueprintType)
enum class EZoneState : uint8
{
    Dark        UMETA(DisplayName="Dark"),       // pre-swarm, all off
    Idle        UMETA(DisplayName="Idle"),       // agent present, not working
    Active      UMETA(DisplayName="Active"),     // agent in WORKING state
    Handoff     UMETA(DisplayName="Handoff"),    // data departing or arriving
    Success     UMETA(DisplayName="Success"),    // task completed
    Failed      UMETA(DisplayName="Failed"),     // task failed
    Retry       UMETA(DisplayName="Retry"),      // re-entering work after quality fail
};

// ─── FZoneColors ─────────────────────────────────────────────────────────────
// Per-zone identity colors used across lighting, particles, and HUD.

USTRUCT(BlueprintType)
struct SWARMVISIONCINEMATIC_API FZoneColors
{
    GENERATED_BODY()

    // Zone primary color (Active/Working state)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FLinearColor Primary;

    // Zone deep ambient (fills the zone when Idle)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FLinearColor Ambient;

    // Zone highlight (Success state, data channel)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FLinearColor Highlight;

    static FZoneColors ForZone(EZoneId Zone);
};

// ─── FZoneTransitionCurve ─────────────────────────────────────────────────────
// Defines how fast a zone transitions between states.

USTRUCT(BlueprintType)
struct SWARMVISIONCINEMATIC_API FZoneTransitionParams
{
    GENERATED_BODY()

    // Time to reach target intensity (seconds)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float RampDuration = 0.5f;

    // Easing exponent (1=linear, 2=quadratic, 3=cubic)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float EaseExponent = 2.0f;

    // Pulse frequency when in pulsing sub-state (Hz)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float PulseFrequency = 1.0f;

    // Number of pulse beats before settling (-1 = infinite)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 PulseCount = -1;
};
