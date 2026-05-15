#include "HUD/AlertPanel.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"

void UAlertPanel::NativeConstruct()
{
    Super::NativeConstruct();

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(this, &UAlertPanel::OnEventForAlert);
        }
    }
}

void UAlertPanel::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
    Super::NativeTick(MyGeometry, InDeltaTime);

    if (bAlertActive && AutoDismissSeconds > 0.f)
    {
        DismissTimer -= InDeltaTime;
        if (DismissTimer <= 0.f)
        {
            DismissCurrentAlert();
        }
    }
}

void UAlertPanel::OnEventForAlert(const FSwarmEvent& Event)
{
    FLinearColor AlertColor;
    FString Message;

    switch (Event.EventType)
    {
    case ESwarmEventType::Anomaly:
        AlertColor = FLinearColor(1.f, 0.0f, 0.0f);
        Message    = TEXT("ANOMALY DETECTED");
        if (!Event.AgentId.IsEmpty())
        {
            Message += TEXT(" — ") + Event.AgentId;
        }
        break;

    case ESwarmEventType::SwarmFailed:
        AlertColor = FLinearColor(1.f, 0.0f, 0.0f);
        Message    = TEXT("SWARM FAILED");
        break;

    case ESwarmEventType::AgentStepFailed:
        AlertColor = FLinearColor(1.f, 0.3f, 0.0f);
        Message    = TEXT("STEP FAILED — ") + Event.AgentId;
        break;

    case ESwarmEventType::TaskFail:
        AlertColor = FLinearColor(1.f, 0.2f, 0.0f);
        Message    = TEXT("TASK FAILED");
        break;

    default:
        return;
    }

    TriggerAlert(Message, AlertColor, Event.Timestamp);
}

void UAlertPanel::TriggerAlert(const FString& Message, FLinearColor Color,
                                const FString& Timestamp)
{
    FAlertEntry Alert;
    Alert.Message   = Message;
    Alert.Color     = Color;
    Alert.Timestamp = Timestamp;

    CurrentAlert  = Alert;
    bAlertActive  = true;
    DismissTimer  = AutoDismissSeconds;

    AlertHistory.Add(Alert);
    if (AlertHistory.Num() > 20)
    {
        AlertHistory.RemoveAt(0);
    }

    BP_ShowAlert(Alert);
}

void UAlertPanel::DismissCurrentAlert()
{
    if (!bAlertActive)
    {
        return;
    }

    CurrentAlert.bAcknowledged = true;
    bAlertActive = false;
    DismissTimer = 0.f;

    BP_OnAlertCleared();
}
