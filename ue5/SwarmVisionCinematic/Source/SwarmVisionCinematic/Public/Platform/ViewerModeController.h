#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "ViewerModeController.generated.h"

UENUM(BlueprintType)
enum class EViewerMode : uint8
{
    Executive      UMETA(DisplayName="Executive"),      // cinematic auto-directed, minimal HUD
    Observability  UMETA(DisplayName="Observability"),  // full telemetry overlays, live graphs
    Incident       UMETA(DisplayName="Incident"),       // anomaly-focused, timeline scrubbing
    Inspector      UMETA(DisplayName="Inspector"),      // free camera, deep per-agent inspection
};

USTRUCT(BlueprintType)
struct FViewerModeConfig
{
    GENERATED_BODY()

    // HUD
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowTelemetryGraphs   = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowAgentLabels       = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowEventFeed         = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowReplayControls    = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowQualityScore      = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bShowBookmarkTimeline  = false;

    // Camera
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bAutoCinematicCamera   = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bAllowFreeCam          = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bFocusAnomalies        = false;

    // FX
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bReducePostProcess     = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bHighlightAnomalyZones = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(
    FOnViewerModeChanged, EViewerMode, OldMode, EViewerMode, NewMode);

// ─── UViewerModeController ────────────────────────────────────────────────────

UCLASS()
class SWARMVISIONCINEMATIC_API UViewerModeController : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    UFUNCTION(BlueprintCallable, Category="Platform")
    void SetViewerMode(EViewerMode NewMode);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Platform")
    EViewerMode GetViewerMode() const { return CurrentMode; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Platform")
    const FViewerModeConfig& GetModeConfig() const { return CurrentConfig; }

    UPROPERTY(BlueprintAssignable, Category="Platform")
    FOnViewerModeChanged OnViewerModeChanged;

private:
    static FViewerModeConfig BuildConfig(EViewerMode Mode);

    EViewerMode       CurrentMode   = EViewerMode::Executive;
    FViewerModeConfig CurrentConfig;
};
