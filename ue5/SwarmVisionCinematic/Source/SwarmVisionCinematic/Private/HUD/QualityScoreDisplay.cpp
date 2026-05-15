#include "HUD/QualityScoreDisplay.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"

void UQualityScoreDisplay::NativeConstruct()
{
    Super::NativeConstruct();

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(this, &UQualityScoreDisplay::OnEventForScore);
        }
    }
}

void UQualityScoreDisplay::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
    Super::NativeTick(MyGeometry, InDeltaTime);

    if (!FMath::IsNearlyEqual(DisplayedScore, TargetScore, 0.05f))
    {
        DisplayedScore = FMath::FInterpTo(DisplayedScore, TargetScore,
                                           InDeltaTime, ScoreLerpSpeed);
    }
}

void UQualityScoreDisplay::OnEventForScore(const FSwarmEvent& Event)
{
    float NewScore = -1.f;

    if (Event.EventType == ESwarmEventType::AgentStepCompleted ||
        Event.EventType == ESwarmEventType::AgentStepFailed    ||
        Event.EventType == ESwarmEventType::TaskSuccess         ||
        Event.EventType == ESwarmEventType::TaskFail            ||
        Event.EventType == ESwarmEventType::MetricsSnapshot)
    {
        NewScore = Event.GetDataFloat(TEXT("quality_score"), -1.f);
    }

    if (NewScore < 0.f)
    {
        return;
    }

    PreviousScore = TargetScore;
    TargetScore   = FMath::Clamp(NewScore, 0.f, 100.f);
    bScoreReceived = true;

    const FLinearColor BandColor = GetScoreColor();
    const FText BandLabel        = GetScoreBandLabel();

    BP_OnScoreReceived(TargetScore, PreviousScore);
    BP_OnBandChanged(BandColor, BandLabel);
}

FLinearColor UQualityScoreDisplay::GetScoreColor() const
{
    if (TargetScore >= GoodThreshold)
    {
        return FLinearColor(0.1f, 1.0f, 0.3f); // green
    }
    if (TargetScore >= AcceptableThreshold)
    {
        return FLinearColor(1.0f, 0.55f, 0.0f); // amber
    }
    return FLinearColor(1.0f, 0.05f, 0.05f); // red
}

FText UQualityScoreDisplay::GetScoreBandLabel() const
{
    if (TargetScore >= GoodThreshold)
    {
        return FText::FromString(TEXT("GOOD"));
    }
    if (TargetScore >= AcceptableThreshold)
    {
        return FText::FromString(TEXT("ACCEPTABLE"));
    }
    return FText::FromString(TEXT("POOR"));
}
