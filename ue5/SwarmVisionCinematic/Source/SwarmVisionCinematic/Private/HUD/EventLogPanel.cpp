#include "HUD/EventLogPanel.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"

void UEventLogPanel::NativeConstruct()
{
    Super::NativeConstruct();

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(this, &UEventLogPanel::OnEventForLog);
        }
    }
}

TArray<FEventLogEntry> UEventLogPanel::GetRecentEntries(int32 Count) const
{
    const int32 Total = LogEntries.Num();
    const int32 Take  = FMath::Clamp(Count, 1, Total);
    // Return newest-first slice
    TArray<FEventLogEntry> Result;
    for (int32 i = Total - 1; i >= Total - Take; --i)
    {
        Result.Add(LogEntries[i]);
    }
    return Result;
}

void UEventLogPanel::ClearLog()
{
    LogEntries.Empty();
}

void UEventLogPanel::OnEventForLog(const FSwarmEvent& Event)
{
    // Priority filter
    if ((int32)Event.Priority > (int32)MinPriority)
    {
        return;
    }

    FEventLogEntry Entry;
    Entry.Timestamp  = Event.Timestamp;
    Entry.AgentId    = Event.AgentId;
    Entry.EventType  = Event.EventType;
    Entry.Priority   = Event.Priority;
    Entry.EntryColor = EventTypeToColor(Event.EventType);

    // Build summary
    FString Label = EventTypeToLabel(Event.EventType).ToString();
    if (!Event.AgentId.IsEmpty())
    {
        Label += TEXT(" [") + Event.AgentId + TEXT("]");
    }
    const FString Step = Event.GetDataField(TEXT("step_name"));
    if (!Step.IsEmpty())
    {
        Label += TEXT(" ") + Step;
    }
    const FString Score = Event.GetDataField(TEXT("quality_score"));
    if (!Score.IsEmpty())
    {
        Label += TEXT(" score=") + Score;
    }
    Entry.Summary = Label;

    LogEntries.Add(Entry);
    if (LogEntries.Num() > MaxEntries)
    {
        LogEntries.RemoveAt(0);
    }

    BP_OnEntryAdded(Entry);
}
