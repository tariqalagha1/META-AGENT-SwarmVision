#include "Tasks/DataPacket.h"
#include "NiagaraFunctionLibrary.h"
#include "Components/SplineComponent.h"

ADataPacket::ADataPacket()
{
    PrimaryActorTick.bCanEverTick = true;

    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
    Mesh->SetupAttachment(Root);
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Mesh->SetCastShadow(false);

    TrailFX = CreateDefaultSubobject<UNiagaraComponent>(TEXT("TrailFX"));
    TrailFX->SetupAttachment(Root);
    TrailFX->bAutoActivate = false;

    ArrivalFX = CreateDefaultSubobject<UNiagaraComponent>(TEXT("ArrivalFX"));
    ArrivalFX->SetupAttachment(Root);
    ArrivalFX->bAutoActivate = false;
}

void ADataPacket::InitTravel(USplineComponent* InSpline, float InTravelDuration,
                              EDataPacketType InType, FLinearColor InColor)
{
    Spline         = InSpline;
    TravelDuration = FMath::Max(InTravelDuration, 0.1f);
    PacketType     = InType;
    PacketColor    = InColor;
    SplineProgress = 0.f;
    bTraveling     = true;
    bArrived       = false;

    // Build dynamic material for color-coding
    if (Mesh->GetMaterial(0))
    {
        PacketMID = Mesh->CreateAndSetMaterialInstanceDynamic(0);
    }
    if (PacketMID)
    {
        PacketMID->SetVectorParameterValue(TEXT("EmissiveColor"), PacketColor);
    }

    // Niagara color param
    if (TrailFX)
    {
        TrailFX->SetColorParameter(TEXT("PacketColor"), PacketColor);
        TrailFX->Activate(true);
    }

    BP_OnColorSet(PacketColor);
}

void ADataPacket::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    if (bArrived)
    {
        ArrivalTimer -= DeltaTime;
        if (ArrivalTimer <= 0.f)
        {
            Destroy();
        }
        return;
    }

    if (!bTraveling || !Spline)
    {
        return;
    }

    SplineProgress = FMath::Clamp(SplineProgress + DeltaTime / TravelDuration, 0.f, 1.f);

    const float SplineLength = Spline->GetSplineLength();
    const float DistAlongSpline = SplineProgress * SplineLength;

    const FVector WorldPos = Spline->GetLocationAtDistanceAlongSpline(
        DistAlongSpline, ESplineCoordinateSpace::World);
    const FRotator WorldRot = Spline->GetRotationAtDistanceAlongSpline(
        DistAlongSpline, ESplineCoordinateSpace::World);

    SetActorLocation(WorldPos);
    SetActorRotation(WorldRot);

    if (SplineProgress >= 1.f)
    {
        OnArrival();
    }
}

void ADataPacket::OnArrival()
{
    bTraveling = false;
    bArrived   = true;
    ArrivalTimer = ArrivalFXHoldSeconds;

    if (TrailFX && TrailFX->IsActive())
    {
        TrailFX->Deactivate();
    }

    if (ArrivalFX)
    {
        ArrivalFX->SetColorParameter(TEXT("PacketColor"), PacketColor);
        ArrivalFX->Activate(true);
    }

    OnPacketArrived.Broadcast(this);
    BP_OnArrived();
}
