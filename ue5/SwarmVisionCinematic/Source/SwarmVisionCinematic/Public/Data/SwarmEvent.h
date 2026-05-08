#pragma once

#include "CoreMinimal.h"
#include "Data/SwarmEventTypes.h"
#include "SwarmEvent.generated.h"

// ─── FSwarmEvent ─────────────────────────────────────────────────────────────
//
// Parsed representation of a Ue5Message from the event-relay service.
// All string data is preserved verbatim from JSON. Blueprint-accessible
// via the flat Data map (FString → FString) so Blueprint nodes can read
// named fields without nested struct access.

USTRUCT(BlueprintType)
struct SWARMVISIONCINEMATIC_API FSwarmEvent
{
    GENERATED_BODY()

    // Discriminator — parsed from "ue5_type"
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    ESwarmEventType EventType = ESwarmEventType::Unknown;

    // ISO-8601 timestamp string from the backend
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    FString Timestamp;

    // Which relay channel this arrived on
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    ERelayChannel Channel = ERelayChannel::Unknown;

    // Trace correlation ID — chains all events in one swarm run
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    FString TraceId;

    // Which agent produced this event (fetch_agent / normalize_agent / quality_agent)
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    FString AgentId;

    // Parent event ID for chain traversal
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    FString ParentEventId;

    // Flat key-value payload — all data fields accessible by name
    // Keys: step_name, attempt, quality_score, quality_threshold, status,
    //       degraded, decision, reason, error, severity, ...
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    TMap<FString, FString> Data;

    // Processing priority assigned by the router
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    EEventPriority Priority = EEventPriority::Normal;

    // True when this event was injected via replay rather than live stream
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    bool bIsReplay = false;

    // Raw JSON string — preserved for debug logging
    UPROPERTY(BlueprintReadOnly, Category="SwarmEvent")
    FString RawJson;

    // ── Convenience accessors (inline, zero-cost) ─────────────────────────

    FORCEINLINE FString GetDataField(const FString& Key) const
    {
        const FString* Val = Data.Find(Key);
        return Val ? *Val : FString();
    }

    FORCEINLINE float GetDataFloat(const FString& Key, float Default = 0.f) const
    {
        const FString* Val = Data.Find(Key);
        return Val ? FCString::Atof(**Val) : Default;
    }

    FORCEINLINE int32 GetDataInt(const FString& Key, int32 Default = 0) const
    {
        const FString* Val = Data.Find(Key);
        return Val ? FCString::Atoi(**Val) : Default;
    }

    FORCEINLINE bool GetDataBool(const FString& Key) const
    {
        const FString* Val = Data.Find(Key);
        return Val && (Val->Equals(TEXT("true"), ESearchCase::IgnoreCase)
                    || Val->Equals(TEXT("1"), ESearchCase::CaseSensitive));
    }
};

// ─── FQueuedEvent ─────────────────────────────────────────────────────────────
// Wraps FSwarmEvent with a sequence number for FIFO ordering within the
// same priority band.

USTRUCT()
struct SWARMVISIONCINEMATIC_API FQueuedEvent
{
    GENERATED_BODY()

    FSwarmEvent Event;
    uint64 SequenceNumber = 0;

    // Lower numeric priority value = processed first (Critical=0)
    bool operator<(const FQueuedEvent& Other) const
    {
        uint8 MyPriority    = static_cast<uint8>(Event.Priority);
        uint8 OtherPriority = static_cast<uint8>(Other.Event.Priority);
        if (MyPriority != OtherPriority)
            return MyPriority > OtherPriority; // higher enum value = lower urgency
        return SequenceNumber > Other.SequenceNumber; // older events first within same priority
    }
};

// ─── FAgentStateRecord ────────────────────────────────────────────────────────
// Per-agent runtime state maintained by USwarmEventRouterSubsystem.

USTRUCT(BlueprintType)
struct SWARMVISIONCINEMATIC_API FAgentStateRecord
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category="AgentState")
    FString AgentId;

    UPROPERTY(BlueprintReadOnly, Category="AgentState")
    EAgentVisualState VisualState = EAgentVisualState::Idle;

    UPROPERTY(BlueprintReadOnly, Category="AgentState")
    FString CurrentStepName;

    UPROPERTY(BlueprintReadOnly, Category="AgentState")
    FString CurrentTraceId;

    UPROPERTY(BlueprintReadOnly, Category="AgentState")
    float LastQualityScore = 0.f;

    UPROPERTY(BlueprintReadOnly, Category="AgentState")
    int32 RetryCount = 0;

    // Timestamp of last event for this agent (FDateTime serialized to string)
    UPROPERTY(BlueprintReadOnly, Category="AgentState")
    FString LastEventTimestamp;
};
