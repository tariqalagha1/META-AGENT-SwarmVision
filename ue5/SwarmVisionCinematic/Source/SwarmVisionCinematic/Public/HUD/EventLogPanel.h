#pragma once

#include "CoreMinimal.h"
#include "HUD/SwarmHUDBase.h"
#include "EventLogPanel.generated.h"

USTRUCT(BlueprintType)
struct FEventLogEntry
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly)
    FString Timestamp;

    UPROPERTY(BlueprintReadOnly)
    FString AgentId;

    UPROPERTY(BlueprintReadOnly)
    ESwarmEventType EventType = ESwarmEventType::Unknown;

    UPROPERTY(BlueprintReadOnly)
    FString Summary; // Short human-readable description

    UPROPERTY(BlueprintReadOnly)
    FLinearColor EntryColor = FLinearColor::White;

    UPROPERTY(BlueprintReadOnly)
    EEventPriority Priority = EEventPriority::Normal;
};

// ─── UEventLogPanel ───────────────────────────────────────────────────────────
//
// Scrolling event log — WBP_EventLog in Blueprint.
// Maintains a fixed-size ring buffer of recent events.
// BP subclass polls GetRecentEntries() or binds BP_OnEntryAdded.

UCLASS(Abstract, Blueprintable)
class SWARMVISIONCINEMATIC_API UEventLogPanel : public USwarmHUDBase
{
    GENERATED_BODY()

public:
    // Max entries to keep in ring buffer
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|EventLog")
    int32 MaxEntries = 50;

    // Only show events at or above this priority
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="HUD|EventLog")
    EEventPriority MinPriority = EEventPriority::Normal;

    // Get recent entries — newest first
    UFUNCTION(BlueprintCallable, BlueprintPure, Category="HUD|EventLog")
    TArray<FEventLogEntry> GetRecentEntries(int32 Count = 20) const;

    UFUNCTION(BlueprintCallable, Category="HUD|EventLog")
    void ClearLog();

    // BP hook — fired when a new entry is added
    UFUNCTION(BlueprintImplementableEvent, Category="HUD|EventLog")
    void BP_OnEntryAdded(const FEventLogEntry& Entry);

protected:
    virtual void NativeConstruct() override;

private:
    UFUNCTION()
    void OnEventForLog(const FSwarmEvent& Event);

    TArray<FEventLogEntry> LogEntries; // newest last, trimmed to MaxEntries
};
