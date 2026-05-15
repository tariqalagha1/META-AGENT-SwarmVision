#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/SplineComponent.h"
#include "NiagaraComponent.h"
#include "DataPacket.generated.h"

UENUM(BlueprintType)
enum class EDataPacketType : uint8
{
    Normal      UMETA(DisplayName="Normal"),
    Handoff     UMETA(DisplayName="Handoff"),
    Retry       UMETA(DisplayName="Retry"),
    Success     UMETA(DisplayName="Success"),
    Failed      UMETA(DisplayName="Failed"),
};

// Broadcast when packet arrives at destination
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnPacketArrived, ADataPacket*, Packet);

// ─── ADataPacket ──────────────────────────────────────────────────────────────
//
// Spawned by ATaskFlowSplineManager when a TaskHandoff / AgentStep event fires.
// Travels along a USplineComponent from source zone to destination zone,
// plays trail FX in-flight, and arrival FX on landing.
// Destroys itself after arrival FX completes.

UCLASS(Blueprintable)
class SWARMVISIONCINEMATIC_API ADataPacket : public AActor
{
    GENERATED_BODY()

public:
    ADataPacket();

    virtual void Tick(float DeltaTime) override;

    // ── Setup (called by spline manager after spawn) ──────────────────────────

    // The spline to travel along (external owner, do not destroy)
    void InitTravel(USplineComponent* InSpline, float InTravelDuration,
                    EDataPacketType InType, FLinearColor InColor);

    // ── Config ────────────────────────────────────────────────────────────────

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Packet")
    float TravelDuration = 1.8f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Packet")
    float ArrivalFXHoldSeconds = 0.8f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Packet")
    EDataPacketType PacketType = EDataPacketType::Normal;

    // ── Components ────────────────────────────────────────────────────────────

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UStaticMeshComponent* Mesh;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UNiagaraComponent* TrailFX;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Components")
    UNiagaraComponent* ArrivalFX;

    // ── Delegate ─────────────────────────────────────────────────────────────

    UPROPERTY(BlueprintAssignable, Category="Packet")
    FOnPacketArrived OnPacketArrived;

    // ── BP hooks ──────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintImplementableEvent, Category="Packet")
    void BP_OnArrived();

    UFUNCTION(BlueprintImplementableEvent, Category="Packet")
    void BP_OnColorSet(FLinearColor Color);

    // ── State ─────────────────────────────────────────────────────────────────

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Packet")
    bool IsArrived() const { return bArrived; }

    UFUNCTION(BlueprintCallable, BlueprintPure, Category="Packet")
    float GetProgress() const { return SplineProgress; }

private:
    USplineComponent* Spline         = nullptr;
    float             SplineProgress = 0.f; // 0..1
    bool              bTraveling     = false;
    bool              bArrived       = false;
    float             ArrivalTimer   = 0.f;
    FLinearColor      PacketColor;

    UMaterialInstanceDynamic* PacketMID = nullptr;

    void OnArrival();
};
