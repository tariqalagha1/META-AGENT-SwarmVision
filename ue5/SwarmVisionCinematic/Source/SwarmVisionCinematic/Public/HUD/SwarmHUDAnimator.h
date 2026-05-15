#pragma once

#include "CoreMinimal.h"
#include "HUD/SwarmHUDBase.h"
#include "SwarmHUDAnimator.generated.h"

// Easing function selection
UENUM(BlueprintType)
enum class EHUDEasingType : uint8
{
    Linear          UMETA(DisplayName="Linear"),
    EaseIn          UMETA(DisplayName="EaseIn"),
    EaseOut         UMETA(DisplayName="EaseOut"),
    EaseInOut       UMETA(DisplayName="EaseInOut"),
    Spring          UMETA(DisplayName="Spring"),      // overshoot + settle
    Anticipate      UMETA(DisplayName="Anticipate"),  // pull back then forward
};

// A single animated float value with target + easing
USTRUCT(BlueprintType)
struct FAnimatedFloat
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) float Current = 0.f;
    UPROPERTY(BlueprintReadOnly) float Target  = 0.f;
    float Velocity  = 0.f; // used for spring
    float Speed     = 5.f;
    EHUDEasingType Easing = EHUDEasingType::EaseOut;

    void SetTarget(float InTarget, float InSpeed = -1.f, EHUDEasingType InEasing = EHUDEasingType::EaseOut)
    {
        Target = InTarget;
        if (InSpeed > 0.f) Speed = InSpeed;
        Easing = InEasing;
    }

    // Returns true if still animating
    bool Tick(float DeltaTime)
    {
        if (FMath::IsNearlyEqual(Current, Target, 0.001f))
        {
            Current = Target;
            return false;
        }
        switch (Easing)
        {
        case EHUDEasingType::Spring:
        {
            const float Stiffness = Speed * Speed;
            const float Damping   = Speed * 2.f;
            const float Force     = (Target - Current) * Stiffness - Velocity * Damping;
            Velocity += Force * DeltaTime;
            Current  += Velocity * DeltaTime;
            break;
        }
        default:
            Current = FMath::FInterpTo(Current, Target, DeltaTime, Speed);
            break;
        }
        return !FMath::IsNearlyEqual(Current, Target, 0.001f);
    }
};

// One entry for the live graph (time-series data, e.g. quality score history)
USTRUCT(BlueprintType)
struct FGraphSample
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) float Value     = 0.f;
    UPROPERTY(BlueprintReadOnly) float Timestamp = 0.f; // game time
    UPROPERTY(BlueprintReadOnly) FLinearColor Color = FLinearColor::White;
};

// ─── USwarmHUDAnimator ────────────────────────────────────────────────────────
//
// Cinematic HUD base — adds to USwarmHUDBase:
//   - Per-widget opacity / scale / offset animated values (FAnimatedFloat)
//   - Glassmorphism blur alpha (driven by animation)
//   - Live graph data model (quality score + event rate time-series)
//   - Cinematic entrance / exit animations
//   - Event-triggered flash / highlight pulses
//
// All animation values are driven in NativeTick and exposed to BP as
// BlueprintPure getter functions. BP Designer binds widget properties
// to these getters for a fully code-driven animation system.

UCLASS(Abstract, Blueprintable)
class SWARMVISIONCINEMATIC_API USwarmHUDAnimator : public USwarmHUDBase
{
    GENERATED_BODY()

public:
    // ── Animation config ──────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Animation")
    float EntranceAnimSpeed = 4.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Animation")
    float ExitAnimSpeed = 6.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Animation")
    float GlassBlurMaxRadius = 12.f;

    // How strongly event flashes affect opacity (0..1)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Animation")
    float FlashIntensity = 0.3f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Animation")
    float FlashDecaySpeed = 8.f;

    // Max quality score graph samples to keep
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|Graph")
    int32 MaxGraphSamples = 60;

    // ── Animation API ─────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, Category="HUD|Animation")
    void AnimateIn();

    UFUNCTION(BlueprintCallable, Category="HUD|Animation")
    void AnimateOut();

    UFUNCTION(BlueprintCallable, Category="HUD|Animation")
    void TriggerEventFlash(FLinearColor Color, float Intensity = 1.f);

    // ── Animated value getters — bind to widget properties ───────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Animation")
    float GetOpacity() const { return Opacity.Current; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Animation")
    float GetScale() const { return Scale.Current; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Animation")
    float GetBlurRadius() const { return BlurRadius.Current; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Animation")
    float GetTranslationY() const { return TranslationY.Current; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Animation")
    FLinearColor GetFlashColor() const { return FlashColor; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Animation")
    float GetFlashAlpha() const { return FlashAlpha; }

    // ── Live graph ────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Graph")
    TArray<FGraphSample> GetQualityGraphSamples() const { return QualityGraphSamples; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Graph")
    TArray<FGraphSample> GetEventRateGraphSamples() const { return EventRateGraphSamples; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|Graph")
    float GetNormalizedGraphValue(const FGraphSample& Sample, float MinVal, float MaxVal) const;

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Animation")
    void BP_OnAnimateIn();

    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Animation")
    void BP_OnAnimateOut();

    UFUNCTION(BlueprintImplementableEvent, Category="HUD|Animation")
    void BP_OnEventFlash(FLinearColor Color);

protected:
    virtual void NativeConstruct() override;
    virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
    UFUNCTION()
    void OnEventForAnimator(const FSwarmEvent& Event);

    void PushQualityGraphSample(float Value, FLinearColor Color);
    void PushEventRateSample();

    // Animated values
    FAnimatedFloat Opacity;
    FAnimatedFloat Scale;
    FAnimatedFloat BlurRadius;
    FAnimatedFloat TranslationY;

    // Flash
    float         FlashAlpha = 0.f;
    FLinearColor  FlashColor = FLinearColor::White;

    // Live graph data
    TArray<FGraphSample> QualityGraphSamples;
    TArray<FGraphSample> EventRateGraphSamples;
    float EventRateAccumulator = 0.f;
    float EventRateSampleTimer = 0.f;
    static constexpr float EventRateSampleInterval = 2.f; // sample every 2s
};
