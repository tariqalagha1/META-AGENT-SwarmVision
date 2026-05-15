#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "SwarmPerformanceTierManager.generated.h"

UENUM(BlueprintType)
enum class EPerformanceTier : uint8
{
    Cinematic  UMETA(DisplayName="Cinematic"),   // Full Lumen, MetaHuman LOD0, all FX
    Standard   UMETA(DisplayName="Standard"),    // Lumen reduced, LOD1, partial FX
    Cloud      UMETA(DisplayName="Cloud"),        // Baked lighting, LOD2, minimal FX
};

USTRUCT(BlueprintType)
struct FPerformanceTierSettings
{
    GENERATED_BODY()

    // Lumen
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float LumenSceneLightingQuality  = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float LumenFinalGatherQuality    = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float LumenReflectionQuality     = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool  bLumenEnabled              = true;

    // Shadows
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ShadowDistanceScale        = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 ShadowQuality              = 3;

    // Post-process
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float MotionBlurAmount           = 0.5f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float BloomIntensity             = 1.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool  bDepthOfFieldEnabled       = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float AmbientOcclusionIntensity  = 0.5f;

    // Niagara
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float NiagaraScalability         = 1.f;

    // LOD
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float LODBias                    = 0.f;

    // Target frame rate (hint for Pixel Streaming encoder)
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 TargetFPS                  = 60;

    // Pixel Streaming bitrate kbps
    UPROPERTY(EditAnywhere, BlueprintReadWrite) int32 BitrateKbps                = 12000;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(
    FOnTierChanged, EPerformanceTier, OldTier, EPerformanceTier, NewTier);

// ─── USwarmPerformanceTierManager ─────────────────────────────────────────────

UCLASS()
class SWARMVISIONCINEMATIC_API USwarmPerformanceTierManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;

    UFUNCTION(BlueprintCallable, Category="Performance")
    void SetTier(EPerformanceTier NewTier);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Performance")
    EPerformanceTier GetTier() const { return CurrentTier; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Performance")
    const FPerformanceTierSettings& GetSettings() const { return CurrentSettings; }

    UPROPERTY(BlueprintAssignable, Category="Performance")
    FOnTierChanged OnTierChanged;

private:
    void ApplyConsoleVars(const FPerformanceTierSettings& S) const;
    static FPerformanceTierSettings BuildSettings(EPerformanceTier Tier);

    EPerformanceTier         CurrentTier     = EPerformanceTier::Cinematic;
    FPerformanceTierSettings CurrentSettings;
};
