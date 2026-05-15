#pragma once

#include "CoreMinimal.h"
#include "CinematicLightingState.generated.h"

// ─── FCinematicLightingState ──────────────────────────────────────────────────
//
// Full cinematic lighting descriptor for one swarm state.
// Used by ALightOrchestrator (Phase 3) to drive Lumen + post-process
// simultaneously with zone light changes.

USTRUCT(BlueprintType)
struct SWARMVISIONCINEMATIC_API FCinematicLightingState
{
    GENERATED_BODY()

    // ── Sky / ambient ─────────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Ambient")
    FLinearColor AmbientColor = FLinearColor(0.02f, 0.02f, 0.04f);

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Ambient")
    float SkyLightIntensity = 0.3f;

    // ── Directional ───────────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Directional")
    float DirectionalIntensity = 0.5f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Directional")
    FLinearColor DirectionalColor = FLinearColor(0.9f, 0.95f, 1.0f);

    // ── Lumen GI ──────────────────────────────────────────────────────────────
    // Drives r.Lumen.DiffuseIndirect.Intensity via post-process
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lumen")
    float LumenGIIntensity = 1.0f;

    // Lumen reflection intensity
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Lumen")
    float LumenReflectionIntensity = 1.0f;

    // ── Post-process ──────────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="PostProcess")
    float ExposureCompensation = 0.0f; // EV

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="PostProcess")
    float ContrastShadows = 0.5f;    // toe

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="PostProcess")
    float ContrastHighlights = 0.5f; // shoulder

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="PostProcess")
    FLinearColor ColorGradeShadows   = FLinearColor(1.f, 1.f, 1.f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="PostProcess")
    FLinearColor ColorGradeMidtones  = FLinearColor(1.f, 1.f, 1.f);
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="PostProcess")
    FLinearColor ColorGradeHighlights = FLinearColor(1.f, 1.f, 1.f);

    // Saturation multiplier
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="PostProcess")
    float ColorSaturation = 1.0f;

    // ── Corridor emissive flow ────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Corridor")
    float CorridorFlowIntensity = 0.5f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Corridor")
    FLinearColor CorridorFlowColor = FLinearColor(0.0f, 0.9f, 0.85f);

    // ── Transition ────────────────────────────────────────────────────────────
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Transition")
    float TransitionDuration = 1.5f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Transition")
    float EaseExponent = 2.0f; // 1=linear, 2=quadratic, 3=cubic
};
