#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/SplineComponent.h"
#include "Data/SwarmEvent.h"
#include "Environment/ZoneTypes.h"
#include "Tasks/DataPacket.h"
#include "TaskFlowSplineManager.generated.h"

// Describes a named spline route between two zones
USTRUCT(BlueprintType)
struct FSplineRoute
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FName RouteName;

    // Source and destination zone IDs
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EZoneId SourceZone = EZoneId::Intake;

    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    EZoneId DestZone = EZoneId::Transform;

    // Travel time for packets on this route (seconds)
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float TravelDuration = 1.8f;

    // Spline component index in SplineRoutes array
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    int32 SplineIndex = 0;
};

// ─── ATaskFlowSplineManager ───────────────────────────────────────────────────
//
// Placed once in the level.
// Owns all spline routes between zones.
// Spawns ADataPacket actors on TaskHandoff / AgentStep events.
// Each spline route is a USplineComponent attached to this actor's root.
// Add points in the Details panel or via Blueprint.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ATaskFlowSplineManager : public AActor
{
    GENERATED_BODY()

public:
    ATaskFlowSplineManager();

    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

    // ── Config ────────────────────────────────────────────────────────────────

    // Subclass of ADataPacket to spawn (allows BP override)
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Splines")
    TSubclassOf<ADataPacket> DataPacketClass;

    // Route definitions — maps zone pairs to spline indices
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Splines")
    TArray<FSplineRoute> Routes;

    // Spline components — add one per route in Blueprint (or CreateDefaultSubobject in subclass)
    // Access by Routes[i].SplineIndex
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Splines")
    TArray<USplineComponent*> SplineComponents;

    // Whether to show debug spline visualization in-editor
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Splines|Debug")
    bool bShowDebugSplines = true;

    // ── API ───────────────────────────────────────────────────────────────────

    // Manually fire a packet along a named route
    UFUNCTION(BlueprintCallable, Category="Splines")
    ADataPacket* SpawnPacketOnRoute(FName RouteName, EDataPacketType PacketType);

    // Find route by source + dest zone pair
    UFUNCTION(BlueprintCallable, Category="Splines")
    bool FindRoute(EZoneId Source, EZoneId Dest, FSplineRoute& OutRoute) const;

    // Add a spline component at runtime (returns component index)
    UFUNCTION(BlueprintCallable, Category="Splines")
    int32 AddSplineRoute(EZoneId Source, EZoneId Dest, float TravelDuration,
                         const TArray<FVector>& WorldPoints);

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="Splines")
    void BP_OnPacketSpawned(ADataPacket* Packet, FName RouteName);

    UFUNCTION(BlueprintImplementableEvent, Category="Splines")
    void BP_OnPacketArrived(ADataPacket* Packet, FName RouteName);

private:
    UFUNCTION()
    void OnSwarmEventReceived(const FSwarmEvent& Event);

    UFUNCTION()
    void OnPacketArrived(ADataPacket* Packet);

    ADataPacket* SpawnPacketInternal(const FSplineRoute& Route, EDataPacketType Type,
                                      FLinearColor Color);

    static FLinearColor ColorForPacketType(EDataPacketType Type);
    static EDataPacketType PacketTypeForEvent(ESwarmEventType EventType);

    // Active packets map: packet → route name (for arrival callback)
    TMap<ADataPacket*, FName> ActivePackets;
};
