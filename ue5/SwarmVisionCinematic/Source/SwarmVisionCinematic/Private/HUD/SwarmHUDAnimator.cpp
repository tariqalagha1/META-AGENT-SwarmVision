#include "HUD/SwarmHUDAnimator.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"

void USwarmHUDAnimator::NativeConstruct()
{
    Super::NativeConstruct();

    // Start invisible, animate in on construct
    Opacity.Current = 0.f;
    Opacity.Target  = 0.f;
    Scale.Current   = 0.9f;
    Scale.Target    = 0.9f;
    BlurRadius.Current = 0.f;
    BlurRadius.Target  = 0.f;
    TranslationY.Current = 20.f;
    TranslationY.Target  = 20.f;

    Opacity.Speed    = EntranceAnimSpeed;
    Scale.Speed      = EntranceAnimSpeed;
    BlurRadius.Speed = EntranceAnimSpeed;
    TranslationY.Speed = EntranceAnimSpeed;

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(this, &USwarmHUDAnimator::OnEventForAnimator);
        }
    }

    AnimateIn();
}

void USwarmHUDAnimator::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
    Super::NativeTick(MyGeometry, InDeltaTime);

    Opacity.Tick(InDeltaTime);
    Scale.Tick(InDeltaTime);
    BlurRadius.Tick(InDeltaTime);
    TranslationY.Tick(InDeltaTime);

    // Flash decay
    if (FlashAlpha > 0.f)
    {
        FlashAlpha = FMath::Max(0.f, FlashAlpha - InDeltaTime * FlashDecaySpeed);
    }

    // Event rate sampling
    EventRateSampleTimer += InDeltaTime;
    if (EventRateSampleTimer >= EventRateSampleInterval)
    {
        EventRateSampleTimer = 0.f;
        PushEventRateSample();
        EventRateAccumulator = 0.f;
    }
}

// ─── Animation controls ───────────────────────────────────────────────────────

void USwarmHUDAnimator::AnimateIn()
{
    Opacity.SetTarget(1.f, EntranceAnimSpeed, EHUDEasingType::EaseOut);
    Scale.SetTarget(1.f, EntranceAnimSpeed, EHUDEasingType::Spring);
    BlurRadius.SetTarget(GlassBlurMaxRadius, EntranceAnimSpeed, EHUDEasingType::EaseOut);
    TranslationY.SetTarget(0.f, EntranceAnimSpeed, EHUDEasingType::EaseOut);

    BP_OnAnimateIn();
}

void USwarmHUDAnimator::AnimateOut()
{
    Opacity.SetTarget(0.f, ExitAnimSpeed, EHUDEasingType::EaseIn);
    Scale.SetTarget(0.95f, ExitAnimSpeed, EHUDEasingType::EaseIn);
    BlurRadius.SetTarget(0.f, ExitAnimSpeed, EHUDEasingType::EaseIn);
    TranslationY.SetTarget(-15.f, ExitAnimSpeed, EHUDEasingType::EaseIn);

    BP_OnAnimateOut();
}

void USwarmHUDAnimator::TriggerEventFlash(FLinearColor Color, float Intensity)
{
    FlashColor = Color;
    FlashAlpha = FMath::Clamp(FlashIntensity * Intensity, 0.f, 1.f);
    BP_OnEventFlash(Color);
}

// ─── Event handler ────────────────────────────────────────────────────────────

void USwarmHUDAnimator::OnEventForAnimator(const FSwarmEvent& Event)
{
    EventRateAccumulator += 1.f;

    // Flash color based on event priority / type
    switch (Event.EventType)
    {
    case ESwarmEventType::Anomaly:
    case ESwarmEventType::SwarmFailed:
        TriggerEventFlash(FLinearColor(1.f, 0.05f, 0.05f), 1.0f);
        break;

    case ESwarmEventType::TaskSuccess:
    case ESwarmEventType::SwarmCompleted:
        TriggerEventFlash(FLinearColor(0.1f, 1.f, 0.3f), 0.7f);
        break;

    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:
        TriggerEventFlash(FLinearColor(1.f, 0.55f, 0.f), 0.5f);
        break;

    case ESwarmEventType::TaskHandoff:
        TriggerEventFlash(FLinearColor(0.f, 0.9f, 0.9f), 0.3f);
        break;

    case ESwarmEventType::MetaInsight:
        TriggerEventFlash(FLinearColor(0.8f, 1.f, 0.4f), 0.4f);
        break;

    default:
        break;
    }

    // Quality score graph
    const float QScore = Event.GetDataFloat(TEXT("quality_score"), -1.f);
    if (QScore >= 0.f)
    {
        FLinearColor QColor;
        if      (QScore >= 80.f) QColor = FLinearColor(0.1f, 1.f, 0.3f);
        else if (QScore >= 60.f) QColor = FLinearColor(1.f, 0.55f, 0.f);
        else                     QColor = FLinearColor(1.f, 0.1f, 0.1f);

        PushQualityGraphSample(QScore, QColor);
    }
}

// ─── Graph data helpers ───────────────────────────────────────────────────────

void USwarmHUDAnimator::PushQualityGraphSample(float Value, FLinearColor Color)
{
    FGraphSample Sample;
    Sample.Value     = Value;
    Sample.Timestamp = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
    Sample.Color     = Color;

    QualityGraphSamples.Add(Sample);
    if (QualityGraphSamples.Num() > MaxGraphSamples)
    {
        QualityGraphSamples.RemoveAt(0);
    }
}

void USwarmHUDAnimator::PushEventRateSample()
{
    FGraphSample Sample;
    Sample.Value     = EventRateAccumulator / EventRateSampleInterval; // events/sec
    Sample.Timestamp = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
    Sample.Color     = FLinearColor(0.2f, 0.5f, 1.f);

    EventRateGraphSamples.Add(Sample);
    if (EventRateGraphSamples.Num() > MaxGraphSamples)
    {
        EventRateGraphSamples.RemoveAt(0);
    }
}

float USwarmHUDAnimator::GetNormalizedGraphValue(const FGraphSample& Sample,
                                                   float MinVal, float MaxVal) const
{
    const float Range = FMath::Max(MaxVal - MinVal, 0.001f);
    return FMath::Clamp((Sample.Value - MinVal) / Range, 0.f, 1.f);
}
