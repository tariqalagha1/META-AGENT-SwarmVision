#include "Agents/SwarmAgentPawn.h"
#include "Subsystems/SwarmEventRouterSubsystem.h"
#include "Components/PointLightComponent.h"

ASwarmAgentPawn::ASwarmAgentPawn()
{
    PrimaryActorTick.bCanEverTick = true;

    USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    SetRootComponent(Root);

    Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
    Mesh->SetupAttachment(Root);
    Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

    StatusLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("StatusLight"));
    StatusLight->SetupAttachment(Root);
    StatusLight->SetRelativeLocation(FVector(0.f, 0.f, 220.f));
    StatusLight->Intensity = 800.f;
    StatusLight->AttenuationRadius = 200.f;
    StatusLight->bUseInverseSquaredFalloff = false;
    StatusLight->SetLightColor(FLinearColor(0.3f, 0.3f, 1.0f)); // default blue = idle

    WorkFX = CreateDefaultSubobject<UNiagaraComponent>(TEXT("WorkFX"));
    WorkFX->SetupAttachment(Root);
    WorkFX->bAutoActivate = false;
}

// ─── BeginPlay ───────────────────────────────────────────────────────────────

void ASwarmAgentPawn::BeginPlay()
{
    Super::BeginPlay();

    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.AddDynamic(
                this, &ASwarmAgentPawn::OnSwarmEventReceived);
            Router->OnAgentStateChanged.AddDynamic(
                this, &ASwarmAgentPawn::OnAgentVisualStateChanged);
        }
    }
}

void ASwarmAgentPawn::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (UGameInstance* GI = GetGameInstance())
    {
        if (USwarmEventRouterSubsystem* Router = GI->GetSubsystem<USwarmEventRouterSubsystem>())
        {
            Router->OnSwarmEventReceived.RemoveDynamic(
                this, &ASwarmAgentPawn::OnSwarmEventReceived);
            Router->OnAgentStateChanged.RemoveDynamic(
                this, &ASwarmAgentPawn::OnAgentVisualStateChanged);
        }
    }
    Super::EndPlay(EndPlayReason);
}

// ─── Tick ────────────────────────────────────────────────────────────────────

void ASwarmAgentPawn::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    if (AnimState == EAgentAnimState::Working)
    {
        WorkProgress = FMath::Clamp(WorkProgress + WorkProgressSpeed * DeltaTime, 0.f, 1.f);
    }

    if (bHoldingState && StateHoldDuration > 0.f)
    {
        StateHoldTimer -= DeltaTime;
        if (StateHoldTimer <= 0.f)
        {
            bHoldingState = false;
            SetAnimState(EAgentAnimState::Idle);
        }
    }
}

// ─── SetAnimState ─────────────────────────────────────────────────────────────

void ASwarmAgentPawn::SetAnimState(EAgentAnimState NewState)
{
    if (NewState == AnimState)
    {
        return;
    }

    PrevAnimState = AnimState;
    AnimState     = NewState;

    WorkProgress = 0.f;

    if (WorkFX)
    {
        const bool bShouldWork = (NewState == EAgentAnimState::Working);
        if (bShouldWork && !WorkFX->IsActive())
        {
            WorkFX->Activate(true);
        }
        else if (!bShouldWork && WorkFX->IsActive())
        {
            WorkFX->Deactivate();
        }
    }

    ApplyStateToStatusLight(NewState);

    // Start hold timer for transient states
    if (StateHoldDuration > 0.f &&
        NewState != EAgentAnimState::Idle &&
        NewState != EAgentAnimState::Working)
    {
        StateHoldTimer = StateHoldDuration;
        bHoldingState  = true;
    }

    OnAgentAnimStateChanged.Broadcast(NewState, PrevAnimState);
    BP_OnAnimStateChanged(NewState, PrevAnimState);
}

// ─── Event handler ───────────────────────────────────────────────────────────

void ASwarmAgentPawn::OnSwarmEventReceived(const FSwarmEvent& Event)
{
    if (!AgentId.IsEmpty() && Event.AgentId != AgentId)
    {
        return;
    }

    BP_OnEventReceived(Event);
}

void ASwarmAgentPawn::OnAgentVisualStateChanged(const FString& InAgentId,
                                                  EAgentVisualState VisualState)
{
    if (!AgentId.IsEmpty() && InAgentId != AgentId)
    {
        return;
    }

    SetAnimState(VisualStateToAnimState(VisualState));
}

// ─── ApplyStateToStatusLight ─────────────────────────────────────────────────

void ASwarmAgentPawn::ApplyStateToStatusLight(EAgentAnimState State)
{
    if (!StatusLight)
    {
        return;
    }

    FLinearColor Color;
    float Intensity;

    switch (State)
    {
    case EAgentAnimState::Idle:
        Color     = FLinearColor(0.2f, 0.2f, 1.0f);
        Intensity = 600.f;
        break;
    case EAgentAnimState::Working:
        Color     = FLinearColor(0.1f, 0.6f, 1.0f);
        Intensity = 2000.f;
        break;
    case EAgentAnimState::Handoff:
        Color     = FLinearColor(0.0f, 1.0f, 0.9f);
        Intensity = 2500.f;
        break;
    case EAgentAnimState::Failed:
        Color     = FLinearColor(1.0f, 0.05f, 0.05f);
        Intensity = 1500.f;
        break;
    case EAgentAnimState::Retry:
        Color     = FLinearColor(1.0f, 0.55f, 0.0f);
        Intensity = 2000.f;
        break;
    case EAgentAnimState::Complete:
        Color     = FLinearColor(0.1f, 1.0f, 0.3f);
        Intensity = 3500.f;
        break;
    default:
        Color     = FLinearColor::White;
        Intensity = 800.f;
        break;
    }

    StatusLight->SetLightColor(Color);
    StatusLight->SetIntensity(Intensity);
}

// ─── VisualStateToAnimState ───────────────────────────────────────────────────

EAgentAnimState ASwarmAgentPawn::VisualStateToAnimState(EAgentVisualState VisualState) const
{
    switch (VisualState)
    {
    case EAgentVisualState::Idle:         return EAgentAnimState::Idle;
    case EAgentVisualState::Active:
    case EAgentVisualState::Working:      return EAgentAnimState::Working;
    case EAgentVisualState::HandoffSource:
    case EAgentVisualState::HandoffTarget: return EAgentAnimState::Handoff;
    case EAgentVisualState::Failed:        return EAgentAnimState::Failed;
    case EAgentVisualState::Retry:         return EAgentAnimState::Retry;
    case EAgentVisualState::Complete:      return EAgentAnimState::Complete;
    case EAgentVisualState::Observing:     return EAgentAnimState::Idle;
    default:                               return EAgentAnimState::Idle;
    }
}
