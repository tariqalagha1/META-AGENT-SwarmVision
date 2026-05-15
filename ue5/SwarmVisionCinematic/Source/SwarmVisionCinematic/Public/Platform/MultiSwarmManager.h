#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "MultiSwarmManager.generated.h"

// Zone ownership — which swarm currently owns each zone
USTRUCT(BlueprintType)
struct FZoneOwnership
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString ZoneId;
    UPROPERTY(BlueprintReadOnly) FString SwarmId;    // empty = unowned
    UPROPERTY(BlueprintReadOnly) int64   ClaimedAtMs = 0;
};

// Lightweight per-swarm descriptor tracked in memory
USTRUCT(BlueprintType)
struct FLiveSwarmRecord
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FString  SwarmId;
    UPROPERTY(BlueprintReadOnly) FString  Status;    // running|completed|failed
    UPROPERTY(BlueprintReadOnly) int64    StartedAtMs = 0;
    UPROPERTY(BlueprintReadOnly) int32    EventCount  = 0;
    UPROPERTY(BlueprintReadOnly) int32    AgentCount  = 0;
    UPROPERTY(BlueprintReadOnly) float    QualityScore = -1.f;
    UPROPERTY(BlueprintReadOnly) TArray<FString> ZoneIds;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSwarmRegistered,   const FString&, SwarmId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSwarmDeregistered, const FString&, SwarmId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnZoneOwnerChanged,
    const FString&, ZoneId, const FString&, NewSwarmId);

// ─── AMultiSwarmManager ───────────────────────────────────────────────────────

UCLASS()
class SWARMVISIONCINEMATIC_API UMultiSwarmManager : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    // Register a new swarm session starting up
    UFUNCTION(BlueprintCallable, Category="MultiSwarm")
    void RegisterSwarm(const FString& SwarmId, const TArray<FString>& ZoneIds);

    // Mark swarm as complete/failed and release zone ownership
    UFUNCTION(BlueprintCallable, Category="MultiSwarm")
    void DeregisterSwarm(const FString& SwarmId, const FString& FinalStatus, float QualityScore);

    // Update event/agent counts mid-run
    UFUNCTION(BlueprintCallable, Category="MultiSwarm")
    void UpdateSwarmStats(const FString& SwarmId, int32 EventCount, int32 AgentCount);

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MultiSwarm")
    TArray<FLiveSwarmRecord> GetLiveSwarms() const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MultiSwarm")
    bool GetSwarmRecord(const FString& SwarmId, FLiveSwarmRecord& OutRecord) const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MultiSwarm")
    FString GetZoneOwner(const FString& ZoneId) const;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="MultiSwarm")
    TArray<FZoneOwnership> GetAllZoneOwnerships() const;

    UPROPERTY(BlueprintAssignable) FOnSwarmRegistered   OnSwarmRegistered;
    UPROPERTY(BlueprintAssignable) FOnSwarmDeregistered OnSwarmDeregistered;
    UPROPERTY(BlueprintAssignable) FOnZoneOwnerChanged  OnZoneOwnerChanged;

private:
    TMap<FString, FLiveSwarmRecord> Swarms;      // SwarmId → record
    TMap<FString, FString>          ZoneOwners;  // ZoneId  → SwarmId
};
