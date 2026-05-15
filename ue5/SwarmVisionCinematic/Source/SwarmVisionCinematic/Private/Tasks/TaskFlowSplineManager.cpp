#include "Tasks/TaskFlowSplineManager.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Components/SplineComponent.h"
#include "Engine/World.h"

ATaskFlowSplineManager::ATaskFlowSplineManager()
{
    PrimaryActorTick.bCanEverTick = false;

    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    // Pre-create the 4 canonical zone-to-zone routes as named spline components
    // Intake → Transform
    {
        USplineComponent* S = CreateDefaultSubobject<USplineComponent>(TEXT("Spline_IntakeToTransform"));
        S->SetupAttachment(Root);
        S->SetDrawDebug(true);
        SplineComponents.Add(S);
        FSplineRoute R;
        R.RouteName      = TEXT("Intake_to_Transform");
        R.SourceZone     = EZoneId::Intake;
        R.DestZone       = EZoneId::Transform;
        R.TravelDuration = 1.8f;
        R.SplineIndex    = 0;
        Routes.Add(R);
    }
    // Transform → Validation
    {
        USplineComponent* S = CreateDefaultSubobject<USplineComponent>(TEXT("Spline_TransformToValidation"));
        S->SetupAttachment(Root);
        S->SetDrawDebug(true);
        SplineComponents.Add(S);
        FSplineRoute R;
        R.RouteName      = TEXT("Transform_to_Validation");
        R.SourceZone     = EZoneId::Transform;
        R.DestZone       = EZoneId::Validation;
        R.TravelDuration = 1.8f;
        R.SplineIndex    = 1;
        Routes.Add(R);
    }
    // Validation → Corridor (quality pass to output)
    {
        USplineComponent* S = CreateDefaultSubobject<USplineComponent>(TEXT("Spline_ValidationToCorridor"));
        S->SetupAttachment(Root);
        S->SetDrawDebug(true);
        SplineComponents.Add(S);
        FSplineRoute R;
        R.RouteName      = TEXT("Validation_to_Corridor");
        R.SourceZone     = EZoneId::Validation;
        R.DestZone       = EZoneId::Corridor;
        R.TravelDuration = 2.0f;
        R.SplineIndex    = 2;
        Routes.Add(R);
    }
    // Validation → Transform (quality fail → retry back to normalize)
    {
        USplineComponent* S = CreateDefaultSubobject<USplineComponent>(TEXT("Spline_ValidationRetry"));
        S->SetupAttachment(Root);
        S->SetDrawDebug(true);
        SplineComponents.Add(S);
        FSplineRoute R;
        R.RouteName      = TEXT("Validation_Retry");
        R.SourceZone     = EZoneId::Validation;
        R.DestZone       = EZoneId::Transform;
        R.TravelDuration = 2.2f;
        R.SplineIndex    = 3;
        Routes.Add(R);
    }
}

// ─── BeginPlay ───────────────────────────────────────────────────────────────

void ATaskFlowSplineManager::BeginPlay()
{
    Super::BeginPlay();

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(
                this, &ATaskFlowSplineManager::OnSwarmEventReceived);
        }
    }
}

void ATaskFlowSplineManager::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(
                this, &ATaskFlowSplineManager::OnSwarmEventReceived);
        }
    }
    Super::EndPlay(EndPlayReason);
}

// ─── Event handler ───────────────────────────────────────────────────────────

void ATaskFlowSplineManager::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    EDataPacketType PType = PacketTypeForEvent(Event.EventType);

    switch (Event.EventType)
    {
    case ESwarmEventType::TaskHandoff:
    {
        // Determine source and dest zones from agent ID
        // fetch_agent = Intake, normalize_agent = Transform, quality_agent = Validation
        FName RouteToFire;
        const FString& Aid = Event.AgentId;
        if (Aid == TEXT("fetch_agent"))
        {
            RouteToFire = TEXT("Intake_to_Transform");
        }
        else if (Aid == TEXT("normalize_agent"))
        {
            RouteToFire = TEXT("Transform_to_Validation");
        }
        else if (Aid == TEXT("quality_agent"))
        {
            const FString StepResult = Event.GetDataField(TEXT("result"));
            RouteToFire = (StepResult == TEXT("pass"))
                ? TEXT("Validation_to_Corridor")
                : TEXT("Validation_Retry");
        }

        if (!RouteToFire.IsNone())
        {
            SpawnPacketOnRoute(RouteToFire, PType);
        }
        break;
    }

    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:
    {
        const FString& Aid = Event.AgentId;
        if (Aid == TEXT("quality_agent"))
        {
            SpawnPacketOnRoute(TEXT("Validation_Retry"), EDataPacketType::Retry);
        }
        break;
    }

    case ESwarmEventType::SwarmCompleted:
    case ESwarmEventType::TaskSuccess:
    {
        SpawnPacketOnRoute(TEXT("Validation_to_Corridor"), EDataPacketType::Success);
        break;
    }

    default:
        break;
    }
}

// ─── SpawnPacketOnRoute ───────────────────────────────────────────────────────

ADataPacket* ATaskFlowSplineManager::SpawnPacketOnRoute(FName RouteName,
                                                          EDataPacketType PacketType)
{
    for (const FSplineRoute& Route : Routes)
    {
        if (Route.RouteName == RouteName)
        {
            return SpawnPacketInternal(Route, PacketType, ColorForPacketType(PacketType));
        }
    }
    return nullptr;
}

// ─── FindRoute ────────────────────────────────────────────────────────────────

bool ATaskFlowSplineManager::FindRoute(EZoneId Source, EZoneId Dest,
                                        FSplineRoute& OutRoute) const
{
    for (const FSplineRoute& Route : Routes)
    {
        if (Route.SourceZone == Source && Route.DestZone == Dest)
        {
            OutRoute = Route;
            return true;
        }
    }
    return false;
}

// ─── AddSplineRoute ───────────────────────────────────────────────────────────

int32 ATaskFlowSplineManager::AddSplineRoute(EZoneId Source, EZoneId Dest,
                                              float TravelDuration,
                                              const TArray<FVector>& WorldPoints)
{
    if (WorldPoints.Num() < 2)
    {
        return INDEX_NONE;
    }

    USplineComponent* NewSpline = NewObject<USplineComponent>(this);
    NewSpline->SetupAttachment(GetRootComponent());
    NewSpline->RegisterComponent();
    NewSpline->ClearSplinePoints(false);

    for (int32 i = 0; i < WorldPoints.Num(); ++i)
    {
        NewSpline->AddSplineWorldPoint(WorldPoints[i]);
    }

    const int32 SplineIdx = SplineComponents.Add(NewSpline);

    FSplineRoute R;
    R.SourceZone     = Source;
    R.DestZone       = Dest;
    R.TravelDuration = TravelDuration;
    R.SplineIndex    = SplineIdx;
    Routes.Add(R);

    return SplineIdx;
}

// ─── SpawnPacketInternal ──────────────────────────────────────────────────────

ADataPacket* ATaskFlowSplineManager::SpawnPacketInternal(const FSplineRoute& Route,
                                                           EDataPacketType Type,
                                                           FLinearColor Color)
{
    if (!GetWorld())
    {
        return nullptr;
    }
    if (!SplineComponents.IsValidIndex(Route.SplineIndex))
    {
        return nullptr;
    }

    USplineComponent* Spline = SplineComponents[Route.SplineIndex];
    if (!Spline)
    {
        return nullptr;
    }

    const FVector SpawnPos = Spline->GetLocationAtSplinePoint(0, ESplineCoordinateSpace::World);

    TSubclassOf<ADataPacket> ClassToSpawn = DataPacketClass
        ? DataPacketClass
        : ADataPacket::StaticClass();

    FActorSpawnParameters Params;
    Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

    ADataPacket* Packet = GetWorld()->SpawnActor<ADataPacket>(
        ClassToSpawn, SpawnPos, FRotator::ZeroRotator, Params);

    if (!Packet)
    {
        return nullptr;
    }

    Packet->OnPacketArrived.AddDynamic(this, &ATaskFlowSplineManager::OnPacketArrived);
    ActivePackets.Add(Packet, Route.RouteName);

    Packet->InitTravel(Spline, Route.TravelDuration, Type, Color);

    BP_OnPacketSpawned(Packet, Route.RouteName);
    return Packet;
}

// ─── OnPacketArrived ─────────────────────────────────────────────────────────

void ATaskFlowSplineManager::OnPacketArrived(ADataPacket* Packet)
{
    if (FName* RouteName = ActivePackets.Find(Packet))
    {
        BP_OnPacketArrived(Packet, *RouteName);
        ActivePackets.Remove(Packet);
    }
}

// ─── Statics ─────────────────────────────────────────────────────────────────

FLinearColor ATaskFlowSplineManager::ColorForPacketType(EDataPacketType Type)
{
    switch (Type)
    {
    case EDataPacketType::Normal:   return FLinearColor(0.2f, 0.5f, 1.0f);   // blue
    case EDataPacketType::Handoff:  return FLinearColor(0.0f, 0.9f, 0.9f);   // cyan
    case EDataPacketType::Retry:    return FLinearColor(1.0f, 0.55f, 0.0f);  // amber
    case EDataPacketType::Success:  return FLinearColor(0.1f, 1.0f, 0.3f);   // green
    case EDataPacketType::Failed:   return FLinearColor(1.0f, 0.05f, 0.05f); // red
    default:                        return FLinearColor::White;
    }
}

EDataPacketType ATaskFlowSplineManager::PacketTypeForEvent(ESwarmEventType EventType)
{
    switch (EventType)
    {
    case ESwarmEventType::TaskHandoff:       return EDataPacketType::Handoff;
    case ESwarmEventType::AgentStepRetry:
    case ESwarmEventType::Retry:             return EDataPacketType::Retry;
    case ESwarmEventType::TaskSuccess:
    case ESwarmEventType::SwarmCompleted:    return EDataPacketType::Success;
    case ESwarmEventType::TaskFail:
    case ESwarmEventType::SwarmFailed:
    case ESwarmEventType::Anomaly:           return EDataPacketType::Failed;
    default:                                  return EDataPacketType::Normal;
    }
}
