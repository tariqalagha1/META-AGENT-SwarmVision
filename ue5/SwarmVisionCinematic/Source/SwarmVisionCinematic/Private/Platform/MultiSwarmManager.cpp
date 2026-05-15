#include "Platform/MultiSwarmManager.h"
#include "HAL/PlatformTime.h"

void UMultiSwarmManager::RegisterSwarm(const FString& SwarmId, const TArray<FString>& ZoneIds)
{
    if (Swarms.Contains(SwarmId)) return;

    FLiveSwarmRecord Record;
    Record.SwarmId     = SwarmId;
    Record.Status      = TEXT("running");
    Record.StartedAtMs = static_cast<int64>(FPlatformTime::Seconds() * 1000.0);
    Record.ZoneIds     = ZoneIds;
    Swarms.Add(SwarmId, Record);

    const int64 Now = Record.StartedAtMs;
    for (const FString& ZoneId : ZoneIds)
    {
        const FString PreviousOwner = ZoneOwners.FindRef(ZoneId);
        ZoneOwners.Add(ZoneId, SwarmId);
        if (PreviousOwner != SwarmId)
        {
            OnZoneOwnerChanged.Broadcast(ZoneId, SwarmId);
        }
    }

    OnSwarmRegistered.Broadcast(SwarmId);
}

void UMultiSwarmManager::DeregisterSwarm(
    const FString& SwarmId, const FString& FinalStatus, float QualityScore)
{
    FLiveSwarmRecord* Record = Swarms.Find(SwarmId);
    if (!Record) return;

    Record->Status       = FinalStatus;
    Record->QualityScore = QualityScore;

    // Release zone ownership
    for (const FString& ZoneId : Record->ZoneIds)
    {
        if (ZoneOwners.FindRef(ZoneId) == SwarmId)
        {
            ZoneOwners.Remove(ZoneId);
            OnZoneOwnerChanged.Broadcast(ZoneId, TEXT(""));
        }
    }

    OnSwarmDeregistered.Broadcast(SwarmId);
    Swarms.Remove(SwarmId);
}

void UMultiSwarmManager::UpdateSwarmStats(
    const FString& SwarmId, int32 EventCount, int32 AgentCount)
{
    if (FLiveSwarmRecord* R = Swarms.Find(SwarmId))
    {
        R->EventCount = EventCount;
        R->AgentCount = AgentCount;
    }
}

TArray<FLiveSwarmRecord> UMultiSwarmManager::GetLiveSwarms() const
{
    TArray<FLiveSwarmRecord> Out;
    Swarms.GenerateValueArray(Out);
    return Out;
}

bool UMultiSwarmManager::GetSwarmRecord(const FString& SwarmId, FLiveSwarmRecord& OutRecord) const
{
    if (const FLiveSwarmRecord* R = Swarms.Find(SwarmId))
    {
        OutRecord = *R;
        return true;
    }
    return false;
}

FString UMultiSwarmManager::GetZoneOwner(const FString& ZoneId) const
{
    return ZoneOwners.FindRef(ZoneId);
}

TArray<FZoneOwnership> UMultiSwarmManager::GetAllZoneOwnerships() const
{
    TArray<FZoneOwnership> Out;
    for (const auto& Pair : ZoneOwners)
    {
        FZoneOwnership O;
        O.ZoneId  = Pair.Key;
        O.SwarmId = Pair.Value;
        Out.Add(O);
    }
    return Out;
}
