#pragma once

#include "CoreMinimal.h"
#include "HUD/SwarmHUDBase.h"
#include "QualityScoreDisplay.generated.h"

// ─── UQualityScoreDisplay ──────────────────────────────────────────────────────
//
// Animated quality score widget — WBP_QualityScoreDisplay in Blueprint.
// Tracks the latest quality_score from quality_agent events.
// Provides animated score lerp and threshold-based color banding.

UCLASS(Abstract, Blueprintable)
class SWARMVISIONCINEMATIC_API UQualityScoreDisplay : public USwarmHUDBase
{
    GENERATED_BODY()

public:
    // Score threshold for green band (good)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Quality")
    float GoodThreshold = 80.f;

    // Score threshold for amber band (acceptable)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Quality")
    float AcceptableThreshold = 60.f;

    // How fast the displayed score animates toward the target (units/sec)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Quality")
    float ScoreLerpSpeed = 15.f;

    // ── API ───────────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Quality")
    float GetDisplayedScore() const { return DisplayedScore; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Quality")
    float GetTargetScore() const { return TargetScore; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Quality")
    FLinearColor GetScoreColor() const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Quality")
    FText GetScoreBandLabel() const;

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Quality")
    void BP_OnScoreReceived(float NewScore, float PreviousScore);

    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Quality")
    void BP_OnBandChanged(FLinearColor BandColor, FText BandLabel);

protected:
    virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
    UFUNCTION()
    void OnEventForScore(const FSwarmEvent& Event);

    virtual void NativeConstruct() override;

    float TargetScore    = 0.f;
    float DisplayedScore = 0.f;
    float PreviousScore  = 0.f;
    bool  bScoreReceived = false;
};
