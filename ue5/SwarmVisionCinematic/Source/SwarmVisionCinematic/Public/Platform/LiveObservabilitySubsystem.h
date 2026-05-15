#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Events/SwarmEventTypes.h"
#include "LiveObservabilitySubsystem.generated.h"

// Heatmap — accumulates event counts per agent per zone
USTRUCT(BlueprintType)
struct FAgentHeatmapEntry
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString AgentId;
    UPROPERTY(BlueprintReadOnly) FString ZoneId;
    UPROPERTY(BlueprintReadOnly) int32   EventCount = 0;
    UPROPERTY(BlueprintReadOnly) int32   RetryCount = 0;
    UPROPERTY(BlueprintReadOnly) float   HeatNormalized = 0.f; // 0..1 within current swarm
};

// Rolling event-rate sample (events/sec)
USTRUCT(BlueprintType)
struct FEventRateSample
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) float   EventsPerSec = 0.f;
    UPROPERTY(BlueprintReadOnly) int64   TimestampMs  = 0;
};

// Per-agent live state snapshot
USTRUCT(BlueprintType)
struct FAgentLiveState
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString AgentId;
    UPROPERTY(BlueprintReadOnly) FString CurrentState;    // from last event
    UPROPERTY(BlueprintReadOnly) float   QualityScore     = -1.f;
    UPROPERTY(BlueprintReadOnly) int32   RetryCount       = 0;
    UPROPERTY(BlueprintReadOnly) int32   EventCount       = 0;
    UPROPERTY(BlueprintReadOnly) int64   LastEventMs      = 0;
    UPROPERTY(BlueprintReadOnly) bool    bIsAnomaly       = false;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnObservabilityUpdated);

// ─── ULiveObservabilitySubsystem ──────────────────────────────────────────────
//
// Aggregates live telemetry for the Observability and Incident viewer modes:
//   - Per-agent heatmap  (activity density)
//   - Rolling event rate (events/sec ring buffer, 60 samples = 60s at 1Hz)
//   - Per-agent state    (last known state + quality)
//   - Retry and anomaly analytics

UCLASS()
class SWARMVISIONCINEMATIC_API ULiveObservabilitySubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

    // Called by USwarmEventRouterSubsystem whenever an event fires
    void OnSwarmEvent(const FSwarmEvent& Event);

    void ResetForSwarm(const FString& SwarmId);

    // ── Heatmap ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Observability")
    TArray<FAgentHeatmapEntry> GetHeatmap() const;

    // ── Event rate ───────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Observability")
    float GetCurrentEventRate() const { return CurrentEventsPerSec; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Observability")
    TArray<FEventRateSample> GetEventRateHistory() const { return EventRateRing; }

    // ── Agent states ─────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Observability")
    TArray<FAgentLiveState> GetAllAgentStates() const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Observability")
    bool GetAgentState(const FString& AgentId, FAgentLiveState& OutState) const;

    // ── Analytics ────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Observability")
    int32 GetTotalRetries()  const { return TotalRetries;  }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Observability")
    int32 GetTotalAnomalies() const { return TotalAnomalies; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Observability")
    int32 GetTotalFailures()  const { return TotalFailures;  }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Observability")
    float GetQueueDepthEstimate() const { return QueueDepthEstimate; }

    UPROPERTY(BlueprintAssignable) FOnObservabilityUpdated OnObservabilityUpdated;

private:
    void TickRateAccumulator(int64 NowMs);

    // Key: "AgentId|ZoneId"
    TMap<FString, FAgentHeatmapEntry> Heatmap;

    TMap<FString, FAgentLiveState>    AgentStates;

    // Rolling 1-second event rate
    static constexpr int32 RATE_RING_SIZE = 60;
    TArray<FEventRateSample> EventRateRing;
    int32  RateRingHead        = 0;
    int32  EventsThisSecond    = 0;
    int64  CurrentSecondBucket = 0;
    float  CurrentEventsPerSec = 0.f;

    int32 TotalRetries    = 0;
    int32 TotalAnomalies  = 0;
    int32 TotalFailures   = 0;
    float QueueDepthEstimate = 0.f;

    FString ActiveSwarmId;
};
