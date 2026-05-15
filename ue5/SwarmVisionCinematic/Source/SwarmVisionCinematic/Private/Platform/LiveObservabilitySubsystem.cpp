#include "Platform/LiveObservabilitySubsystem.h"
#include "HAL/PlatformTime.h"

static const TSet<FString> RetryEventTypes   = { TEXT("TASK_RETRY"), TEXT("AGENT_RETRY"), TEXT("CIRCUIT_BREAKER_HALF_OPEN") };
static const TSet<FString> AnomalyEventTypes = { TEXT("ANOMALY_DETECTED"), TEXT("CIRCUIT_BREAKER_OPEN"), TEXT("AGENT_TIMEOUT"), TEXT("QUEUE_OVERFLOW") };
static const TSet<FString> FailureEventTypes = { TEXT("TASK_FAILED"), TEXT("AGENT_FAILED"), TEXT("SWARM_FAILED") };

void ULiveObservabilitySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);
    EventRateRing.SetNum(RATE_RING_SIZE);
    CurrentSecondBucket = static_cast<int64>(FPlatformTime::Seconds());
}

void ULiveObservabilitySubsystem::Deinitialize()
{
    Super::Deinitialize();
}

void ULiveObservabilitySubsystem::ResetForSwarm(const FString& SwarmId)
{
    ActiveSwarmId     = SwarmId;
    Heatmap.Empty();
    AgentStates.Empty();
    EventRateRing.SetNum(RATE_RING_SIZE);
    RateRingHead       = 0;
    EventsThisSecond   = 0;
    CurrentEventsPerSec = 0.f;
    TotalRetries       = 0;
    TotalAnomalies     = 0;
    TotalFailures      = 0;
    QueueDepthEstimate = 0.f;
}

// ─── Event ingestion ──────────────────────────────────────────────────────────

void ULiveObservabilitySubsystem::OnSwarmEvent(const FSwarmEvent& Event)
{
    const int64 NowMs = static_cast<int64>(FPlatformTime::Seconds() * 1000.0);

    // ── Heatmap ──────────────────────────────────────────────────────────────

    // ZoneId extracted from Channel field (format: "zone_id.priority" or just "zone_id")
    FString ZoneId = Event.Channel.IsEmpty() ? TEXT("unknown") : Event.Channel;
    {
        int32 DotIdx;
        if (ZoneId.FindChar(TEXT('.'), DotIdx)) ZoneId = ZoneId.Left(DotIdx);
    }

    const FString HeatKey = Event.AgentId + TEXT("|") + ZoneId;
    FAgentHeatmapEntry& Entry = Heatmap.FindOrAdd(HeatKey);
    Entry.AgentId   = Event.AgentId;
    Entry.ZoneId    = ZoneId;
    Entry.EventCount++;
    if (RetryEventTypes.Contains(Event.EventType)) Entry.RetryCount++;

    // ── Agent state ──────────────────────────────────────────────────────────

    FAgentLiveState& AgentState = AgentStates.FindOrAdd(Event.AgentId);
    AgentState.AgentId     = Event.AgentId;
    AgentState.CurrentState = Event.EventType;
    AgentState.EventCount++;
    AgentState.LastEventMs  = NowMs;
    AgentState.bIsAnomaly   = AnomalyEventTypes.Contains(Event.EventType);

    // Parse quality_score from DataJson (simple substring search — avoids full JSON parse per event)
    if (Event.DataJson.Contains(TEXT("quality_score")))
    {
        TSharedPtr<FJsonObject> Root;
        const TSharedRef<TJsonReader<>> R = TJsonReaderFactory<>::Create(Event.DataJson);
        if (FJsonSerializer::Deserialize(R, Root) && Root.IsValid())
        {
            double QS = -1.0;
            if (Root->TryGetNumberField(TEXT("quality_score"), QS))
                AgentState.QualityScore = static_cast<float>(QS);
        }
    }

    if (RetryEventTypes.Contains(Event.EventType))
    {
        AgentState.RetryCount++;
        TotalRetries++;
    }
    if (AnomalyEventTypes.Contains(Event.EventType)) TotalAnomalies++;
    if (FailureEventTypes.Contains(Event.EventType)) TotalFailures++;

    // Queue depth estimate — rough proxy: retry events raise it, completions lower it
    if (RetryEventTypes.Contains(Event.EventType))       QueueDepthEstimate += 1.f;
    if (Event.EventType == TEXT("TASK_COMPLETED"))        QueueDepthEstimate = FMath::Max(0.f, QueueDepthEstimate - 1.f);
    if (Event.EventType == TEXT("SWARM_COMPLETED"))       QueueDepthEstimate = 0.f;

    // ── Rate accumulator ─────────────────────────────────────────────────────
    TickRateAccumulator(NowMs);

    OnObservabilityUpdated.Broadcast();
}

void ULiveObservabilitySubsystem::TickRateAccumulator(int64 NowMs)
{
    const int64 NowSec = NowMs / 1000;
    if (NowSec != CurrentSecondBucket)
    {
        // Commit completed bucket
        CurrentEventsPerSec = static_cast<float>(EventsThisSecond);
        EventRateRing[RateRingHead] = { CurrentEventsPerSec, CurrentSecondBucket * 1000 };
        RateRingHead      = (RateRingHead + 1) % RATE_RING_SIZE;
        EventsThisSecond  = 0;
        CurrentSecondBucket = NowSec;
    }
    EventsThisSecond++;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

TArray<FAgentHeatmapEntry> ULiveObservabilitySubsystem::GetHeatmap() const
{
    TArray<FAgentHeatmapEntry> Out;
    Heatmap.GenerateValueArray(Out);

    // Normalize HeatNormalized by max EventCount
    int32 MaxCount = 1;
    for (const auto& E : Out) MaxCount = FMath::Max(MaxCount, E.EventCount);
    for (auto& E : Out) E.HeatNormalized = static_cast<float>(E.EventCount) / MaxCount;

    return Out;
}

TArray<FAgentLiveState> ULiveObservabilitySubsystem::GetAllAgentStates() const
{
    TArray<FAgentLiveState> Out;
    AgentStates.GenerateValueArray(Out);
    return Out;
}

bool ULiveObservabilitySubsystem::GetAgentState(
    const FString& AgentId, FAgentLiveState& OutState) const
{
    if (const FAgentLiveState* S = AgentStates.Find(AgentId))
    {
        OutState = *S;
        return true;
    }
    return false;
}
